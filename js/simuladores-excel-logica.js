// Excel del inventario: funciones PURAS para leer y escribir hojas como las del CSC.
// Trabajan sobre la matriz de valores de una hoja (lo que regresa Microsoft Graph en usedRange)
// y su dirección ("'1Inventario'!A1:T498"). No llaman a internet: eso lo hace simuladores-excel.js.
//
// Las columnas se buscan por su encabezado, no por letra, y sin importar acentos ni mayúsculas.
// Así la página sigue funcionando si alguien mueve o agrega columnas en el Excel.

import { TIPOS_MOVIMIENTO } from "./simuladores-logica.js";

const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function normalizarEncabezado(s) {
  return plano(s).replace(/\s+/g, " ").replace(/\s*:$/, "").trim();
}

export function textoCelda(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  return String(v).replace(/\s+/g, " ").trim();
}

// ---------- Hojas ----------

// "1Inventario" coincide con "Inventario" (se ignoran números al inicio, acentos y mayúsculas).
const sinNumero = (s) => normalizarEncabezado(s).replace(/^[\d\s._-]+/, "");
export function elegirHoja(nombres = [], buscada) {
  const b = sinNumero(buscada);
  if (!b) return null;
  return nombres.find((n) => n === buscada)
    || nombres.find((n) => sinNumero(n) === b)
    || nombres.find((n) => sinNumero(n).includes(b) || b.includes(sinNumero(n)))
    || null;
}

// ---------- Direcciones ----------

export function letraColumna(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function indiceDeLetras(letras) {
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// "'1Inventario'!B3:T498" → { col: 1, fila: 3 } (columna desde 0, fila como en Excel).
export function parsearDireccion(direccion) {
  const parte = String(direccion ?? "").split("!").pop();
  const m = /^\$?([A-Z]+)\$?(\d+)/i.exec(parte);
  if (!m) return { col: 0, fila: 1 };
  return { col: indiceDeLetras(m[1]), fila: Number(m[2]) };
}

// Dirección de la celda en la fila `filaIdx` y columna `colIdx` de la matriz (ambas desde 0).
export function celda(origen, filaIdx, colIdx) {
  return `${letraColumna(origen.col + colIdx)}${origen.fila + filaIdx}`;
}

// ---------- Encabezados y filas ----------

// Busca la fila de encabezados: la primera (dentro de las primeras `maxFilas`) que tenga todos los `requeridos`.
// Regresa { fila, columnas: Map(nombre normalizado → [índices]) } o null.
export function buscarEncabezados(valores = [], requeridos = [], maxFilas = 40) {
  const req = requeridos.map(normalizarEncabezado);
  for (let f = 0; f < Math.min(valores.length, maxFilas); f++) {
    const fila = (valores[f] || []).map(normalizarEncabezado);
    if (req.every((r) => fila.includes(r))) {
      const columnas = new Map();
      fila.forEach((n, i) => { if (n) columnas.set(n, [...(columnas.get(n) || []), i]); });
      return { fila: f, columnas };
    }
  }
  return null;
}

// Índice de la columna `nombre` (o -1). Si se repite, `n` elige cuál (0 = la primera).
export function columna(enc, nombre, n = 0) {
  const l = enc && enc.columnas.get(normalizarEncabezado(nombre));
  return l && l[n] !== undefined ? l[n] : -1;
}
export const columnas = (enc, nombre) => (enc && enc.columnas.get(normalizarEncabezado(nombre))) || [];

// Fila (índice en la matriz) donde la columna `colId` tiene el ID buscado, o -1.
export function buscarFila(valores = [], enc, colId, id) {
  const buscado = textoCelda(id).toUpperCase();
  if (!enc || colId < 0 || !buscado) return -1;
  for (let f = enc.fila + 1; f < valores.length; f++) {
    if (textoCelda((valores[f] || [])[colId]).toUpperCase() === buscado) return f;
  }
  return -1;
}

// Catálogo a partir de la hoja de inventario. Se saltan filas sin ID o sin nombre
// (títulos de sección e IDs reservados todavía sin artículo).
export function catalogoDesdeValores(valores = [], direccion, cols = {}) {
  const enc = buscarEncabezados(valores, [cols.id, cols.nombre]);
  if (!enc) return { ok: false, faltan: [cols.id, cols.nombre], items: [] };
  const origen = parsearDireccion(direccion);
  const c = (k) => (cols[k] ? columna(enc, cols[k]) : -1);
  const idx = { id: c("id"), nombre: c("nombre"), categoria: c("categoria"), marca: c("marca"), cuarto: c("cuarto"), caja: c("caja"), estadoGeneral: c("estadoGeneral"), tipo: c("tipo"), notas: c("notas") };
  const val = (fila, k) => (idx[k] >= 0 ? textoCelda(fila[idx[k]]) : "");
  const vistos = new Set();
  const items = [];
  const repetidos = [];
  for (let f = enc.fila + 1; f < valores.length; f++) {
    const fila = valores[f] || [];
    const id = val(fila, "id").toUpperCase();
    const nombre = val(fila, "nombre");
    if (!id || !nombre) continue;
    if (vistos.has(id)) { repetidos.push(id); continue; }
    vistos.add(id);
    items.push({
      id, nombre, categoria: val(fila, "categoria"), marca: val(fila, "marca"), cuarto: val(fila, "cuarto"),
      caja: val(fila, "caja"), estadoGeneral: val(fila, "estadoGeneral"), tipo: val(fila, "tipo"), notas: val(fila, "notas"),
      fila: origen.fila + f,
    });
  }
  return { ok: true, items, repetidos };
}

// ---------- Fechas para Excel ----------

// Número de serie de Excel del día local (sin hora) y fracción del día para la hora.
export function serialFecha(ms) {
  const d = new Date(ms);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 864e5);
}
export function serialHora(ms) {
  const d = new Date(ms);
  return Math.round(((d.getHours() * 60 + d.getMinutes()) / 1440) * 1e6) / 1e6;
}
const fechaCorta = (ms) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };

