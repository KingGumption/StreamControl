@echo off
node "%~dp0..\game-control.cjs" launch split
if errorlevel 1 pause
