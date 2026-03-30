@echo off
echo ============================================
echo  ADHD/ASD Diagnostic System — Startup Script
echo ============================================

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python غير مثبت. قم بتنزيله من https://python.org
  pause & exit
)

:: Create venv if not exists
if not exist "venv" (
  echo [1/4] Creating Python virtual environment...
  python -m venv venv
)

:: Activate venv
call venv\Scripts\activate.bat

:: Install requirements
echo [2/4] Installing Python dependencies...
pip install -r requirements.txt --quiet

:: Check MySQL
echo [3/4] Checking database connection...
python -c "import mysql.connector; mysql.connector.connect(host='localhost',user='root',password='')" >nul 2>&1
if errorlevel 1 (
  echo [WARNING] MySQL connection failed.
  echo Please make sure MySQL is running and update .env with your DB_PASSWORD.
  pause
)

:: Start Flask
echo [4/4] Starting Flask server on http://localhost:5000
echo.
echo Open your browser at: http://localhost:5000
echo Press CTRL+C to stop the server.
echo ============================================
python app.py
pause
