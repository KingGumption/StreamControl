@echo off
node "%~dp0..\game-control.cjs" stop hill
if errorlevel 1 pause
