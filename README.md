<div align="center">

# ⚡ Internet Download Manager (LIDM)
### Unlimited Multi-Threaded Download Accelerator for Linux & Windows

[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blue?style=for-the-badge&logo=linux&logoColor=white)](https://github.com)
[![Engine](https://img.shields.io/badge/Engine-TypeScript%20%7C%20Node.js-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://github.com)
[![MCP](https://img.shields.io/badge/MCP-Protocol%20Ready-5c4ee5?style=for-the-badge)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**LIDM** is an open-source, unlimited multi-threaded download manager reverse-engineered from **Internet Download Manager (IDM)** using **REA (Reverse Engineer Anything)**. It runs as a true standalone desktop application on both **Linux** and **Windows** with zero browser clutter.

[Fitur](#-fitur-utama) • [Instalasi Linux](#-instalasi-di-linux) • [Instalasi Windows](#-instalasi-di-windows) • [Penggunaan CLI](#-penggunaan-cli) • [Integrasi MCP (AI)](#-integrasi-mcp-ai-agents)

---

</div>

## 🌟 Fitur Utama

- 🚀 **Dynamic Multi-Threaded Segmentation**: Memecah file menjadi 1 hingga 32 segmen paralel secara dinamis untuk memaksimalkan kecepatan unduhan.
- 🖥️ **True Standalone Desktop Window**:
  - **Linux**: Berjalan mandiri menggunakan jendela native **GTK3 + WebKit2** (tanpa tab browser, address bar, atau ekstensi).
  - **Windows**: Berjalan mandiri menggunakan **App Mode** bawaan Windows 10/11 (bebas dari gangguan browser biasa).
- 🔍 **Reverse-Engineered Search Engine (`CMainDlgSearchBar`)**:
  - Pencarian keyword real-time, wrap-around navigation (F3/Find Next).
  - Filter target: Nama File, Deskripsi, dan Host/URL/Referer.
  - Opsi: *Match case* & *Match whole string*.
- 📁 **Manajemen Kategori Otomatis**: Otomatis mengelompokkan unduhan ke folder *Compressed, Documents, Music, Programs,* dan *Video*.
- ⏸️ **Pause & Resume**: Mendukung HTTP Range headers untuk melanjutkan unduhan yang terputus kapan saja.
- 🤖 **Model Context Protocol (MCP) Server**: Memungkinkan AI Agent (Antigravity, Gemini CLI, Claude Code, Cursor) mengontrol unduhan secara otomatis.
- ⚡ **REST API & Server-Sent Events (SSE)**: Sinkronisasi status download secara real-time tanpa polling.

---

## 🐧 Instalasi di Linux (Debian / Ubuntu / Mint / Arch / Fedora)

### 1. Prasyarat
- Node.js 18+ (atau instalasi biner mandiri)
- Python 3 dengan `python3-gi` dan WebKit2 (sudah bawaan di sebagian besar distro GNOME/Ubuntu)

### 2. Jalankan Installer
```bash
git clone https://github.com/<username>/lidm.git
cd lidm
./install.sh
```

Installer akan otomatis:
1. Mem-build bundle aplikasi.
2. Memasang shortcut desktop di menu aplikasi dan desktop (`Internet Download Manager`).
3. Mendaftarkan command `lidm` ke PATH sistem (`~/.local/bin/lidm`).

### 3. Menjalankan
- Klik icon **Internet Download Manager (LIDM)** dari menu aplikasi, atau ketik:
```bash
lidm
```

---

## 🪟 Instalasi di Windows (Windows 10 / 11)

### Opsi A: Portable (Tanpa Install)
1. Download file rilis **`LIDM-Windows-x64-v1.0.0.zip`** dari tab [Releases](../../releases).
2. Ekstrak ZIP di folder mana saja.
3. Klik 2x **`Internet Download Manager.bat`** atau **`lidm-silent.vbs`**.

### Opsi B: Install ke Sistem (Disarankan)
1. Di dalam folder hasil ekstrak, klik kanan file **`install-windows.bat`** -> pilih **Run**.
2. Script akan otomatis:
   - Memasang LIDM ke `%LocalAppData%\Programs\LIDM`.
   - Membuat shortcut di **Desktop** dan **Start Menu**.
   - Mendaftarkan perintah `lidm` ke PowerShell dan Command Prompt.

---

## 💻 Penggunaan CLI

LIDM dapat dikendalikan langsung lewat Terminal / Command Prompt:

```bash
# Membuka jendela antarmuka Desktop
lidm ui

# Menambah download baru dengan koneksi default (8 segmen)
lidm add "https://speed.hetzner.de/100MB.bin"

# Menambah download dengan akselerasi maksimal (32 segmen)
lidm add "https://speed.hetzner.de/1GB.bin" --segments 32

# Melihat status semua tugas download
lidm list

# Menjeda unduhan
lidm pause <TASK_ID>

# Melanjutkan unduhan
lidm resume <TASK_ID>

# Menghapus tugas (opsional: sekaligus hapus file fisik)
lidm delete <TASK_ID> --delete-file
```

---

## 🤖 Integrasi MCP (AI Agents)

LIDM dilengkapi server MCP bawaan sehingga AI Coding Assistant kamu dapat memonitor atau mendownload file secara langsung.

Tambahkan konfigurasi berikut ke file settings MCP kamu (misal `~/.gemini/antigravity-cli/mcp_config.json` atau Claude Desktop):

```json
{
  "mcpServers": {
    "lidm": {
      "command": "lidm",
      "args": ["mcp"]
    }
  }
}
```

---

## 🏗️ Struktur Proyek

```
lidm/
├── bin/
│   ├── lidm-app.py          # Native GTK3+WebKit2 standalone window (Linux)
│   ├── lidm-launcher.sh     # Desktop launcher script (Linux)
│   └── lidm.js              # Node.js CLI entrypoint
├── public/
│   ├── index.html           # Desktop Web UI (Responsive Edge-to-Edge)
│   └── lidm.svg             # Logo/Icon resmi
├── src/
│   ├── categories/          # Klasifikasi tipe file otomatis
│   ├── engine/              # Multi-threaded segment downloader & queue manager
│   ├── mcp/                 # Model Context Protocol server stdio
│   ├── search/              # Reverse-engineered IDM search subsystem
│   ├── server/              # REST API & SSE Server
│   ├── cli.ts               # CLI & cross-platform window launcher
│   └── main.ts              # Entry point
├── dist/
│   ├── windows-x64/         # Paket rilis mandiri Windows x64
│   └── lidm.exe             # Portable PE32+ executable untuk Windows
├── install.sh               # One-click installer untuk Linux
└── package.json
```

---

## 📄 Lisensi

Proyek ini didistribusikan di bawah lisensi **MIT License**.
Reverse-engineered for educational and open-source cross-platform development purposes using **REA**.
