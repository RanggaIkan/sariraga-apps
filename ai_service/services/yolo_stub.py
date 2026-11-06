# ai_service/services/yolo_stub.py
import base64
import cv2
import numpy as np


def run_dummy_detection(image_bytes: bytes):
    """
    Decode image bytes with OpenCV, draw mock YOLOv8 bounding boxes,
    and return detection coordinates + labels + annotated base64 image.
    """
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        # Fallback canvas if invalid image bytes
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

    height, width, _ = frame.shape

    # Mock YOLOv8 detections (normalized & pixel coordinates)
    detections = [
        {
            "label": "Botol Plastik (PET)",
            "category_id": "botol",
            "confidence": 0.94,
            "bbox": [int(width * 0.15), int(height * 0.20), int(width * 0.45), int(height * 0.75)],
            "estimated_weight_kg": 0.03,
        },
        {
            "label": "Kardus",
            "category_id": "kardus",
            "confidence": 0.89,
            "bbox": [int(width * 0.52), int(height * 0.30), int(width * 0.88), int(height * 0.80)],
            "estimated_weight_kg": 0.20,
        },
    ]

    # Draw bounding boxes on frame
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        label_text = f"{det['label']} ({det['confidence']:.2f})"
        cv2.rectangle(frame, (x1, y1), (x2, y2), (16, 185, 129), 2)
        cv2.putText(
            frame,
            label_text,
            (x1, max(y1 - 10, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (16, 185, 129),
            2,
        )

    _, buffer = cv2.imencode(".jpg", frame)
    annotated_b64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "frame_size": {"width": width, "height": height},
        "detections": detections,
        "annotated_image_base64": annotated_b64,
    }
