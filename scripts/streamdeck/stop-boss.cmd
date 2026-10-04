@echo off
node "%~dp0..\game-control.cjs" stop boss
if errorlevel 1 pause
