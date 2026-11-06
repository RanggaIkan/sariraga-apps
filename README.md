# SariRaga — Smart AI Recycling & Garbage Analytics

> AI Web Innovation Challenge — Bali DigiFest 2026 • Tema: *Build with AI, Solve for Bali* • Sub-tema: Bali Smart Society (Lingkungan & Manajemen Sampah)
> Tim SariRaga — FTI Universitas Kristen Satya Wacana • Rilis: `v1.0-submission`

SariRaga mendeteksi dan mengklasifikasikan sampah anorganik bernilai ekonomi (**botol plastik, kaleng aluminium, kardus/karton minuman**) dari kamera konveyor TPS3R / Bank Sampah secara real-time, mencatat setiap deteksi beserta bukti visual (snapshot + confidence), lalu mengonversinya menjadi estimasi nilai jual Rupiah dan poin sirkuler (*Waste-to-Wealth*).

## Fitur MVP

| Fitur | Keterangan |
| :--- | :--- |
| **Smart Stream Command Center** | Sumber input: simulasi konveyor, webcam, upload foto / galeri sampel, dan stream CCTV dari mesin AI server. Bounding box, label, confidence, latensi, dan FPS ditampilkan langsung. |
| **Visual Metrics Dashboard** | Komposisi sampah (donut), tren 24 jam, KPI (item, berat, nilai, poin), riwayat deteksi dengan snapshot sebagai bukti visual. Ekspor laporan CSV untuk DLH. |
| **Waste-to-Wealth Estimator** | Valuasi dihitung di server: jumlah item × bobot rata-rata × harga acuan bank sampah. Tabel harga ada di [`client/api/_lib/categories.js`](client/api/_lib/categories.js). |
| **Hybrid AI Engine** | Inferensi di **AI server** (FastAPI + ONNX Runtime). Jika server offline, otomatis pindah ke **browser** (onnxruntime-web, model yang sama). |

## Model AI

| | |
| :--- | :--- |
| Arsitektur | Ultralytics **YOLO11n** (deteksi objek), diekspor ke ONNX (`[1,3,640,640]` → `[1,7,8400]`) |
| Dataset | WaRP-D — *Waste Recycling Plant Dataset* (foto konveyor fasilitas daur ulang). 28 kelas asli dipetakan ke 3 kelas: `botol_plastik`, `kaleng_aluminium`, `kardus` (kelas kaca dibuang). |
| Hasil test | mAP50 **0.584** • mAP50-95 0.432 • precision 0.674 • recall 0.484 |
| Inferensi | ~35 ms/frame di CPU (FastAPI + ONNX Runtime) • ~250–350 ms/frame di browser (WASM) |
| File | [`ai_service/models/sariraga_yolo11n.onnx`](ai_service/models/sariraga_yolo11n.onnx) (server) dan [`client/public/models/sariraga_yolo11n.onnx`](client/public/models/sariraga_yolo11n.onnx) (browser) |

Pipeline: letterbox 640 → normalisasi RGB 0–1 → ONNX → filter confidence (default 0.25) → NMS per kelas (IoU 0.45) → koordinat dikembalikan ke ukuran asli. Implementasi: [`ai_service/services/detector.py`](ai_service/services/detector.py) (Python) dan [`client/src/lib/detector.js`](client/src/lib/detector.js) (JS).

## Arsitektur

```text
[Operator / Juri — browser]
   │  webcam / upload / simulasi konveyor
   ▼
[Frontend: React 19 + Vite + Tailwind]  ── (Vercel)
   │                         │
   │ frame JPEG              │ fallback: onnxruntime-web (model sama, di browser)
   ▼                         │
[AI Microservice: FastAPI + OpenCV + ONNX Runtime]  ── (laptop/server + Cloudflare Tunnel)
   │ detections JSON
   ▼
[Core API: Vercel Functions client/api/*]  (lokal: Express server/ memakai handler yang sama)
   │ insert / aggregate
   ▼
[Supabase PostgreSQL: detection_logs]
```

```text
sariraga-apps/
├── client/              # Frontend React + Vite (deploy ke Vercel, root directory = client)
│   ├── api/             # Vercel Functions: /api/detections, /api/stats, /api/health
│   │   └── _lib/        # Logika bisnis bersama (kategori, valuasi, Supabase)
│   ├── public/models/   # Model ONNX untuk inferensi di browser
│   └── src/             # UI: Command Center, Dashboard, engine deteksi
├── server/              # Express (lokal) — me-mount handler client/api yang sama
├── ai_service/          # FastAPI + ONNX Runtime + OpenCV
└── supabase/schema.sql  # Skema database
```

## Menjalankan Lokal

Prasyarat: Node.js ≥ 20, Python ≥ 3.10.

```bash
# 1. AI microservice (port 8000)
cd ai_service
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# 2. Core API (port 5000)
cd ../client && npm install         # dependency handler API ada di client/
cd ../server && npm install
cp .env.example .env                # isi SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (opsional)
npm start

# 3. Frontend (port 5173)
cd ../client
cp .env.example .env.local          # VITE_AI_SERVICE_URL=http://localhost:8000
npm run dev
```

Tanpa kredensial Supabase, Core API memakai penyimpanan memori (data hilang saat restart) dan Dashboard menampilkan banner "Mode demo".

