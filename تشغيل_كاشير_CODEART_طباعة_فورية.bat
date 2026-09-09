@echo off
chcp 65001 > nul
title تشغيل كاشير CODEART - طباعة فورية بدون معاينة

echo ===================================================
echo     كاشير CODEART السحابي - وضع الطباعة الفورية
echo ===================================================
echo.
echo جاري فحص المتصفح وتشغيل نظام الكاشير...
echo ملاحظة: تأكد أن طابعة الفواتير الحرارية مضبوطة كطابعة افتراضية (Default Printer) في ويندوز.
echo.

set TARGET_URL=https://codeart.almagd555.com/pos/

:: 1. البحث عن Google Chrome
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

:: 2. البحث عن Microsoft Edge
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
echo تم تشغيل الكاشير بنجاح!
timeout /t 3 > nul
exit
