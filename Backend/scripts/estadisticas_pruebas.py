"""Estadística descriptiva de la corrida con videos reales.

Lee los JSON crudos que deja `probar_lote.py`, los cruza con las etiquetas de referencia
que viven en `$SENDA_DOCS/pruebas-videos-etiquetas.tsv`, y produce la tabla y las figuras que
consume el capítulo de validación de la tesis.

No interpreta: cuenta. Todo lo que emite sale de los archivos de la corrida, para que el
número de la tesis se pueda rastrear hasta el JSON que lo produjo.

    cd Backend && PYTHONPATH=. .venv/bin/python scripts/estadisticas_pruebas.py

El script está pensado para volver a correrse cuando se añadan videos: no tiene ningún
número escrito a mano y las figuras se regeneran completas.
"""
from __future__ import annotations

import argparse
import os
import json
from collections import Counter
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]

# Paleta estable: si las figuras se regeneran, los colores no bailan entre versiones.
AZUL, NARANJA, VERDE, ROJO, GRIS = "#2F6F73", "#E08A3C", "#4C956C", "#C4453C", "#8A8A8A"


def cargar_etiquetas(ruta: Path) -> pd.DataFrame:
    filas = []
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if not linea.strip() or linea.startswith("#"):
            continue
        filas.append(linea.split("\t"))
    return pd.DataFrame(filas[1:], columns=filas[0])


def cargar_resultados(directorio: Path) -> pd.DataFrame:
    filas = []
    for ruta in sorted(directorio.glob("*.json")):
        dato = json.loads(ruta.read_text(encoding="utf-8"))
        caso = dato["caso"]
        clasificacion = caso["classification"]
        categoria = clasificacion.get("category") or {}
        subcategoria = clasificacion.get("subcategory") or {}
        etapas = {t["stage"]: t.get("segundos_etapa", 0.0) for t in dato.get("tiempos", [])}
        hechos = caso["facts"]
        filas.append(
            {
                "clip": ruta.name.split("_")[0],
                "categoria_obtenida": categoria.get("label"),
                "confianza_categoria": categoria.get("confidence"),
                "subcategoria_obtenida": subcategoria.get("label"),
                "confianza_subcategoria": subcategoria.get("confidence"),
                "segmentos": len(caso["segments"]),
                "hitos_linea_tiempo": len(caso["timeline"]),
                "hechos": len(hechos),
                "hechos_criticos": sum(1 for h in hechos if h["is_critical"]),
                "fuentes": len(caso["sources"]),
                "rutas": len(caso["routes"]),
                "pasos_ruta": sum(len(r["steps"]) for r in caso["routes"]),
                "citas_ruta": sum(len(p["claims"]) for r in caso["routes"] for p in r["steps"]),
                "inconsistencias_criticas": caso["critical_inconsistencies"],
                "estado_imagen": (caso.get("memory_image") or {}).get("status"),
                "seg_audio": etapas.get("audio", 0.0),
                "seg_transcripcion": etapas.get("transcription", 0.0),
                "seg_analisis": etapas.get("people_places", 0.0),
                "seg_total": sum(etapas.values()),
                # Distribuciones que dependen de cuántos proveedores respondieron.
                "bandas": Counter(h["confidence_band"] for h in hechos),
                "verificacion": Counter(h["verification_status"] for h in hechos),
                "tipos_ruta": [r["route_type"] for r in caso["routes"]],
            }
        )
    return pd.DataFrame(filas)


def evaluar_aciertos(df: pd.DataFrame) -> pd.DataFrame:
    """Marca acierto sólo donde existe una etiqueta correcta posible.

    Los controles negativos (`tiene_hecho == 'no'`) quedan como «no aplica»: el
    clasificador no tiene clase de abstención, así que cualquier salida suya es
    necesariamente un falso positivo y no un error de discriminación entre clases.
    Mezclarlos con los demás inflaría o hundiría la tasa según convenga.
    """
    def marcar(fila):
        if fila["tiene_hecho"] != "si":
            return "no aplica"
        return "acierto" if fila["categoria_obtenida"] == fila["categoria_esperada"] else "error"

    df = df.copy()
    df["resultado"] = df.apply(marcar, axis=1)
    return df


