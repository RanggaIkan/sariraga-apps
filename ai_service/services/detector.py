# ai_service/services/detector.py
"""SariRaga waste detector - YOLO11n trained by Tim SariRaga, exported to ONNX (real inference, no mock data).

Training : Ultralytics YOLO11n, WaRP-D dataset (Waste Recycling Plant conveyor images), 3 classes
           test mAP50 0.584, precision 0.674, recall 0.484
Input    : [1, 3, 640, 640] float32 RGB 0..1 (letterboxed)
Output   : [1, 7, 8400] = [cx, cy, w, h, p_botol_plastik, p_kaleng_aluminium, p_kardus]
"""
import base64
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "sariraga_yolo11n.onnx"
INPUT_SIZE = 640

# Model class index -> SariRaga category
CLASSES = [  # colors are BGR
    {"id": "botol", "label": "Botol Plastik", "color": (129, 185, 16)},
    {"id": "kaleng", "label": "Kaleng Aluminium", "color": (11, 158, 245)},
    {"id": "kardus", "label": "Kardus / Karton", "color": (246, 130, 59)},
]
DEFAULT_CONF = 0.25
DEFAULT_IOU = 0.45

_providers = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in ort.get_available_providers()]
_session = ort.InferenceSession(str(MODEL_PATH), providers=_providers)
_input_name = _session.get_inputs()[0].name


def _letterbox(img):
    h, w = img.shape[:2]
    scale = min(INPUT_SIZE / h, INPUT_SIZE / w)
    nh, nw = round(h * scale), round(w * scale)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    pad_x, pad_y = (INPUT_SIZE - nw) // 2, (INPUT_SIZE - nh) // 2
    canvas = np.full((INPUT_SIZE, INPUT_SIZE, 3), 114, dtype=np.uint8)
    canvas[pad_y:pad_y + nh, pad_x:pad_x + nw] = resized
    return canvas, scale, pad_x, pad_y


def detect(frame, conf_threshold=DEFAULT_CONF, iou_threshold=DEFAULT_IOU):
    """Run YOLO11n inference on a BGR frame. Returns list of detections in original pixel coords."""
    h, w = frame.shape[:2]
    canvas, scale, pad_x, pad_y = _letterbox(frame)
    blob = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 255.0

    out = _session.run(None, {_input_name: blob})[0][0].T  # (8400, 9)
    scores = out[:, 4:]
    class_ids = scores.argmax(axis=1)
    confs = scores[np.arange(len(scores)), class_ids]
    keep = confs >= conf_threshold
    if not keep.any():
        return []

    boxes, confs, class_ids = out[keep, :4], confs[keep], class_ids[keep]
    # cx,cy,w,h (letterbox space) -> x,y,w,h (original space)
    x = (boxes[:, 0] - boxes[:, 2] / 2 - pad_x) / scale
    y = (boxes[:, 1] - boxes[:, 3] / 2 - pad_y) / scale
    bw, bh = boxes[:, 2] / scale, boxes[:, 3] / scale
    xywh = np.stack([x, y, bw, bh], axis=1)

    idxs = cv2.dnn.NMSBoxesBatched(xywh.tolist(), confs.tolist(), class_ids.tolist(), conf_threshold, iou_threshold)
    detections = []
    for i in np.array(idxs).flatten():
        x1, y1 = max(0, int(xywh[i, 0])), max(0, int(xywh[i, 1]))
        x2, y2 = min(w, int(xywh[i, 0] + xywh[i, 2])), min(h, int(xywh[i, 1] + xywh[i, 3]))
        cls = CLASSES[int(class_ids[i])]
        detections.append({
            "category": cls["id"],
            "label": cls["label"],
            "confidence": round(float(confs[i]), 3),
            "bbox": [x1, y1, x2, y2],
        })
    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections


def annotate(frame, detections):
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        color = next(c["color"] for c in CLASSES if c["id"] == det["category"])
        text = f"{det['label']} {det['confidence']:.2f}"
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        ty = max(y1, th + 6)
        cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 6, ty), color, -1)
        cv2.putText(frame, text, (x1 + 3, ty - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    return frame


def run_detection(image_bytes: bytes, conf_threshold=DEFAULT_CONF, with_image=True):
    frame = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR) if image_bytes else None
    if frame is None:
        raise ValueError("File bukan gambar yang valid")
    t0 = time.perf_counter()
    detections = detect(frame, conf_threshold)
    inference_ms = round((time.perf_counter() - t0) * 1000, 1)
    result = {
        "frame_size": {"width": frame.shape[1], "height": frame.shape[0]},
        "detections": detections,
        "inference_ms": inference_ms,
        "provider": _session.get_providers()[0],
    }
    if with_image:
        _, buf = cv2.imencode(".jpg", annotate(frame, detections), [cv2.IMWRITE_JPEG_QUALITY, 85])
        result["annotated_image_base64"] = base64.b64encode(buf).decode("utf-8")
    return result