// ---------- Bitácora de movimientos ----------

export const ORDEN_BITACORA = ["fecha", "hora", "id", "equipo", "movimiento", "responsable", "destino", "cuarto", "minutos", "notas", "registro", "folio"];

export function encabezadosBitacora(cols = {}) {
  return ORDEN_BITACORA.map((k) => cols[k]).filter(Boolean);
}

function notaDeMovimiento(m) {
  if (m.tipo !== "verificacion") return m.nota || "";
  const v = m.verificacion || {};
  const falta = (v.material || []).filter(Boolean);
  return [
    v.estadoGeneral && `Estado: ${v.estadoGeneral}`,
    v.resultado && `Resultado: ${v.resultado}`,
    Number.isFinite(v.piezasDanadas) && `Piezas dañadas: ${v.piezasDanadas}`,
    falta.length && `Falta: ${falta.join(", ")}`,
    v.ajustes && `Ajustes: ${v.ajustes}`,
    v.comentarios,
  ].filter(Boolean).join(" · ");
}

// Fila para la bitácora, alineada con sus encabezados. Cada celda: { v, f } (valor y formato o null).
export function filaBitacora(m, encabezados = [], cols = {}, formatos = {}) {
  const valores = {
    fecha: { v: serialFecha(m.t), f: formatos.fecha || "m/d/yyyy" },
    hora: { v: serialHora(m.t), f: formatos.hora || "hh:mm" },
    id: { v: m.codigo || "" },
    equipo: { v: m.sim || "" },
    movimiento: { v: TIPOS_MOVIMIENTO[m.tipo] || m.tipo || "" },
    responsable: { v: m.responsable || "" },
    destino: { v: m.destino || "" },
    cuarto: { v: m.cuarto || m.zona || "" },
    minutos: { v: Number.isFinite(m.duracion) ? Math.round(m.duracion / 60000) : "" },
    notas: { v: notaDeMovimiento(m) },
    registro: { v: m.por || "" },
    folio: { v: m.id || "" },
  };
  const porEncabezado = new Map(Object.entries(cols).filter(([, h]) => h).map(([k, h]) => [normalizarEncabezado(h), k]));
  return encabezados.map((h) => {
    const k = porEncabezado.get(normalizarEncabezado(h));
    return k && valores[k] ? { v: valores[k].v, f: valores[k].f || null } : { v: "", f: null };
  });
}

