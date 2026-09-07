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
 * describen en veinte líneas. El papel es ruido blanco filtrado con una caída
 * rápida; el aviso, dos notas suaves.
 *
 * Se puede apagar y la preferencia se recuerda. Nada suena sin que la persona
 * haya hecho algo antes —pasar una página, pedir un análisis—, que además es
 * lo único que los navegadores permiten sin bloquear el audio.
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

/* El contexto se crea tarde y una sola vez: hacerlo al cargar el módulo lo
 * dejaría suspendido por la política de reproducción automática del navegador,
 * y además gasta un recurso de audio en cada pestaña que nunca lo use. */
function obtenerContexto(): AudioContext | null {
  if (!habilitado) return null
  if (contexto) {
    // El navegador suspende el contexto cuando la pestaña pasa a segundo
    // plano, que es justo donde estará la persona mientras corre el análisis.
    // Sin esto, el aviso de "ya está" no sonaría nunca.
    if (contexto.state === "suspended") void contexto.resume()
    return contexto
  }
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

/* La hoja de papel: un golpe de ruido blanco que se apaga en un cuarto de
 * segundo, filtrado por arriba para quitarle el siseo digital y por abajo para
 * que no retumbe. Suena a papel porque el papel es exactamente eso, ruido de
 * banda ancha que decae rápido. */
export function pageTurn(): void {
  const ctx = obtenerContexto()
  if (!ctx) return
  try {
    const duracion = 0.26
    const muestras = Math.floor(ctx.sampleRate * duracion)
    const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate)
    const datos = buffer.getChannelData(0)
    for (let i = 0; i < muestras; i += 1) {
      // La envolvente al cubo hace el golpe seco del principio y la cola corta.
      const caida = (1 - i / muestras) ** 3
      datos[i] = (Math.random() * 2 - 1) * caida
    }

    const fuente = ctx.createBufferSource()
    fuente.buffer = buffer

    const paso = ctx.createBiquadFilter()
    paso.type = "bandpass"
    paso.frequency.value = 2300
    paso.Q.value = 0.7

    const volumen = ctx.createGain()
    volumen.gain.value = 0.05 // discreto a propósito: acompaña, no anuncia

    fuente.connect(paso).connect(volumen).connect(ctx.destination)
    fuente.start()
  } catch {
    // Un sonido que falla no puede tumbar la página que lo pidió.
  }
}

/* El aviso de análisis terminado: dos notas ascendentes, un intervalo abierto
 * y corto. Ni fanfarria ni alarma; el análisis no es una buena noticia ni una
 * mala, sólo algo que ya está listo para leerse. */
export function analysisReady(): void {
  const ctx = obtenerContexto()
  if (!ctx) return
  try {
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
      volumen.gain.exponentialRampToValueAtTime(0.075, t + 0.03)
      volumen.gain.exponentialRampToValueAtTime(0.0001, t + nota.largo)

      oscilador.connect(volumen).connect(ctx.destination)
      oscilador.start(t)
      oscilador.stop(t + nota.largo + 0.02)
    }
  } catch {
    // Igual que arriba: el aviso es accesorio, el análisis no.
  }
}
