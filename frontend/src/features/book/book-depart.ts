import { createContext, useContext } from "react"


/* Salir del libro hacia otra parte. Vive en su propio archivo porque lo usan
 * el libro (que decide cómo se sale: cerrando la tapa primero) y las páginas
 * (que sólo tienen el enlace), y las páginas ya las importa el libro. */
export const BookDepartContext = createContext<(path: string) => void>(() => undefined)

export function useBookDepart() {
  return useContext(BookDepartContext)
}
