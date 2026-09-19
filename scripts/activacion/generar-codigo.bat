@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Node.js en este PC.
  echo Instala la version LTS desde https://nodejs.org y vuelve a correr este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo Primera vez en este PC: instalando dependencias del proyecto...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo La instalacion fallo. Revisa el error de arriba.
    pause
    exit /b 1
  )
)

set "ARCHIVO_LLAVE=%~dp0.llave-privada.local"

if exist "%ARCHIVO_LLAVE%" (
  set /p LLAVE_PRIVADA=<"%ARCHIVO_LLAVE%"
) else (
  echo.
  echo No hay una llave privada guardada todavia en este PC.
  echo Si todavia no tienes una, corre primero generar-llaves.bat
  echo.
  set /p LLAVE_PRIVADA="Pega tu LLAVE PRIVADA: "
  set /p GUARDAR="Guardarla en este PC para no pegarla cada vez? S/N: "
  if /i "!GUARDAR!"=="S" (
    echo !LLAVE_PRIVADA! > "%ARCHIVO_LLAVE%"
    echo Guardada en: %ARCHIVO_LLAVE%
    echo NO subas ese archivo a git ni se lo mandes a nadie.
  )
)

echo.
set /p DIAS="Cuantos dias de Premium le das a esta tienda? Ejemplo 30: "
set /p DISPOSITIVO="Pega el ID de dispositivo que te mando el bodeguero por WhatsApp: "

echo.
echo Generando codigo...
echo.

set "VENDE_FACIL_LLAVE_PRIVADA=%LLAVE_PRIVADA%"
node scripts\activacion\generar-codigo.mjs --dias %DIAS% --dispositivo "%DISPOSITIVO%"

echo.
echo Copia el codigo de arriba y mandaselo al bodeguero por WhatsApp.
echo.
pause