## Deploy

### 1. Supabase
Buka **SQL Editor**, lalu jalankan [`supabase/schema.sql`](supabase/schema.sql). RLS aktif tanpa policy publik, jadi hanya server (service_role key) yang bisa membaca/menulis.

### 2. Vercel (frontend + Core API)
- Import repo → **Root Directory: `client`** (framework Vite terdeteksi otomatis; `client/api/*` menjadi Vercel Functions).
- Environment Variables:
  - `SUPABASE_URL` = URL project Supabase
  - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (**rahasia, hanya di Vercel, jangan diberi prefix `VITE_`**)
  - `VITE_AI_SERVICE_URL` = URL publik AI server (opsional, lihat langkah 3)

### 3. AI server via Cloudflare Tunnel
```bash
cd ai_service && uvicorn main:app --host 0.0.0.0 --port 8000
cloudflared tunnel --url http://localhost:8000     # keluarkan https://xxxx.trycloudflare.com
```
URL quick tunnel berubah setiap restart. Tanpa redeploy, buka web dengan `https://<app>.vercel.app/?ai=https://xxxx.trycloudflare.com` (disimpan di browser; `?ai=off` untuk menghapus). Untuk URL tetap, gunakan *named tunnel* dengan domain Cloudflare.

Jika AI server mati, aplikasi tetap berfungsi penuh dengan inferensi di browser.

## API

| Service | Endpoint | Keterangan |
| :--- | :--- | :--- |
| AI | `GET /health` | Status, nama model, execution provider, kelas |
| AI | `POST /api/detect?conf=0.25&annotated=true` | `multipart/form-data` field `file` → `detections[]` (`category`, `label`, `confidence`, `bbox [x1,y1,x2,y2]`), `inference_ms`, `annotated_image_base64` |
| AI | `WS /ws/detect` | Kirim frame JPEG biner → JSON deteksi |
| AI | `GET /video_feed?camera=0` | MJPEG teranotasi dari kamera yang terpasang di mesin AI |
| Core | `POST /api/detections` | Simpan deteksi `{source, engine, model, inference_ms, items[], snapshot}`; valuasi dihitung server |
| Core | `GET /api/detections?limit=20` | Riwayat log + snapshot |
| Core | `GET /api/stats` | Komposisi, valuasi Waste-to-Wealth, tren 24 jam |

Uji cepat:
```bash
curl http://localhost:8000/health
curl -X POST "http://localhost:8000/api/detect?annotated=false" -F "file=@client/public/samples/tumpukan-kaleng.jpg"
curl http://localhost:5000/api/stats
```

## Keterbatasan

- Model dilatih pada citra konveyor WaRP, sehingga paling akurat untuk tampilan kamera atas di jalur konveyor. Pada foto produk tunggal dengan latar polos, akurasinya turun. Recall test 0.48 berarti sebagian objek masih terlewat, terutama saat tumpukan saling menutupi.
- Kelas "kardus" pada dataset adalah karton minuman (jus/susu). Kardus kemasan besar belum menjadi data latih.
- Limbah medis/B3 belum dideteksi karena tidak ada di dataset. Ini masuk roadmap.
- Nilai Waste-to-Wealth adalah estimasi dari bobot rata-rata per item dan harga acuan, belum terhubung dengan timbangan load-cell.
- Pencatatan live bersifat per-frame (tombol "Catat" atau auto-catat tiap 5 detik). Belum ada object tracking, jadi satu objek bisa tercatat lebih dari sekali pada auto-catat.
- Endpoint publik demo tanpa autentikasi.

## Kredit & Lisensi

- Kode aplikasi: MIT. Bobot model dilatih dengan Ultralytics YOLO11 (AGPL-3.0).
- Dataset: WaRP — Waste Recycling Plant Dataset (parohod, Kaggle).
- Library: React, Vite, Tailwind CSS, Recharts, Lucide (ISC), onnxruntime / onnxruntime-web (MIT), FastAPI, OpenCV, Express, Supabase JS.
- Foto sampel (Wikimedia Commons):

| File | Sumber | Pembuat | Lisensi |
| :--- | :--- | :--- | :--- |
| `/samples/tumpukan-botol-1.jpg` | [Plastic bottles for recycling.jpg](https://commons.wikimedia.org/wiki/File:Plastic_bottles_for_recycling.jpg) | Radulf del Maresme | CC BY-SA 4.0 |
| `/samples/tumpukan-botol-2.jpg` | [Plastic Bottles - Waste (7992944072).jpg](https://commons.wikimedia.org/wiki/File:Plastic_Bottles_-_Waste_(7992944072).jpg) | Tony Webster | CC BY 2.0 |
| `/samples/tumpukan-kaleng.jpg` | [Heap of cans South Korea Pavilion Expo 2015.JPG](https://commons.wikimedia.org/wiki/File:Heap_of_cans_South_Korea_Pavilion_Expo_2015.JPG) | Gzzz | CC BY-SA 4.0 |
| `/samples/botol-pet.jpg` | [Dornbirn-bottle 3,05 Liter-Orangejuice-01ASD.jpg](https://commons.wikimedia.org/wiki/File:Dornbirn-bottle_3,05_Liter-Orangejuice-01ASD.jpg) | Asurnipal | CC BY-SA 4.0 |
