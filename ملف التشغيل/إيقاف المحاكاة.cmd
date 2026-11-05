@echo off
rem Runs the PowerShell script next to it, hidden. Keep this file plain ASCII (cmd misreads Arabic inside a .cmd).
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0_tools\stop.ps1"
