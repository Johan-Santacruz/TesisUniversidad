# Modernización integral del flujo de video

**Fecha:** 2026-07-29  
**Estado:** aprobado visualmente por el usuario

## Objetivo

Modernizar todo el recorrido de `/subir-video` sin convertir SIAD en un
dashboard genérico ni alterar su comportamiento. La interfaz conservará el
carácter editorial y humano que ya funciona, pero reemplazará la rigidez actual
por superficies suaves, profundidad ligera, controles familiares y animaciones
visibles.

La referencia aprobada es la dirección **A · Editorial suave**, extendida en el
mockup integral a carga, procesamiento y revisión. El usuario aprobó
explícitamente aplicar este sistema a todo el flujo.

## Alcance

La modernización comprende:

- selección y arrastre del archivo;
- acceso al caso ficticio de demostración;
- estados de carga, bloqueo y error;
- procesamiento de las ocho etapas;
- reproductor y fragmentos de la declaración;
- navegación entre `Escuchar`, `Señales` y `Ruta`;
- clasificación, evidencias y formularios de revisión;
- línea de tiempo, rutas institucionales y aprobación final;
- comportamiento responsive y movimiento reducido.

Los cambios se concentrarán en:

- `frontend/src/components/analysis/`;
- los estilos del flujo de análisis en `frontend/src/index.css`;
- componentes auxiliares estrictamente necesarios para compartir movimiento o
  presentación.

No se modificarán el backend, los contratos OpenAPI, las rutas HTTP, la
autenticación, las reglas de acceso, la persistencia, el stream SSE ni las
condiciones de aprobación.

## Principios de diseño

### Continuidad editorial

Se mantienen la base marfil, los títulos serif y el acento colombiano amarillo,
azul y rojo. La modernización no sustituye esta identidad por una plantilla
tecnológica genérica.

### Suavidad contemporánea

Las superficies principales usarán radios amplios de entre `18px` y `28px`,
bordes tenues y sombras difusas. Las capas podrán tener una transparencia
moderada y desenfoque ligero cuando exista un fondo legible detrás, pero no se
aplicará glassmorphism intenso ni se reducirá el contraste del contenido.

### Jerarquía clara

Cada contexto tendrá una sola acción principal. Las acciones secundarias se
presentarán como botones suaves o enlaces de texto según su importancia. No
habrá filas de botones grandes compitiendo entre sí.

### Movimiento visible y funcional

Las animaciones se percibirán claramente y explicarán cambios de estado,
progreso, selección y navegación. No habrá movimiento decorativo continuo que
distraiga de la revisión del caso.

## Sistema visual

### Paleta y profundidad

- fondo general marfil con degradados radiales muy suaves;
- superficies blancas cálidas con transparencia controlada;
- azul SIAD como color principal de interacción;
- amarillo para progreso o atención;
- rojo reservado para alertas y estados críticos;
- sombras en dos niveles: elevación ligera para tarjetas y elevación media para
  la superficie activa;
- bordes cálidos de bajo contraste para conservar estructura sin verse
  cuadriculados.

### Formas

- superficie de página: `24px–28px`;
- paneles internos: `18px–22px`;
- tarjetas y formularios: `14px–18px`;
- botones principales y selector de etapas: forma de cápsula;
- chips de estado: cápsulas pequeñas, nunca usadas como decoración masiva.

Los radios variarán por nivel jerárquico. No todos los elementos tendrán la
misma forma ni parecerán tarjetas equivalentes.

### Tipografía

Los títulos conservarán `Newsreader` y sus fallbacks serif. La tipografía sans
actual continuará en controles, estados y lectura funcional. La modernización
vendrá de una escala más limpia, mayor respiración y pesos mejor diferenciados,
no de incorporar otra familia innecesaria.

## Jerarquía de botones

### Carga

- `Elegir archivo` será la acción principal compacta;
- después de seleccionar un archivo, la acción evolucionará de manera clara a
  `Analizar video ficticio`;
- `Probar caso de demostración` será un enlace secundario visible;
- el estado ocupado conservará el ancho del control y mostrará progreso sin
  saltos de distribución.

