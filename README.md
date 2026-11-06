# SariRaga - Waste Detection API

## Menjalankan
    pip install -r requirements.txt
    uvicorn app:app --host 0.0.0.0 --port 8000

## Contoh pemakaian
    curl -X POST "http://localhost:8000/predict?conf=0.25&annotated=true" -F "file=@sampah.jpg"

## Contoh dari frontend (JavaScript)
    const fd = new FormData(); fd.append("file", fileInput.files[0]);
    const res = await fetch("http://localhost:8000/predict", { method: "POST", body: fd });
    const data = await res.json();  // data.summary, data.detections, data.annotated_image
