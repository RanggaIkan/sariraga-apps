# SariRaga: Smart AI Recycling & Garbage Analytics

AI Web Innovation Challenge, Bali DigiFest 2026. Tema *Build with AI, Solve for Bali*, ruang lingkup **Bali Smart Society** (lingkungan dan pengelolaan sampah).
Tim SariRaga, FTI Universitas Kristen Satya Wacana. Versi yang dinilai: tag `v1.0-submission`.

## Description

SariRaga adalah aplikasi web yang mendeteksi dan menghitung sampah anorganik bernilai jual (**botol plastik, kaleng aluminium, kardus/karton minuman**) dari kamera konveyor, webcam, atau foto. Setiap deteksi dicatat beserta bukti visual (thumbnail dan tingkat keyakinan model), lalu diubah menjadi estimasi berat, nilai jual dalam Rupiah, dan poin sirkuler (*Waste-to-Wealth*). Rekap komposisi bisa diunduh sebagai CSV untuk bank sampah atau Dinas Lingkungan Hidup.

## Problem & Target User

**Masalah.** Di TPS3R dan Bank Sampah, pemilahan dan pencatatan sampah anorganik masih dilakukan manual: petugas menghitung dan menimbang per jenis, lalu menulis di buku atau spreadsheet. Prosesnya lambat, datanya jarang lengkap, dan nilai ekonomi sampah yang terkumpul sulit dilaporkan. Akibatnya pengelola kesulitan menunjukkan komposisi sampah harian kepada pemerintah daerah, dan warga tidak melihat nilai dari sampah yang mereka pilah.

**Target user.**
- Operator TPS3R / Bank Sampah: butuh penghitungan per jenis yang cepat tanpa mengubah alur kerja di konveyor.
- Pengelola Bank Sampah: butuh estimasi nilai jual dan poin untuk nasabah.
- Dinas Lingkungan Hidup / desa adat: butuh laporan komposisi sampah yang konsisten.

## Key Features

Fitur yang sudah berfungsi pada versi ini:

| Fitur | Keterangan |
| :--- | :--- |
| **Smart Stream Command Center** | Sumber gambar: simulasi konveyor, webcam, unggah foto atau galeri contoh, dan stream CCTV dari mesin AI server. Kotak deteksi, label, keyakinan, waktu proses, dan FPS tampil langsung. Ambang keyakinan bisa diatur. |
| **Pencatatan deteksi** | Tombol "Catat ke log" atau catat otomatis tiap 5 detik. Setiap log menyimpan item, mesin AI, waktu proses, dan thumbnail sebagai bukti. |
| **Visual Metrics Dashboard** | Total nilai dan akumulasi 24 jam, kartu per kategori, volume deteksi per jam, rata-rata keyakinan model, asal deteksi, tabel Waste-to-Wealth, dan riwayat deteksi dengan thumbnail. |
| **Waste-to-Wealth Estimator** | Nilai dihitung di server: jumlah item x bobot rata-rata x harga acuan bank sampah. Tabel harga ada di [`client/api/_lib/categories.js`](client/api/_lib/categories.js). |
| **Ekspor laporan** | Unduh rekap komposisi, nilai, dan riwayat deteksi dalam CSV (bisa dibuka di Excel). |
| **Hybrid AI Engine** | Inferensi di AI server (FastAPI + ONNX Runtime). Jika server tidak terhubung, aplikasi otomatis memakai inferensi di browser (onnxruntime-web) dengan model yang sama. |

## Tech Stack

| Lapisan | Teknologi |
| :--- | :--- |
| Frontend | React 19, Vite, Tailwind CSS, Recharts, Lucide icons |
| Core API | Vercel Functions (`client/api/*`). Lokal: Express (`server/`) yang memakai handler yang sama |
| AI service | Python, FastAPI, ONNX Runtime, OpenCV |
| AI di browser | onnxruntime-web (WASM) |
| Database | Supabase PostgreSQL (tabel `detection_logs`). Tanpa kredensial: penyimpanan memori untuk demo |
| Hosting | Frontend + Core API di Vercel, AI service di mesin tim yang diekspos lewat Cloudflare Tunnel |

