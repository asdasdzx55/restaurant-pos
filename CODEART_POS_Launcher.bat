@echo off
chcp 65001 > nul
title تشغيل كاشير CODEART - نافذة برنامج مستقلة وطباعة فورية

echo ===================================================
echo     منظومة CODEART السحابية - تشغيل نقطة البيع
echo ===================================================
echo.
echo جاري فتح البرنامج كنافذة سطح مكتب مستقلة...
echo.

set TARGET_URL=https://codeart.almagd555.com/pos/

:: 1. الفحص والتشغيل عبر Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk-printing --app="%TARGET_URL%"
    goto DONE
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk-printing --app="%TARGET_URL%"
    goto DONE
)

if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --kiosk-printing --app="%TARGET_URL%"
    goto DONE
)

:: 2. الفحص والتشغيل عبر Microsoft Edge
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --app="%TARGET_URL%"
    goto DONE
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --app="%TARGET_URL%"
    goto DONE
)

start chrome.exe --kiosk-printing --app="%TARGET_URL%"

:DONE
echo تم تشغيل البرنامج بنجاح!
timeout /t 2 > nul
exit