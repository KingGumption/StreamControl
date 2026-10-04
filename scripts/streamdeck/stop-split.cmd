@echo off
node "%~dp0..\game-control.cjs" stop split
if errorlevel 1 pause
