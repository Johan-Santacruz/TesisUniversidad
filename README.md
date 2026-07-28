# SIAD — análisis inteligente de video

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

- Usuario: `admin@siad.local`
- Contraseña: `Cambiar-Esta-Clave-2026!`

La demostración incluida es completamente sintética. El video reproducible dura
53 segundos y coincide con los tiempos de la línea de tiempo.

## Controles de datos reales

`REAL_DATA_ENABLED=false` es el estado seguro inicial. Un testimonio real solo
puede cargarse cuando estén activos, al mismo tiempo:

- `SIAD_REAL_DATA_ENABLED=true`
- `SIAD_OPENAI_ZDR_CONFIRMED=true`
- `SIAD_ANTHROPIC_ZDR_CONFIRMED=true`
- `SIAD_INSTITUTIONAL_AUTHORIZATION_ID=<referencia>`
- consentimiento explícito y referencia de autorización para ese video

El código registra y hace cumplir esos controles, pero no sustituye la revisión
jurídica, la aprobación ZDR de los proveedores ni la autorización institucional
exigida por la Ley 1581.

## Proveedores de IA

Sin llaves de proveedores, el caso demo recorre las ocho etapas de forma
determinista. Para el pipeline configurado:

```dotenv
SIAD_OPENAI_API_KEY=...
SIAD_ANTHROPIC_API_KEY=...
SIAD_OPENAI_ANALYSIS_MODEL=gpt-5.6-terra
SIAD_ANTHROPIC_ANALYSIS_MODEL=claude-sonnet-5
SIAD_WHISPER_MODEL=whisper-1
```

BETO solo devuelve categoría y subcategoría. GPT y Claude leen de forma
independiente hechos, urgencia, vulnerabilidades, eventos y rutas; cualquier
desacuerdo queda visible.

## Administración sin panel visual

```bash
cd Backend
.venv/bin/siad users list
.venv/bin/siad users create --email operador@siad.local --password 'Clave-Segura-2026!' --role operador
.venv/bin/siad users disable --email operador@siad.local
.venv/bin/siad users password --email operador@siad.local --password 'Nueva-Clave-2026!'
.venv/bin/siad sources seed
.venv/bin/siad sources list
.venv/bin/siad retention run
```

## Verificación

```bash
make test
make e2e
make contracts-check
make verify
```

Las pruebas E2E cubren 360, 768 y 1440 px, teclado, movimiento reducido, Axe,
capturas, carga sintética, revisión humana y aprobación final. El smoke con
proveedores reales es optativo, usa únicamente texto ficticio y puede generar
costos:

```bash
cd Backend
RUN_REAL_PROVIDER_SMOKE=1 PYTHONPATH=. .venv/bin/pytest tests/smoke -q
```

El contrato TypeScript se genera exclusivamente desde el OpenAPI de FastAPI:

```bash
./scripts/generate-contracts.sh
```
