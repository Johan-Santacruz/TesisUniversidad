import type { CSSProperties } from "react"


export type MosaicColumn = {
  duration: string
  photos: readonly string[]
}

/* Las columnas descienden a ritmos distintos y no comparten escenas, para que
 * la misma fotografía no aparezca dos veces a la vez. Vive aparte porque la
 * portada del análisis y el acceso institucional muestran el mismo archivo:
 * duplicar el mosaico era duplicar también sus arreglos. */
export function PhotoMosaic({ columns }: { columns: readonly MosaicColumn[] }) {
  return (
    <div className="login-mosaic">
      {columns.map((column, columnIndex) => (
        <div
          className="login-mosaic-column"
          key={columnIndex}
          style={{ "--mosaic-duration": column.duration } as CSSProperties}
        >
          {/* La lista se duplica para que el bucle no muestre un corte. */}
          <div className="login-mosaic-track">
            {[...column.photos, ...column.photos].map((src, index) => (
              <figure className="login-mosaic-photo" key={`${src}-${index}`}>
                <img src={src} alt="" loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


export const DISPLACEMENT_MOSAIC: readonly MosaicColumn[] = [
  {
    duration: "58s",
    photos: [
      "/images/mosaic-desplazamiento/01-salida-forzada-v3.jpg",
      "/images/mosaic-desplazamiento/04-testimonio-protegido-v3.jpg",
      "/images/mosaic-desplazamiento/09-alojamiento-temporal-v3.jpg",
      "/images/mosaic-desplazamiento/12-coordinacion-institucional-v3.jpg",
    ],
  },
  {
    duration: "44s",
    photos: [
      "/images/mosaic-desplazamiento/02-hogar-y-memoria-v3.jpg",
      "/images/mosaic-desplazamiento/05-analisis-senda-v3.jpg",
      "/images/mosaic-desplazamiento/08-terminal-intermunicipal-v3.jpg",
      "/images/mosaic-desplazamiento/07-ruta-institucional-v3.jpg",
    ],
  },
  {
    duration: "68s",
    photos: [
      "/images/mosaic-desplazamiento/03-recepcion-segura-v3.jpg",
      "/images/mosaic-desplazamiento/06-validacion-humana-v3.jpg",
      "/images/mosaic-desplazamiento/10-registro-confidencial-v3.jpg",
      "/images/mosaic-desplazamiento/11-transcripcion-anonima-v3.jpg",
    ],
  },
] as const
