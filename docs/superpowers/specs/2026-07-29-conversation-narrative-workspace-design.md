# Diseño del espacio narrativo de análisis

**Fecha:** 2026-07-29  
**Estado:** aprobado visualmente por el usuario

## Objetivo

Reimplementar la ventana de conversación y análisis de la worktree
`siad-smart-video` con el lenguaje editorial del proyecto original. La nueva
interfaz debe conservar todas las capacidades del backend FastAPI, pero debe
sentirse como una historia documental guiada y no como un dashboard genérico.

El segundo mockup presentado en la conversación es la referencia visual
aprobada: una columna documental para el video y los fragmentos, y una hoja
narrativa dominante para revisar el análisis.

## Alcance

La implementación se realizará en:

- `frontend/src/pages/conversation-page.tsx`;
- los componentes de `frontend/src/components/analysis/`;
- los estilos específicos del espacio de análisis en `frontend/src/index.css`.

El proyecto original ubicado fuera de la worktree se utilizará únicamente como
referencia estética. No se reemplazarán los contratos generados, los endpoints,
la autenticación, el procesamiento SSE ni las reglas de aprobación existentes.

## Dirección visual

La pantalla utilizará una base marfil cálida, superficies de papel blanco,
tipografía serif literaria para títulos y una sans humanista para controles y
texto funcional. La identidad colombiana se expresará con acentos discretos en
amarillo, azul y rojo.

La interfaz evitará:

- barras laterales genéricas;
- mosaicos de métricas;
- tres columnas equivalentes;
- glassmorphism;
- exceso de cápsulas, gráficas o tarjetas uniformes;
- efectos físicos difíciles de reproducir, como papeles rotos, cintas o clips.

Los recursos editoriales se limitarán a elementos implementables con CSS y SVG:
líneas finas, subrayados, numeración de capítulos, sombras suaves, cambios
moderados de fondo y una textura de papel muy sutil.

## Estructura general

### Encabezado

El encabezado será delgado y permanecerá visualmente ligero. Incluirá:

- marca SIAD con el acento tricolor;
- título `Constructor de ruta de acción`;
- correo y rol de la persona autenticada;
- acción `Cerrar sesión`.

No se introducirá navegación lateral.

### Composición de escritorio

El contenido utilizará una cuadrícula de dos columnas:

- columna izquierda fija o estable de aproximadamente `320px`;
- columna derecha flexible con un mínimo funcional;
- separación de `24px`;
- ancho máximo centrado entre `1440px` y `1520px`.

La columna izquierda podrá permanecer visible durante la revisión en pantallas
amplias. La hoja principal de la derecha será el foco visual.

### Columna documental

La columna izquierda contendrá:

1. título `Tu declaración`;
2. reproductor HTML de video;
3. aviso `Caso ficticio · identidad protegida`;
4. lista vertical de fragmentos con timestamp;
5. línea fina que relaciona los fragmentos como una secuencia.

Seleccionar un fragmento moverá el video a su instante y actualizará el contexto
de la hoja principal. El fragmento activo tendrá un tratamiento visible de
foco, borde y color, no solo un cambio cromático sutil.

### Hoja narrativa

La columna derecha será una sola superficie principal con:

- indicador `01 / 03`, `02 / 03` o `03 / 03`;
- leyenda `Del relato a la ruta`;
- progreso de tres etapas;
- título editorial;
- explicación breve;
- contenido de la etapa;
- navegación anterior y siguiente cuando corresponda.

La hoja tendrá borde fino, radio moderado, sombra contenida y suficiente espacio
en blanco. No se apilarán paneles independientes alrededor de ella.

## Las tres etapas

### 01. Escuchando el relato

Presentará la transcripción segmentada y el estado de procesamiento. Los eventos
del backend `audio` y `transcription` alimentarán visualmente esta etapa.

Durante el análisis se mostrará progreso real, no una animación ficticia. Los
ocho eventos SSE seguirán visibles en forma compacta, agrupados dentro de los
tres capítulos narrativos.

### 02. Ordenando lo importante

Integrará:

- personas, lugares, fechas y hechos;
- clasificación;
- nivel de riesgo;
- evidencia relacionada con cada hecho;
- estado de confianza y verificación;
- controles de confirmación o corrección según el rol.