// ---------- Inventario ----------

// Celdas que cambian en la fila del equipo. Regresa [{ col, valor, formato }] (col = índice en la matriz).
export function cambiosInventario(m, fila = [], enc, cols = {}, formatos = {}) {
  const cambios = [];
  const poner = (clave, valor, formato = null, n = 0) => {
    const c = cols[clave] ? columna(enc, cols[clave], n) : -1;
    if (c >= 0) cambios.push({ col: c, valor, formato });
  };
  if ((m.tipo === "regreso" || m.tipo === "reubicacion") && m.cuarto) poner("cuarto", m.cuarto);
  if (m.tipo === "verificacion") {
    const v = m.verificacion || {};
    if (v.estadoGeneral) poner("estadoGeneral", v.estadoGeneral);
    if (Number.isFinite(v.piezasDanadas)) poner("piezasDanadas", v.piezasDanadas);
    const material = cols.materialQueFalta ? columnas(enc, cols.materialQueFalta) : [];
    material.forEach((c, i) => cambios.push({ col: c, valor: (v.material || [])[i] || "", formato: null }));
    poner("revisadoPor", m.por || "");
    poner("fechaRevision", serialFecha(m.t), formatos.fecha || "m/d/yyyy");
    if (v.comentarios) {
      const c = cols.notas ? columna(enc, cols.notas) : -1;
      if (c >= 0) {
        const antes = textoCelda(fila[c]);
        const nuevo = `${fechaCorta(m.t)}: ${v.comentarios}`;
        cambios.push({ col: c, valor: antes ? `${antes} | ${nuevo}` : nuevo, formato: null });
      }
    }
  }
  return cambios;
}

// Valores actuales de la fila del equipo (para llenar el formulario de verificación).
export function valoresInventario(fila = [], enc, cols = {}) {
  const v = (k) => { const c = cols[k] ? columna(enc, cols[k]) : -1; return c >= 0 ? textoCelda(fila[c]) : ""; };
  return {
    estadoGeneral: v("estadoGeneral"),
    piezasDanadas: v("piezasDanadas"),
    material: (cols.materialQueFalta ? columnas(enc, cols.materialQueFalta) : []).map((c) => textoCelda(fila[c])),
    notas: v("notas"),
    revisadoPor: v("revisadoPor"),
  };
}

// ---------- Hoja de Verificación ----------

export function cambiosVerificacion(m, enc, cols = {}) {
  const v = m.verificacion || {};
  const cambios = [];
  for (const k of ["estadoFisico", "funciona", "ajustes", "resultado", "comentarios"]) {
    const c = cols[k] ? columna(enc, cols[k]) : -1;
    if (c >= 0 && v[k] !== undefined && v[k] !== null) cambios.push({ col: c, valor: v[k], formato: null });
  }
  return cambios;
}

// Encabezado del formato ("Fecha:", "Realizó:", "Hora:"): el valor va en la celda de la derecha de cada etiqueta.
// Regresa [{ fila, col, valor, formato }] con índices de la matriz.
export function cambiosEncabezado(valores = [], etiquetas = {}, m, formatos = {}, maxFilas = 10) {
  const datos = {
    fecha: { valor: serialFecha(m.t), formato: formatos.fecha || "m/d/yyyy" },
    hora: { valor: serialHora(m.t), formato: formatos.hora || "hh:mm" },
    realizo: { valor: m.por || "", formato: null },
  };
  const cambios = [];
  for (const [k, etiqueta] of Object.entries(etiquetas)) {
    if (!etiqueta || !datos[k]) continue;
    const buscada = normalizarEncabezado(etiqueta);
    for (let f = 0; f < Math.min(valores.length, maxFilas); f++) {
      const c = (valores[f] || []).findIndex((x) => normalizarEncabezado(x) === buscada);
      if (c >= 0) { cambios.push({ fila: f, col: c + 1, ...datos[k] }); break; }
    }
  }
  return cambios;
}
