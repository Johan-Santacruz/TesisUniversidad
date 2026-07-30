# Análisis real de testimonios en “Subir video”

**Fecha:** 2026-07-29  
**Estado:** diseño aprobado en conversación; pendiente de revisión del documento  
**Enfoque aprobado:** evolución segura del flujo actual

## Objetivo

Permitir que una persona operadora autenticada cargue un video real de un
testimonio de desplazamiento y obtenga, sin volver a diligenciar el relato:

```text
video
→ transcripción segmentada
→ datos y señales sustentadas
→ clasificación contrastada
→ línea de tiempo
→ tres rutas respaldadas por fuentes oficiales
→ verificación humana
```

La implementación conservará la identidad editorial de SIAD y la línea de
tiempo como protagonista. El backend será la fuente de verdad: las animaciones
del frontend revelarán resultados reales ya producidos o etapas realmente
activas; nunca simularán análisis ni reutilizarán el caso de demostración.

## Decisiones confirmadas

1. Se ampliará la arquitectura existente; no se construirá un segundo pipeline.
2. El caso objetivo contiene datos personales reales.
3. El usuario dispone de llaves de OpenAI y Anthropic, acuerdos ZDR,
   autorización institucional y consentimiento.
4. Las llaves se configurarán únicamente en `Backend/.env`; no se escribirán en
   código, contratos, base de datos, logs, frontend ni commits.
5. Se conservará `whisper-1`: primero terminará la transcripción y después se
   revelarán progresivamente los segmentos y resultados.
6. No es requisito mostrar texto parcial mientras Whisper todavía transcribe.
7. Se utilizará el clasificador BETO incluido en el repositorio dentro de su
   alcance real: categoría y subcategoría de eventos de violencia.
8. GPT y Claude contrastarán el resultado de BETO con la evidencia del
   testimonio. No podrán sustituir silenciosamente la salida del clasificador.
9. El sistema no completará campos ausentes, programas ni entidades mediante
   memoria general de los LLM.
10. La revisión humana seguirá siendo obligatoria para inconsistencias y
    decisiones de alto impacto.

## Alcance

### Incluido

- previsualización y validación del video antes de cargarlo;
- captura mínima de consentimiento y referencia de autorización;
- verificación de disponibilidad del pipeline sin exponer secretos;
- carga de testimonios con `data_kind=real`;
- validación segura de archivo, audio, tamaño y decodificación;
- transcripción del audio real con segmentos y marcas de tiempo;
- clasificación BETO sobre la transcripción del video actual;
- extracción estructurada e independiente mediante GPT y Claude;
- contraste explícito entre BETO, GPT y Claude;
- reconciliación de datos con estados de origen, confianza y verificación;
- recuperación RAG desde el catálogo oficial local;
- generación de línea de tiempo y tres rutas institucionales;
- trazabilidad de llamadas, resultados y correcciones;
- eventos SSE de las etapas reales;
- reanudación visual y reintentos recuperables;
- retención automática del video real;
- actualización de frontend, backend, contratos y pruebas.

### Fuera de alcance

- reentrenar BETO o añadir nuevas cabezas de clasificación;
- afirmar que BETO calcula urgencia o un subtipo de desplazamiento que sus
  artefactos actuales no producen;
- convertir una recomendación en una decisión administrativa definitiva;
- consultar programas directamente desde internet durante cada análisis;
- permitir acceso anónimo;
- enviar llaves de proveedores al navegador;
- almacenar una transcripción parcial inventada o resultados demo en un caso
  real;
- reemplazar SQLite, FastAPI, React o el lenguaje visual editorial de SIAD;
- desplegar infraestructura externa o introducir Redis/Celery para esta fase.

## Estado actual que se conservará

El proyecto ya dispone de:

- OAuth2, JWT, renovación de sesión y roles;
- almacenamiento de video cifrado por bloques;
- cifrado de transcripciones, hechos, rutas, consentimientos y auditoría;
- extracción de audio con FFmpeg;
- adaptadores para Whisper, GPT, Claude y BETO;
- reconciliación de dos lecturas estructuradas;
- catálogo local de fuentes oficiales;
- análisis asíncrono y entrega de eventos mediante SSE;
- revisión de hechos, aprobación de rutas y eliminación por retención;
- frontend editorial con carga, procesamiento y revisión narrativa.

La implementación debe evolucionar estas piezas y preservar sus contratos
cuando sea posible.

## Problemas actuales que el diseño corrige

