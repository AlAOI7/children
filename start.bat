@echo off
chcp 65001 >nul

echo.
echo ============================================
echo   🧠 نظام تحليل سلوك الأطفال
echo   ADHD/ASD Diagnostic System
echo ============================================
echo.

REM Start XAMPP MySQL if not running
echo [1/3] التأكد من تشغيل MySQL...
tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I "mysqld.exe" >NUL
if ERRORLEVEL 1 (
    echo    MySQL غير مُشغّل — يتم تشغيله الآن...
    start "" /B C:\xampp\mysql\bin\mysqld.exe
    timeout /t 3 /nobreak >nul
    echo    ✅ MySQL started
) else (
    echo    ✅ MySQL is running
)

echo.
echo [2/3] تشغيل Flask Server...
start /B python app.py > flask_log.txt 2>&1
timeout /t 2 /nobreak >nul
echo    ✅ Flask running at http://localhost:5000

echo.
echo [3/3] فتح المتصفح...

REM Open Chrome with camera permission for localhost
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --use-fake-ui-for-media-stream http://localhost:5000

echo.
echo ============================================
echo   ✅ النظام يعمل الآن!
echo   📎 الموقع: http://localhost:5000
echo   ⚠️ لا تغلق هذه النافذة
echo ============================================
echo.
pause
