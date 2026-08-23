# Desplegar SENDA en la máquina virtual

Servidor `104.225.223.220`, SSH por el puerto `2228`, usuario `camilo`,
dominio `senda.casa`.

**El dominio y el certificado no se gestionan aquí.** El proveedor del servidor
ya enruta `senda.casa` y termina el TLS en su propio proxy. Esta máquina solo
publica HTTP plano en el puerto 80 y ese proxy entra por ahí. No hay que tocar
DNS, ni pedir certificados, ni abrir el 443.

Todo lo que sigue se ejecuta desde tu equipo o dentro del servidor; nada de
esto es automático.

## 1. Preparar el servidor

```bash
ssh camilo@104.225.223.220 -p 2228

mkdir -p ~/senda && cd ~/senda
git clone https://github.com/Miloiskd/TesisUniversidad.git .
```

El puerto 80 tiene que estar abierto para que el proxy del anfitrión alcance a
Caddy. Si hay cortafuegos:

```bash
ufw allow 80/tcp
```

El 443 no se abre: el certificado no se emite en esta máquina.

## 2. Las claves

```bash
cp .env.server.example .env
nano .env
```

`SENDA_DOMINIO` debe ser exactamente `senda.casa`. De ahí sale
`SENDA_FRONTEND_ORIGIN=https://senda.casa`, y si no coincide con el dominio real
el navegador bloquea las peticiones por CORS: la aplicación se ve pero no
responde.

Genera las dos claves **dentro del servidor**, cada una por separado, y no
reutilices las de tu equipo:

```bash
openssl rand -base64 32 | tr '/+' '_-'
```

Si pierdes `SENDA_ENCRYPTION_MASTER_KEY`, lo que ya se haya guardado no se
recupera: cada registro se cifra con una clave derivada de ella.

## 3. Los pesos afinados de BETO

No están en el repositorio: son 420 MB cada uno y GitHub rechaza cualquier
archivo de más de 100 MB. Se copian una sola vez, **desde tu equipo**:

```bash
ssh camilo@104.225.223.220 -p 2228 \
  "mkdir -p ~/senda/Backend/ml-artifacts/violencia_classifier_artifacts"

scp -P 2228 \
  Backend/ml-artifacts/violencia_classifier_artifacts/model_categoria.pt \
  Backend/ml-artifacts/violencia_classifier_artifacts/model_subcategoria.pt \
  camilo@104.225.223.220:~/senda/Backend/ml-artifacts/violencia_classifier_artifacts/
```

Los demás artefactos (codificadores, `metrics_config_singlelabel.json`,
`tokenizer/`) sí viajan en el repositorio y llegan con el `git clone`.

Sin los dos `.pt` la aplicación arranca igual, pero la clasificación con BETO
queda marcada como no disponible y el análisis lo dice en vez de inventárselo.

Comprueba que llegaron antes de seguir:

```bash
ls -lh ~/senda/Backend/ml-artifacts/violencia_classifier_artifacts/*.pt
# deben aparecer los dos, ~420 MB cada uno
```

## 4. Levantar

```bash
docker compose up -d --build
```

La primera construcción tarda y **necesita salida a internet**: la imagen del
backend baja torch (más de 2 GB) y el encoder base de BETO (440 MB), que queda
dentro de la imagen para que el arranque no dependa de la red. Las siguientes
reutilizan esas capas mientras `pyproject.toml` no cambie.

```bash
docker compose ps               # los tres servicios en estado "running"
curl -I http://localhost        # responde desde dentro del servidor
docker compose logs -f api      # el arranque de la API
```

En los registros de `api` verás avisos de `transformers` sobre claves
`UNEXPECTED` y `MISSING` al cargar BETO: son normales. El modelo usa
`last_hidden_state`, no el `pooler` que aparece como `MISSING`.

## 5. Comprobar

- `https://senda.casa` abre el libro (el candado lo pone el proxy del
  anfitrión, no esta máquina).
- Entra con el administrador de prueba y abre el caso de demostración.
- La pantalla de progreso avanza etapa por etapa: si se quedara quieta hasta
  el final, el proxy estaría reteniendo los eventos SSE.
- En la etapa de clasificación debe aparecer una categoría y una subcategoría.
  Si dice que BETO no está disponible, faltan los `.pt` del paso 3.

## Actualizar

```bash
cd ~/senda && git pull && docker compose up -d --build
```

La base y los testimonios cifrados viven en un volumen y sobreviven a cada
despliegue. Los pesos afinados también: están montados de sólo lectura desde el
disco del servidor, no dentro de la imagen. Solo hay que volver a copiarlos si
reentrenas el modelo.

## Lo que este despliegue todavía no resuelve

- **La cuenta de demostración es pública.** Está sembrada al arrancar y su
  contraseña aparece en el README. En un dominio público, cualquiera entra.
  Cámbiala en el `.env` del servidor o pon `SENDA_DEMO_USERS_ENABLED=false`.
- **No hay copias de seguridad.** El volumen `datos` guarda la base y los
  videos cifrados; nadie los está respaldando.
- **SQLite y un solo proceso.** Suficiente para una demostración y para la
  sustentación; no para varios analistas trabajando a la vez.
- **Consentimiento.** La casilla de términos del inicio de sesión todavía no
  registra nada, y no existe la autorización de tratamiento que la Ley 1581
  exige para datos sensibles. Antes de que esto vea un testimonio real, eso
  hay que resolverlo.
