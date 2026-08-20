export type BookConversationTurn = {
  who: "persona" | "sistema"
  label: string
  time: string
  body: string
  accent?: "amarillo" | "azul" | "rojo"
  note?: string
}

export const BOOK_SYSTEM_STEPS = [
  {
    n: "I",
    title: "Escuchar",
    body: "La persona cuenta su historia en sus propias palabras —por voz, por texto, en español o en lengua propia. El sistema no la interrumpe.",
  },
  {
    n: "II",
    title: "Reconocer",
    body: "El sistema identifica los derechos vulnerados y las rutas disponibles: declaración como víctima, restitución de tierras, ayuda humanitaria, atención psicosocial.",
  },
  {
    n: "III",
    title: "Traducir",
    body: "Los trámites, plazos y formularios del Estado se explican en lenguaje claro. Sin jerga jurídica. Sin letra pequeña.",
  },
  {
    n: "IV",
    title: "Acompañar",
    body: "El sistema sostiene la conversación en el tiempo: recuerda fechas, guarda los documentos, escribe los borradores, conecta con defensoras y defensores humanos cuando hace falta.",
  },
] as const

export const BOOK_CONVERSATION_TRANSCRIPT: BookConversationTurn[] = [
  {
    who: "persona",
    label: "Marta, 47 años",
    time: "09:12",
    accent: "amarillo",
    body: "Buenas. Nos tuvimos que salir de la finca hace dos semanas. No sé a quién acudir. Ya no tengo ni la cédula.",
    note: "Mensaje de voz — 00:18",
  },
  {
    who: "sistema",
    label: "El sistema",
    time: "09:12",
    body: "Marta, la escucho. Lo primero: usted tiene derecho a declararse víctima y a recibir ayuda humanitaria inmediata. Vamos por partes, sin afán. ¿Está en un lugar seguro ahora?",
  },
  {
    who: "persona",
    label: "Marta, 47 años",
    time: "09:14",
    body: "Sí, estoy donde una prima en Popayán. Vine con mis dos hijos.",
  },
  {
    who: "sistema",
    label: "El sistema",
    time: "09:14",
    accent: "azul",
    body: "Bien. En Popayán hay una oficina de la Unidad para las Víctimas a 15 minutos de donde está. Tiene 4 años para declarar, pero mientras antes, mejor. ¿Quiere que le prepare el borrador de la declaración?",
    note: "Referencia: Ley 1448, Art. 155",
  },
  {
    who: "persona",
    label: "Marta, 47 años",
    time: "09:16",
    body: "Sí, por favor. Pero no tengo papeles. Solo tengo una foto del recibo de la luz.",
  },
  {
    who: "sistema",
    label: "El sistema",
    time: "09:16",
    body: "Con eso empezamos. Mándeme la foto. La cédula se puede reponer gratis por ser víctima —yo le explico ese trámite después. Para la declaración, su palabra es la prueba principal.",
  },
  {
    who: "persona",
    label: "Marta, 47 años",
    time: "09:18",
    body: "[envía foto del recibo]",
    note: "Archivo guardado — expediente #4421",
  },
  {
    who: "sistema",
    label: "El sistema",
    time: "09:19",
    accent: "rojo",
    body: "Listo, lo tengo. Mientras llega a la oficina, le paso el contacto de Dora, una defensora humana que trabaja con familias en su situación. ¿Prefiere que ella la llame, o la llama usted?",
    note: "Derivación a acompañamiento humano",
  },
]
