@echo off
node "%~dp0..\game-control.cjs" launch higher
if errorlevel 1 pause
