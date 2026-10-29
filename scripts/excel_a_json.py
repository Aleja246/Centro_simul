#!/usr/bin/env python3
"""Convierte el Excel del inventario del CSC en los datos que usa la página de escaneo.

Uso:
    pip install openpyxl "qrcode[pil]"
    python3 scripts/excel_a_json.py datos/inventario.xlsx

Lee del Excel:
  - Hoja "Inventario": una fila por artículo (columnas por nombre, no por letra).
  - Hoja "Cajas", sección "Cajas reales": cuarto y estante de cada caja.
  - Hoja "Reservas" (opcional): reservas confirmadas que se muestran al escanear.

Genera:
  - datos/inventario.json   (lo lee equipo/ y etiquetas/)
  - qr/equipos/<ID>.svg     (un QR por simulador, accesorio, equipo clínico y caja)

Solo se publican las columnas que necesita la página: no se copian "Revisado por",
fechas de revisión ni materiales faltantes.
"""

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit('Falta la librería "openpyxl". Instálala con:  pip install openpyxl')

RAIZ = Path(__file__).resolve().parent.parent
URL_SITIO = "https://aleja246.github.io/Centro_simul/"

# Encabezados de la hoja Inventario que se usan (deben existir tal cual).
COLUMNAS = {
    "id": "ID equipo",
    "nombre": "Nombre / descripción del equipo",
    "categoria": "Categoría",
    "marca": "Marca",
    "cuarto": "Zona del cuarto donde estaba",
    "estado": "Estado general",
    "guardado": "Caja real",
    "notas": "Notas / enlace a foto",
    "tipo": "Tipo (para QR)",
    "kit": "Kit / módulo",
    "pertenece": "Pertenece a (ID)",
}
TIPOS = ["Simulador", "Accesorio", "Equipo clínico", "Electrónica / general", "Consumible"]
PRIORIDAD_QR = {"Simulador": 1, "Accesorio": 1, "Equipo clínico": 2}
PATRON_CAJA = re.compile(r"^(CJ|EST)-[\w.]+$")

RESERVAS_COLUMNAS = {
    "id": "ID equipo",
    "fecha": "Fecha",
    "inicio": "Hora inicio",
    "fin": "Hora fin",
    "actividad": "Actividad",
    "sala": "Sala",
}


def texto(valor):
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return re.sub(r"\s+", " ", str(valor)).strip()


def leer_tabla(hoja, encabezados_requeridos, fila_encabezado=None):
    """Devuelve (fila_encabezado, {nombre_columna: índice}) buscando la fila de encabezados."""
    filas = [fila_encabezado] if fila_encabezado else range(1, min(hoja.max_row, 80) + 1)
    for f in filas:
        valores = [texto(c.value) for c in hoja[f]]
        if all(e in valores for e in encabezados_requeridos):
            return f, {v: i for i, v in enumerate(valores) if v}
    return None, None


def leer_inventario(libro, avisos):
    if "Inventario" not in libro.sheetnames:
        sys.exit('El Excel no tiene la hoja "Inventario".')
    hoja = libro["Inventario"]
    requeridas = [COLUMNAS[k] for k in ("id", "nombre", "cuarto", "guardado", "tipo")]
    fila_enc, idx = leer_tabla(hoja, requeridas)
    if not fila_enc:
        sys.exit("En la hoja Inventario faltan columnas: " + ", ".join(requeridas))

    articulos = []
    for fila in hoja.iter_rows(min_row=fila_enc + 1, values_only=True):
        dato = {k: texto(fila[idx[v]]) if v in idx and idx[v] < len(fila) else "" for k, v in COLUMNAS.items()}
        if not dato["id"] or not dato["nombre"]:
            continue  # IDs ya puestos pero sin artículo registrado
        tipo = dato["tipo"]
        if tipo and tipo not in TIPOS:
            avisos.append(f'{dato["id"]}: tipo "{tipo}" no es de la lista; se trata como vacío.')
            tipo = ""
        if not tipo:
            avisos.append(f'{dato["id"]} ({dato["nombre"]}): sin "Tipo (para QR)".')
        guardado = dato["guardado"]
        articulos.append({
            "id": dato["id"].upper(),
            "nombre": dato["nombre"],
            "tipo": tipo,
            "categoria": dato["categoria"],
            "marca": dato["marca"],
            "cuarto": dato["cuarto"],
            "caja": guardado.upper() if PATRON_CAJA.match(guardado.upper()) else "",
            "guardado": "" if PATRON_CAJA.match(guardado.upper()) else guardado,
            "estado": dato["estado"],
            "notas": dato["notas"],
            "kit": dato["kit"],
            "pertenece": dato["pertenece"].upper(),
            "qr": PRIORIDAD_QR.get(tipo),
        })

    ids = {a["id"] for a in articulos}
    repetidos = {a["id"] for a in articulos if sum(b["id"] == a["id"] for b in articulos) > 1}
    for r in sorted(repetidos):
        avisos.append(f"{r}: el ID está repetido en Inventario.")
    for a in articulos:
        if a["pertenece"] and a["pertenece"] not in ids:
            avisos.append(f'{a["id"]}: "Pertenece a" = {a["pertenece"]}, que no existe en Inventario.')
    return articulos


