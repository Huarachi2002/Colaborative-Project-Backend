echo "Esperando a que la base de datos esté lista..."
npx prisma migrate deploy
if [ $? -ne 0 ]; then
  echo "Error al ejecutar las migraciones de Prisma"
  exit 1
fi
echo "Iniciando la aplicación..."
npm run start:prod