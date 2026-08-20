import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { type ComponentType, type ReactNode } from "react"
import {
  BOOK_CONVERSATION_TRANSCRIPT,
  BOOK_SYSTEM_STEPS,
} from "./book-content"

type PageTheme = "paper" | "ink" | "image"

export type FlipbookPageItem = {
  id: string
  eyebrow: string
  label: string
  Component: ComponentType
  density?: "hard" | "soft"
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ")
}

// Viewport compartido: threshold alto para que la animación solo dispare
// cuando la página está genuinamente activa como hoja visible (no a mitad
// de flip), y once:false para que se repita si el usuario vuelve a la
// página tras haber avanzado.
const pageViewport = { once: false, amount: 0.6 } as const

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0 },
}

const fadeOnly = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
}

const imageSettle = {
  hidden: { opacity: 0, scale: 1.045 },
  shown: { opacity: 1, scale: 1 },
}

// El titular sube desde detrás de su propia máscara. Es el gesto clásico de
// portada editorial y sustituye al fadeUp genérico en las cabeceras.
const maskRise = {
  hidden: { y: "108%" },
  shown: { y: "0%" },
}

// La máscara recorta a ras de la caja de texto, así que las descendentes (g,
// j, y) y las cursivas se comerían un pelo: se compensa con holgura abajo.
const MASK = "overflow-hidden pb-[0.16em] -mb-[0.16em]"

