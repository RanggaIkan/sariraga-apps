# ai_service/main.py
import time
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from services.yolo_stub import run_dummy_detection

app = FastAPI(title="SariRaga AI Microservice", version="1.0.0")

# Explicit CORS for Frontend (5173/3000) & Backend (5000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:5000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SariRaga AI Microservice (YOLOv8 Stub)",
        "port": 8000,
    }


@app.post("/api/detect")
async def detect_waste_frame(file: UploadFile = File(...)):
    """
    POST Endpoint: Receive an image frame (multipart/form-data),
    run OpenCV mock YOLO bounding box detection, and return coordinates + labels.
    """
    image_bytes = await file.read()
    result = run_dummy_detection(image_bytes)
    return {
        "status": "success",
        "filename": file.filename,
        "count": len(result["detections"]),
        "frame_size": result["frame_size"],
        "detections": result["detections"],
        "annotated_image_base64": result["annotated_image_base64"],
    }


@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket):
    """
    WebSocket Endpoint: Receive binary image frames in real-time,
    return JSON with bounding box coordinates, labels, and annotated frame.
    """
    await websocket.accept()
    try:
        while True:
            image_bytes = await websocket.receive_bytes()
            result = run_dummy_detection(image_bytes)
            await websocket.send_json({
                "status": "success",
                "count": len(result["detections"]),
                "detections": result["detections"],
                "annotated_image_base64": result["annotated_image_base64"],
            })
    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected from /ws/detect")


def generate_frames():
    cap = cv2.VideoCapture(0)
    try:
        while True:
            success, frame = cap.read()
            if not success:
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(
                    frame,
                    "SariRaga CCTV Simulation Mode",
                    (80, 200),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.9,
                    (16, 185, 129),
                    2,
                )
                cv2.rectangle(frame, (96, 96), (288, 360), (16, 185, 129), 2)
                cv2.putText(
                    frame,
                    "Botol Plastik (0.94)",
                    (96, 86),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (16, 185, 129),
                    2,
                )
                cv2.rectangle(frame, (332, 144), (563, 384), (59, 130, 246), 2)
                cv2.putText(
                    frame,
                    "Kardus (0.89)",
                    (332, 134),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (59, 130, 246),
                    2,
                )
                time.sleep(0.1)
            else:
                cv2.rectangle(frame, (120, 80), (420, 360), (16, 185, 129), 2)
                cv2.putText(
                    frame,
                    "Botol Plastik (0.94)",
                    (120, 70),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (16, 185, 129),
                    2,
                )

            ret, buffer = cv2.imencode(".jpg", frame)
            if not ret:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
            )
    finally:
        cap.release()


@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
