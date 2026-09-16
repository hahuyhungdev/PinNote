@echo off
cd /d "%~dp0"
if exist "%~dp0dist\win-unpacked\PinNote.exe" (
  start "" "%~dp0dist\win-unpacked\PinNote.exe"
) else (
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
)
