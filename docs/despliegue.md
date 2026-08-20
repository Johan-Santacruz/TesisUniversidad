# Desplegar SENDA en la máquina virtual

Servidor `104.225.223.220`, SSH por el puerto `2228`, dominio `senda.casa`.

Todo lo que sigue se ejecuta desde tu equipo o dentro del servidor; nada de
esto es automático.

## 1. Apuntar el dominio (esto va primero)

En GoDaddy, en los registros DNS de `senda.casa`, **edita** el registro `A` de
`@` que hoy apunta al creador de webs y pon `104.225.223.220`. No crees uno
nuevo: solo puede haber un `A` para `@`.

El `cname` de `www` ya apunta a `senda.casa.` y seguirá al `A` solo. Los `ns`,
el `soa` y el `_dmarc` no se tocan.

Comprueba la propagación antes de seguir, porque Caddy no podrá obtener el
certificado hasta que responda:

```bash
dig +short senda.casa
# debe devolver 104.225.223.220
```

## 2. Preparar el servidor

```bash
ssh camilo@104.225.223.220 -p 2228

mkdir -p ~/senda && cd ~/senda
git clone https://github.com/Miloiskd/TesisUniversidad.git .
```

Los puertos 80 y 443 tienen que estar abiertos. Si hay cortafuegos:

```bash
ufw allow 80/tcp && ufw allow 443/tcp
```

## 3. Las claves

```bash
cp .env.server.example .env
nano .env
```

Genera las dos claves **dentro del servidor**, cada una por separado, y no
reutilices las de tu equipo:

```bash
openssl rand -base64 32 | tr '/+' '_-'
```

Si pierdes `SENDA_ENCRYPTION_MASTER_KEY`, lo que ya se haya guardado no se
recupera: cada registro se cifra con una clave derivada de ella.

## 4. Los pesos de BETO

No están en el repositorio: son 420 MB cada uno y GitHub rechaza cualquier
archivo de más de 100 MB. Se copian una sola vez, **desde tu equipo**:

```bash
scp -P 2228 \
  Backend/ml-artifacts/violencia_classifier_artifacts/model_categoria.pt \
  Backend/ml-artifacts/violencia_classifier_artifacts/model_subcategoria.pt \
  camilo@104.225.223.220:~/senda/Backend/ml-artifacts/violencia_classifier_artifacts/
```

Sin ellos la aplicación arranca igual, pero la clasificación con BETO queda
marcada como no disponible y el análisis lo dice en vez de inventárselo.

## 5. Levantar

```bash
docker compose up -d --build
```

La primera construcción tarda: la imagen del backend baja torch, que son más
de 2 GB. Las siguientes reutilizan esa capa mientras `pyproject.toml` no
cambie.

```bash
docker compose logs -f proxy   # ver cómo Caddy obtiene el certificado
docker compose ps
curl -I https://senda.casa
```

## 6. Comprobar

- `https://senda.casa` abre el libro.
- El candado del navegador es válido (Caddy renueva solo).
- Entra con el administrador de prueba y abre el caso de demostración.
- La pantalla de progreso avanza etapa por etapa: si se quedara quieta hasta
  el final, el proxy estaría reteniendo los eventos SSE.

## Actualizar

```bash
cd ~/senda && git pull && docker compose up -d --build
```

La base y los testimonios cifrados viven en un volumen y sobreviven a cada
despliegue. Los pesos de BETO también: están montados desde el disco del
servidor, no dentro de la imagen.

## Lo que este despliegue todavía no resuelve

- **La cuenta de demostración es pública.** Está sembrada al arrancar y su
  contraseña aparece en el README. En una IP pública, cualquiera entra.
  Cámbiala en el `.env` del servidor o pon `SENDA_DEMO_USERS_ENABLED=false`.
- **No hay copias de seguridad.** El volumen `datos` guarda la base y los
  videos cifrados; nadie los está respaldando.
- **SQLite y un solo proceso.** Suficiente para una demostración y para la
  sustentación; no para varios analistas trabajando a la vez.
- **Consentimiento.** La casilla de términos del inicio de sesión todavía no
  registra nada, y no existe la autorización de tratamiento que la Ley 1581
  exige para datos sensibles. Antes de que esto vea un testimonio real, eso
  hay que resolverlo.
