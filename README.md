<!-- README.md -->
# SariRaga — Smart AI Recycling & Garbage Analytics

> **Dokumen Submisi Resmi — AIWIC 2026 (Lampiran B - Template README.md)**

---

## 1. Informasi Tim & Proyek
- **Nama Proyek:** SariRaga (Smart AI Recycling & Garbage Analytics)
- **Kompetisi:** AIWIC 2026
- **Kategori:** Smart Environment / Circular Economy & Computer Vision
- **Versi Rilis:** `v1.0-submission`

---

## 2. Deskripsi Singkat & Permasalahan
**SariRaga** adalah platform analitik sampah cerdas berbasis Computer Vision (YOLOv8 + OpenCV) yang terintegrasi dengan sistem valuasi ekonomi sirkular (*Waste-to-Wealth Estimator*). Sistem ini mendeteksi, mengklasifikasikan, dan menghitung estimasi nilai ekonomi sampah daur ulang (Botol Plastik PET, Kardus/Kertas, Kaca/Beling) secara *real-time* melalui umpan kamera CCTV maupun unggahan citra.

---

## 3. Arsitektur Sistem & Tech Stack

```text
SariRaga/
├── client/          # Frontend UI (React.js + Vite + Tailwind CSS) — Port 5173
├── server/          # Backend REST API (Node.js + Express.js + Supabase) — Port 5000
├── ai_service/      # AI Microservice (Python + FastAPI + OpenCV/YOLOv8) — Port 8000
├── .gitignore       # Global Git Ignore
└── README.md        # Dokumentasi Standar AIWIC 2026
```

| Komponen | Teknologi Utama | Port Lokal |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS v3 | `5173` |
| **Backend API** | Node.js, Express.js, `@supabase/supabase-js` | `5000` |
| **Database** | Supabase (PostgreSQL) | Cloud / Managed |
| **AI Microservice** | Python 3.10+, FastAPI, Uvicorn, OpenCV, YOLOv8 Stub | `8000` |

---

## 4. Prasyarat Instalasi (Prerequisites)
Pastikan perangkat lokal Anda telah terinstal:
- **Node.js** `>= 18.x` dan **npm** `>= 9.x`
- **Python** `>= 3.10` dan `pip`
- **Git**
- Akun & Project **Supabase** (untuk kredensial PostgreSQL)

---

## 5. Panduan Instalasi & Konfigurasi Lokal

### A. Clone Repository
```bash
git clone https://github.com/RanggaIkan/sariraga-apps.git
cd sariraga-apps
```

### B. Setup Frontend (`client`)
```bash
cd client
npm install
npm run dev
```
Frontend berjalan di: `http://localhost:5173`

### C. Setup Backend (`server`)
```bash
cd ../server
npm install
cp .env.example .env
# Sesuaikan SUPABASE_URL dan SUPABASE_ANON_KEY di dalam file .env
node server.js
```
Backend berjalan di: `http://localhost:5000`

### D. Setup AI Microservice (`ai_service`)
```bash
cd ../ai_service
python -m venv venv
# Aktivasi venv (Windows PowerShell):
.\venv\Scripts\activate
# Aktivasi venv (Linux/macOS):
# source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
AI Microservice berjalan di: `http://localhost:8000`

---

## 6. Spesifikasi Endpoint API

### Backend Service (`http://localhost:5000`)
- `GET /health` — Pemeriksaan status server Express.
- `GET /api/stats` — Mengambil data klasifikasi sampah dan valuasi ekonomi (*Waste-to-Wealth*).

### AI Microservice (`http://localhost:8000`)
- `GET /health` — Pemeriksaan status microservice FastAPI.
- `GET /video_feed` — Stream video `multipart/x-mixed-replace` OpenCV dengan *bounding box* real-time.
- `POST /api/detect` — Menerima file gambar (`multipart/form-data`), mengembalikan koordinat `bbox`, `label`, `confidence`, dan `annotated_image_base64`.
- `WS /ws/detect` — Endpoint WebSocket untuk pengiriman *binary frame* secara *real-time*.

---

## 7. Pengujian & Verifikasi (Testing)
1. **Health Check API & AI:**
   ```bash
   curl http://localhost:5000/health
   curl http://localhost:8000/health
   ```
2. **Statistik Valuasi Sampah:**
   ```bash
   curl http://localhost:5000/api/stats
   ```
3. **Deteksi Frame Gambar (cURL):**
   ```bash
   curl -X POST "http://localhost:8000/api/detect" -F "file=@sample.jpg"
   ```

---

## 8. Lisensi & Pernyataan Orisinalitas
Karya ini dikembangkan secara orisinal untuk keperluan kompetisi **AIWIC 2026**. Seluruh kode sumber dilisensikan di bawah **MIT License**.
