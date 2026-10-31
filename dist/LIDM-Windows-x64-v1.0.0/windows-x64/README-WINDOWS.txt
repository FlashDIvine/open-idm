========================================================================
 INTERNET DOWNLOAD MANAGER (IDM) - WINDOWS EDITION x64
 Reverse-Engineered from IDM v6.43 with REA (Reverse Engineer Anything)
 Unlimited Multi-Threaded Dynamic Segmentation (1 - 32 Connections)
========================================================================

FITUR UTAMA:
- Standalone Native Window (menggunakan Microsoft Edge/Chrome App Mode bawaan Windows 10/11)
  * Bebas dari tab browser, address bar, atau jendela browser biasa.
- Mesin Download Tersegmentasi Multi-Threaded (akselerasi kecepatan hingga 32 koneksi).
- Pause & Resume download yang mendukung HTTP Range.
- Mesin Pencari & Filter Hasil Reverse Engineering IDMan.exe (CMainDlgSearchBar).
- Kategori Download Otomatis (Compressed, Documents, Music, Programs, Video).
- REST API & Real-time Server-Sent Events (SSE).
- Model Context Protocol (MCP) Server untuk integrasi AI (Gemini CLI, Cursor, Claude Code).

------------------------------------------------------------------------
PANDUAN PENGGUNAAN DI WINDOWS:
------------------------------------------------------------------------

CARA 1: PORTABLE (TANPA INSTALL)
- Cukup double-click file "Internet Download Manager.bat" atau "lidm-silent.vbs".
- Jendela IDM akan langsung terbuka secara mandiri di desktop Windows kamu.

CARA 2: INSTALL KE SISTEM (DIREKOMENDASIKAN)
- Double-click file "install-windows.bat".
- Script akan secara otomatis:
  1. Memasang LIDM ke folder %LocalAppData%\Programs\LIDM.
  2. Membuat shortcut "Internet Download Manager" di Desktop dan Start Menu Windows.
  3. Mendaftarkan perintah 'lidm' ke Command Prompt dan PowerShell.

CARA 3: CLI & MCP DARI CMD / POWERSHELL
- Buka CMD atau PowerShell di folder ini:
  lidm.exe ui                          -> Membuka jendela desktop IDM
  lidm.exe add <URL>                   -> Menambah download baru
  lidm.exe add <URL> --segments 16     -> Download dengan 16 koneksi paralel
  lidm.exe list                        -> Melihat daftar antrean download
  lidm.exe pause <TASK_ID>             -> Menjeda download
  lidm.exe resume <TASK_ID>            -> Melanjutkan download
  lidm.exe mcp                         -> Menjalankan LIDM MCP server stdio

------------------------------------------------------------------------
CARA UNINSTALL:
- Cukup jalankan "uninstall-windows.bat" untuk menghapus instalasi dan shortcut secara bersih.
========================================================================
