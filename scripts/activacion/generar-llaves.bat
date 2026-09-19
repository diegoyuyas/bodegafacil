@echo off
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
)

node scripts\activacion\generar-llaves.mjs

echo.
echo ============================================================
echo  Guarda la LLAVE PRIVADA de arriba en un lugar seguro.
echo  La proxima vez que corras generar-codigo.bat, te va a pedir
echo  que la pegues una vez y te va a ofrecer guardarla en este PC
echo  para no volver a pedirtela.
echo.
echo  La LLAVE PUBLICA va pegada en src/infraestructura/seguridad/
echo  activacion.ts, en la constante LLAVE_PUBLICA_HEX. Solo hace
echo  falta si decides rotar las llaves que ya vienen por defecto
echo  en el proyecto.
echo ============================================================
echo.
pause