def leer_cajas(libro, articulos, avisos):
    cajas = {}
    if "Cajas" in libro.sheetnames:
        hoja = libro["Cajas"]
        fila_enc, idx = leer_tabla(hoja, ["Caja", "Contenido principal", "Cuarto"])
        if fila_enc:
            col_estante = next((i for v, i in idx.items() if v.startswith("Estante")), None)
            for fila in hoja.iter_rows(min_row=fila_enc + 1, values_only=True):
                cid = texto(fila[idx["Caja"]]).upper()
                if not cid:
                    break
                cajas[cid] = {
                    "id": cid,
                    "contenido": texto(fila[idx["Contenido principal"]]),
                    "estante": texto(fila[col_estante]) if col_estante is not None else "",
                }
        else:
            avisos.append('La hoja Cajas no tiene la sección "Cajas reales"; las cajas salen solo del Inventario.')

    # El cuarto de cada caja se calcula del Inventario (así nunca queda desactualizado).
    for a in articulos:
        if not a["caja"]:
            continue
        caja = cajas.setdefault(a["caja"], {"id": a["caja"], "contenido": "", "estante": ""})
        caja.setdefault("cuartos", [])
        if a["cuarto"] and a["cuarto"] not in caja["cuartos"]:
            caja["cuartos"].append(a["cuarto"])
    for caja in cajas.values():
        caja.setdefault("cuartos", [])
        if len(caja["cuartos"]) > 1:
            avisos.append(f'{caja["id"]}: el mismo ID se usa en {len(caja["cuartos"])} cuartos '
                          f'({", ".join(caja["cuartos"])}). Conviene renombrar una de las cajas.')
    return sorted(cajas.values(), key=lambda c: (not c["id"].startswith("CJ"), c["id"]))


def a_fecha(valor):
    if isinstance(valor, dt.datetime):
        return valor.date().isoformat()
    if isinstance(valor, dt.date):
        return valor.isoformat()
    t = texto(valor)
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", t)
    if m:
        return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}"
    return t if re.match(r"^\d{4}-\d{2}-\d{2}$", t) else ""


def a_hora(valor):
    if isinstance(valor, (dt.time, dt.datetime)):
        return f"{valor.hour:02d}:{valor.minute:02d}"
    if isinstance(valor, float) and 0 <= valor < 1:  # fracción de día de Excel
        minutos = round(valor * 24 * 60)
        return f"{minutos // 60:02d}:{minutos % 60:02d}"
    m = re.match(r"^(\d{1,2}):(\d{2})", texto(valor))
    return f"{int(m[1]):02d}:{m[2]}" if m else ""