def figura_categorias(df: pd.DataFrame, destino: Path) -> None:
    conteo = df["categoria_obtenida"].value_counts().sort_values()
    fig, ax = plt.subplots(figsize=(9, 4))
    ax.barh(conteo.index, conteo.values, color=AZUL)
    for y, v in enumerate(conteo.values):
        ax.text(v + 0.05, y, str(v), va="center", fontsize=9)
    ax.set_xlabel("Clips clasificados")
    ax.set_title(f"Categorías asignadas por BETO (n = {len(df)} clips)")
    ax.set_xlim(0, max(conteo.values) + 0.6)
    ax.grid(axis="x", alpha=0.3)
    fig.tight_layout()
    fig.savefig(destino, dpi=200)
    plt.close(fig)


def figura_aciertos(df: pd.DataFrame, destino: Path) -> None:
    conteo = df["resultado"].value_counts()
    colores = {"acierto": VERDE, "error": ROJO, "no aplica": GRIS}
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.pie(
        conteo.values,
        labels=[f"{k}\n({v})" for k, v in conteo.items()],
        colors=[colores.get(k, GRIS) for k in conteo.index],
        autopct="%1.0f%%",
        startangle=90,
        wedgeprops={"edgecolor": "white", "linewidth": 2},
    )
    ax.set_title(f"Resultado de la clasificación (n = {len(df)} clips)")
    fig.tight_layout()
    fig.savefig(destino, dpi=200)
    plt.close(fig)


def figura_confianza(df: pd.DataFrame, destino: Path) -> None:
    datos = [
        df["confianza_categoria"].dropna().astype(float),
        df["confianza_subcategoria"].dropna().astype(float),
    ]
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    caja = ax.boxplot(datos, patch_artist=True, widths=0.5,
                      tick_labels=["Categoría", "Subcategoría"])
    for parche, color in zip(caja["boxes"], (AZUL, NARANJA)):
        parche.set_facecolor(color)
        parche.set_alpha(0.55)
    for mediana in caja["medians"]:
        mediana.set_color("black")
    # Los puntos individuales importan más que la caja con esta n: se dibujan encima.
    for i, serie in enumerate(datos, start=1):
        ax.scatter([i] * len(serie), serie, color="black", zorder=3, s=18, alpha=0.8)
    ax.set_ylabel("Confianza reportada")
    ax.set_ylim(0, 1.05)
    ax.set_title(f"Distribución de la confianza (n = {len(df)} clips)")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(destino, dpi=200)
    plt.close(fig)


def figura_tiempos(df: pd.DataFrame, destino: Path) -> None:
    columnas = ["seg_audio", "seg_transcripcion", "seg_analisis", "seg_total"]
    nombres = ["Audio", "Transcripción", "Análisis\n(una inferencia)", "Total"]
    fig, ax = plt.subplots(figsize=(7.5, 4.5))
    caja = ax.boxplot([df[c].astype(float) for c in columnas], patch_artist=True,
                      widths=0.55, tick_labels=nombres)
    for parche in caja["boxes"]:
        parche.set_facecolor(AZUL)
        parche.set_alpha(0.5)
    for mediana in caja["medians"]:
        mediana.set_color("black")
    for i, c in enumerate(columnas, start=1):
        ax.scatter([i] * len(df), df[c].astype(float), color="black", zorder=3, s=18, alpha=0.8)
    ax.set_ylabel("Segundos")
    ax.set_title(f"Duración de las etapas del análisis (n = {len(df)} clips)")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(destino, dpi=200)
    plt.close(fig)


def figura_salidas(df: pd.DataFrame, destino: Path) -> None:
    columnas = ["hechos", "fuentes", "pasos_ruta", "citas_ruta"]
    nombres = ["Hechos", "Fuentes", "Pasos de ruta", "Citas"]
    colores = [AZUL, NARANJA, VERDE, GRIS]
    ancho = 0.2
    posiciones = range(len(df))
    fig, ax = plt.subplots(figsize=(9, 4.5))
    for i, (col, nombre, color) in enumerate(zip(columnas, nombres, colores)):
        ax.bar([p + i * ancho for p in posiciones], df[col].astype(int),
               width=ancho, label=nombre, color=color)
    ax.set_xticks([p + 1.5 * ancho for p in posiciones])
    ax.set_xticklabels(df["clip"])
    ax.set_ylabel("Elementos producidos")
    ax.set_title("Salidas del sistema por clip")
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(destino, dpi=200)
    plt.close(fig)


