# Diseño del login editorial de SIAD

**Fecha:** 2026-07-27  
**Estado:** aprobado visualmente por el usuario  
**Alcance:** únicamente la ruta `/login`

## Objetivo

Reemplazar la tarjeta centrada y genérica del acceso actual por una pantalla
editorial a tamaño completo. El resultado debe sentirse humano, territorial y
táctil, sin parecer un portal gubernamental ni sacrificar claridad, seguridad o
accesibilidad.

La composición aprobada toma como referencia una página de revista: fotografías
impresas superpuestas, marcos blancos, cinta adhesiva y textura de papel. El
formulario sigue siendo el punto funcional dominante.

## Composición

En escritorio, la página ocupa todo el viewport y se divide en dos áreas:

- Un collage editorial a la izquierda, de aproximadamente 65 % del ancho.
- El formulario de acceso a la derecha, de aproximadamente 35 % del ancho.

No habrá tarjeta exterior, ventana flotante, encabezado de propuesta ni margen
decorativo alrededor de la aplicación. Una línea fina separará las dos áreas.

El collage incluirá seis imágenes ficticias o sintéticas ya disponibles en el
proyecto. Cada imagen tendrá:

- marco blanco tipo fotografía impresa;
- borde fino oscuro;
- sombra moderada;
- una rotación pequeña y distinta;
- cinta decorativa;
- un pie breve, puramente editorial.

El fondo del collage combinará papel cuadriculado tenue con un bloque oscuro
diagonal. El tricolor aparecerá como una línea inferior discreta. Se eliminan
explícitamente los textos “Archivo vivo · Cauca” y “Escuchar también es
proteger”.

## Formulario

El panel derecho conservará el papel cálido y una textura apenas visible.
Contendrá:

- marca SIAD y gesto tricolor en la parte superior;
- etiqueta “Acceso al sistema”;
- título “Bienvenido.”;
- descripción breve sobre casos ficticios y validación de rutas;
- correo institucional;
- contraseña;
- botón “Ingresar de forma segura”;
- indicador “Sesión cifrada · datos reales bloqueados”.

El formulario mantendrá el comportamiento actual: autenticación, redirección,
estado de envío y errores de API. No se cambia el contrato del backend.

## Estados e interacción

- Los campos tendrán foco visible de alto contraste.
- El botón mostrará “Ingresando…” y quedará deshabilitado durante el envío.
- Los errores aparecerán junto al formulario con `role="alert"` y sin mover el
  collage.
- La contraseña tendrá un control accesible para mostrar u ocultar su contenido.
- El contenido del botón y el indicador de seguridad no dependerán únicamente
  del color.
- Las transiciones se limitarán a la entrada suave de fotografías y formulario.
  Con `prefers-reduced-motion`, todo aparecerá sin animación.

## Responsive

### Escritorio — 1024 px o más

Se mantendrá la división 65/35 y el collage de seis imágenes. El formulario
quedará centrado verticalmente y no superará una anchura legible.

### Tableta — 768 a 1023 px

La división pasará a una proporción aproximada 55/45. El collage conservará las
seis imágenes, con solapamientos reducidos, y el formulario tendrá menos
padding.

### Móvil — menos de 768 px

La página se apilará:

1. marca y formulario;
2. collage editorial compacto como contexto visual secundario.

El formulario aparecerá primero para evitar que el usuario tenga que recorrer
fotografías antes de iniciar sesión. El collage se reducirá a cuatro imágenes y
no provocará desplazamiento horizontal. Campos y botón mantendrán objetivos
táctiles de al menos 44 px.

## Accesibilidad y contenido sensible

- Existirá un único `h1`.
- Las etiquetas permanecerán asociadas mediante `htmlFor` e `id`.
- Las imágenes del collage serán decorativas y usarán `alt=""`.
- Se conservará contraste AA para textos, controles y foco.
- La navegación completa funcionará con teclado.
- Las fotografías no se presentarán como testimonios reales ni como evidencia
  de casos. El entorno seguirá marcado como demostración ficticia.

## Componentes y límites

El cambio se concentrará en:

- `frontend/src/pages/login-page.tsx`;
- estilos de login en `frontend/src/index.css`;
- pruebas unitarias del login;
- prueba E2E y capturas responsive del acceso.

Las fotografías existentes se reutilizarán desde `frontend/public/images`. No
se modificarán autenticación, rutas protegidas, backend, workspace de análisis
ni otras páginas.

## Criterios de aceptación

- La pantalla coincide visualmente con la composición aprobada a 1440 px.
- No existe una tarjeta o ventana exterior alrededor del login.
- No aparecen “Archivo vivo · Cauca”, “Escuchar también es proteger”,
  “Propuesta refinada · v2” ni “Revista comunitaria, no portal institucional”.
- El login continúa funcionando y redirige a `/subir-video`.
- Los estados de error, envío y mostrar/ocultar contraseña son accesibles.
- No existe desbordamiento horizontal a 360, 768 o 1440 px.
- Axe no reporta violaciones serias o críticas.
- `prefers-reduced-motion` elimina las animaciones.
- Las pruebas de frontend, build y E2E quedan en verde.
