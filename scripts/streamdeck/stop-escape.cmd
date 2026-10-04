@echo off
node "%~dp0..\game-control.cjs" stop escape
if errorlevel 1 pause
