# SENDA — análisis inteligente de video

Demostración local de un flujo seguro para convertir un testimonio ficticio en
segmentos navegables, hechos contrastados, clasificación BETO, fuentes oficiales
y tres rutas institucionales verificables.

La aplicación usa un único backend FastAPI y un frontend React. El video, las
transcripciones, los hechos, los resultados, los consentimientos y los detalles
de auditoría se cifran con AES-256-GCM y claves derivadas por registro. Los
videos se cifran por bloques y el backend admite HTTP Range.

## Preparación local

Requisitos: Python 3.12, Node.js, FFmpeg, OpenSSL y SQLite con FTS5.

```bash
./scripts/bootstrap-local.sh
```

Luego, en terminales separadas:

```bash
make backend
make frontend
```

Abra `http://localhost:5173/subir-video` e ingrese con:

- Usuario: `camilobalanta1@gmail.com`
- Contraseña: `dios#12Admin`

El botón **Probar administrador de prueba**, debajo de «Ingresar», llena ambos
campos. La cuenta se siembra al arrancar mientras `SENDA_DEMO_USERS_ENABLED` esté
en `true`; se cambia con `SENDA_DEMO_ADMIN_EMAIL` y `SENDA_DEMO_ADMIN_PASSWORD` en
`Backend/.env` (mínimo 12 caracteres, igual que cualquier otra cuenta) y con
`DEMO_ADMIN` en `frontend/src/pages/login-page.tsx`.

La demostración incluida es completamente sintética. El video reproducible dura
53 segundos y coincide con los tiempos de la línea de tiempo.

## Proveedores de IA

Sin llaves de proveedores, el caso demo recorre las ocho etapas de forma
determinista. Para el pipeline configurado:

```dotenv
SENDA_OPENAI_API_KEY=...
SENDA_ANTHROPIC_API_KEY=...
SENDA_OPENAI_ANALYSIS_MODEL=gpt-5.6-terra
SENDA_ANTHROPIC_ANALYSIS_MODEL=claude-sonnet-5
SENDA_WHISPER_MODEL=whisper-1
```

BETO solo devuelve categoría y subcategoría. GPT y Claude leen de forma
independiente hechos, urgencia, vulnerabilidades, eventos y rutas; cualquier
desacuerdo queda visible.

## Cierre de memoria

Al terminar el análisis, SENDA genera automáticamente una imagen institucional
16:9 que cierra el caso. La generación es una operación no crítica: si falla, el
análisis sigue completo y el caso continúa sin cierre visual.

```dotenv
SENDA_OPENAI_API_KEY=...
SENDA_OPENAI_IMAGE_MODEL=gpt-image-2
SENDA_MEMORY_IMAGE_MAX_BYTES=10485760
SENDA_MEMORY_IMAGE_PROMPT_VERSION=memory-image-v1
SENDA_MEMORY_CLOSING_SECONDS=7
SENDA_VIDEO_RETENTION_DAYS=7
```

La imagen es una **ilustración dibujada a mano**, no una fotografía. La elección
es ética antes que estética: un dibujo declara que es una representación, y una
imagen fotorrealista invitaría a leerse como registro de los hechos.

**Límite ético.** El prompt se arma únicamente con hechos ya persistidos y
generalizados del caso: la categoría y subcategoría que clasificó BETO, el tipo
de entorno, y el lugar reducido a una de cinco regiones naturales del país. El
municipio o la dirección se leen dentro del constructor de contexto y no salen de
él. Nunca se envían el video, el audio, la transcripción completa, nombres,
ubicaciones exactas, composición familiar ni los hechos mismos al generador de
imágenes. Cada categoría tiene su propia escena, que nombra lo que queda
—territorio, casa, camino— y nunca el hecho. El modelo tampoco escribe texto
dentro de la imagen: la leyenda la superpone SENDA.

Recorrido:

1. Terminado el análisis, la imagen queda en `pending_review` y visible en la
   sección `Cierre de memoria`, después del recorrido institucional.
2. Una persona validadora o administradora puede aprobarla, regenerarla o
   descartarla. Toda decisión queda auditada y protegida contra solicitudes
   simultáneas.
3. La aprobación renderiza un video derivado: el testimonio original intacto más
   una placa final de siete segundos con la imagen, en silencio y conservando la
   proporción. El original nunca se sobrescribe.
4. La interfaz mantiene accesos separados a `Testimonio original` y `Versión con
   cierre de memoria`. Si FFmpeg falla, la aprobación se conserva y el cierre se
   puede reintentar.

La leyenda que SENDA superpone en la placa, y que la interfaz muestra junto a la
imagen, es exactamente:

> Imagen representativa generada a partir del contexto documentado del caso. No
> corresponde a un registro de los hechos.

El caso de demostración usa una imagen local versionada de 1536×864: recorre todo
el flujo sin llamar a ningún proveedor y sin costo. El adaptador real solo se
activa para videos cargados cuando hay una clave configurada.

Imagen, metadatos y video derivado se almacenan cifrados, siguen la misma
retención que el original y se eliminan con el caso a través de una cola de purga
cifrada e idempotente.

## Administración sin panel visual

```bash
cd Backend
.venv/bin/senda users list
.venv/bin/senda users create --email operador@senda.local --password 'Clave-Segura-2026!' --role operador
.venv/bin/senda users disable --email operador@senda.local
.venv/bin/senda users password --email operador@senda.local --password 'Nueva-Clave-2026!'
.venv/bin/senda sources seed
.venv/bin/senda sources list
.venv/bin/senda retention run
```

## Verificación

```bash
make test
make contracts-check
make verify
```

El smoke con proveedores reales es optativo, usa únicamente texto ficticio y
puede generar costos:

```bash
cd Backend
RUN_REAL_PROVIDER_SMOKE=1 PYTHONPATH=. .venv/bin/pytest tests/smoke -q
```

El contrato TypeScript se genera exclusivamente desde el OpenAPI de FastAPI:

```bash
./scripts/generate-contracts.sh
```
