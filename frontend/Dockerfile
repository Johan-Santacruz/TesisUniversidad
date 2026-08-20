# El frontend es estático: se compila una vez y lo sirve nginx. Vite no debe
# quedarse corriendo en el servidor, es un servidor de desarrollo.
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# La URL de la API se hornea en el momento de compilar: Vite sustituye
# import.meta.env en el paquete, así que no se puede cambiar después sin
# volver a construir.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build


FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
