# ai_service/main.py
"""SariRaga AI Microservice - real YOLO11n (ONNX Runtime) waste detection, model trained by Tim SariRaga.

Run locally : uvicorn main:app --host 0.0.0.0 --port 8000
Expose      : cloudflared tunnel --url http://localhost:8000
"""
import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from services.detector import CLASSES, MODEL_PATH, _session, annotate, detect, run_detection

app = FastAPI(title="SariRaga AI Microservice", version="1.0.0")

# Public demo API (no credentials) - allow any origin so Vercel / tunnel URLs work.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SariRaga AI Microservice",
        "model": MODEL_PATH.name,
        "provider": _session.get_providers()[0],
        "classes": [c["id"] for c in CLASSES],
    }


@app.post("/api/detect")
async def detect_waste_frame(
    file: UploadFile = File(...),
    conf: float = Query(0.25, ge=0.05, le=0.95),
    annotated: bool = Query(True),
):
    """Receive an image (multipart/form-data), run YOLO11n inference, return boxes + labels."""
    try:
        result = run_detection(await file.read(), conf, with_image=annotated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "filename": file.filename, "count": len(result["detections"]), **result}


@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket):
    """Receive binary JPEG frames, reply with detections JSON (no annotated image, client draws boxes)."""
    await websocket.accept()
    try:
        while True:
            image_bytes = await websocket.receive_bytes()
            try:
                result = run_detection(image_bytes, with_image=False)
                await websocket.send_json({"status": "success", "count": len(result["detections"]), **result})
            except ValueError as e:
                await websocket.send_json({"status": "error", "detail": str(e)})
    except WebSocketDisconnect:
        pass


def generate_frames(camera_index: int):
    """MJPEG stream from a camera attached to this machine (CCTV / USB cam on the conveyor)."""
    cap = cv2.VideoCapture(camera_index)
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(frame, "Kamera tidak tersedia di server AI", (60, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
                detections = []
            else:
                detections = detect(frame)
            ok, buffer = cv2.imencode(".jpg", annotate(frame, detections))
            if not ok:
                continue
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
    finally:
        cap.release()


@app.get("/video_feed")
def video_feed(camera: int = 0):
    return StreamingResponse(generate_frames(camera), media_type="multipart/x-mixed-replace; boundary=frame")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
