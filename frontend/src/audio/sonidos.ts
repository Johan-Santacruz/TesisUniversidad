/* Sonido en una aplicación sobre desplazamiento forzado.
 *
 * Hay dos maneras de meter sonido en una interfaz. Una es ponerle un clic a
 * cada botón, que aquí sería una falta de tacto: quien está oyendo a alguien
 * contar cómo salió de su casa no necesita que la aplicación haga ruiditos
 * encima. La otra es sonar sólo donde el objeto que se está imitando sonaría de
 * verdad, y sólo cuando hace falta avisar de algo. Este módulo tiene dos:
 *
 *   - `pageTurn`, el papel al pasar la hoja. El libro es el objeto central de
 *     toda la aplicación y es la única parte que en la vida real suena.
 *   - `analysisReady`, un aviso corto para cuando el análisis termina. Tarda
 *     cerca de un minuto y en ese rato la persona se va a mirar otra cosa; es
 *     información, no adorno.
 *
 * No hay archivos de audio. Los dos se sintetizan con la Web Audio API, por la
 * misma razón por la que los iconos se dibujan a mano en SVG: un MP3 traería
 * licencia, peso y una descarga que puede fallar, para dos sonidos que se
 * describen en veinte líneas.
 *
 * Se puede apagar y la preferencia se recuerda.
 *
 * **Por qué la primera versión no sonaba.** Dos cosas, y las dos vale la pena
 * dejarlas escritas. La primera: el contexto de audio nace suspendido si la
 * página todavía no ha recibido un gesto que el navegador reconozca, y girar la
 * página con el trackpad no es uno —Chrome no cuenta la rueda del ratón como
 * activación, sólo el clic y el teclado—. Había que reanudarlo también al
 * crearlo, no sólo al reencontrarlo. La segunda: el volumen estaba en 0.05
 * sobre ruido filtrado, que en los altavoces de un portátil es prácticamente
 * silencio.
 */

const CLAVE_PREFERENCIA = "senda:sonido"

let contexto: AudioContext | null = null
let habilitado = leerPreferencia()

function leerPreferencia(): boolean {
  try {
    // Suena salvo que se haya apagado a propósito.
    return window.localStorage.getItem(CLAVE_PREFERENCIA) !== "apagado"
  } catch {
    return true // modo privado o almacenamiento bloqueado
  }
}

export function sonidoHabilitado(): boolean {
  return habilitado
}

export function cambiarSonido(activo: boolean): void {
  habilitado = activo
  try {
    window.localStorage.setItem(CLAVE_PREFERENCIA, activo ? "encendido" : "apagado")
  } catch {
    // Sin almacenamiento la preferencia dura lo que la pestaña. Aceptable.
  }
}

/* El contexto se crea tarde y una sola vez: hacerlo al cargar el módulo gasta
 * un recurso de audio en cada pestaña que nunca lo use. */
function obtenerContexto(): AudioContext | null {
  if (!habilitado) return null
  if (contexto) return contexto
  try {
    const Constructor =
      window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Constructor) return null // jsdom, navegadores viejos
    contexto = new Constructor()
    return contexto
  } catch {
    return null
  }
}

/* Reanudar y luego sonar. El contexto nace suspendido cuando la página aún no
 * ha recibido un gesto que el navegador reconozca, y vuelve a suspenderse
 * cuando la pestaña pasa a segundo plano, que es justo donde estará la persona
 * mientras corre el análisis. `resume` devuelve una promesa: sin esperarla, el
 * sonido se programa sobre un reloj parado y no se oye nunca. */
function reproducir(dibujar: (ctx: BaseAudioContext, destino: AudioNode) => void): void {
  const ctx = obtenerContexto()
  if (!ctx) return
  const tocar = () => {
    try {
      dibujar(ctx, ctx.destination)
    } catch {
      // Un sonido que falla no puede tumbar la página que lo pidió.
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume().then(tocar).catch(() => {})
    return
  }
  tocar()
}

/* La hoja de papel: ruido de banda ancha, que es lo que el papel es en física,
 * con un filtro que sube de 900 a 3600 Hz mientras suena. Ese barrido es lo que
 * convierte un siseo plano en el roce de una hoja que pasa: el brillo se mueve
 * porque la hoja se mueve. La envolvente entra rápido y sale despacio, como el
 * gesto de la mano.
 *
 * Se exporta con el contexto como parámetro para poder renderizarlo en un
 * OfflineAudioContext y medir lo que suena, en vez de suponerlo. */
export function dibujarPapel(ctx: BaseAudioContext, destino: AudioNode): void {
  const duracion = 0.34
  const ahora = ctx.currentTime
  const muestras = Math.floor(ctx.sampleRate * duracion)
  const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate)
  const datos = buffer.getChannelData(0)
  for (let i = 0; i < muestras; i += 1) {
    const avance = i / muestras
    // Ataque corto y cola larga: el roce empieza antes de que la hoja caiga.
    const envolvente = avance < 0.12
      ? avance / 0.12
      : (1 - (avance - 0.12) / 0.88) ** 2
    datos[i] = (Math.random() * 2 - 1) * envolvente
  }

  const fuente = ctx.createBufferSource()
  fuente.buffer = buffer

  const filtro = ctx.createBiquadFilter()
  filtro.type = "bandpass"
  filtro.Q.value = 0.55
  filtro.frequency.setValueAtTime(900, ahora)
  filtro.frequency.exponentialRampToValueAtTime(3600, ahora + duracion)

  const volumen = ctx.createGain()
  volumen.gain.value = 0.34

  fuente.connect(filtro).connect(volumen).connect(destino)
  fuente.start(ahora)
}

/* El aviso de análisis terminado: dos notas ascendentes, cortas y suaves. Ni
 * fanfarria ni alarma; el análisis no es una buena noticia ni una mala, sólo
 * algo que ya está listo para leerse. */
export function dibujarAviso(ctx: BaseAudioContext, destino: AudioNode): void {
  const inicio = ctx.currentTime
  const notas = [
    { hz: 587.33, en: 0, largo: 0.5 }, // re5
    { hz: 880.0, en: 0.14, largo: 0.55 }, // la5
  ]
  for (const nota of notas) {
    const oscilador = ctx.createOscillator()
    oscilador.type = "sine"
    oscilador.frequency.value = nota.hz

    const volumen = ctx.createGain()
    const t = inicio + nota.en
    volumen.gain.setValueAtTime(0.0001, t)
    volumen.gain.exponentialRampToValueAtTime(0.16, t + 0.03)
    volumen.gain.exponentialRampToValueAtTime(0.0001, t + nota.largo)

    oscilador.connect(volumen).connect(destino)
    oscilador.start(t)
    oscilador.stop(t + nota.largo + 0.02)
  }
}

export function pageTurn(): void {
  reproducir(dibujarPapel)
}

export function analysisReady(): void {
  reproducir(dibujarAviso)
}
