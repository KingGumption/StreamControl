@echo off
node "%~dp0..\game-control.cjs" launch hill
if errorlevel 1 pause
