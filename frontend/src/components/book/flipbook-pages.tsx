import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { type ComponentType, type ReactNode } from "react"
import {
  BOOK_CONVERSATION_TRANSCRIPT,
  BOOK_SYSTEM_STEPS,
} from "../../data/book-content"

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
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              "font-serif text-[clamp(2.1rem,4.5vh,3.45rem)] leading-[0.96] text-balance",
              isDark ? "text-paper" : "text-ink"
            )}
          >
            {title}
          </motion.h2>
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
            <h2 className="font-serif text-[clamp(2.1rem,4.5vh,3.45rem)] leading-[0.96] text-ink text-balance">
              Primero,{" "}
              <span className="italic text-ink-faded">la historia.</span>
            </h2>
            <p className="mt-3 font-serif text-[clamp(1rem,2.08vh,1.16rem)] leading-snug text-ink-soft text-pretty">
              Antes de hablar de tecnología, el libro vuelve a la escena
              humana: una persona perdió casa, rutina y certeza.
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.55, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="grid min-h-0 content-start gap-4 border-t border-rule pt-4"
          >
            <p className="font-serif text-lg leading-relaxed text-ink text-pretty">
              El desplazamiento no termina al llegar a otro lugar. Continúa
              en los papeles perdidos, en oficinas desconocidas y en el
              miedo a no saber cómo pedir ayuda.
            </p>
            <p className="font-serif text-base leading-relaxed text-ink-soft text-pretty">
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
      <div className="mt-6 grid min-h-0 flex-1 grid-rows-[0.45fr_1fr] gap-5">
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

        <ol className="grid min-h-0 grid-cols-2 gap-x-5 gap-y-4">
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
                <h3 className="font-serif text-2xl leading-none text-ink">
                  {step.title}
                </h3>
              </div>
              <p className="mt-2 font-serif text-[15px] leading-snug text-ink-soft text-pretty">
                {step.body}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </PageShell>
  )
}

const conversationTurns = BOOK_CONVERSATION_TRANSCRIPT.filter((_, index) =>
  [0, 1, 3, 5, 7].includes(index)
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
      <ol className="mt-5 min-h-0 flex-1 space-y-3">
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
              "grid grid-cols-[3.3rem_1fr] gap-4 border-l-2 pl-4",
              turn.accent ? turnAccent[turn.accent] : "border-rule"
            )}
          >
            <div className="pt-1 font-mono text-[10px] uppercase text-ink-faded">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div>
              <p className="mb-1 font-sans text-[10px] uppercase text-ink-faded">
                {turn.who === "persona" ? "Persona" : "Sistema"}
              </p>
              <WordReveal
                text={turn.body}
                wordDuration={turn.who === "persona" ? 0.26 : 0.34}
                stagger={turn.who === "persona" ? 0.032 : 0.05}
                className={cx(
                  "font-serif leading-snug text-pretty",
                  turn.who === "persona"
                    ? "text-[1.02rem] text-ink"
                    : "text-base italic text-ink-soft"
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
          className="relative min-h-0 overflow-hidden border border-rule bg-paper-deep"
        >
          <img
            src="/images/justicia.jpg"
            alt="Persona revisando documentos de acceso a la justicia"
            className="h-full w-full object-cover object-center duotone-ink"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-paper/82 via-paper/18 to-transparent" />
          <figcaption className="absolute bottom-4 left-4 right-5 max-w-sm font-serif text-lg italic leading-snug text-ink">
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
      <motion.img
        variants={fadeOnly}
        transition={{ duration: 1.1, ease: "easeOut" }}
        src="/images/cover-andes.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[center_58%] opacity-55 duotone-ink"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/74 to-ink/38" />

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
        <motion.h2
          variants={fadeUp}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md font-serif text-[clamp(2.1rem,4.5vh,3.45rem)] leading-[0.96] text-paper text-balance"
        >
          Este libro{" "}
          <span className="italic text-paper/64">no se cierra.</span>
        </motion.h2>
        <motion.p
          variants={fadeUp}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-md font-serif text-xl leading-snug text-paper/84 text-pretty"
        >
          El recorrido termina donde debería empezar la atención: con una
          persona mejor orientada y una institución obligada a escuchar con
          claridad.
        </motion.p>

        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link
            to="/conversar"
            className="group mt-8 flex min-h-16 items-center justify-between border-y border-paper/30 py-5 font-serif text-3xl text-paper transition-colors hover:text-amarillo focus:outline-none focus:ring-2 focus:ring-paper/70"
          >
            <span>Iniciar una conversación</span>
            <span className="font-sans text-[10px] uppercase text-paper/56 transition-colors group-hover:text-amarillo">
              Ir
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