// Una línea por máscara, escalonadas. Para titulares partidos a mano donde
// interesa que cada renglón entre por separado.
function LineReveal({
  lines,
  className,
  delay = 0,
}: {
  lines: ReactNode[]
  className?: string
  delay?: number
}) {
  return (
    <span className={className}>
      {lines.map((line, index) => (
        <span key={index} className={cx("block", MASK)}>
          <motion.span
            className="block"
            variants={maskRise}
            transition={{
              duration: 0.82,
              delay: delay + index * 0.1,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

function PageShell({
  kicker,
  folio,
  title,
  subtitle,
  theme = "paper",
  children,
  footer,
  className,
}: {
  kicker: string
  folio: string
  title: ReactNode
  subtitle?: ReactNode
  theme?: PageTheme
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const isDark = theme === "ink" || theme === "image"

  return (
    <motion.section
      initial="hidden"
      whileInView="shown"
      viewport={pageViewport}
      className={cx(
        "relative flex h-full min-h-full flex-col overflow-hidden p-6 md:p-8",
        isDark ? "bg-ink text-paper" : "bg-paper text-ink",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-5 h-px md:inset-x-8"
        style={{
          background: isDark
            ? "linear-gradient(90deg, rgba(248,244,230,0.72), transparent)"
            : "linear-gradient(90deg, rgba(24,20,16,0.44), transparent)",
        }}
      />
      <div aria-hidden="true" className="absolute bottom-0 right-0 top-0 w-1">
        <span className="block h-1/2 bg-amarillo" />
        <span className="block h-1/4 bg-azul" />
        <span className="block h-1/4 bg-rojo" />
      </div>

      <motion.header
        variants={fadeOnly}
        transition={{ duration: 0.5 }}
        className={cx(
          "relative z-10 mb-5 flex items-center justify-between gap-5 font-sans text-[10px] uppercase",
          isDark ? "text-paper/58" : "text-ink-faded"
        )}
      >
        <span>{kicker}</span>
        <span>{folio}</span>
      </motion.header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="max-w-[26rem]">
          <div className={MASK}>
            <motion.h2
              variants={maskRise}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className={cx(
                "font-serif text-[clamp(2.1rem,4.5vh,3.45rem)] leading-[0.96] text-balance",
                isDark ? "text-paper" : "text-ink"
              )}
            >
              {title}
            </motion.h2>
          </div>
          {subtitle ? (
            <motion.p
              variants={fadeUp}
              transition={{
                duration: 0.55,
                delay: 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cx(
                "mt-3 font-serif text-[clamp(1rem,2.08vh,1.16rem)] leading-snug text-pretty",
                isDark ? "text-paper/76" : "text-ink-soft"
              )}
            >
              {subtitle}
            </motion.p>
          ) : null}
        </div>

        {children}
      </div>

      {footer ? (
        <motion.footer
          variants={fadeOnly}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={cx(
            "relative z-10 mt-5 border-t pt-4 font-sans text-[10px] uppercase",
            isDark ? "border-paper/18 text-paper/54" : "border-rule text-ink-faded"
          )}
        >
          {footer}
        </motion.footer>
      ) : null}
    </motion.section>
  )
}

function ClosedCoverPage() {
  return (
    <motion.section
      id="cover"
      className="relative flex h-full min-h-full flex-col overflow-hidden bg-ink text-paper"
      initial={{ opacity: 0.92, scale: 1.015 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.img
        src="/images/cover-andes.jpg"
        alt="Montañas andinas cubiertas de niebla, con un camino rural al fondo"
        className="absolute inset-0 h-full w-full object-cover object-[center_42%] contrast-125 saturate-0 brightness-90"
        initial={{ scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/72 via-ink/48 to-ink" />
      <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-ink via-ink/92 to-transparent" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 z-10 flex h-[3px]">
        <span className="h-full w-1/2 bg-amarillo" />
        <span className="h-full w-1/4 bg-azul" />
        <span className="h-full w-1/4 bg-rojo" />
      </div>

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col p-6 md:p-9">
        <div className="flex shrink-0 items-center justify-between font-sans text-[10px] uppercase text-paper/62">
          <span>Crónica visual</span>
          <span>Derechos y acompañamiento</span>
        </div>

        <div className="mt-auto max-w-[27rem]">
          <p className="mb-[1.5vh] font-sans text-[10px] uppercase text-paper/56">
            Un libro abierto
          </p>
          <h2 className="font-serif text-[clamp(2.05rem,6vh,3.9rem)] leading-[0.92] text-paper">
            <span className="block italic font-normal">Los que</span>
            <span className="block">caminan</span>
            <span className="block italic font-normal text-paper/70">
              todavía.
            </span>
          </h2>
          <p className="mt-[1.6vh] max-w-sm border-t border-paper/22 pt-[1.6vh] font-serif text-[clamp(0.94rem,2.35vh,1.24rem)] leading-snug text-paper/84 text-pretty">
            Una lectura sobre desplazamiento, derechos y la posibilidad de
            volver a orientarse.
          </p>
        </div>
      </div>
    </motion.section>
  )
}

function PrologueFlipPage() {
  return (
    <motion.section
      initial="hidden"
      whileInView="shown"
      viewport={pageViewport}
      className="relative flex h-full min-h-full flex-col overflow-hidden bg-paper p-6 text-ink md:p-8"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-5 h-px md:inset-x-8"
        style={{
          background: "linear-gradient(90deg, rgba(24,20,16,0.44), transparent)",
        }}
      />
      <div aria-hidden="true" className="absolute bottom-0 right-0 top-0 w-1">
        <span className="block h-1/2 bg-amarillo" />
        <span className="block h-1/4 bg-azul" />
        <span className="block h-1/4 bg-rojo" />
      </div>

      <motion.header
        variants={fadeOnly}
        transition={{ duration: 0.5 }}
        className="relative z-10 mb-5 flex shrink-0 items-center justify-between gap-5 font-sans text-[10px] uppercase text-ink-faded"
      >
        <span>Prólogo</span>
        <span>003</span>
      </motion.header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2">
        <motion.figure
          variants={imageSettle}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative min-h-[14rem] overflow-hidden border border-rule bg-paper-deep md:min-h-0"
        >
          <img
            src="/images/hero-esperanza.jpg"
            alt="Madre con una niña frente a un paisaje de montaña"
            className="h-full w-full object-cover object-center duotone-ink"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/58 via-transparent to-transparent" />
          <motion.figcaption
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="absolute bottom-3 left-4 right-4 font-sans text-[10px] uppercase leading-snug text-paper/76"
          >
            La pregunta no es qué dato falta, sino qué necesita entender una
            persona para recuperar agencia
          </motion.figcaption>
        </motion.figure>

        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-5 md:border-l md:border-rule md:pl-6">
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-rule pt-4 md:border-t-0 md:pt-0"
          >
            {/* Esta cabecera vive en media columna de media hoja: se le pone
                techo aparte para que no se coma el alto de los párrafos. */}
            <h2 className="font-serif text-[clamp(1.65rem,3.5vh,2.5rem)] leading-[0.98] text-ink text-balance">
              Primero,{" "}
              <span className="italic text-ink-faded">la historia.</span>
            </h2>
            <p className="mt-2.5 font-serif text-[clamp(0.9rem,1.85vh,1.04rem)] leading-snug text-ink-soft text-pretty">
              Antes de hablar de tecnología, el libro vuelve a la escena
              humana: una persona perdió casa, rutina y certeza.
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.55, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="grid min-h-0 content-start gap-3 border-t border-rule pt-4"
          >
            {/* Escalan con el alto de la página: a 590px de ancho de hoja el
                texto fijo se desbordaba por debajo del folio. */}
            <p className="font-serif text-[clamp(0.88rem,1.8vh,1.02rem)] leading-[1.45] text-ink text-pretty">
              El desplazamiento no termina al llegar a otro lugar. Continúa
              en los papeles perdidos, en oficinas desconocidas y en el
              miedo a no saber cómo pedir ayuda.
            </p>
            <p className="font-serif text-[clamp(0.82rem,1.65vh,0.94rem)] leading-[1.45] text-ink-soft text-pretty">
              Desde ahí nace este sistema: una conversación que ordena
              información, explica derechos y prepara mejor el encuentro
              con las instituciones.
            </p>
          </motion.div>
        </div>
      </div>

      <motion.footer
        variants={fadeOnly}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="relative z-10 mt-5 shrink-0 border-t border-rule pt-4 font-sans text-[10px] uppercase text-ink-faded"
      >
        Una nota para leer con calma
      </motion.footer>
    </motion.section>
  )
}

function ContextFlipPage() {
  return (
    <motion.section
      initial="hidden"
      whileInView="shown"
      viewport={pageViewport}
      className="relative flex h-full min-h-full flex-col overflow-hidden bg-paper p-6 text-ink md:p-8"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-5 h-px md:inset-x-8"
        style={{
          background: "linear-gradient(90deg, rgba(24,20,16,0.44), transparent)",
        }}
      />
      <div aria-hidden="true" className="absolute bottom-0 right-0 top-0 w-1">
        <span className="block h-1/2 bg-amarillo" />
        <span className="block h-1/4 bg-azul" />
        <span className="block h-1/4 bg-rojo" />
      </div>

      <motion.header
        variants={fadeOnly}
        transition={{ duration: 0.5 }}
        className="relative z-10 mb-5 flex shrink-0 items-center justify-between gap-5 font-sans text-[10px] uppercase text-ink-faded"
      >
        <span>Capítulo I</span>
        <span>004</span>
      </motion.header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-5">
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[30rem]"
        >
          <h2 className="font-serif text-[clamp(2.1rem,4.5vh,3.45rem)] leading-[0.96] text-ink text-balance">
            El éxodo{" "}
            <span className="italic text-ink-faded">silencioso.</span>
          </h2>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 font-serif text-[clamp(1rem,2.08vh,1.16rem)] leading-snug text-ink-soft text-pretty"
          >
            El desplazamiento forzado no es un episodio aislado; es una
            corriente que ha atravesado al país durante décadas:{" "}
            <span className="text-ink">
              más de nueve millones de víctimas, ocho millones desplazadas y
              una de cada cinco familias rurales
            </span>{" "}
            marcadas por la huida.
          </motion.p>
        </motion.div>

        <motion.figure
          variants={fadeOnly}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative min-h-0 overflow-hidden border border-rule bg-paper-deep"
        >
          <img
            src="/images/camino.jpg"
            alt="Avenida urbana bajo luz de mediodía"
            className="h-full w-full object-cover object-center duotone-ink"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/56 via-transparent to-transparent" />
          <figcaption className="absolute bottom-3 left-4 right-4 font-sans text-[10px] uppercase text-paper/72">
            Caminar también puede ser una forma de resistencia
          </figcaption>
        </motion.figure>
      </div>

      <motion.footer
        variants={fadeOnly}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="relative z-10 mt-5 shrink-0 border-t border-rule pt-4 font-sans text-[10px] uppercase text-ink-faded"
      >
        Contexto y magnitud
      </motion.footer>
    </motion.section>
  )
}

function DocumentsFlipPage() {
  return (
    <motion.section
      initial="hidden"
      whileInView="shown"
      viewport={pageViewport}
      className="relative flex h-full min-h-full flex-col overflow-hidden bg-paper p-6 text-ink md:p-8"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-5 h-px md:inset-x-8"
        style={{
          background: "linear-gradient(90deg, rgba(24,20,16,0.44), transparent)",
        }}
      />
      <div aria-hidden="true" className="absolute bottom-0 right-0 top-0 w-1">
        <span className="block h-1/2 bg-amarillo" />
        <span className="block h-1/4 bg-azul" />
        <span className="block h-1/4 bg-rojo" />
      </div>

      <motion.header
        variants={fadeOnly}
        transition={{ duration: 0.5 }}
        className="relative z-10 mb-5 flex shrink-0 items-center justify-between gap-5 font-sans text-[10px] uppercase text-ink-faded"
      >
        <span>Capítulo II</span>
        <span>005</span>
      </motion.header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[26rem]"
        >
          <h2 className="font-serif text-[clamp(2.1rem,4.5vh,3.45rem)] leading-[0.96] text-ink text-balance">
            La casa que{" "}
            <span className="italic text-ink-faded">quedó.</span>
          </h2>
          <p className="mt-3 font-serif text-[clamp(1rem,2.08vh,1.16rem)] leading-snug text-ink-soft text-pretty">
            Cuando alguien huye, también pierde el archivo cotidiano de su
            vida: cédulas, recibos, escrituras, contactos y pruebas.
          </p>
        </motion.div>

        <motion.figure
          variants={imageSettle}
          transition={{ duration: 0.85, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-6 min-h-0 flex-1 overflow-hidden border border-rule bg-paper-deep"
        >
          <img
            src="/images/manos-documento.jpg"
            alt="Manos sosteniendo un documento de identidad"
            className="h-full w-full object-cover object-center duotone-ink"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-paper/82 via-paper/10 to-transparent" />
          <motion.figcaption
            variants={fadeOnly}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="absolute bottom-4 left-4 right-5 max-w-sm font-serif text-base italic leading-snug text-ink text-pretty"
          >
            Sin documentos, el Estado se vuelve un muro. Por eso la
            orientación empieza con lo que la persona sí conserva.
          </motion.figcaption>
        </motion.figure>
      </div>

      <motion.footer
        variants={fadeOnly}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="relative z-10 mt-5 shrink-0 border-t border-rule pt-4 font-sans text-[10px] uppercase text-ink-faded"
      >
        Memoria, papeles y acceso
      </motion.footer>
    </motion.section>
  )
}

function ToolIntroFlipPage() {
  return (
    <PageShell
      kicker="Capítulo IV"
      folio="006"
      title={
        <>
          Una herramienta{" "}
          <span className="italic text-paper/60">que escucha.</span>
        </>
      }
      theme="ink"
      subtitle="El sistema no reemplaza el acompañamiento humano. Ayuda a ordenar el relato para que una persona llegue mejor preparada a la ruta de atención."
      footer="Tecnología situada"
    >
      <div className="mt-6 grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-5">
        <motion.figure
          variants={fadeOnly}
          initial="hidden"
          whileInView="shown"
          viewport={pageViewport}
          transition={{ duration: 0.9, delay: 0.1, ease: "easeOut" }}
          className="relative min-h-0 overflow-hidden border border-paper/12 bg-paper/5"
        >
          <img
            src="/images/tecnologia.jpg"
            alt="Mujer usando un teléfono en una comunidad rural"
            className="h-full w-full object-cover object-center opacity-90 duotone-ink"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/64 via-transparent to-transparent" />
          <figcaption className="absolute bottom-3 left-4 right-4 flex justify-between font-sans text-[10px] uppercase text-paper/60">
            <span>Asistencia artificial</span>
            <span>Decisiones humanas</span>
          </figcaption>
        </motion.figure>

        <motion.p
          variants={fadeOnly}
          initial="hidden"
          whileInView="shown"
          viewport={pageViewport}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="max-w-md font-serif text-lg italic leading-snug text-paper/78 text-pretty"
        >
          La herramienta aparece como una mesa limpia: reúne hechos, documentos
          y próximos pasos sin quitarle a la persona el control de su historia.
        </motion.p>
      </div>
    </PageShell>
  )
}

function ToolStepsFlipPage() {
  return (
    <PageShell
      kicker="Capítulo IV"
      folio="007"
      title={
        <>
          Cuatro gestos,{" "}
          <span className="italic text-ink-faded">una ruta.</span>
        </>
      }
      footer="Del relato a la orientación"
    >
      <div className="mt-5 grid min-h-0 flex-1 grid-rows-[0.36fr_1fr] gap-4">
        <motion.figure
          variants={fadeOnly}
          initial="hidden"
          whileInView="shown"
          viewport={pageViewport}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative min-h-0 overflow-hidden border border-rule bg-paper-deep"
        >
          <img
            src="/images/archivo.jpg"
            alt="Documentos organizados sobre una mesa"
            className="h-full w-full object-cover object-center duotone-ink"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-paper/84 via-paper/22 to-transparent" />
          <figcaption className="absolute bottom-3 left-4 font-sans text-[10px] uppercase text-ink-faded">
            Datos que vuelven a tener orden
          </figcaption>
        </motion.figure>

        <ol className="grid min-h-0 grid-cols-2 gap-x-5 gap-y-3">
          {BOOK_SYSTEM_STEPS.map((step, index) => (
            <motion.li
              key={step.n}
              variants={fadeUp}
              initial="hidden"
              whileInView="shown"
              viewport={pageViewport}
              transition={{
                duration: 0.45,
                delay: 0.15 + index * 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="border-t border-rule pt-3"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-ink-faded">
                  {step.n}
                </span>
                <h3 className="font-serif text-[clamp(1.1rem,2.45vh,1.5rem)] leading-none text-ink">
                  {step.title}
                </h3>
              </div>
              {/* Cuatro bloques en media hoja: el cuerpo fijo de 15px hacía
                  que "Acompañar" se saliera por el borde inferior. */}
              <p className="mt-1.5 font-serif text-[clamp(0.78rem,1.6vh,0.92rem)] leading-[1.4] text-ink-soft text-pretty">
                {step.body}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </PageShell>
  )
}

// En el transcript los índices pares son de la persona y los impares del
// sistema. La selección anterior —[0,1,3,5,7]— se quedaba con un turno de ella
// y cuatro seguidos de él: la página se llamaba "Una voz, una respuesta" pero
// leía como un monólogo, y encima el quinto turno no cabía sobre el pie.
// Este corte alterna y cierra el arco: ella pide, él orienta, ella advierte
// que no tiene papeles, él resuelve con lo que sí conserva.
const conversationTurns = BOOK_CONVERSATION_TRANSCRIPT.filter((_, index) =>
  [0, 1, 4, 5].includes(index)
)

const turnAccent = {
  amarillo: "border-amarillo",
  azul: "border-azul",
  rojo: "border-rojo",
} as const

// Divide un texto en palabras y las revela en cascada, simulando que el
// turno se está escribiendo en el momento. staggerChildren real de
// framer-motion (no delays calculados a mano) para que el ritmo entre
// palabras sea consistente sin importar cuántas tenga cada turno.
function WordReveal({
  text,
  className,
  wordDuration = 0.32,
  stagger = 0.045,
}: {
  text: string
  className?: string
  wordDuration?: number
  stagger?: number
}) {
  const words = text.split(" ").filter((word) => word.length > 0)

  return (
    <motion.p
      className={className}
      variants={{
        hidden: {},
        shown: {
          transition: { staggerChildren: stagger },
        },
      }}
    >
      {words.map((word, index) => (
        <motion.span
          key={index}
          variants={{
            hidden: { opacity: 0, y: 6 },
            shown: {
              opacity: 1,
              y: 0,
              transition: { duration: wordDuration, ease: [0.22, 1, 0.36, 1] },
            },
          }}
          className="inline-block"
        >
          {word}
          {index < words.length - 1 ? "\u00a0" : ""}
        </motion.span>
      ))}
    </motion.p>
  )
}

function ConversationFlipPage() {
  return (
    <PageShell
      kicker="Escena de acompañamiento"
      folio="008"
      title={
        <>
          Una voz,{" "}
          <span className="italic text-ink-faded">una respuesta.</span>
        </>
      }
      subtitle="Una conversación breve muestra cómo el relato se convierte en orientación sin exigir lenguaje jurídico."
      footer="Caso compuesto, datos protegidos"
    >
      <ol className="mt-4 min-h-0 flex-1 space-y-2">
        {conversationTurns.map((turn, index) => (
          <motion.li
            key={`${turn.label}-${index}`}
            variants={fadeUp}
            initial="hidden"
            whileInView="shown"
            viewport={pageViewport}
            transition={{
              duration: 0.4,
              delay: 0.1 + index * 0.42,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cx(
              "grid grid-cols-[2.1rem_1fr] gap-3 border-l-2 pl-3.5",
              turn.accent ? turnAccent[turn.accent] : "border-rule"
            )}
          >
            <div className="pt-0.5 font-mono text-[10px] uppercase text-ink-faded">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div>
              <p className="mb-0.5 font-sans text-[10px] uppercase text-ink-faded">
                {turn.who === "persona" ? "Persona" : "Sistema"}
              </p>
              <WordReveal
                text={turn.body}
                wordDuration={turn.who === "persona" ? 0.26 : 0.34}
                stagger={turn.who === "persona" ? 0.032 : 0.05}
                className={cx(
                  // Cinco turnos tienen que caber sobre el pie de página.
                  "font-serif leading-[1.38] text-pretty",
                  turn.who === "persona"
                    ? "text-[clamp(0.84rem,1.72vh,0.98rem)] text-ink"
                    : "text-[clamp(0.8rem,1.65vh,0.93rem)] italic text-ink-soft"
                )}
              />
            </div>
          </motion.li>
        ))}
      </ol>
    </PageShell>
  )
}

function TrustFlipPage() {
  const notes = [
    ["Confianza", "Primero valida la situación humana; después solicita datos."],
    ["Claridad", "Cada trámite se traduce en una acción comprensible."],
    ["Límite", "Cuando hace falta criterio especializado, deriva a una persona."],
  ]

  return (
    <PageShell
      kicker="Diseño del cuidado"
      folio="009"
      title={
        <>
          Lo que la interfaz{" "}
          <span className="italic text-ink-faded">debe cuidar.</span>
        </>
      }
      footer="Criterios de confianza"
    >
      <div className="mt-6 grid min-h-0 flex-1 grid-rows-[0.75fr_auto] gap-5">
        <motion.figure
          variants={fadeOnly}
          initial="hidden"
          whileInView="shown"
          viewport={pageViewport}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative min-h-[7.5rem] overflow-hidden border border-rule bg-paper-deep"
        >
          <img
            src="/images/justicia.jpg"
            alt="Persona revisando documentos de acceso a la justicia"
            className="h-full w-full object-cover object-center duotone-ink"
          />
          {/* El velo iba a paper/82 y el pie en tinta caía sobre medios tonos
              de la foto: ilegible. Ahora es casi opaco donde se apoya. */}
          <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/72 via-40% to-transparent" />
          <figcaption className="absolute bottom-3 left-4 right-5 max-w-sm font-serif text-[clamp(0.86rem,1.72vh,1rem)] italic leading-snug text-ink">
            La interfaz no decide por la persona: prepara mejor la conversación
            que vendrá después.
          </figcaption>
        </motion.figure>

        <ul className="divide-y divide-rule border-y border-rule">
          {notes.map(([title, body], index) => (
            <motion.li
              key={title}
              variants={fadeUp}
              initial="hidden"
              whileInView="shown"
              viewport={pageViewport}
              transition={{
                duration: 0.45,
                delay: 0.2 + index * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="grid grid-cols-[2.5rem_1fr] gap-4 py-2.5"
            >
              <span className="font-mono text-[10px] text-ink-faded">
                0{index + 1}
              </span>
              <div>
                <h3 className="font-serif text-xl leading-none text-ink">
                  {title}
                </h3>
                <p className="mt-1 font-serif text-base leading-snug text-ink-soft">
                  {body}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </PageShell>
  )
}

function ColophonFlipPage() {
  return (
    <motion.section
      initial="hidden"
      whileInView="shown"
      viewport={pageViewport}
      className="relative flex h-full min-h-full flex-col overflow-hidden bg-ink p-6 text-paper md:p-8"
    >
      {/* Antes iba cover-andes.jpg: es cuadrada y su mitad superior es niebla
          sin detalle, que en una página vertical quedaba como un gris muerto.
          Esta es vertical y muestra justo lo que dice el texto. */}
      <motion.img
        variants={{
          hidden: { opacity: 0, scale: 1.12 },
          shown: { opacity: 1, scale: 1 },
        }}
        transition={{
          opacity: { duration: 1.2, ease: "easeOut" },
          scale: { duration: 16, ease: "linear" },
        }}
        src="/images/mosaic-desplazamiento/07-ruta-institucional-v3.jpg"
        alt="Una funcionaria acompaña a una mujer mientras revisan juntas la ruta de atención en una tableta"
        className="absolute inset-0 h-full w-full object-cover object-[62%_center] duotone-ink"
      />
      {/* El texto vive en la mitad inferior: ahí el velo es casi opaco y
          arriba se abre para que la fotografía respire. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, oklch(0.19 0.018 60) 0%, oklch(0.19 0.018 60 / 94%) 30%, oklch(0.19 0.018 60 / 62%) 55%, oklch(0.19 0.018 60 / 22%) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-28"
        style={{
          background:
            "linear-gradient(to bottom, oklch(0.19 0.018 60 / 72%), transparent)",
        }}
      />

      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-5 h-px md:inset-x-8"
        style={{
          background: "linear-gradient(90deg, rgba(248,244,230,0.72), transparent)",
        }}
      />
      <div aria-hidden="true" className="absolute bottom-0 right-0 top-0 w-1">
        <span className="block h-1/2 bg-amarillo" />
        <span className="block h-1/4 bg-azul" />
        <span className="block h-1/4 bg-rojo" />
      </div>

      <motion.header
        variants={fadeOnly}
        transition={{ duration: 0.5 }}
        className="relative z-10 mb-5 flex shrink-0 items-center justify-between gap-5 font-sans text-[10px] uppercase text-paper/58"
      >
        <span>Colofón</span>
        <span>010</span>
      </motion.header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end">
        <LineReveal
          className="block max-w-md font-serif text-[clamp(2rem,4.4vh,3.2rem)] leading-[0.98] text-paper"
          delay={0.12}
          lines={[
            "Este libro",
            <span key="cierra" className="italic text-paper/68">
              no se cierra.
            </span>,
          ]}
        />
        <motion.p
          variants={fadeUp}
          transition={{ duration: 0.6, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-md font-serif text-[clamp(0.95rem,2vh,1.14rem)] leading-relaxed text-paper/86 text-pretty"
        >
          El recorrido termina donde debería empezar la atención: con una
          persona mejor orientada y una institución obligada a escuchar con
          claridad.
        </motion.p>

        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.6, delay: 0.58, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* isolate + el relleno primero en el DOM: los hermanos con position
              relative pintan encima sin necesidad de z-index negativos. */}
          <Link
            to="/conversar"
            className="group relative isolate mt-6 flex items-center justify-between gap-4 overflow-hidden rounded-full border border-paper/40 px-6 py-4 font-serif text-[clamp(1rem,2.2vh,1.3rem)] text-paper transition-colors hover:border-amarillo focus:outline-none focus-visible:ring-2 focus-visible:ring-paper/70"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 origin-left scale-x-0 bg-amarillo transition-transform duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100"
            />
            <span className="relative transition-colors duration-300 group-hover:text-ink">
              Iniciar una conversación
            </span>
            <span
              aria-hidden="true"
              className="relative transition-all duration-300 group-hover:translate-x-1 group-hover:text-ink"
            >
              →
            </span>
          </Link>
        </motion.div>
      </div>

      <motion.footer
        variants={fadeOnly}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="relative z-10 mt-5 shrink-0 border-t border-paper/18 pt-4 font-sans text-[10px] uppercase text-paper/54"
      >
        Fin del volumen
      </motion.footer>
    </motion.section>
  )
}

export const BOOK_PAGES: FlipbookPageItem[] = [
  {
    id: "closed-cover",
    eyebrow: "Cubierta",
    label: "Los que caminan todavía",
    Component: ClosedCoverPage,
    density: "hard",
  },
  {
    id: "prologo",
    eyebrow: "Prólogo",
    label: "Primero, la historia",
    Component: PrologueFlipPage,
  },
  {
    id: "contexto",
    eyebrow: "Capítulo I",
    label: "El éxodo silencioso",
    Component: ContextFlipPage,
  },
  {
    id: "documentos",
    eyebrow: "Capítulo II",
    label: "La casa que quedó",
    Component: DocumentsFlipPage,
  },
  {
    id: "herramienta",
    eyebrow: "Capítulo IV",
    label: "Una herramienta que escucha",
    Component: ToolIntroFlipPage,
  },
  {
    id: "gestos",
    eyebrow: "Capítulo IV",
    label: "Cuatro gestos, una ruta",
    Component: ToolStepsFlipPage,
  },
  {
    id: "conversacion",
    eyebrow: "Escena",
    label: "Una voz, una respuesta",
    Component: ConversationFlipPage,
  },
  {
    id: "cuidado",
    eyebrow: "Diseño del cuidado",
    label: "Lo que la interfaz debe cuidar",
    Component: TrustFlipPage,
  },
  {
    id: "colofon",
    eyebrow: "Colofón",
    label: "Este libro no se cierra",
    Component: ColophonFlipPage,
    density: "hard",
  },
]

export const PAGE_COUNT_LABEL = String(BOOK_PAGES.length).padStart(2, "0")
