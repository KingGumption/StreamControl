@echo off
node "%~dp0..\game-control.cjs" stop higher
if errorlevel 1 pause
