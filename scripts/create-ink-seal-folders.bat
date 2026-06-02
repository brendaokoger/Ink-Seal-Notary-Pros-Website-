@echo off
setlocal EnableDelayedExpansion
title Ink ^& Seal Notary Pros — Folder Setup

echo.
echo  ============================================================
echo   Ink ^& Seal Notary Pros — Dropbox Folder Setup
echo  ============================================================
echo.

:: ── 1. Locate Dropbox ────────────────────────────────────────
set "DROPBOX="

:: Try Dropbox info.json (most reliable — works for custom paths)
set "INFO_JSON=%LOCALAPPDATA%\Dropbox\info.json"

if exist "%INFO_JSON%" (
    :: Use PowerShell to extract the path value from the JSON
    for /f "usebackq delims=" %%P in (
        `powershell -NoProfile -Command ^
            "(Get-Content '%INFO_JSON%' -Raw | ConvertFrom-Json).personal.path"^
            2^>nul`
    ) do set "DROPBOX=%%P"
)

:: Fall back to common default locations if JSON parse failed
if not defined DROPBOX (
    if exist "%USERPROFILE%\Dropbox" (
        set "DROPBOX=%USERPROFILE%\Dropbox"
    )
)

if not defined DROPBOX (
    if exist "%USERPROFILE%\OneDrive\Dropbox" (
        set "DROPBOX=%USERPROFILE%\OneDrive\Dropbox"
    )
)

:: Could not find Dropbox
if not defined DROPBOX (
    echo  ERROR: Could not locate your Dropbox folder automatically.
    echo.
    echo  Please edit this .bat file and set your Dropbox path manually
    echo  by adding this line near the top:
    echo.
    echo     set "DROPBOX=C:\Users\YourName\Dropbox"
    echo.
    pause
    exit /b 1
)

echo  Dropbox found at:
echo    %DROPBOX%
echo.

:: ── 2. Set root folder ───────────────────────────────────────
set "ROOT=%DROPBOX%\Ink & Seal Notary Pros"

:: ── 3. Create main workflow folders ─────────────────────────
echo  Creating main folders...
echo.

call :make_folder "%ROOT%\01 - New Intake Submissions"
call :make_folder "%ROOT%\02 - Pending Review"
call :make_folder "%ROOT%\03 - Awaiting Payment"
call :make_folder "%ROOT%\04 - Awaiting Original Documents"
call :make_folder "%ROOT%\05 - Awaiting RON"
call :make_folder "%ROOT%\06 - Approved For Processing"
call :make_folder "%ROOT%\07 - Submitted For Apostille"
call :make_folder "%ROOT%\08 - Completed Orders"
call :make_folder "%ROOT%\09 - Rejected - On Hold"
call :make_folder "%ROOT%\10 - Internal Templates ^& Forms"

:: ── 4. Create Client Folder Template ────────────────────────
echo.
echo  Creating Client Folder Template...
echo.

set "TEMPLATE=%ROOT%\10 - Internal Templates & Forms\Client Folder Template"

call :make_folder "%TEMPLATE%\01 - Uploaded Documents"
call :make_folder "%TEMPLATE%\02 - RON Documents"
call :make_folder "%TEMPLATE%\03 - Shipping Labels"
call :make_folder "%TEMPLATE%\04 - Apostille Submission"
call :make_folder "%TEMPLATE%\05 - Completed Documents"
call :make_folder "%TEMPLATE%\06 - Client Communication"

:: ── 5. Create README.txt ─────────────────────────────────────
set "README=%ROOT%\README.txt"

if not exist "%README%" (
    (
        echo CLIENT FOLDER NAMING FORMAT:
        echo ORDER# - CLIENT NAME - DOCUMENT TYPE
        echo.
        echo.
        echo EXAMPLES:
        echo INS-1001 - John Smith - Birth Certificate
        echo INS-1002 - Maria Lopez - POA
        echo INS-1003 - David Jones - Passport Copy
        echo.
        echo.
        echo RECOMMENDED FILE NAMING FORMAT:
        echo ORDER#_DOCUMENTTYPE_DATE
        echo.
        echo.
        echo EXAMPLES:
        echo INS1001_BirthCertificate_2026-05-28.pdf
        echo INS1002_POA_2026-05-28.pdf
        echo INS1003_PassportCopy_2026-05-28.pdf
    ) > "%README%"
    echo    [CREATED]  README.txt
) else (
    echo    [EXISTS]   README.txt
)

:: ── 6. Done ──────────────────────────────────────────────────
echo.
echo  ============================================================
echo   COMPLETE. Folder structure created at:
echo.
echo     %ROOT%
echo  ============================================================
echo.
echo  Press any key to open the folder in File Explorer...
pause >nul
explorer "%ROOT%"
exit /b 0


:: ── Helper: create a folder only if it does not already exist ─
:make_folder
if not exist "%~1\" (
    mkdir "%~1" 2>nul
    echo    [CREATED]  %~nx1
) else (
    echo    [EXISTS]   %~nx1
)
exit /b 0
