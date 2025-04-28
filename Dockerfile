FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias necesarias para compilar los módulos nativos
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copiar los archivos de package.json e instalar dependencias
COPY package*.json ./

# Instalar las dependencias
RUN npm ci

# Copiar el resto de los archivos
COPY . .

# Generar el prisma client
RUN npx prisma generate

# Compilar la aplicación
RUN npm run build

# Etapa de producción
FROM node:20-slim

WORKDIR /app

# Copiar archivos de la etapa anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Crear directorios necesarios
RUN mkdir -p ./uploads ./temp
RUN chmod -R 755 ./uploads ./temp

# Exponer el puerto que usa la aplicación
EXPOSE ${PORT}

# Comando para iniciar la aplicación
CMD ["npm", "run", "start:prod"]