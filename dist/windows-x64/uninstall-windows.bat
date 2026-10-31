@echo off
setlocal

echo ===================================================================
echo   Uninstalling Internet Download Manager (LIDM)
echo ===================================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\Programs\LIDM"
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "STARTMENU_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

echo [*] Removing shortcuts...
del /f /q "%DESKTOP_DIR%\Internet Download Manager.lnk" 2>nul
del /f /q "%STARTMENU_DIR%\Internet Download Manager.lnk" 2>nul

echo [*] Stopping running background processes...
taskkill /f /im lidm.exe 2>nul

echo [*] Removing application files...
rmdir /s /q "%TARGET_DIR%" 2>nul

echo.
echo [+] LIDM has been cleanly uninstalled.
pause
