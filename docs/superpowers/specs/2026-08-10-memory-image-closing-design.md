# Cierre visual de memoria para cada caso

## Objetivo

Generar para cada caso analizado una imagen horizontal de cierre, documental y simbólica, inspirada en el lenguaje institucional de los archivos de memoria. La imagen representará el contexto verificado del caso sin reconstruir literalmente los hechos, identificar personas ni mostrar violencia. Una persona deberá aprobarla antes de que el sistema produzca una versión final del video con esa imagen al cierre.

## Decisiones adoptadas

- La dirección visual será mixta: contexto documental más tratamiento simbólico.
- La primera versión usará la API de generación de imágenes de OpenAI mediante un adaptador aislado del resto del pipeline.
- El generador recibirá únicamente un resumen estructurado y minimizado; nunca el video, la transcripción completa, nombres de personas ni citas testimoniales.
- La generación ocurrirá después de persistir hechos, clasificación, cronología y rutas, porque esos resultados suministran el contexto ya reconciliado.
- El análisis principal podrá finalizar aunque la generación falle o el proveedor no esté configurado. La imagen tendrá su propio estado recuperable.
- La imagen no se incorporará al video hasta recibir una aprobación humana explícita.
- Al aprobarla, FFmpeg generará un derivado MP4 que conserva el contenido original y agrega un cierre de siete segundos.
- El video original permanecerá inmutable y seguirá siendo la fuente probatoria; el derivado se presentará como una pieza institucional de consulta.

## Alternativas consideradas

### Generación completamente automática

Reduce la interacción, pero puede publicar una interpretación visual inadecuada y no ofrece una barrera suficiente frente a sesgos, errores contextuales o revictimización. Se descarta para este dominio.

### Banco de plantillas institucionales

Ofrece máxima previsibilidad y bajo costo, pero produce cierres repetitivos y poco vinculados al caso. Puede conservarse como contingencia futura, no como experiencia principal.

### Generación controlada con aprobación humana

Combina singularidad visual, trazabilidad y control ético. Es la alternativa seleccionada. La persona revisora podrá aprobar, regenerar o descartar la imagen sin afectar el análisis.

## Flujo funcional

1. El operador carga un video y comienza el análisis existente.
2. SIAD extrae audio, transcribe, clasifica, contrasta proveedores, crea la cronología, consulta fuentes y persiste las rutas.
3. Un constructor determinista deriva un contexto visual exclusivamente de campos reconciliados:
   - categoría y subcategoría de BETO;
   - lugares en forma generalizada cuando sea necesario;
   - periodo aproximado, nunca una fecha personal innecesaria;
   - tipo de entorno y desplazamiento;
   - símbolos permitidos asociados al contexto.
4. El constructor aplica una plantilla institucional versionada y una lista fija de restricciones.
5. El adaptador solicita una imagen horizontal al proveedor y almacena la respuesta cifrada.
6. La interfaz presenta la imagen como `pendiente de revisión`, junto con su carácter representativo y generado por IA.
7. Una persona validadora o administradora puede:
   - aprobarla;
   - regenerarla con el mismo contexto y una nueva semilla lógica;
   - descartarla y dejar el caso sin cierre visual.
8. La aprobación inicia el render del derivado. El sistema concatena el video original con una placa de siete segundos y una transición breve.
9. La interfaz conserva acceso separado a `Testimonio original` y `Versión con cierre de memoria`.

## Dirección visual y contenido permitido

La imagen será 16:9, sobria, de apariencia fotográfica documental y con una capa poética contenida. Podrá incluir paisajes, caminos, puertas, objetos cotidianos, vegetación, arquitectura genérica y figuras humanas lejanas o no identificables. La composición reservará una zona tranquila para la leyenda superpuesta por SIAD durante el render.

Cada prompt impondrá estas restricciones:

- sin violencia explícita, heridas, armas ni escenas del hecho;
- sin rostros identificables, primeros planos ni menores reconocibles;
- sin nombres, citas, texto generado, logotipos, banderas o escudos;
- sin representar una ubicación exacta como si fuera evidencia fotográfica;
- sin dramatización sensacionalista ni estética publicitaria;
- sin afirmar que la imagen documenta el suceso real.

El texto no será generado dentro de la imagen. SIAD lo añadirá con FFmpeg para garantizar legibilidad y exactitud:

> Imagen representativa generada a partir del contexto documentado del caso. No corresponde a un registro de los hechos.

## Modelo de datos

Se añadirá una entidad `MemoryImage` asociada de forma uno-a-muchos con el caso: cada regeneración crea un registro histórico y solo el registro con mayor número de generación será el activo. Cada registro tendrá:

- identificador, caso y número de generación;
- estado: `pending`, `generating`, `pending_review`, `approved`, `rejected` o `failed`;
- proveedor, modelo y versión de prompt;
- hash del contexto visual minimizado;
- metadatos cifrados con el contexto, prompt, motivo de fallo y decisión;
- ruta del archivo cifrado, tipo MIME, dimensiones y tamaño;
- persona y fecha de la decisión.

