# Rutas seguras, claras y pertinentes

## Objetivo

Mejorar el apartado **Rutas institucionales** para que una persona afectada por desplazamiento pueda reconocer primero qué debe hacer, comprender el recorrido sin sobrecarga de texto y distinguir con claridad qué información todavía necesita revisión humana.

El cambio abarca la generación y selección de rutas, su presentación, el recorrido de pasos, el respaldo institucional y la aprobación final. No modifica en esta entrega el clasificador BETO, la transcripción, la retención del video ni otros apartados del análisis.

## Principios de producto

1. La necesidad urgente aparece antes que el trámite.
2. No se muestra una ruta sólo para completar una plantilla.
3. La primera lectura permite actuar sin abrir detalles técnicos.
4. Ningún estado técnico se presenta como certeza humana.
5. Retorno o reubicación nunca se trata como recomendación automática.
6. La aprobación conserva la trazabilidad y no aumenta artificialmente la confianza.
7. La información institucional sin fuente disponible o vigente no puede aprobarse como orientación final.

## Alcance funcional

### Rutas pertinentes

Los proveedores podrán devolver de cero a tres tipos de ruta. La instrucción de análisis dejará de exigir siempre `emergency`, `housing_stabilization` y `return_relocation`.

- `emergency` aparecerá cuando el relato indique peligro, necesidad médica, falta de alojamiento o alimentación, menores en riesgo u otra necesidad inmediata respaldada por una fuente disponible.
- `housing_stabilization` aparecerá cuando haya una necesidad real de permanencia, alojamiento de transición, subsidio, registro o acompañamiento para estabilización.
- `return_relocation` aparecerá sólo cuando el relato plantee retorno, reubicación, abandono o restitución de tierras. Su texto deberá advertir que la decisión es voluntaria y depende de condiciones de seguridad.
- Si ninguna ruta está suficientemente sustentada, el caso mostrará un estado de revisión sin inventar un recorrido.

La reconciliación iterará únicamente los tipos devueltos de forma válida por al menos un proveedor. Si un solo proveedor sustenta una ruta, se conservará como preliminar y con confianza media. Si dos proveedores discrepan sobre el contenido de la misma ruta, continuará bloqueada como inconsistente. La reconciliación semántica avanzada entre redacciones diferentes queda fuera de esta entrega.

### Contenido breve y accionable

Cada ruta tendrá entre tres y cinco pasos. Se aplicarán estos límites en la instrucción de generación y en la validación de salida:

- título de ruta existente y estable por tipo;
- resumen de una frase, con un máximo de 24 palabras;
- título de paso de hasta seis palabras, iniciado por un verbo cuando sea posible;
- `key_point` de hasta diez palabras y una sola acción;
- `instructions` de máximo dos frases cortas, sin repetir literalmente `key_point`;
- cada paso debe contener al menos una afirmación respaldada por una fuente del catálogo.

Las instrucciones priorizarán lenguaje cotidiano y trato de “usted”. Siglas, decretos, vigencias y requisitos extensos permanecerán en el detalle institucional, no en la acción principal.

### Prioridad de atención

Cuando exista `emergency`, esa ruta se ordenará primero y se distinguirá con el rótulo **Empiece por aquí**. Su tarjeta cerrada mostrará hasta tres acciones esenciales tomadas de los primeros pasos.

Las demás rutas se presentarán como **Después puede continuar con**. Este orden es informativo y no convierte la ruta de emergencia en una decisión automática: si está inconsistente o carece de respaldo, se mostrará como bloqueada para revisión.

Si no hay ruta inmediata, no se mostrará un bloque de urgencia vacío. El apartado comenzará directamente con las rutas aplicables.

## Arquitectura de la interfaz

### Vista cerrada de una ruta

La tarjeta conservará la fotografía, el color propio de la ruta y la identidad cálida actual. Encima de ella aparecerán únicamente:

- rótulo de prioridad cuando corresponda;
- título;
- resumen de una frase;
- hasta tres acciones esenciales en atención inmediata;
- estado humano;
- acción **Ver pasos**.

Los estados visibles serán:

- **Requiere revisión** para rutas pendientes o inferidas;
- **Hay información por resolver** para rutas inconsistentes;
- **Revisada por una persona** para rutas confirmadas;
- **Sin ruta aplicable** para el estado vacío del apartado.

