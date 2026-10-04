@echo off
node "%~dp0..\game-control.cjs" stop quiz
if errorlevel 1 pause
