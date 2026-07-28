# Rediseño fotográfico superpuesto del login

**Fecha:** 2026-07-28  
**Estado:** dirección visual aprobada por el usuario  
**Alcance:** únicamente el frontend de la ruta `/login`

## Objetivo

Convertir el login actual en una portada fotográfica contemporánea. El mosaico
debe dominar la pantalla, el formulario debe sentirse compacto y superpuesto,
y el fondo general debe dejar ver la superficie visual de la aplicación en
lugar de usar un bloque opaco.

No se modifican autenticación, rutas protegidas, redirecciones, contratos de API
ni backend.

## Dirección visual

La pantalla combinará dos lenguajes:

- una composición fotográfica asimétrica, editorial y de gran formato;
- un formulario translúcido, sobrio y claramente legible.

La firma visual será un mosaico de seis imágenes con una fotografía principal y
cinco recortes secundarios. Las fotos dejarán de verse como seis tarjetas
iguales: tendrán tamaños jerárquicos, encuadres diferenciados, espacios
controlados y un borde interior sutil. Las rotaciones se eliminarán o se
reducirán al mínimo para que la composición se perciba intencional y no
accidental.

## Composición de escritorio

La página usará el fondo heredado de la aplicación con `background:
transparent`. El mosaico ocupará aproximadamente dos tercios del ancho y la
altura completa disponible.

Dentro del mosaico:

- `cover-andes.jpg` será la imagen protagonista;
- las otras cinco imágenes completarán una retícula tipo masonry;
- los espacios entre fotos serán uniformes;
- habrá radios moderados, borde interior claro y una sombra breve;
- un velo tonal muy leve unificará fotografías con luminosidades distintas.

El formulario se superpondrá parcialmente sobre el borde derecho del mosaico.
Su panel será translúcido, con desenfoque de fondo, borde fino y sombra suave.
La opacidad será suficiente para mantener contraste AA incluso sobre las zonas
más complejas de las fotos.

## Formulario

Se recuperará una jerarquía completa y compacta:

- etiqueta de contexto “SIAD · Acceso institucional”;
- título único `h1`: “Bienvenido de nuevo.”;
- una descripción breve del entorno de análisis;
- correo institucional;
- contraseña con control accesible para mostrar u ocultar;
- mensaje de error persistente para lectores de pantalla pero colapsado cuando
  esté vacío;
- botón principal “Ingresar de forma segura”;
- indicador “Sesión cifrada · datos reales bloqueados”.

Los campos dejarán la forma de píldora y usarán rectángulos suavemente
redondeados. Esto mejora la alineación, crea una jerarquía más profesional y
reserva la forma completamente redonda para acciones secundarias o indicadores.

El botón tendrá contraste alto, foco visible y estados de hover, envío y
deshabilitado. La lógica actual de envío se conserva sin cambios.

## Tipografía

La tipografía se cambiará únicamente dentro del login para no alterar otras
pantallas:

- `Newsreader` para el título y pequeños gestos editoriales;
- `Manrope` para etiquetas, campos, botón y textos de apoyo.

Ambas fuentes se cargarán desde Google Fonts con `display=swap` y conservarán
alternativas locales para evitar texto invisible durante la carga.

## Responsive

### Escritorio — 1080 px o más

El mosaico dominará la composición y el formulario se superpondrá sobre su borde
derecho. Las seis imágenes permanecerán visibles.

### Tableta — 768 a 1079 px

Se reducirá el solapamiento, el formulario conservará un ancho cómodo y el
mosaico mantendrá las seis imágenes con una retícula menos compleja.

### Móvil — menos de 768 px

El mosaico abrirá la pantalla como cabecera fotográfica. El formulario
translúcido se colocará sobre su parte inferior y continuará en el flujo para no
ocultar campos ni provocar desbordamiento. Se mostrarán cuatro imágenes para
mantener foco, rendimiento y legibilidad.

## Accesibilidad y comportamiento

- Se mantendrá un único `h1`.
- Todos los campos conservarán sus etiquetas asociadas.
- Las fotografías seguirán siendo decorativas con `alt=""` y un contenedor
  `aria-hidden`.
- El control de contraseña conservará nombre accesible y `aria-pressed`.
- El error conservará `role="alert"` y `aria-live="assertive"`.
- Los objetivos interactivos medirán al menos 44 px.
- Las animaciones serán breves y se desactivarán con
  `prefers-reduced-motion`.
- No se crearán ni ejecutarán pruebas en esta intervención, por solicitud
  expresa del usuario.

## Archivos previstos

- `frontend/src/pages/login-page.tsx`
- `frontend/src/index.css`
- `frontend/index.html`

Los cambios locales ya existentes en estos archivos se conservarán y se
integrarán en el nuevo diseño.

## Criterios de aceptación

- El fondo de `.login-page` es transparente.
- El mosaico es el elemento visual dominante y no una cuadrícula uniforme.
- El formulario se percibe compacto, translúcido y parcialmente superpuesto.
- La nueva pareja tipográfica se limita al login.
- La jerarquía del formulario incluye título, contexto y descripción.
- La autenticación y redirección actuales no cambian.
- La composición no genera desplazamiento horizontal.
- En móvil, el formulario permanece legible y las fotografías no impiden el
  acceso a los campos.
