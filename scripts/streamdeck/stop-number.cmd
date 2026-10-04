@echo off
node "%~dp0..\game-control.cjs" stop number
if errorlevel 1 pause
