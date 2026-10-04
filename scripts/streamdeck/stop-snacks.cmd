@echo off
node "%~dp0..\game-control.cjs" stop snacks
if errorlevel 1 pause
