@echo off
rem Starts the Recall backend on http://localhost:8080. Works from any folder.
cd /d "%~dp0backend" || exit /b 1
echo Starting Recall backend on http://localhost:8080 - leave this window open. Press Ctrl+C to stop.
call "%~dp0backend\mvnw.cmd" -q spring-boot:run
if errorlevel 1 echo Backend stopped with an error. If the log says port 8080 is in use, close the other Recall backend window first.