Los hechos aparecerán en una cuadrícula responsive de dos columnas. Cada tarjeta
mostrará nombre, valor, evidencia, estado y acciones. Los formularios de
corrección se desplegarán dentro de la misma tarjeta, evitando un panel lateral
de verificación.

Los eventos `people_places`, `dates_facts`, `classification` y `sources`
pertenecerán a esta etapa.

### 03. Trazando la ruta

Unificará la línea temporal y las rutas institucionales en una lectura
secuencial:

- eventos ordenados por tiempo y vinculados al video;
- tres recorridos institucionales comparables;
- pasos, instrucciones, fuentes y fecha de verificación;
- advertencias sobre fuentes faltantes;
- estado preliminar o final;
- aprobación final para los roles autorizados.

Los eventos `timeline` y `routes` pertenecerán a esta etapa. La aprobación seguirá
bloqueada mientras existan inconsistencias críticas.

## Estados previos al resultado

### Inicio

Antes de cargar un caso, la misma composición mostrará una introducción
documental en la izquierda y una hoja de carga en la derecha. La hoja contendrá
el selector de archivo, el caso ficticio de demostración y el aviso de bloqueo
de testimonios reales.

### Procesamiento

Después de iniciar un análisis, la hoja conservará su tamaño y mostrará el
capítulo activo, el progreso real de las ocho etapas y los mensajes del stream.
No habrá saltos hacia una pantalla con otra estructura.

### Error

Los errores aparecerán dentro de la hoja correspondiente, cerca de la acción que
los produjo, con mensaje recuperable y opción para volver a intentar o regresar
a la carga. No se ocultará el contenido ya procesado por un error secundario.

## Datos y comportamiento

`AnalysisWorkspace` continuará siendo el dueño del estado del caso, el stream,
la selección temporal, la carga del video, la revisión y la aprobación.

La presentación se dividirá en componentes con responsabilidades claras:

- `NarrativeWorkspaceShell`: composición y navegación entre capítulos;
- `DocumentaryVideoRail`: video, privacidad y fragmentos;
- `NarrativeStageHeader`: número, progreso, título y estado;
- `ListeningStage`: transcripción y progreso;
- `EvidenceStage`: hechos, clasificación y revisión;
- `RouteStage`: cronología, rutas, fuentes y aprobación.

La navegación entre capítulos será estado local de presentación. No alterará el
estado persistido del caso ni repetirá solicitudes al backend.

## Movimiento

El movimiento será funcional y breve:

- entrada suave de la hoja;
- cambio de capítulo mediante desvanecimiento y desplazamiento corto;
- subrayado del título;
- transición de estado de tarjetas;
- resaltado del fragmento sincronizado.

No se utilizará una simulación 3D compleja de pasar página. Todas las animaciones
respetarán `prefers-reduced-motion`.

## Responsive

Por debajo de `960px`, la cuadrícula se convertirá en una sola
columna:

1. encabezado;
2. video;
3. fragmentos en una franja horizontal desplazable;
4. hoja narrativa.

La cuadrícula de hechos pasará de dos columnas a una. Los controles mantendrán
un alto mínimo de `44px`, y ninguna acción dependerá de hover.

## Accesibilidad

- un solo `h1` visible por estado principal;
- orden lógico de encabezados;
- estados de progreso con texto accesible;
- foco visible;
- reproductor y fragmentos operables con teclado;
- `aria-live` para progreso y errores;
- formularios de revisión con etiquetas explícitas;
- contraste mínimo AA;
- movimiento reducido respetado.

## Verificación acordada

Por solicitud previa del usuario, no se ejecutarán pruebas automatizadas,
compilación ni servidor durante esta implementación. La revisión se limitará a:

- inspección estática de los componentes;
- revisión del diff;
- `git diff --check`.

No se afirmará validación visual en navegador mientras el servidor no sea
ejecutado.

## Criterios de aceptación

1. La pantalla conserva todas las operaciones actuales del backend.
2. La vista principal se percibe como una narrativa editorial, no como un
   dashboard.
3. En escritorio solo existen dos zonas visuales principales.
4. Video, fragmentos y selección temporal permanecen sincronizados.
5. La verificación ocurre dentro de las tarjetas de hechos.
6. Las rutas y la aprobación aparecen en el tercer capítulo.
7. Inicio, procesamiento y resultados comparten la misma estructura.
8. La interfaz se adapta a móvil sin perder contenido ni acciones.
9. El proyecto original no se modifica.