### Revisión

- avanzar de etapa será la acción principal del pie de la hoja;
- confirmar, corregir y cancelar tendrán tratamientos distintos y
  convencionales;
- la aprobación final será prominente únicamente cuando esté habilitada;
- los estados deshabilitados conservarán contraste y explicación.

Todos los controles interactivos mantendrán un área mínima de `44px` en
pantallas táctiles y foco visible por teclado.

## Flujo visual

### 1. Carga

La pantalla inicial se convertirá en una composición suave y unificada:

- encabezado ligero con marca y número de etapa;
- título editorial dominante;
- texto breve de orientación;
- zona de arrastre translúcida con borde discontinuo, radio amplio y profundidad;
- bloque compacto de acciones;
- etapas `Escuchar`, `Ordenar` y `Trazar` como apoyo narrativo;
- aviso de testimonios reales bloqueados integrado sin parecer una alerta
  agresiva.

Al entrar, el título, la zona de arrastre y las acciones aparecerán en secuencia.
Al arrastrar un archivo, la superficie ganará elevación, color y escala de forma
perceptible. Al seleccionar el archivo se animará el cambio de nombre y acción.

### 2. Procesamiento

El procesamiento conservará los ocho eventos reales, agrupados en tres
capítulos. Visualmente incluirá:

- indicador circular del porcentaje real;
- contador textual accesible;
- tres capítulos en superficies suaves;
- aparición escalonada de las etapas;
- transición clara entre espera, curso, completado y error;
- mensaje de que la ventana puede permanecer abierta.

El porcentaje se derivará del número de eventos persistidos respecto a las ocho
etapas; no se simulará progreso. El círculo, el contador y el capítulo activo se
actualizarán con movimiento.

### 3. Revisión del caso

La composición seguirá usando dos zonas:

- columna documental con video y fragmentos;
- hoja narrativa con el contenido activo.

Ambas zonas se suavizarán con radios amplios, bordes discretos y profundidad.
La columna del video seguirá siendo estable en escritorio para conservar el
contexto durante la revisión.

La navegación `Escuchar`, `Señales` y `Ruta` se convertirá en un selector
segmentado. El indicador activo se desplazará entre etapas. El contenido saldrá
con una combinación breve de opacidad, desenfoque y desplazamiento; el nuevo
contenido entrará desde la dirección de avance.

### 4. Escuchar

- los fragmentos se presentarán como bloques ligeros, no filas rectangulares
  rígidas;
- el fragmento activo ganará profundidad, borde azul y un pequeño desplazamiento;
- la selección seguirá sincronizando el tiempo del video;
- la entrada inicial de fragmentos será escalonada.

### 5. Señales

- clasificación y riesgo se resumirán en una superficie compacta;
- las evidencias usarán tarjetas de radios moderados y altura determinada por el
  contenido;
- estados de verificación, confianza y origen conservarán sus datos;
- confirmar y corregir usarán controles normales y reconocibles;
- el formulario se desplegará dentro de la tarjeta con una transición de altura
  y opacidad;
- errores de guardado permanecerán junto a la acción que los produjo.

### 6. Ruta

- la línea de tiempo mantendrá su relación con el video y ganará una progresión
  visual más fluida;
- los nodos aparecerán de forma escalonada;
- las tres rutas conservarán sus acentos tricolor, con superficies menos
  cuadradas y jerarquía interna más clara;
- la aprobación final se integrará como cierre del recorrido;
- los estados preliminar, bloqueado y aprobado tendrán transiciones visibles sin
  ocultar información.

## Arquitectura y comportamiento

`AnalysisWorkspace` seguirá siendo el propietario de:

- caso activo;
- URL y eventos del stream;
- estado ocupado y errores;
- etapa narrativa;
- evento y fragmento seleccionados;
- fuente local del video;
- revisión de hechos;
- aprobación.

Los componentes actuales conservarán sus contratos. Se permitirá añadir
envoltorios de `motion`, variantes compartidas y pequeños elementos de
presentación, pero no se duplicará estado de negocio para controlar
animaciones.

