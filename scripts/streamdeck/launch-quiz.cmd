@echo off
node "%~dp0..\game-control.cjs" launch quiz
if errorlevel 1 pause