## AI Implementation

| | |
| :--- | :--- |
| Metode | Computer vision, deteksi objek |
| Model | Ultralytics **YOLO11n**, dilatih ulang oleh tim lalu diekspor ke ONNX |
| Dataset | WaRP-D (*Waste Recycling Plant Dataset*), foto konveyor fasilitas daur ulang. 28 kelas asli dipetakan ke 3 kelas: `botol_plastik`, `kaleng_aluminium`, `kardus` (kelas kaca dibuang) |
| Hasil test | mAP50 **0.584**, mAP50-95 0.432, precision 0.674, recall 0.484 |
| Input | Frame gambar (JPEG dari kamera, webcam, atau foto unggahan) |
| Output | Daftar objek: kategori, keyakinan, bounding box `[x1, y1, x2, y2]` |
| Kecepatan | Sekitar 35 sampai 45 ms/frame di AI server (CPU). Sekitar 250 sampai 350 ms/frame di browser (WASM) |
| File model | [`ai_service/models/sariraga_yolo11n.onnx`](ai_service/models/sariraga_yolo11n.onnx) dan [`client/public/models/sariraga_yolo11n.onnx`](client/public/models/sariraga_yolo11n.onnx) |

**Pipeline:** letterbox 640x640, normalisasi RGB 0 sampai 1, inferensi ONNX (`[1,3,640,640]` ke `[1,7,8400]`), filter keyakinan (default 0.25), NMS per kelas (IoU 0.45), lalu koordinat dikembalikan ke ukuran gambar asli.
Kode AI utama: [`ai_service/services/detector.py`](ai_service/services/detector.py) (server) dan [`client/src/lib/detector.js`](client/src/lib/detector.js) (browser).

**Kenapa perlu AI.** Menghitung dan memilah jenis sampah dari tumpukan di konveyor tidak bisa dilakukan dengan aturan sederhana karena bentuk, warna, dan posisi objek sangat beragam. Model deteksi objek mengenali tiap item beserta lokasinya, sehingga jumlah per jenis bisa dihitung otomatis dan langsung dikonversi menjadi nilai.

**Penanganan error.** Jika AI server tidak terhubung saat aplikasi dibuka, inferensi otomatis berjalan di browser. Jika satu inferensi gagal, pesan error tampil di atas video dan loop mencoba lagi setelah 1 detik. Jika Core API gagal, dashboard menampilkan pesan dan tombol muat ulang.

## Data & Privacy

- Frame kamera hanya dianalisis dan tidak disimpan, baik di browser maupun di AI server.
- Pada mode browser, gambar tidak keluar dari perangkat pengguna. Pada mode server, frame dikirim ke AI service milik tim untuk diproses lalu dibuang.
- Yang disimpan ke database hanya hasil deteksi (kategori, keyakinan, bounding box) dan thumbnail 320 px, dan hanya saat pengguna menekan "Catat ke log" atau menyalakan catat otomatis.
- Supabase memakai Row Level Security tanpa policy publik. Hanya server (service_role key di environment variable) yang bisa membaca dan menulis.
- Nilai Rupiah adalah estimasi, bukan hasil timbangan, dan dijelaskan sebagai estimasi di aplikasi.

## Architecture / Data Flow

```text
User (operator / juri) di browser
   |  webcam / unggah foto / simulasi konveyor
   v
Frontend: React + Vite (Vercel)
   |  frame JPEG                         fallback: onnxruntime-web di browser
   v
AI Service: FastAPI + ONNX Runtime + OpenCV (Cloudflare Tunnel)
   |  detections JSON
   v
Frontend menampilkan hasil, lalu "Catat ke log"
   |  POST /api/detections
   v
Core API: Vercel Functions client/api/*  (valuasi Waste-to-Wealth dihitung di sini)
   |  insert / aggregate
   v
Supabase PostgreSQL: detection_logs  ->  GET /api/stats  ->  Dashboard
```