`AnimatePresence` coordinará el cambio entre las tres etapas. Las animaciones de
progreso dependerán de los datos ya existentes. Una animación nunca retrasará
una solicitud, una selección, una corrección ni la aprobación.

## Estados y errores

- un error de carga permanecerá dentro del panel inicial y conservará el archivo
  seleccionado;
- un error del stream se mostrará dentro del procesamiento sin convertir una
  etapa incompleta en completada;
- un error secundario al descargar el video mantendrá disponibles los datos del
  caso y la transcripción;
- los estados ocupados bloquearán únicamente la acción que no puede repetirse;
- el contenido existente no desaparecerá por una transición o error tardío.

## Movimiento

La duración objetivo será:

- entradas de página: `500–700ms`;
- cambios de etapa: `350–500ms`;
- aparición escalonada: `45–90ms` entre elementos;
- respuesta de botones y tarjetas: `160–220ms`;
- progreso: interpolación aproximada de `450ms`.

Se utilizarán curvas con desaceleración marcada y resortes controlados. No se
usarán rebotes excesivos, desplazamientos 3D ni animaciones infinitas sobre
contenido de lectura.

Con `prefers-reduced-motion`, las transiciones se reducirán a cambios de opacidad
muy breves o serán instantáneas. La funcionalidad, el foco y los estados no
dependerán del movimiento.

## Responsive

### Escritorio

La composición tendrá un ancho máximo centrado. En la revisión, el video
mantendrá una columna estable y la hoja aprovechará el espacio restante.

### Tableta

Entre `600px` y `960px`, carga y procesamiento podrán mantener dos columnas
compactas cuando exista espacio. La revisión pasará a una columna y los
fragmentos formarán una franja horizontal desplazable.

### Móvil

Por debajo de `600px`:

- todo el flujo será de una columna;
- las superficies reducirán radios y sombras;
- las acciones principales ocuparán el ancho disponible;
- los enlaces secundarios permanecerán separados y legibles;
- el selector de etapas seguirá visible sin desbordamiento;
- formularios, rutas y evidencias pasarán a una columna;
- ninguna acción dependerá de hover.

## Accesibilidad

- orden semántico de encabezados y un `h1` principal por estado;
- progreso con texto accesible y actualización mediante `aria-live`;
- foco visible y contraste AA;
- fragmentos y etapas operables con teclado;
- estados activos comunicados con `aria-current` o `aria-pressed`;
- campos con etiquetas explícitas y errores asociados;
- botones táctiles de al menos `44px`;
- compatibilidad completa con movimiento reducido.

## Verificación

La implementación se comprobará con:

- pruebas unitarias existentes del flujo de análisis;
- pruebas nuevas o ajustadas únicamente cuando cambie el comportamiento
  observable de los controles;
- compilación de producción del frontend;
- recorrido E2E existente en `360px`, `768px` y `1440px`;
- revisión visual del estado de carga, procesamiento y las tres etapas;
- verificación de teclado, foco y movimiento reducido;
- `git diff --check`.

Las advertencias de dependencias existentes se reportarán por separado y no se
ocultarán como parte del rediseño.

## Criterios de aceptación

1. Todo `/subir-video` comparte el sistema **Editorial suave**.
2. La interfaz se percibe moderna sin parecer un dashboard genérico.
3. Carga, procesamiento y revisión cambian sin saltos visuales bruscos.
4. Existe una sola acción principal por contexto.
5. Las animaciones son visibles y representan datos o cambios reales.
6. El movimiento reducido conserva toda la funcionalidad.
7. Video, fragmentos y línea de tiempo permanecen sincronizados.
8. Revisión, corrección y aprobación conservan permisos y datos.
9. Errores y estados ocupados aparecen cerca de la acción correspondiente.
10. El flujo funciona y mantiene jerarquía en `360px`, `768px` y `1440px`.
11. No cambian endpoints, contratos ni reglas del backend.
12. Las pruebas y la compilación del frontend terminan correctamente.
