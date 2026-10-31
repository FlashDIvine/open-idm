@echo off
setlocal enabledelayedexpansion

title Installing Internet Download Manager (LIDM Windows Edition)
echo ===================================================================
echo   Installing Internet Download Manager (LIDM Windows Edition)
echo   Unlimited Multi-Threaded Accelerator - Reverse-Engineered
echo ===================================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\Programs\LIDM"
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "STARTMENU_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

echo [*] Target installation directory: %TARGET_DIR%
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
if not exist "%TARGET_DIR%\public" mkdir "%TARGET_DIR%\public"

echo [*] Copying application files...
copy /y "%~dp0lidm.exe" "%TARGET_DIR%\" >nul
copy /y "%~dp0lidm-silent.vbs" "%TARGET_DIR%\" >nul
copy /y "%~dp0Internet Download Manager.bat" "%TARGET_DIR%\" >nul
copy /y "%~dp0public\*.*" "%TARGET_DIR%\public\" >nul
if exist "%~dp0uninstall-windows.bat" copy /y "%~dp0uninstall-windows.bat" "%TARGET_DIR%\" >nul

echo [*] Creating Desktop and Start Menu shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s1 = $ws.CreateShortcut('%DESKTOP_DIR%\Internet Download Manager.lnk'); ^
   $s1.TargetPath = 'wscript.exe'; ^
   $s1.Arguments = '\"%TARGET_DIR%\lidm-silent.vbs\"'; ^
   $s1.WorkingDirectory = '%TARGET_DIR%'; ^
   $s1.IconLocation = '%TARGET_DIR%\lidm.exe,0'; ^
   $s1.Description = 'Unlimited Internet Download Manager'; ^
   $s1.Save(); ^
   $s2 = $ws.CreateShortcut('%STARTMENU_DIR%\Internet Download Manager.lnk'); ^
   $s2.TargetPath = 'wscript.exe'; ^
   $s2.Arguments = '\"%TARGET_DIR%\lidm-silent.vbs\"'; ^
   $s2.WorkingDirectory = '%TARGET_DIR%'; ^
   $s2.IconLocation = '%TARGET_DIR%\lidm.exe,0'; ^
   $s2.Description = 'Unlimited Internet Download Manager'; ^
   $s2.Save();"

echo [*] Adding LIDM to User PATH...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$path = [Environment]::GetEnvironmentVariable('Path', 'User'); ^
   if ($path -notlike '*%TARGET_DIR%*') { [Environment]::SetEnvironmentVariable('Path', $path + ';%TARGET_DIR%', 'User') }"

echo.
echo ===================================================================
echo  [+] Installation Successful!
echo  [+] Shortcut added to Desktop and Start Menu.
echo  [+] You can also run 'lidm' from PowerShell or Command Prompt.
echo ===================================================================
echo.
pause
