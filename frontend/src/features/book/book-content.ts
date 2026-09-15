/* Un momento del recorrido de un testimonio por SENDA.
 *
 * La escena era un chat en el que Marta le escribía al sistema y el sistema le
 * contestaba, le preparaba borradores y le guardaba documentos. Nada de eso
 * existe: SENDA recibe un video ya grabado, lo ordena, una persona revisa lo
 * que encontró y de ahí sale la ruta. La escena cuenta ese recorrido. */
export type BookConversationTurn = {
  who: "testimonio" | "senda" | "revision" | "ruta"
  body: string
  accent?: "amarillo" | "azul" | "rojo"
}

export const BOOK_TURN_LABELS: Record<BookConversationTurn["who"], string> = {
  testimonio: "Testimonio",
  senda: "SENDA",
  revision: "Revisión humana",
  ruta: "Ruta",
}

export const BOOK_SYSTEM_STEPS = [
  {
    n: "I",
    title: "Escuchar",
    body: "La persona cuenta su historia en sus propias palabras, en un video. SENDA la recibe entera: no la corta en preguntas de formulario.",
  },
  {
    n: "II",
    title: "Ordenar",
    body: "SENDA transcribe el relato y señala lo que importa: quiénes son, de dónde salieron, quién necesita protección especial. Nada queda confirmado hasta que una persona lo revisa.",
  },
  {
    n: "III",
    title: "Orientar",
    body: "Con lo confirmado arma tres rutas —ayuda inmediata, vivienda, retorno o reubicación— y cada paso cita una fuente oficial vigente. Sin jerga jurídica.",
  },
  {
    n: "IV",
    title: "Entregar",
    body: "La ruta aprobada queda escrita en lenguaje claro, dirigida a quien contó su historia, y cada paso se puede escuchar en voz alta.",
  },
] as const

export const BOOK_CONVERSATION_TRANSCRIPT: BookConversationTurn[] = [
  {
    who: "testimonio",
    accent: "amarillo",
    body: "«Nos tuvimos que salir de la finca hace dos semanas. Vine con mis dos hijos y ya no tengo ni la cédula.»",
  },
  {
    who: "senda",
    body: "Transcribe el video y anota lo que dice: salió de una finca, está en Popayán y llegó con dos hijos. Todo queda por confirmar.",
  },
  {
    who: "revision",
    accent: "azul",
    body: "Quien revisa vuelve al minuto 0:14, escucha la frase y confirma que en el hogar hay niñas, niños o adolescentes. Con eso se ajusta la ruta.",
  },
  {
    who: "ruta",
    accent: "rojo",
    body: "«Pida una cita en el punto de atención a víctimas de Popayán. Lleve lo que conserve, aunque sea poco.» Cada paso cita su fuente oficial y se puede escuchar en voz alta.",
  },
]
