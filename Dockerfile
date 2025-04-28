FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias necesarias para compilar los módulos nativos
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar los archivos de package.json e instalar dependencias
COPY package*.json ./

# Instalar las dependencias
RUN npm ci

# Copiar el resto de los archivos
COPY . .

# Generar el prisma client con la URL de la base de datos actualizada
# ENV DATABASE_URL="postgresql://postgres:123@diagram_db:5432/Diagrama?schema=public"
RUN npx prisma generate

# Compilar la aplicación
RUN npm run build

# Etapa de producción
FROM node:20-slim

WORKDIR /app

# Instalar las dependencias necesarias para ejecutar bcrypt
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de la etapa anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Configurar la URL de la base de datos para el entorno de producción
# ENV DATABASE_URL="postgresql://postgres:123@diagram_db:5432/Diagrama?schema=public"

# Instalar solo las dependencias de producción y reconstruir bcrypt
RUN npm ci --only=production && npx prisma generate

# Crear directorios necesarios
RUN mkdir -p ./uploads ./temp
RUN chmod -R 755 ./uploads ./temp

# Exponer el puerto que usa la aplicación
EXPOSE 3001

# Comando para iniciar la aplicación
CMD ["npm", "run", "start:prod"]