- El frontend etiqueta cualquier archivo propio como `fictitious`.
- No envía consentimiento ni referencia de autorización.
- No permite confirmar el video mediante una previsualización local.
- El selector acepta tipos de manera orientativa, pero no valida tamaño, archivo
  vacío o arrastre incompatible.
- El backend confía en una firma mínima de archivo y descubre algunos errores
  solamente al ejecutar FFmpeg.
- El análisis de un video real no vuelve a comprobar el gate de privacidad al
  iniciarse.
- Sin Whisper configurado, una carga propia termina parcial y no genera caso.
- El proceso descifra actualmente el video completo en memoria.
- El caso real no recibe una fecha de eliminación al momento de cargarse.
- El pipeline llama a GPT y Claude antes de producir BETO, por lo que los LLM no
  contrastan realmente su clasificación.
- Los proveedores reciben segmentos, pero no un conjunto explícito de fuentes
  oficiales para construir rutas.
- La trazabilidad no guarda una invocación técnica separada por proveedor,
  modelo y versión de prompt.
- Un reinicio del servidor puede dejar un análisis en estado intermedio sin una
  operación explícita de recuperación.
- Las etiquetas del reproductor siempre dicen “caso ficticio”.

## Arquitectura

La arquitectura seguirá siendo un único backend FastAPI. El servicio de
análisis se dividirá internamente en unidades con responsabilidades claras.

### 1. `AnalysisReadinessService`

Determina si el flujo real puede empezar:

- datos reales habilitados;
- OpenAI configurado;
- Anthropic configurado;
- ZDR y autorización institucional confirmados;
- FFmpeg disponible;
- BETO disponible o razón no sensible de indisponibilidad.

Solo expone booleanos y límites operativos. Nunca devuelve nombres de variables,
llaves, referencias de autorización ni detalles de cuentas.

### 2. `VideoIngestionService`

Se responsabiliza de:

- validar consentimiento y referencias sin aceptar cadenas vacías o espacios;
- identificar MP4/WebM por contenido;
- comprobar que FFprobe/FFmpeg puede leer el contenedor;
- verificar existencia de una pista de audio;
- aplicar el máximo configurado;
- cifrar el video por bloques;
- registrar metadatos técnicos seguros;
- asignar la fecha de eliminación desde la carga.

No interpreta el contenido del testimonio.

### 3. `MediaPipeline`

Entrega el audio a transcripción sin reconstruir un archivo de video plano en
disco. El video se descifra por bloques hacia un pipe de FFmpeg.

El audio se normaliza a mono y 16 kHz. Cuando exceda el límite aceptado por el
proveedor, se divide en fragmentos de audio en memoria, conservando el
desplazamiento temporal. La recomposición ajusta las marcas de tiempo al video
original y conserva identificadores estables.

El audio extraído no se persiste en base de datos ni almacenamiento.

### 4. `TranscriptionService`

Usa `whisper-1` con salida estructurada y granularidad por segmento. Su salida
canónica contiene:

- identificador estable;
- inicio y fin en milisegundos;
- texto normalizado por el proveedor;
- índice de orden;
- referencia al video y análisis.

La transcripción completa se cifra antes de persistirse. Una transcripción vacía
o sin segmentos termina la etapa como fallida; no habilita extracción posterior.

### 5. `BetoClassificationService`

El artefacto actual limita cada entrada a 240 tokens. Para evitar que un
testimonio largo pierda todo lo dicho después de ese límite, el servicio agrupa
la transcripción en ventanas de segmentos que respetan la capacidad real del
tokenizador. Ejecuta BETO sobre cada ventana y conserva:

- categoría elegida y probabilidad;
- subcategoría elegida y probabilidad;
- alternativas devueltas por el clasificador;
- segmentos y rango temporal que alimentaron cada predicción;
- versión o huella de los artefactos utilizados;
- estado disponible o razón controlada de indisponibilidad.

La clasificación global agrega probabilidades del modelo, no palabras clave ni
reglas sobre el relato. El resultado mantiene las predicciones por ventana para
que GPT, Claude y la persona revisora puedan comprobar dónde aparece la señal.

El BETO actual reconoce entre sus categorías `Desplazamiento forzado`, pero no
produce una cabeza de urgencia ni una familia intermedia. El sistema no
atribuirá esas capacidades al modelo.

### 6. `StructuredExtractionService`

Realiza dos lecturas independientes, una con GPT y otra con Claude. Cada llamada
recibe exclusivamente:

