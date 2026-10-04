@echo off
node "%~dp0..\game-control.cjs" launch escape
if errorlevel 1 pause
