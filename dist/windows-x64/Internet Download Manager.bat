@echo off
setlocal
cd /d "%~dp0"
start "" wscript.exe "%~dp0lidm-silent.vbs"