- los segmentos del video actual;
- la salida canónica de BETO;
- un esquema estricto;
- una versión explícita del prompt;
- instrucciones de no completar información ausente.

La primera pasada devuelve:

- personas, lugares, fechas y acontecimientos;
- composición del hogar y vulnerabilidades;
- situación de vivienda, necesidades y preferencias mencionadas;
- nivel de urgencia estimado por el LLM;
- eventos temporales candidatos;
- evaluación de la clasificación BETO con uno de tres veredictos:
  `supported`, `disputed` o `insufficient_evidence`;
- identificadores de segmentos para cada afirmación.

Esta pasada no puede proponer entidades, programas ni canales de contacto.

### 7. `ReconciliationService`

Valida y reconcilia ambas lecturas:

- coincidencia compatible: confianza alta, todavía revisable;
- una sola lectura válida: pendiente, confianza media;
- diferencia material: posible inconsistencia, confianza baja;
- ausencia de evidencia: no identificado;
- identificador de segmento desconocido: salida inválida del proveedor.

La reconciliación no usa reglas de palabras clave para clasificar el relato. Sus
condiciones solo verifican contratos, referencias y acuerdo entre resultados
estructurados.

BETO conserva su valor original. GPT y Claude pueden sustentarlo o cuestionarlo,
pero no reemplazarlo. Si existe desacuerdo, la interfaz muestra las lecturas y
solicita validación humana.

### 8. `OfficialSourceRetrievalService`

Consulta el catálogo oficial local usando el perfil reconciliado del caso.
Devuelve registros con:

- identificador estable;
- entidad y programa;
- tipo de ayuda;
- requisitos y cobertura conocidos;
- canal de contacto;
- URL oficial;
- fecha de verificación;
- estado de vigencia.

Las fuentes se sembrarán únicamente desde páginas oficiales verificadas. El
catálogo puede usar búsqueda FTS/RAG, pero sus resultados siguen siendo datos
curados; un LLM no añade registros al catálogo durante el análisis.

### 9. `RoutePlanningService`

La segunda pasada de GPT y Claude recibe únicamente:

- perfil reconciliado del caso;
- preferencias sustentadas por segmentos;
- tres tipos de ruta permitidos;
- registros recuperados del catálogo oficial.

Devuelve, de forma estructurada:

1. alojamiento inmediato y atención de emergencia;
2. estabilización de vivienda;
3. retorno o reubicación segura.

Cada paso debe citar un identificador de fuente recibido. Un identificador
desconocido invalida el paso. Si no existe información oficial suficiente, el
resultado visible será `Requiere confirmación con la entidad`.

### 10. `AnalysisOrchestrator`

Coordina las unidades anteriores mediante etapas persistidas e idempotentes:

```text
audio
→ transcription
→ people_places
→ dates_facts
→ classification
→ sources
→ timeline
→ routes
```

BETO puede calcularse inmediatamente después de la transcripción para que su
resultado forme parte de las lecturas GPT/Claude, aunque la etapa visual
`classification` se publique después de hechos y fechas para conservar la
narrativa aprobada.

Cada etapa registra `running` y un estado terminal (`completed`, `partial`,
`failed` o `unavailable`). Los reintentos no duplican hechos, rutas ni eventos
terminales. Al repetir una etapa se invalidan de forma explícita sus resultados
descendientes antes de recalcularlos.

No se añadirá infraestructura externa. Los análisis incompletos quedarán
registrados en SQLite y podrán reanudarse al reiniciar el backend o mediante una
acción autenticada de reintento.

### 11. `ModelInvocationTraceService`

Registra una fila por intento con:

- análisis y etapa;
- proveedor;
- modelo;
- versión del prompt;
- fecha de inicio y fin;
- duración;
- número de intento;
- estado y código de error seguro;
- identificadores de segmentos de entrada;
- identificador del resultado cifrado.

No registra llaves, prompts con datos personales, texto del testimonio ni
respuestas completas en logs planos.

## Flujo completo

### Preflight

1. Una persona operadora autenticada abre `/subir-video`.
2. El frontend consulta la disponibilidad del análisis real.
3. Si el gate no está listo, se muestra qué capacidad general falta sin exponer
   secretos.
4. El caso demo permanece como opción separada y claramente sintética.

### Selección y consentimiento

1. La persona selecciona o arrastra un MP4/WebM.
2. El navegador valida tipo, tamaño y archivo vacío.
3. Se crea una URL local temporal para previsualizar video, duración y
   miniatura.