```text
sariraga-apps/
├── client/              # Frontend React + Vite (deploy ke Vercel, root directory = client)
│   ├── api/             # Vercel Functions: /api/detections, /api/stats, /api/health
│   │   └── _lib/        # Logika bersama: kategori, valuasi, Supabase
│   ├── public/models/   # Model ONNX untuk inferensi di browser
│   └── src/             # UI: Command Center, Dashboard, engine deteksi
├── server/              # Express untuk lokal, memakai handler client/api yang sama
├── ai_service/          # FastAPI + ONNX Runtime + OpenCV
└── supabase/schema.sql  # Skema database
```

## Installation / Run Instructions

Prasyarat: Node.js 20 atau lebih baru, Python 3.10 atau lebih baru.

```bash
# 1. AI service (port 8000)
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

Buka http://localhost:5173. Tanpa kredensial Supabase, Core API memakai penyimpanan memori (data hilang saat restart) dan Dashboard menampilkan keterangan "Mode demo". Jika `VITE_AI_SERVICE_URL` kosong atau AI service mati, deteksi berjalan di browser.

Uji cepat:
```bash
curl http://localhost:8000/health
curl -X POST "http://localhost:8000/api/detect?annotated=false" -F "file=@client/public/samples/tumpukan-kaleng.jpg"
curl http://localhost:5000/api/stats
```

### Deploy

1. **Supabase:** buka SQL Editor, jalankan [`supabase/schema.sql`](supabase/schema.sql).
2. **Vercel (frontend + Core API):** import repo, Root Directory `client`. Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (rahasia, hanya di Vercel, tanpa prefix `VITE_`), dan `VITE_AI_SERVICE_URL` (opsional).
3. **AI service via Cloudflare Tunnel:**
   ```bash
   cd ai_service && uvicorn main:app --host 0.0.0.0 --port 8000
   cloudflared tunnel --url http://localhost:8000   # menghasilkan https://xxxx.trycloudflare.com
   ```
   URL quick tunnel berubah setiap restart. Tanpa redeploy, buka web dengan `https://<app>/?ai=https://xxxx.trycloudflare.com` (disimpan di browser, `?ai=off` untuk menghapus).

### API

| Service | Endpoint | Keterangan |
| :--- | :--- | :--- |
| AI | `GET /health` | Status, nama model, execution provider, kelas |
| AI | `POST /api/detect?conf=0.25&annotated=true` | `multipart/form-data` field `file`, menghasilkan `detections[]`, `inference_ms`, `annotated_image_base64` |
| AI | `WS /ws/detect` | Kirim frame JPEG biner, terima JSON deteksi |
| AI | `GET /video_feed?camera=0` | MJPEG teranotasi dari kamera di mesin AI |
| Core | `POST /api/detections` | Simpan deteksi `{source, engine, model, inference_ms, items[], snapshot}`. Valuasi dihitung server |
| Core | `GET /api/detections?limit=20` | Riwayat log beserta thumbnail |
| Core | `GET /api/stats` | Komposisi, valuasi Waste-to-Wealth, tren 24 jam |

## Deployment URL

- Web app: **[diisi tim sebelum submit]**
- AI service: URL Cloudflare Tunnel, dikirim lewat kanal panitia saat penjurian (berubah setiap restart). Tanpa AI service, web app tetap berfungsi penuh dengan inferensi di browser.

## Demo Account

Tidak diperlukan. Aplikasi bisa dipakai tanpa login.

## Known Limitations

- Model dilatih pada citra konveyor WaRP, jadi paling akurat untuk kamera atas di jalur konveyor. Pada foto produk tunggal berlatar polos, akurasinya turun. Recall 0.48 berarti sebagian objek masih terlewat, terutama saat tumpukan saling menutupi.
- Kelas "kardus" pada dataset adalah karton minuman (jus/susu). Kardus kemasan besar belum menjadi data latih.
- Limbah medis/B3 belum dideteksi karena tidak ada di dataset.
- Nilai Waste-to-Wealth adalah estimasi dari bobot rata-rata per item dan harga acuan, belum terhubung dengan timbangan.
- Belum ada object tracking, jadi pada catat otomatis satu objek bisa tercatat lebih dari sekali.
- Endpoint demo publik belum memakai autentikasi.
- Inferensi di browser berjalan satu thread (WASM), sekitar 3 FPS. Untuk demo real-time disarankan memakai AI server.

