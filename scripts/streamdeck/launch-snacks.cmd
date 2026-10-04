@echo off
node "%~dp0..\game-control.cjs" launch snacks
if errorlevel 1 pause
