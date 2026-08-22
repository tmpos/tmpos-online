@echo off
echo ========================================
echo Instalando Supabase Client para TMPOS
echo ========================================
echo.

echo Instalando @supabase/supabase-js...
call npm install @supabase/supabase-js

echo.
echo ========================================
echo Instalacion completada!
echo ========================================
echo.
echo Proximos pasos:
echo 1. Ejecuta el script SQL en Supabase Studio
echo 2. Obtén las claves de API en Settings -^> API
echo 3. Actualiza el archivo .env con las claves
echo.
echo Lee INSTRUCCIONES_SUPABASE.md para mas detalles
echo.
pause
