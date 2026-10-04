@echo off
node "%~dp0..\game-control.cjs" start quiz
if errorlevel 1 pause