4. La persona confirma que existe consentimiento y proporciona una referencia
   de autorización.
5. `Iniciar análisis` permanece deshabilitado hasta completar las condiciones.

### Carga

El frontend envía:

```text
file=<video>
data_kind=real
explicit_consent=true
consent_reference=<referencia>
```

El backend repite todas las validaciones, cifra video y consentimiento, registra
auditoría y devuelve el registro del video. La extensión o MIME enviados por el
navegador nunca sustituyen la validación del contenido.

### Análisis

1. El endpoint de inicio vuelve a verificar rol, propiedad, gate real,
   consentimiento vigente y video no eliminado.
2. Se crea o recupera un análisis idempotente para ese video.
3. Se publican los eventos SSE reales de cada etapa.
4. Whisper transcribe exclusivamente el audio de ese video.
5. BETO clasifica ventanas trazables de esa transcripción sin truncar
   silenciosamente el resto del relato.
6. GPT y Claude reciben exclusivamente segmentos de ese análisis y BETO.
7. Las salidas se validan, contrastan y cifran.
8. El RAG recupera fuentes oficiales candidatas.
9. GPT y Claude construyen rutas usando únicamente esas fuentes.
10. Se persiste el caso en revisión y se publica su identificador.

### Revisión

La persona revisora puede navegar:

- video y segmentos sincronizados;
- datos mencionados, inferidos, contrastados o no identificados;
- salida de BETO;
- veredictos GPT y Claude sobre BETO;
- inconsistencias y confianza;
- línea de tiempo;
- fuentes y tres rutas.

Una corrección conserva autor, fecha, valor anterior y valor corregido. La
aprobación final continúa restringida por rol y por inconsistencias críticas.

## Contratos HTTP

### Disponibilidad

Se añadirá un endpoint autenticado:

```text
GET /api/v1/analyses/readiness
```

Su respuesta incluirá:

- `real_analysis_ready`;
- `openai_configured`;
- `anthropic_configured`;
- `beto_available`;
- `ffmpeg_available`;
- `accepted_media_types`;
- `max_video_bytes`;
- `video_retention_days`.

No incluirá valores de entorno ni referencias institucionales.

### Carga e inicio

Se conservarán:

```text
POST /api/v1/videos
POST /api/v1/videos/{video_id}/analyses
GET  /api/v1/analyses/{analysis_id}/events
```

La carga aprovechará los campos reales ya definidos por el contrato. El inicio
añadirá la revalidación de seguridad y la protección frente a análisis
duplicados concurrentes.

### Reintento

Se añadirá:

```text
POST /api/v1/analyses/{analysis_id}/retry
```

Solo la persona propietaria, un validador autorizado o un administrador podrá
usarlo. Se permitirá únicamente sobre análisis parciales o fallidos y
reanudará desde la primera etapa no válida.

### Eventos SSE

Cada evento conservará:

- secuencia monotónica;
- etapa;
- estado;
- marca de tiempo;
- payload cifrado en persistencia;
- datos visibles estrictamente necesarios.

El porcentaje se calculará con etapas únicas terminadas, no contando dos veces
los eventos `running` y terminal.

## Reglas contra invenciones

Estas reglas son invariantes del sistema:

1. Cada dato extraído debe citar al menos un segmento existente o declararse
   `not_identified`.
2. Un evento temporal debe derivar su inicio y fin de segmentos citados.
3. Un LLM no puede crear, cambiar ni eliminar texto de la transcripción
   persistida.
4. `mentioned`, `inferred`, `contrasted` y `not_identified` son estados
   diferentes y visibles.
5. Confianza alta no equivale a confirmación humana.
6. BETO no se sobrescribe con una lectura LLM.
7. Ninguna entidad, programa, requisito, contacto o cobertura puede aparecer
   sin un registro del catálogo oficial.
8. Una fuente no vigente o insuficiente se muestra como pendiente de
   confirmación.
9. El proveedor no recibe contenido de otros análisis ni ejemplos con datos de
   otros casos.
10. El caso demo utiliza un camino explícito y nunca funciona como fallback de
    una carga real.
11. Un fallo de proveedor produce un estado parcial o fallido; nunca resultados
    fabricados.
12. Las validaciones de contrato no se sustituyen por regex o listas de palabras
    para interpretar el testimonio.

## Seguridad y privacidad

### Configuración

El backend exige, simultáneamente:

```dotenv
SIAD_REAL_DATA_ENABLED=true
SIAD_OPENAI_ZDR_CONFIRMED=true
SIAD_ANTHROPIC_ZDR_CONFIRMED=true
SIAD_INSTITUTIONAL_AUTHORIZATION_ID=<referencia>
SIAD_OPENAI_API_KEY=<llave local>
SIAD_ANTHROPIC_API_KEY=<llave local>
```

El repositorio conservará únicamente nombres y ejemplos vacíos. La persona
usuaria colocará las llaves en su archivo local ignorado por Git.

### Gate real

El gate se comprobará:

- al consultar disponibilidad;
- al cargar;
- al iniciar;
- al reintentar.

Consentimiento y referencias se normalizan y cifran. Una cadena vacía o compuesta
solo por espacios no es válida.

### Acceso y auditoría

- operador/gestor: carga y revisa sus videos;
- validador: revisa y aprueba según permisos;
- administrador: administra y audita;
- todas las lecturas sensibles y modificaciones relevantes registran actor,
  acción, entidad y fecha sin copiar PII a logs.

El video y el caso siguen protegidos por autenticación aunque alguien conozca un
UUID.

### Retención

Todo video real recibe `delete_after = uploaded_at + 7 días` desde la carga. La
aprobación no amplía ese plazo. La eliminación se ejecuta al iniciar el backend
y periódicamente mientras esté activo, además de conservar el comando
administrativo manual.

La eliminación del video no elimina automáticamente el expediente derivado. La
eliminación integral del caso seguirá usando el flujo administrativo existente
y su auditoría.

## Experiencia del frontend

### Carga real

La composición editorial suave se conserva. El panel mostrará:

- título `Nuevo testimonio`;
- estado general del pipeline;
- zona de arrastre;
- reproductor local;
- nombre, tamaño, formato y duración;
- aviso de tratamiento confidencial;
- confirmación de consentimiento;
- referencia breve de autorización;
- acción principal `Iniciar análisis`;
- enlace secundario al caso demo.

El archivo seleccionado permanece disponible tras un error recuperable. La URL
local se revoca al cambiar archivo, abandonar la vista o cerrar sesión.

### Procesamiento

Antes de terminar Whisper, la interfaz muestra únicamente la etapa real
`Generando transcripción`; no inventa fragmentos ni porcentajes temporales.

Al recibir el evento de transcripción:

1. los segmentos persistidos aparecen escalonadamente;
2. el riel tricolor empieza a crecer;
3. personas, lugares, fechas y hechos aparecen al llegar sus eventos;
4. la clasificación muestra BETO y el contraste de ambos proveedores;
5. la línea de tiempo incorpora nodos sustentados;
6. las rutas aparecen al final con fuentes y estado de verificación.

La animación puede revelar en secuencia un payload ya recibido, pero las
etiquetas `procesando`, `completado`, `parcial` o `fallido` siempre reflejan el
estado persistido.

### Resultado

La línea de tiempo será el eje central. Cada nodo incluirá cuando exista:

- fecha o periodo;
- lugar;
- descripción;
- personas o núcleo familiar;
- hecho;
- evidencia;
- tiempo del video;
- origen;
- confianza;
- verificación.

Seleccionar segmento o evento moverá el reproductor. Las tres rutas se
compararán sin ocultar fuentes, fecha de verificación o incertidumbre.

Las etiquetas del reproductor y privacidad se derivarán de `data_kind` e
`is_demo`; una carga real nunca se anunciará como ficticia.

### Movimiento y accesibilidad

- Framer Motion coordinará la aparición de resultados.
- El riel tricolor crecerá solo al incorporarse datos reales.
- Una etapa activa podrá pulsar; las etapas terminadas permanecerán estables.
- No habrá movimiento decorativo infinito.
- `prefers-reduced-motion` mostrará el mismo contenido de forma inmediata o con
  fundidos mínimos.
- Progreso, errores y resultados usarán regiones accesibles sin leer cada
  carácter animado.
- Todas las acciones tendrán foco visible, etiqueta y área táctil mínima de
  44 px.

## Estados de error y recuperación

### Antes de cargar

- tipo/tamaño inválido: error junto al selector;
- video vacío: rechazo inmediato;
- pipeline no disponible: explicación general y acción deshabilitada;
- referencia ausente: error junto al campo;
- fallo de metadatos locales: se permite cambiar archivo, no iniciar.

### Durante la carga