La terminología de confianza y origen se conservará para trazabilidad, pero se moverá a información secundaria destinada al validador.

### Vista abierta y recorrido

Al abrir una ruta se mostrará una línea de pasos con título y acción esencial. Las instrucciones completas y el respaldo oficial vivirán dentro de un segundo nivel llamado **Ver requisitos y fuente**.

El recorrido tendrá estas reglas:

- al abrir la ruta no habrá ningún tramo marcado como recorrido;
- abrir un paso lo convierte en el paso activo y marca como recorridos los anteriores;
- cerrar el detalle del paso no borra el último progreso alcanzado mientras la ruta siga abierta;
- cerrar la ruta reinicia el recorrido visual;
- el eje usará las dimensiones reales de los nodos para evitar cortes;
- la línea base y la línea de progreso compartirán geometría y bordes redondeados;
- la transición será breve y respetará `prefers-reduced-motion`;
- el elemento decorativo del eje no será hijo directo de `<ol>`; la lista conservará semántica válida.

En escritorio el recorrido podrá mantenerse horizontal si todos los pasos y la indicación de desplazamiento son visibles. En pantallas pequeñas se convertirá en un recorrido vertical para evitar un desplazamiento horizontal oculto.

### Detalle institucional

El detalle se dividirá en dos capas:

1. instrucción breve dirigida a la persona;
2. panel desplegable con requisitos, cobertura, contacto, entidad, programa, vigencia y enlace oficial.

Una misma afirmación no se repetirá como `instructions`, `claim.text` y requisito. `claim.text` funcionará como explicación del respaldo; la acción principal seguirá viviendo en `key_point`.

El texto principal tendrá al menos 16 px y los metadatos al menos 14 px. Los controles tendrán foco visible, nombre accesible y área táctil suficiente.

## Fuentes institucionales

El catálogo se ampliará únicamente con fuentes oficiales verificadas que cubran los vacíos detectados en las pruebas:

- ayuda humanitaria inmediata y atención desde el municipio receptor;
- protección y atención para mujeres amenazadas o víctimas de violencia;
- atención diferencial para discapacidad y personas mayores;
- protección de niños, niñas y adolescentes;
- retorno, reubicación y restitución de tierras;
- orientación territorial cuando exista una fuente oficial aplicable.

El análisis recibirá un subconjunto del catálogo filtrado por tipo de ruta, cobertura y términos del caso, en vez de todos los registros activos. Si el filtro no encuentra respaldo suficiente, el proveedor deberá omitir el paso o la ruta.

No se añadirán directorios informales, blogs, teléfonos no verificables ni datos inferidos. Cada nueva entrada conservará entidad, programa, cobertura, requisitos, contacto, URL, vigencia, descargo y tipos de ruta.

## Aprobación y seguridad

La pantalla de validación incluirá una casilla independiente por cada ruta aplicable. El botón final permanecerá deshabilitado hasta que todas las rutas existentes hayan sido confirmadas expresamente.

El backend aceptará como conjunto requerido las rutas realmente existentes, no los tres valores del enum. Antes de aprobar verificará:

- que exista al menos una ruta;
- que los tipos confirmados coincidan exactamente con las rutas existentes;
- que ninguna ruta esté inconsistente;
- que cada ruta tenga pasos;
- que cada paso tenga afirmaciones con fuentes disponibles y vigentes;
- que no existan señales críticas pendientes.

Al aprobar:

- `verification_status` podrá pasar a `confirmed` porque hubo revisión humana;
- `confidence_band` conservará su valor previo;
- el registro de auditoría guardará los tipos confirmados;
- la política existente de eliminación programada del video se mantendrá sin cambios.

El frontend no simulará confianza alta después de recibir la aprobación.

## Estados vacíos y errores

- Sin rutas válidas: **No hay una ruta suficientemente sustentada. Un validador debe revisar el caso.**
- Ruta inconsistente: se muestra la tarjeta bloqueada, sin recorrido accionable, y se explica que hay información por resolver.
- Fuente ausente o vencida: el paso se marca para revisión y bloquea la aprobación.
- Error al narrar: el contenido escrito permanece disponible y el error no cierra el paso.
- Error al aprobar: se conservan las selecciones del validador para que pueda reintentar.

