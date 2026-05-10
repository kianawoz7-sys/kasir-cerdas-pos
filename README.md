# Kasir Cerdas POS

![Kasir Cerdas POS](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

Kasir Cerdas POS adalah sistem Point of Sale (POS) modern berbasis web yang dirancang untuk kecepatan, kemudahan penggunaan, dan laporan yang komprehensif. Didesain dengan antarmuka yang sangat responsif, indah (menggunakan Tailwind CSS & Framer Motion), dan mudah dioperasikan dari perangkat seluler maupun desktop.

## ✨ Fitur Utama

- **Dashboard Kasir Cepat (Live Action)**
  - Tampilan grid responsif untuk kemudahan klik saat transaksi.
  - Perhitungan subtotal, total harga, dan jumlah secara instan.
  - _Checkout_ dengan 1-klik untuk efisiensi transaksi.
  
- **Manajemen Inventaris (Gudang Barang)**
  - Sistem CRUD (Create, Read, Update, Delete) yang responsif dan terintegrasi *real-time*.
  - _Live search_ untuk memudahkan pencarian stok ribuan barang.
  - Notifikasi sisa stok otomatis.

- **Arsip Penjualan & Laporan Bulanan**
  - **Live Audit**: Menyimpan seluruh transaksi secara otomatis dan akurat ke database.
  - **Statistik Penjualan**: Ringkasan omset bulanan yang otomatis terhitung.
  - Ekspor laporan dalam bentuk format gambar siap-cetak.

- **Modern Digital Receipt (Struk Digital)**
  - Berbagi struk instan ke WhatsApp atau sosial media pelanggan.
  - Opsi simpan struk ke galeri atau cetak struk untuk *printer thermal*.
  
- **Keamanan Firebase**
  - Autentikasi aman melalui *Google Sign-in*.
  - Penyimpanan tersinkronisasi di Cloud (Firebase Firestore).

## 🚀 Teknologi yang Digunakan

Aplikasi ini dibangun menggunakan modern _tech-stack_ untuk menjamin kecepatan, keamanan, dan skalabilitas:

- **Frontend**: React (Vite) + TypeScript
- **Styling**: Tailwind CSS + Lucide Icons
- **Animasi**: Framer Motion
- **Database & Auth**: Firebase (Google Auth, Firestore)
- **Utilities**: `react-hot-toast` (notifikasi), `date-fns` (waktu), `html-to-image` (ekspor struk & laporan).

## 💻 Cara Menjalankan Secara Lokal (Local Development)

**Prasyarat Utama:** Node.js versi 18+ terinstal di perangkat Anda.

1. **Clone repository ini dan install dependency:**
   ```bash
   git clone <url-repo-anda>
   cd kasir-cerdas-pos
   npm install
   ```

2. **Konfigurasi Firebase:**
   Buat proyek di [Firebase Console](https://console.firebase.google.com/), lalu buat file `.env` di dalam root *folder* proyek (sejajar dengan `package.json`). Isi dengan kredensial Firebase Anda:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Jalankan Aplikasi:**
   ```bash
   npm run dev
   ```
   Aplikasi dapat diakses secara lokal melalui `http://localhost:5173`.

## 🛠 Panduan Kontribusi

Jika Anda ingin menambahkan fitur baru, silakan *fork* repositori ini, buat *branch* khusus untuk *feature/bugfix* Anda, dan kirimkan **Pull Request**.

---
*Dibuat untuk mempermudah bisnis Anda.* **Kasir Cerdas © 2026**
