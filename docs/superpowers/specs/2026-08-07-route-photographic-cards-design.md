# Tarjetas fotográficas para las rutas

## Objetivo

Reemplazar los pictogramas de las tres rutas por una imagen fotográfica que cubra por completo la cabecera cerrada de cada ruta. La fotografía debe aportar contexto humano sin competir con el contenido ni alterar la interacción actual de la línea de tiempo.

## Comportamiento aprobado

- Cada tipo de ruta tendrá una fotografía propia: atención inmediata, estabilización de vivienda y retorno o reubicación.
- La fotografía cubrirá únicamente la tarjeta inicial cerrada.
- Título, resumen, estado de verificación, advertencias y acción para abrir el recorrido permanecerán visibles sobre la imagen.
- Al abrir una ruta, la cabecera dejará de usar la fotografía y volverá a una superficie clara; debajo aparecerá la línea de tiempo existente sin fondo fotográfico.
- Solo una ruta continuará abierta a la vez. No se modifica el funcionamiento de las paradas ni de sus paneles.

## Dirección visual

Las fotografías serán horizontales, documentales y sobrias, relacionadas con el desplazamiento forzado y la atención institucional en Colombia. No mostrarán violencia explícita, rostros reconocibles, texto, marcas ni escudos institucionales.

La legibilidad se preservará con una composición en capas:

1. fotografía a sangre con `object-fit: cover`;
2. velo oscuro neutro con degradado más intenso detrás del texto;
3. leve matiz del color de la ruta para conservar su identidad;
4. contenido en blanco o marfil con sombra mínima, siempre por encima de las capas decorativas.

El color amarillo, azul o rojo seguirá apareciendo como filete y señal de foco, no como un filtro fuerte sobre la imagen. En `hover` y foco la imagen podrá ganar ligeramente contraste; no se aplicará parallax ni movimiento continuo.

## Transición y accesibilidad

- Al abrir la ruta, la fotografía y su velo se desvanecerán mientras la cabecera pasa a papel claro antes de presentar la línea de tiempo.
- Con `prefers-reduced-motion`, el cambio será inmediato o casi inmediato.
- Las imágenes serán decorativas (`alt=""` y fuera del nombre accesible del botón). El título seguirá comunicando el tipo de ruta.
- Se mantendrá un foco de teclado claramente visible y un contraste mínimo AA para todo el texto superpuesto.
- Las advertencias críticas conservarán una superficie propia para no depender solo del color.

## Adaptación responsive

En escritorio, la tarjeta cerrada conservará su formato horizontal y una altura suficiente para que la escena tenga presencia. En pantallas pequeñas, la imagen seguirá cubriendo toda la cabecera, pero se usará un encuadre por tipo de ruta y un velo vertical más intenso para mantener juntos el título, el resumen y la acción sin recortes de texto.

## Recursos y límites

- Se generarán tres imágenes nuevas, optimizadas para estas tarjetas; no se reutilizarán las fotografías verticales del mosaico del login.
- Los archivos se guardarán dentro de `frontend/public/images/routes/` en formato web adecuado y con nombres estables por tipo de ruta.
- El cambio se limita a `routes-comparison.tsx`, sus estilos asociados, los recursos de imagen y las pruebas del comportamiento cerrado/abierto.
- No se modifica el contenido de las rutas, la API, la lógica de verificación ni la línea de tiempo.

## Verificación

- Prueba de componente: cada ruta cerrada expone su imagen decorativa y ya no contiene el pictograma.
- Prueba de interacción: al abrir una ruta se activa el estado sin fotografía y aparece su línea de tiempo; al cerrarla vuelve la fotografía.
- Revisión visual en escritorio y móvil, incluyendo foco de teclado y preferencia de movimiento reducido.
- Ejecución de pruebas del frontend y compilación de producción.