def leer_reservas(libro, ids, hoy, avisos):
    if "Reservas" not in libro.sheetnames:
        return None  # la página dice "reservas no conectadas"
    hoja = libro["Reservas"]
    fila_enc, idx = leer_tabla(hoja, list(RESERVAS_COLUMNAS.values())[:4])
    if not fila_enc:
        avisos.append("La hoja Reservas no tiene los encabezados: " + ", ".join(RESERVAS_COLUMNAS.values()))
        return []
    col_estado = idx.get("Estado")
    reservas = []
    for n, fila in enumerate(hoja.iter_rows(min_row=fila_enc + 1, values_only=True), start=fila_enc + 1):
        def campo(k):
            v = RESERVAS_COLUMNAS[k]
            return fila[idx[v]] if v in idx and idx[v] < len(fila) else None
        rid = texto(campo("id")).upper()
        if not rid:
            continue
        if col_estado is not None and texto(fila[col_estado]).lower() not in ("", "confirmada"):
            continue
        r = {"id": rid, "fecha": a_fecha(campo("fecha")), "inicio": a_hora(campo("inicio")),
             "fin": a_hora(campo("fin")), "actividad": texto(campo("actividad")), "sala": texto(campo("sala"))}
        if not r["fecha"] or not r["inicio"] or not r["fin"]:
            avisos.append(f"Reservas, fila {n}: falta fecha u hora válida; no se publicó.")
            continue
        if rid not in ids:
            avisos.append(f"Reservas, fila {n}: {rid} no existe en Inventario.")
        if r["fecha"] < hoy:
            continue  # ya pasó
        reservas.append(r)
    return sorted(reservas, key=lambda r: (r["fecha"], r["inicio"]))


def generar_qr(datos, url_sitio, carpeta):
    try:
        import qrcode
        import qrcode.image.svg
    except ImportError:
        sys.exit('Falta la librería "qrcode". Instálala con:  pip install "qrcode[pil]"')
    carpeta.mkdir(parents=True, exist_ok=True)
    ids = [a["id"] for a in datos["articulos"] if a["qr"]] + [c["id"] for c in datos["cajas"]]
    for viejo in carpeta.glob("*.svg"):
        if viejo.stem not in ids:
            viejo.unlink()
    for i in ids:
        # Nivel Q (25 %): aguanta rayones. Borde de 2 módulos: la etiqueta deja margen blanco alrededor.
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, box_size=10, border=2)
        qr.add_data(f"{url_sitio}equipo/?id={i}")
        qr.make(fit=True)
        qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(carpeta / f"{i}.svg")
    return len(ids)


def convertir(ruta_excel, hoy=None):
    hoy = hoy or dt.date.today().isoformat()
    avisos = []
    libro = openpyxl.load_workbook(ruta_excel, data_only=True, read_only=False)
    articulos = leer_inventario(libro, avisos)
    cajas = leer_cajas(libro, articulos, avisos)
    reservas = leer_reservas(libro, {a["id"] for a in articulos} | {c["id"] for c in cajas}, hoy, avisos)
    datos = {
        "generado": dt.datetime.now().strftime("%Y-%m-%dT%H:%M"),
        "articulos": articulos,
        "cajas": cajas,
        "reservas": reservas,  # null = no hay hoja Reservas
    }
    return datos, avisos


def main():
    p = argparse.ArgumentParser(description="Convierte el Excel del inventario en datos/inventario.json y los QR.")
    p.add_argument("excel", type=Path)
    p.add_argument("--salida", type=Path, default=RAIZ / "datos" / "inventario.json")
    p.add_argument("--qr", type=Path, default=RAIZ / "qr" / "equipos", help="Carpeta de los QR")
    p.add_argument("--url-sitio", default=URL_SITIO)
    p.add_argument("--sin-qr", action="store_true", help="No regenerar los QR")
    a = p.parse_args()

    url = a.url_sitio if a.url_sitio.endswith("/") else a.url_sitio + "/"
    datos, avisos = convertir(a.excel)
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    a.salida.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    n = len(datos["articulos"])
    con_qr = sum(1 for x in datos["articulos"] if x["qr"])
    print(f"Artículos: {n} · con QR propio: {con_qr} · cajas: {len(datos['cajas'])} · "
          f"reservas: {'sin hoja Reservas' if datos['reservas'] is None else len(datos['reservas'])}")
    if not a.sin_qr:
        print(f"QR generados: {generar_qr(datos, url, a.qr)} en {a.qr}")
    if avisos:
        print(f"\nAvisos ({len(avisos)}):")
        for x in avisos:
            print("  - " + x)


if __name__ == "__main__":
    main()
