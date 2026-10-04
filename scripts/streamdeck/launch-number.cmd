@echo off
node "%~dp0..\game-control.cjs" launch number
if errorlevel 1 pause
