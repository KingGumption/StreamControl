@echo off
node "%~dp0..\game-control.cjs" launch boss
if errorlevel 1 pause