# El material de prueba se guarda fuera del repositorio; la variable de entorno
# SENDA_MATERIAL_PRUEBAS permite moverlo sin tocar el script.
MATERIAL = Path(
    os.environ.get("SENDA_MATERIAL_PRUEBAS", Path.home() / "Documents/SENDA-material-pruebas")
)
# Las etiquetas y el resumen de las pruebas tampoco viven en el repositorio.
DOCS = Path(os.environ.get("SENDA_DOCS", Path.home() / "Documents/SENDA-docs"))
# Las figuras van al documento LaTeX, que vive junto al repositorio.
FIGURAS = Path(os.environ.get("SENDA_FIGURAS", RAIZ.parent / "USB_TESIS/templatefigures"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resultados", type=Path,
                        default=MATERIAL / "prueba-videos/resultados")
    parser.add_argument("--etiquetas", type=Path,
                        default=DOCS / "pruebas-videos-etiquetas.tsv")
    # USB_TESIS es hermano del repositorio, no hijo: apuntar a RAIZ/USB_TESIS
    # escribia las figuras en una carpeta inexistente y el documento LaTeX
    # seguia compilando con las viejas.
    parser.add_argument("--figuras", type=Path,
                        default=FIGURAS)
    parser.add_argument("--csv", type=Path, default=DOCS / "pruebas-videos-resumen.csv")
    args = parser.parse_args()

    if not args.resultados.exists():
        raise SystemExit(f"No existe {args.resultados}. Corre antes scripts/probar_lote.py.")

    df = cargar_resultados(args.resultados)
    if df.empty:
        raise SystemExit(f"No hay archivos .json en {args.resultados}.")
    df = df.merge(cargar_etiquetas(args.etiquetas), on="clip", how="left")
    df = evaluar_aciertos(df)

    columnas_csv = [c for c in df.columns if c not in {"bandas", "verificacion", "tipos_ruta"}]
    args.csv.parent.mkdir(parents=True, exist_ok=True)
    df[columnas_csv].to_csv(args.csv, index=False)

    args.figuras.mkdir(parents=True, exist_ok=True)
    figura_categorias(df, args.figuras / "val_categorias.png")
    figura_aciertos(df, args.figuras / "val_aciertos.png")
    figura_confianza(df, args.figuras / "val_confianza.png")
    figura_tiempos(df, args.figuras / "val_tiempos.png")
    figura_salidas(df, args.figuras / "val_salidas.png")

    con_hecho = df[df["tiene_hecho"] == "si"]
    aciertos = int((con_hecho["resultado"] == "acierto").sum())
    bandas = sum(df["bandas"], Counter())
    verificacion = sum(df["verificacion"], Counter())

    print(f"Clips analizados            : {len(df)}")
    print(f"  con hecho victimizante    : {len(con_hecho)}")
    print(f"  controles negativos       : {len(df) - len(con_hecho)}")
    print(f"Aciertos de categoría       : {aciertos}/{len(con_hecho)}"
          + (f" ({aciertos / len(con_hecho):.0%})" if len(con_hecho) else ""))
    print()
    print(f"Confianza categoría    mediana {df['confianza_categoria'].median():.3f}"
          f"  rango [{df['confianza_categoria'].min():.3f}, {df['confianza_categoria'].max():.3f}]")
    print(f"Confianza subcategoría mediana {df['confianza_subcategoria'].median():.3f}"
          f"  rango [{df['confianza_subcategoria'].min():.3f}, {df['confianza_subcategoria'].max():.3f}]")
    print()
    print(f"Hechos extraídos            : {int(df['hechos'].sum())} "
          f"(mediana {df['hechos'].median():.1f} por clip)")
    print(f"Fuentes citadas             : {int(df['fuentes'].sum())}")
    print(f"Pasos de ruta               : {int(df['pasos_ruta'].sum())} "
          f"en {int(df['rutas'].sum())} rutas")
    print(f"Citas que respaldan pasos   : {int(df['citas_ruta'].sum())}")
    print(f"Inconsistencias críticas    : {int(df['inconsistencias_criticas'].sum())}")
    print(f"Tiempo total  mediana       : {df['seg_total'].median():.1f} s "
          f"(rango {df['seg_total'].min():.1f}-{df['seg_total'].max():.1f})")
    print()
    print(f"Bandas de confianza de hechos : {dict(bandas)}")
    print(f"Estado de verificación        : {dict(verificacion)}")
    if len(bandas) == 1 or len(verificacion) == 1:
        print("  AVISO: distribución degenerada. Con un solo proveedor de lenguaje activo")
        print("  todos los hechos caen en la misma banda; no es un hallazgo, es una")
        print("  ausencia de contraste. Graficarlo como distribución sería engañoso.")
    print()
    print(f"CSV     -> {args.csv}")
    print(f"Figuras -> {args.figuras}/val_*.png")


if __name__ == "__main__":
    main()