## Third-party Resources / Credits

- Kode aplikasi: MIT. Bobot model dilatih dengan Ultralytics YOLO11 (AGPL-3.0).
- Dataset: WaRP, Waste Recycling Plant Dataset (parohod, Kaggle).
- Library: React, Vite, Tailwind CSS, Recharts, Lucide (ISC), onnxruntime dan onnxruntime-web (MIT), FastAPI, OpenCV, Express, Supabase JS.
- Font: Plus Jakarta Sans (SIL Open Font License), via Google Fonts.
- Foto contoh (Wikimedia Commons):

| File | Sumber | Pembuat | Lisensi |
| :--- | :--- | :--- | :--- |
| `/samples/tumpukan-botol-1.jpg` | [Plastic bottles for recycling.jpg](https://commons.wikimedia.org/wiki/File:Plastic_bottles_for_recycling.jpg) | Radulf del Maresme | CC BY-SA 4.0 |
| `/samples/tumpukan-botol-2.jpg` | [Plastic Bottles - Waste (7992944072).jpg](https://commons.wikimedia.org/wiki/File:Plastic_Bottles_-_Waste_(7992944072).jpg) | Tony Webster | CC BY 2.0 |
| `/samples/tumpukan-kaleng.jpg` | [Heap of cans South Korea Pavilion Expo 2015.JPG](https://commons.wikimedia.org/wiki/File:Heap_of_cans_South_Korea_Pavilion_Expo_2015.JPG) | Gzzz | CC BY-SA 4.0 |
| `/samples/botol-pet.jpg` | [Dornbirn-bottle 3,05 Liter-Orangejuice-01ASD.jpg](https://commons.wikimedia.org/wiki/File:Dornbirn-bottle_3,05_Liter-Orangejuice-01ASD.jpg) | Asurnipal | CC BY-SA 4.0 |

## AI & Technology Disclosure

| Komponen | Isi |
| :--- | :--- |
| Nama Produk | SariRaga: Smart AI Recycling & Garbage Analytics |
| Framework / Frontend | React 19, Vite, Tailwind CSS, Recharts |
| Backend / Runtime | Node.js (Vercel Functions, Express untuk lokal), Python (FastAPI) |
| Database / Storage | Supabase PostgreSQL |
| Hosting / Deployment | Vercel (frontend + Core API), Cloudflare Tunnel (AI service) |
| AI Model / API / Method | YOLO11n (deteksi objek) yang dilatih ulang oleh tim, format ONNX, dijalankan dengan ONNX Runtime (server) dan onnxruntime-web (browser). Tidak memakai API AI pihak ketiga |
| Peran AI dalam Produk | Mendeteksi dan menghitung botol plastik, kaleng aluminium, dan kardus pada setiap frame. Hasilnya menjadi dasar pencatatan, valuasi Waste-to-Wealth, dan dashboard |
| Dataset / Data Source | WaRP (Kaggle) untuk pelatihan. Foto contoh dari Wikimedia Commons (lisensi CC) |
| Open-source Libraries | Lihat bagian Third-party Resources / Credits |
| Template / Boilerplate | Kerangka awal frontend dari template resmi Vite + React (`create-vite`) |
| AI Coding Assistant | Claude Code (Anthropic) untuk membantu penulisan kode, desain UI, dan dokumentasi. Seluruh kode diuji dan dipahami oleh tim |
| Pre-existing Components | Tidak ada. Seluruh aplikasi dan model dikembangkan untuk kompetisi ini |
| Third-party Assets / Credits | Foto contoh Wikimedia Commons, font Plus Jakarta Sans, ikon Lucide |

## Team Members

| Nama | Peran |
| :--- | :--- |
| Rangga Wikan Raditya | Ketua tim |
| Bim Dharmawa | Anggota |
| Azriel | Anggota |
