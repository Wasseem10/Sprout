@echo off
cd /d "%~dp0"
node scripts/start-ui-preview.mjs
if errorlevel 1 pause