## Flujo de datos

1. El proveedor recibe segmentos, clasificación y fuentes filtradas.
2. Devuelve sólo las rutas aplicables y sustentadas.
3. El servicio valida longitudes, fuentes, pasos y duplicados por tipo.
4. La reconciliación conserva rutas válidas, determina estado y recopila fuentes usadas.
5. El caso persiste únicamente esas rutas.
6. La interfaz las ordena por prioridad y presenta el contenido progresivamente.
7. El validador confirma cada ruta existente.
8. El backend vuelve a validar el caso y registra la aprobación sin alterar la confianza.

## Archivos previstos

- `Backend/app/ai/providers.py`: instrucciones de pertinencia y límites de escritura.
- `Backend/app/ai/contracts.py`: validaciones estructurales de contenido cuando sean compatibles con salidas estructuradas.
- `Backend/app/services/analysis.py`: validación, selección y reconciliación de subconjuntos de rutas.
- `Backend/app/services/rag.py` y `Backend/app/data/official_sources.json`: recuperación contextual y fuentes faltantes verificadas.
- `Backend/app/services/cases.py`: reglas de aprobación sobre rutas existentes.
- `Frontend/src/components/analysis/routes-comparison.tsx`: prioridad, capas de información, progreso y confirmación individual.
- `Frontend/src/components/analysis/status-badge.tsx`: etiquetas humanas y detalle técnico secundario.
- `Frontend/src/components/analysis/analysis-workspace.tsx`: envío de rutas confirmadas y preservación de confianza.
- `Frontend/src/index.css`: recorrido, tipografía, responsive y estados de foco.
- pruebas unitarias y de integración asociadas a los archivos anteriores.

Los cambios locales existentes se preservarán. Las modificaciones en `Frontend/src/index.css` se aplicarán sobre el estado actual y se limitarán a selectores del apartado de rutas.

## Estrategia de pruebas

### Backend

- acepta uno, dos o tres tipos de ruta válidos sin crear los ausentes;
- conserva una ruta de un solo proveedor como preliminar;
- bloquea una discrepancia entre proveedores;
- rechaza rutas duplicadas, vacías, demasiado extensas o sin fuente válida;
- aprueba exactamente las rutas existentes confirmadas;
- rechaza selección incompleta, fuente ausente o vencida e inconsistencia crítica;
- conserva la confianza original después de la aprobación;
- filtra fuentes por ruta y cobertura sin perder fuentes nacionales aplicables.

### Frontend

- ordena atención inmediata primero y muestra **Empiece por aquí**;
- representa correctamente una, dos, tres o ninguna ruta;
- mantiene detalles institucionales cerrados inicialmente;
- inicia el recorrido sin progreso y avanza al abrir pasos;
- reinicia el progreso al cerrar la ruta;
- no introduce hijos inválidos dentro de `<ol>`;
- exige confirmación individual antes de habilitar la aprobación;
- conserva la confianza recibida después de aprobar;
- muestra errores sin perder selecciones;
- presenta recorrido vertical y controles utilizables en móvil;
- respeta movimiento reducido, teclado y nombres accesibles.

### Escenarios de contenido

Se usarán casos ficticios, sin datos personales, para cubrir:

1. familia recién desplazada con menores, fiebre y sin alojamiento;
2. mujer amenazada con un menor;
3. persona mayor con discapacidad y falta de medicamentos;
4. familia que considera volver a una zona con presencia armada;
5. necesidad de estabilización sin intención de retorno;
6. relato insuficiente;
7. migración económica explícitamente ajena a violencia o desplazamiento.

Los criterios de aceptación son: urgencia primero, máximo cinco pasos por ruta, acciones comprensibles, ausencia de rutas irrelevantes, territorio correcto, respaldo vigente y retorno no coercitivo.

## Verificación final

La entrega se considerará completa cuando:

- pasen las pruebas nuevas y las suites relacionadas de backend y frontend;
- las compilaciones de producción terminen sin errores;
- los siete escenarios produzcan rutas coherentes o un estado de revisión seguro;
- la vista se revise visualmente en escritorio y móvil;
- no se hayan alterado cambios locales ajenos al apartado Rutas.