- red o sesión: conservar selección y consentimiento;
- 413/415/422/403: traducir el detalle del backend a una acción concreta;
- doble clic: una sola solicitud activa.

### Durante el análisis

- sin audio: etapa `audio` fallida y etapas descendientes no disponibles;
- Whisper no configurado o fallido: no crear caso;
- un LLM falla: continuar con el otro como resultado parcial, sin confianza alta;
- ambos LLM fallan: conservar transcripción/BETO, pero no generar rutas;
- BETO falla: mostrar indisponible y continuar con lecturas LLM marcadas como
  parciales;
- fuente inválida: descartar únicamente el paso afectado;
- ninguna fuente válida: ruta pendiente de confirmación, sin entidad inventada;
- stream interrumpido: reconectar con `Last-Event-ID`;
- recarga del navegador: recuperar el análisis activo desde `sessionStorage` y
  consultar los eventos persistidos;
- reinicio del backend: reanudar o permitir reintento desde la primera etapa
  incompleta.

El contenido ya persistido no desaparece por un fallo posterior.

## Verificación

Las pruebas automatizadas no usarán el video real del usuario ni harán llamadas
pagadas por defecto.

### Backend

- unitarias para gate, referencias vacías, disponibilidad y permisos;
- unitarias para validación de segmentos y fuentes desconocidas;
- unitarias para contraste BETO–GPT–Claude;
- unitarias para idempotencia, invalidación descendiente y reintento;
- unitarias para trazabilidad sin secretos ni PII;
- integración con un MP4/WebM reproducible que contenga audio válido;
- integración del pipeline con proveedores falsos y datos distintos por video
  para demostrar aislamiento;
- integración de SSE `running`/terminal y reconexión;
- integración de cifrado, Range, consentimiento, retención y eliminación;
- smoke opcional con proveedores reales, activado por variable explícita y solo
  con material sintético.

### Frontend

- selección por picker y arrastre;
- validación coherente de tipo, tamaño y archivo vacío;
- preview, duración y revocación de URL;
- consentimiento y referencia;
- payload `data_kind=real`;
- disponibilidad y estados bloqueados;
- revelado progresivo de payloads reales;
- presentación de BETO y contraste;
- estados parcial, fallido, reintento y recuperación;
- distinción real/demo;
- sincronización de video, segmentos y línea de tiempo;
- teclado, foco, movimiento reducido y lectores de pantalla;
- E2E en 360, 768 y 1440 px;
- build, contratos OpenAPI y `git diff --check`.

### Prueba manual final

Después de que la persona usuaria configure sus llaves localmente:

1. iniciar backend y frontend;
2. iniciar sesión;
3. seleccionar el testimonio real;
4. confirmar preview y consentimiento;
5. iniciar el análisis;
6. observar las ocho etapas;
7. comprobar segmentos contra el audio;
8. revisar BETO y los veredictos GPT/Claude;
9. validar eventos de la línea de tiempo;
10. revisar fuentes y las tres rutas;
11. corregir un dato y comprobar auditoría;
12. verificar la fecha de eliminación.

## Criterios de aceptación

1. El frontend envía testimonios reales como `real`, nunca como `fictitious`.
2. Un testimonio real no puede cargarse sin gate, consentimiento y referencia.
3. Las llaves solo existen en configuración local del backend.
4. El archivo se previsualiza y valida antes de enviarse.
5. El backend procesa el audio del video seleccionado, no el caso demo.
6. La transcripción contiene segmentos con tiempos reproducibles.
7. Cada análisis usa exclusivamente sus propios segmentos.
8. BETO conserva su salida original de categoría/subcategoría.
9. GPT y Claude contrastan BETO con evidencia del video.
10. Una discrepancia permanece visible y exige revisión.
11. Cada dato y evento cita segmentos válidos o se declara no identificado.
12. Ninguna entidad o programa aparece sin una fuente oficial registrada.
13. Las tres rutas se personalizan únicamente con datos sustentados.
14. Un fallo parcial nunca activa confianza alta ni resultados demo.
15. Cada llamada registra modelo, prompt, tiempos y estado sin secretos ni PII.
16. El análisis puede reanudarse o reintentarse sin duplicar resultados.
17. El video real recibe una fecha automática de eliminación a siete días.
18. El frontend revela resultados persistidos con la dirección visual aprobada.
19. La línea de tiempo sigue sincronizada con el reproductor.
20. Demo y caso real permanecen técnica y visualmente diferenciados.
21. Los contratos generados, pruebas, build y E2E finalizan correctamente.
