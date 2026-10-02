#!/usr/bin/env python3
"""Genera los QR del sitio del CSC (PNG y SVG) en la carpeta qr/.

Uso:
    pip install "qrcode[pil]"
    python3 scripts/generar_qr.py https://USUARIO.github.io/REPO/

Genera tres QR: la página de inicio, /profesores/ y /alumnos/.
Son QR estáticos: llevan la dirección escrita dentro y no caducan.
Si cambia la dirección del sitio, hay que volver a generarlos e imprimirlos de nuevo.
"""

import argparse
import sys
from pathlib import Path

try:
    import qrcode
    import qrcode.image.svg
except ImportError:
    sys.exit('Falta la librería "qrcode". Instálala con:  pip install "qrcode[pil]"')

# (nombre del archivo, ruta dentro del sitio)
DESTINOS = [
    ("inicio", ""),
    ("profesores", "profesores/"),
    ("alumnos", "alumnos/"),
]

CARPETA_POR_DEFECTO = Path(__file__).resolve().parent.parent / "qr"


def normalizar_url_base(texto: str) -> str:
    url = texto.strip()
    if not url.startswith(("https://", "http://")):
        sys.exit(f'La dirección debe empezar con https:// (recibí: "{texto}")')
    if "USUARIO" in url or "REPO" in url:
        sys.exit("Escribe la dirección real del sitio, no el ejemplo USUARIO/REPO.")
    if "?" in url or "#" in url:
        sys.exit("La dirección base no debe llevar ? ni #.")
    return url if url.endswith("/") else url + "/"


def crear_qr(url: str) -> qrcode.QRCode:
    # Nivel de corrección Q (25 %): aguanta rayones y dobleces en una impresión.
    # Borde de 4 módulos: es el margen blanco que exige el estándar para que lo lea cualquier celular.
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=20,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr


def generar(url_base: str, carpeta: Path) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    for nombre, ruta in DESTINOS:
        url = url_base + ruta
        qr = crear_qr(url)
        qr.make_image(fill_color="black", back_color="white").save(carpeta / f"{nombre}.png")
        qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(carpeta / f"{nombre}.svg")
        print(f"{nombre:<11} {url}")
    print(f"\nListo: {len(DESTINOS) * 2} archivos en {carpeta}")


def main() -> None:
    analizador = argparse.ArgumentParser(description="Genera los QR (PNG y SVG) del sitio del CSC.")
    analizador.add_argument("url_base", help="Dirección del sitio, por ejemplo https://USUARIO.github.io/REPO/")
    analizador.add_argument("--salida", type=Path, default=CARPETA_POR_DEFECTO, help="Carpeta de salida (por defecto: qr/)")
    argumentos = analizador.parse_args()
    generar(normalizar_url_base(argumentos.url_base), argumentos.salida)


if __name__ == "__main__":
    main()