Se añadirá una entidad `RenderedVideo` asociada al caso, con estado `rendering`, `ready` o `failed`, metadatos técnicos y ruta cifrada. Los archivos derivados seguirán la misma política de retención y borrado total del caso.

No se almacenará el prompt ni el contexto sensible en texto plano. Los campos necesarios para búsquedas y control de estado serán mínimos.

## Servicios y límites

### Constructor de contexto visual

Recibe el caso ya persistido y produce un contrato pequeño y validado. Es independiente del proveedor y puede probarse sin red. Generaliza lugares y excluye claves asociadas a personas.

### Adaptador de generación

Expone una operación `generate(prompt) -> GeneratedImage`. Encapsula autenticación, reintentos, validación de MIME y límites de tamaño. Una respuesta inválida se registra como fallo recuperable.

### Almacenamiento de recursos

Cifra imagen y video derivado antes de escribirlos. Solo acepta rutas internas calculadas a partir de identificadores UUID. La lectura exige autenticación y autorización sobre el caso.

### Renderizador

Materializa temporalmente el original descifrado y la imagen aprobada en un directorio aislado, invoca FFmpeg sin interpolación de shell, valida el MP4 resultante y lo cifra antes de eliminar los temporales. El audio original no se modifica; durante la placa final se añadirá silencio.

### Orquestación

La generación inicial se ejecuta como una operación no crítica después de `routes`, sin añadirla a las ocho etapas probatorias ni alterar su semántica. Su fallo no cambia un análisis completo a parcial. Regeneración y render son acciones independientes, idempotentes por estado y protegidas contra solicitudes simultáneas.

## API

`CaseRead` incluirá un resumen opcional del cierre visual y las URL autorizadas disponibles.

- `GET /cases/{case_id}/memory-image/content`: entrega la imagen aprobada o pendiente de revisión.
- `POST /cases/{case_id}/memory-image/regenerate`: crea una nueva generación y deja la anterior como historial.
- `POST /cases/{case_id}/memory-image/decision`: aprueba o rechaza la generación activa.
- `GET /cases/{case_id}/rendered-video/stream`: reproduce el derivado cuando esté listo y admite solicitudes HTTP Range.

La generación automática inicial no necesita un endpoint público. Solo validadores y administradores podrán decidir o regenerar. Toda acción quedará en auditoría.

## Interfaz

Se añadirá una sección `Cierre de memoria` dentro del espacio del caso, después del recorrido institucional. Mostrará:

- la imagen 16:9 o un estado de generación/fallo;
- la advertencia de que es una representación generada y no evidencia;
- acciones `Aprobar`, `Generar otra` y `Descartar` según rol y estado;
- los accesos separados al video original y al derivado cuando esté listo.

La imagen tendrá texto alternativo que describa su función, no una interpretación de los hechos. Los estados se anunciarán con una región de estado accesible. Ningún control dependerá exclusivamente del color.

## Fallos y recuperación

- Sin clave de OpenAI: el caso termina normalmente y la interfaz indica que el cierre visual no está configurado.
- Rechazo del proveedor o moderación: estado `failed`, motivo técnico no sensible y posibilidad de regenerar.
- Imagen vacía, demasiado grande o con MIME inesperado: no se persiste como válida.
- Fallo de FFmpeg: se conserva la aprobación y se permite reintentar el render.
- Solicitudes concurrentes: una restricción de generación activa evita dobles cobros y resultados ambiguos.
- Eliminación o vencimiento del caso: imagen, derivado, metadatos y archivos temporales se eliminan junto con el resto del caso.

## Demostración sin proveedores

El caso de demostración usará una imagen local, claramente sintética y versionada, servida por el mismo contrato. Esto mantiene el recorrido determinista sin realizar llamadas pagadas. El adaptador real solo se activará para videos cargados cuando exista una clave configurada.

## Verificación

- Pruebas unitarias del contexto minimizado y de las restricciones del prompt.
- Pruebas unitarias del adaptador para éxito, moderación, MIME inválido, límite de tamaño y reintentos.
- Pruebas de servicio para transiciones de estado, permisos, concurrencia y auditoría.
- Pruebas de integración para lectura protegida, aprobación, regeneración, render y borrado total.
- Prueba del render con un video diminuto: duración original más siete segundos, MP4 válido y pista de audio conservada.
- Pruebas de frontend para estados, permisos, advertencia institucional y cambio entre video original y derivado.
- Regeneración del contrato OpenAPI y comprobación del cliente TypeScript.
- Revisión visual en escritorio y móvil, incluida navegación por teclado.

## Fuera de alcance

- Recrear personas, escenas, ropa o lugares exactos del testimonio.
- Permitir prompts libres escritos por operadores en esta primera versión.
- Reemplazar o sobrescribir el video original.
- Incluir música, voz sintética, animaciones generativas o texto producido por el modelo.
- Publicar automáticamente imágenes o videos fuera de SIAD.
