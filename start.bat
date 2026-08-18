@echo off
cd /d "%~dp0"
rem Rollback v1 verdict: set GROK_GUARD_LOGIC=v1
node src\server.js
pause
