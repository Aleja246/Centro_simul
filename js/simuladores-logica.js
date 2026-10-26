// Bitácora de simuladores: funciones PURAS.
// No tocan el DOM, ni Firebase, ni Microsoft, ni leen el reloj: "ahora" (milisegundos) se recibe como parámetro.
// Así se pueden probar con node --test sin depender del día ni de internet.
//
// El catálogo de equipos (ID, nombre, cuarto, caja…) viene del Excel del inventario.
// Lo que cambia minuto a minuto (quién lo tiene, dónde se dejó, si necesita revisión) vive en la bitácora.

export const TIPOS_MOVIMIENTO = {
  salida: "Salida",
  regreso: "Regreso",
  reubicacion: "Cambio de lugar",
  verificacion: "Verificación",
  revision: "Revisión resuelta",
};

export const LIMITES = {
  zona: 60,
  responsable: 100,
  destino: 120,
  nota: 300,
  material: 120,
};

const MS_MIN = 60000;
const MS_HORA = 60 * MS_MIN;

const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------- Tarjetas NFC ----------

// Deja solo letras y números en mayúsculas: "04:a2:b1:9c" → "04A2B19C", "EQ-347" → "EQ347".
export function normalizarTarjeta(texto) {
  return String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Saca el ID de un enlace grabado en la tarjeta o en el QR:
// ".../simuladores/#EQ-347" → "EQ-347" · ".../equipo/?id=EQ-347" → "EQ-347" · "eq-347" → "EQ-347".
export function codigoDeLectura(texto) {
  let t = String(texto ?? "").trim();
  const conId = /[?&]id=([^&#]+)/i.exec(t);
  if (conId) t = conId[1];
  else if (t.includes("#")) t = t.slice(t.lastIndexOf("#") + 1);
  try { t = decodeURIComponent(t); } catch { /* se queda como venía */ }
  return t.trim().toUpperCase();
}

// Decide qué es una lectura. `serie`: número de serie de la tarjeta (o lo que escribió el lector USB).
// `textos`: textos o enlaces grabados en la tarjeta.
// Regresa { tipo: "simulador" | "zona" | "desconocida", item, tarjeta }.
export function interpretarLectura({ serie = "", textos = [] } = {}, sims = [], zonas = []) {
  for (const t of textos) {
    const cod = normalizarTarjeta(codigoDeLectura(t));
    if (!cod) continue;
    const sim = sims.find((s) => normalizarTarjeta(s.id) === cod);
    if (sim) return { tipo: "simulador", item: sim, tarjeta: normalizarTarjeta(serie) };
  }
  const candidatos = [serie, ...textos].map(normalizarTarjeta).filter(Boolean);
  for (const c of candidatos) {
    const sim = sims.find((s) => s.tarjeta && normalizarTarjeta(s.tarjeta) === c);
    if (sim) return { tipo: "simulador", item: sim, tarjeta: c };
    const zona = zonas.find((z) => z.tarjeta && normalizarTarjeta(z.tarjeta) === c);
    if (zona) return { tipo: "zona", item: zona, tarjeta: c };
    const porId = sims.find((s) => normalizarTarjeta(s.id) === c);
    if (porId) return { tipo: "simulador", item: porId, tarjeta: c };
  }
  return { tipo: "desconocida", item: null, tarjeta: candidatos[0] || "" };
}

// Enlace que se graba en la tarjeta. `base` es la dirección del sitio (con o sin "/" final).
export function urlTarjeta(base, id) {
  const b = String(base ?? "").trim().replace(/\/+$/, "");
  return `${b}/simuladores/#${encodeURIComponent(String(id ?? "").trim())}`;
}

// ---------- Catálogo (Excel) + estado (bitácora) ----------

// ¿Va en el plano? Por tipo (si el Excel tiene "Tipo (para QR)") o por cómo empieza la categoría.
export function vaEnPlano(item, reglas = {}) {
  const tipos = (reglas.tipos || []).map(plano);
  const prefijos = (reglas.categoriasQueEmpiezanCon || []).map(plano);
  if (item.tipo) return tipos.includes(plano(item.tipo));
  const cat = plano(item.categoria);
  return prefijos.some((p) => p && cat.startsWith(p));
}

// Junta cada artículo del catálogo con su estado en la bitácora.
// El cuarto que manda es el más reciente: el de la bitácora si se movió después de leer el Excel,
// o el del Excel si se leyó después (por ejemplo, alguien lo cambió a mano).
export function unirCatalogo(catalogo = [], estados = [], catalogoLeido = 0) {
  const porId = new Map(estados.map((e) => [e.id, e]));
  const items = catalogo.map((c) => {
    const e = porId.get(c.id) || {};
    porId.delete(c.id);
    const usarBitacora = e.zonaId !== undefined && (!catalogoLeido || (e.actualizado || 0) > catalogoLeido);
    return {
      ...c, ...e,
      id: c.id, nombre: c.nombre || e.nombre || c.id,
      zonaId: usarBitacora ? e.zonaId : c.cuarto || null,
      estado: e.estado || "disponible",
      enCatalogo: true,
    };
  });
  // Equipos que ya no están en el Excel pero siguen prestados: se muestran para poder regresarlos.
  for (const e of porId.values()) {
    if (e.estado === "en_uso") items.push({ ...e, nombre: e.nombre || e.id, enCatalogo: false });
  }
  return items;
}

// Zonas = los cuartos del inventario más los que se agregaron en Ajustes.
// `guardadas`: [{ id: cuarto tal cual en el Excel, nombre, color, tamano, orden, tarjeta }].
export function zonasDeCuartos(items = [], guardadas = []) {
  const porId = new Map(guardadas.map((z) => [z.id, z]));
  const cuartos = new Set([...guardadas.map((z) => z.id), ...items.map((s) => s.zonaId).filter(Boolean)]);
  const sinOrden = [...cuartos].filter((c) => !porId.has(c) || !Number.isFinite(porId.get(c).orden)).sort((a, b) => a.localeCompare(b, "es"));
  return [...cuartos].map((id) => {
    const g = porId.get(id) || {};
    const orden = Number.isFinite(g.orden) ? g.orden : 1000 + sinOrden.indexOf(id);
    return { id, nombre: g.nombre || id, color: Number.isInteger(g.color) ? g.color : null, tamano: g.tamano || "m", orden, tarjeta: g.tarjeta || null, guardada: porId.has(id) };
  }).sort((a, b) => a.orden - b.orden);
}

export function ordenarZonas(zonas = []) {
  return zonas.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre).localeCompare(String(b.nombre), "es"));
}

// Nuevo orden de las zonas al subir (-1) o bajar (+1) una. Regresa todas con su orden: [{ id, orden }].
export function moverZona(zonas = [], id, dir) {
  const lista = ordenarZonas(zonas);
  const i = lista.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return [];
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista.map((z, k) => ({ id: z.id, orden: k + 1, antes: z.orden })).filter((z) => z.orden !== z.antes).map(({ id, orden }) => ({ id, orden }));
}

// ---------- Validaciones ----------

const vacio = (v) => String(v ?? "").trim() === "";
const largo = (v) => String(v ?? "").trim().length;

// Tarjeta ya usada por otro equipo o zona (sin contar `idPropio`).
export function duenoTarjeta(tarjeta, sims = [], zonas = [], idPropio = null) {
  const t = normalizarTarjeta(tarjeta);
  if (!t) return null;
  const s = sims.find((x) => x.id !== idPropio && x.tarjeta && normalizarTarjeta(x.tarjeta) === t);
  if (s) return `el equipo ${s.nombre} (${s.id})`;
  const z = zonas.find((x) => x.id !== idPropio && x.tarjeta && normalizarTarjeta(x.tarjeta) === t);
  if (z) return `la zona ${z.nombre}`;
  return null;
}

export function validarTarjeta(tarjeta, sims = [], zonas = [], idPropio = null) {
  const errores = {};
  if (!normalizarTarjeta(tarjeta)) errores.tarjeta = "Lee la tarjeta o escribe su número.";
  else {
    const d = duenoTarjeta(tarjeta, sims, zonas, idPropio);
    if (d) errores.tarjeta = `Esa tarjeta ya es de ${d}.`;
  }
  return { ok: Object.keys(errores).length === 0, errores };
}

// Zona nueva: `id` es el texto que se escribirá en la columna de cuarto del Excel.
export function validarZona(d = {}, zonas = [], idActual = null) {
  const errores = {};
  const nombre = String(d.nombre ?? "").trim();
  if (!nombre) errores.nombre = "Escribe el nombre del cuarto.";
  else if (nombre.length > LIMITES.zona) errores.nombre = `Máximo ${LIMITES.zona} caracteres.`;
  else if (zonas.some((z) => z.id !== idActual && (plano(z.nombre) === plano(nombre) || plano(z.id) === plano(nombre)))) errores.nombre = "Ya hay un cuarto con ese nombre.";
  return { ok: Object.keys(errores).length === 0, errores };
}

export function validarSalida(d = {}, sim) {
  const errores = {};
  if (!sim) errores.general = "Ese equipo ya no existe.";
  else if (sim.estado === "en_uso") errores.general = `Este equipo ya está fuera${sim.responsable ? " (lo tiene " + sim.responsable + ")" : ""}.`;
  if (vacio(d.responsable)) errores.responsable = "Escribe quién se lleva el equipo.";
  else if (largo(d.responsable) > LIMITES.responsable) errores.responsable = `Máximo ${LIMITES.responsable} caracteres.`;
  if (largo(d.destino) > LIMITES.destino) errores.destino = `Máximo ${LIMITES.destino} caracteres.`;
  return { ok: Object.keys(errores).length === 0, errores };
}

export function validarRegreso(d = {}, sim, zonas = []) {
  const errores = {};
  if (!sim) errores.general = "Ese equipo ya no existe.";
  else if (sim.estado !== "en_uso") errores.general = "Este equipo ya estaba registrado como disponible.";
  if (zonas.length && !d.zonaId) errores.zonaId = "Elige el cuarto donde lo dejas.";
  else if (d.zonaId && !zonas.some((z) => z.id === d.zonaId)) errores.zonaId = "Ese cuarto ya no existe. Elige otro.";
  if (d.revision && largo(d.nota) > LIMITES.nota) errores.nota = `Máximo ${LIMITES.nota} caracteres.`;
  return { ok: Object.keys(errores).length === 0, errores };
}

// Verificación: `opciones` trae las listas válidas (de js/config.js).
export function validarVerificacion(d = {}, opciones = {}) {
  const errores = {};
  const dentro = (campo, lista) => {
    if (vacio(d[campo])) errores[campo] = "Elige una opción.";
    else if (lista && lista.length && !lista.includes(d[campo])) errores[campo] = "Esa opción no es válida.";
  };
  dentro("estadoGeneral", opciones.estadoGeneral);
  if (opciones.conHojaVerificacion) {
    dentro("estadoFisico", opciones.estadoFisico);
    dentro("funciona", opciones.funciona);
    dentro("resultado", opciones.resultado);
  }
  const piezas = String(d.piezasDanadas ?? "").trim();
  if (piezas && !/^\d{1,3}$/.test(piezas)) errores.piezasDanadas = "Escribe un número entero (0 o más).";
  (d.material || []).forEach((m, i) => { if (largo(m) > LIMITES.material) errores[`material${i}`] = `Máximo ${LIMITES.material} caracteres.`; });
  if (largo(d.ajustes) > LIMITES.nota) errores.ajustes = `Máximo ${LIMITES.nota} caracteres.`;
  if (largo(d.comentarios) > LIMITES.nota) errores.comentarios = `Máximo ${LIMITES.nota} caracteres.`;
  return { ok: Object.keys(errores).length === 0, errores };
}

// Valores sugeridos para la hoja de Verificación según el Estado general elegido.
export function sugerenciaVerificacion(estadoGeneral, sugerencias = {}) {
  return sugerencias[estadoGeneral] || {};
}

// ---------- Cambios que se guardan (sin escribir nada) ----------
// Cada función regresa { simulador: cambios para su estado, movimiento: registro nuevo }.
// El movimiento lleva excel: { estado: "pendiente" } hasta que se escribe en el Excel.

const quien = (u) => (u && (u.nombre || u.correo || u.uid)) || null;
const nombreZona = (zonas, id) => (zonas.find((z) => z.id === id) || {}).nombre || id || null;
const base = (sim, ahora, usuario, tipo) => ({
  t: ahora, tipo, simId: sim.id, sim: sim.nombre, codigo: sim.id, por: quien(usuario), excel: { estado: "pendiente" },
});

export function datosSalida(sim, d, zonas, ahora, usuario) {
  const responsable = String(d.responsable).trim();
  const destino = String(d.destino ?? "").trim() || null;
  return {
    simulador: { estado: "en_uso", nombre: sim.nombre, responsable, destino, desde: ahora, zonaId: sim.zonaId || null, actualizado: ahora, actualizadoPor: quien(usuario) },
    movimiento: { ...base(sim, ahora, usuario, "salida"), cuarto: sim.zonaId || null, zona: nombreZona(zonas, sim.zonaId), responsable, destino },
  };
}

export function datosRegreso(sim, d, zonas, ahora, usuario) {
  const zonaId = d.zonaId || null;
  const nota = d.revision ? (String(d.nota ?? "").trim() || "Sin detalles") : null;
  const simulador = { estado: "disponible", nombre: sim.nombre, zonaId, responsable: null, destino: null, desde: null, actualizado: ahora, actualizadoPor: quien(usuario) };
  if (d.revision) simulador.revision = nota;
  return {
    simulador,
    movimiento: {
      ...base(sim, ahora, usuario, "regreso"), cuarto: zonaId, zona: nombreZona(zonas, zonaId),
      responsable: sim.responsable || null, destino: sim.destino || null,
      duracion: Number.isFinite(sim.desde) ? Math.max(0, ahora - sim.desde) : null, nota,
    },
  };
}

export function datosCambioLugar(sim, zonaId, zonas, ahora, usuario) {
  return {
    simulador: { nombre: sim.nombre, zonaId: zonaId || null, actualizado: ahora, actualizadoPor: quien(usuario) },
    movimiento: { ...base(sim, ahora, usuario, "reubicacion"), cuarto: zonaId || null, zona: nombreZona(zonas, zonaId), de: nombreZona(zonas, sim.zonaId) },
  };
}

export function datosRevisionResuelta(sim, ahora, usuario) {
  return {
    simulador: { nombre: sim.nombre, revision: null, actualizado: ahora, actualizadoPor: quien(usuario) },
    movimiento: { ...base(sim, ahora, usuario, "revision"), nota: sim.revision || null },
  };
}

export function datosVerificacion(sim, d, zonas, ahora, usuario) {
  const t = (v) => String(v ?? "").trim();
  const verificacion = {
    estadoGeneral: t(d.estadoGeneral),
    piezasDanadas: t(d.piezasDanadas) === "" ? null : Number(t(d.piezasDanadas)),
    material: (d.material || []).map(t),
    estadoFisico: t(d.estadoFisico) || null,
    funciona: t(d.funciona) || null,
    ajustes: t(d.ajustes) || null,
    resultado: t(d.resultado) || null,
    comentarios: t(d.comentarios) || null,
  };
  const resumenTexto = [verificacion.estadoGeneral, verificacion.resultado, verificacion.comentarios].filter(Boolean).join(" · ");
  return {
    simulador: { nombre: sim.nombre, estadoGeneral: verificacion.estadoGeneral, ultimaVerificacion: { t: ahora, resultado: verificacion.resultado, estadoGeneral: verificacion.estadoGeneral }, actualizado: ahora, actualizadoPor: quien(usuario) },
    movimiento: { ...base(sim, ahora, usuario, "verificacion"), cuarto: sim.zonaId || null, zona: nombreZona(zonas, sim.zonaId), verificacion, nota: resumenTexto || null },
  };
}

// ---------- Estado del centro ----------

export const estaFuera = (s) => s.estado === "en_uso";

export function enAlerta(sim, ahora, horasAlerta) {
  return estaFuera(sim) && Number.isFinite(sim.desde) && ahora - sim.desde > horasAlerta * MS_HORA;
}

export function resumen(sims = [], ahora, horasAlerta) {
  const fuera = sims.filter(estaFuera);
  return {
    total: sims.length,
    disponibles: sims.length - fuera.length,
    enUso: fuera.length,
    alerta: fuera.filter((s) => enAlerta(s, ahora, horasAlerta)).length,
    revision: sims.filter((s) => s.revision).length,
  };
}

// Reparte los equipos disponibles por zona; los que están fuera van aparte (el que lleva más tiempo, primero).
export function repartirPorZona(sims = [], zonas = []) {
  const porZona = new Map(ordenarZonas(zonas).map((z) => [z.id, []]));
  const sinUbicar = [];
  const fuera = [];
  for (const s of sims) {
    if (estaFuera(s)) fuera.push(s);
    else if (porZona.has(s.zonaId)) porZona.get(s.zonaId).push(s);
    else sinUbicar.push(s);
  }
  fuera.sort((a, b) => (a.desde ?? 0) - (b.desde ?? 0));
  for (const l of porZona.values()) l.sort((a, b) => String(a.id).localeCompare(String(b.id), "es", { numeric: true }));
  return { porZona, sinUbicar, fuera };
}

export function coincide(sim, texto) {
  const q = plano(texto).trim();
  if (!q) return true;
  return [sim.nombre, sim.id, sim.categoria, sim.marca, sim.caja, sim.responsable].some((v) => plano(v).includes(q));
}

export function duracionTexto(ms) {
  const m = Math.max(0, Math.round((ms || 0) / MS_MIN));
  if (m < 1) return "menos de 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return `${h} h${mm ? ` ${mm} min` : ""}`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d} ${d === 1 ? "día" : "días"}${hh ? ` ${hh} h` : ""}`;
}

// ---------- Historial ----------

const dos = (n) => String(n).padStart(2, "0");

// "AAAA-MM-DD" del día local en que ocurrió.
export function claveDia(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function horaTexto(ms) {
  const d = new Date(ms);
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function filtrarMovimientos(movs = [], { tipo = "todos", texto = "" } = {}) {
  const q = plano(texto).trim();
  return movs
    .filter((m) => tipo === "todos" || m.tipo === tipo)
    .filter((m) => !q || [m.sim, m.codigo, m.responsable, m.zona, m.destino, m.por, m.nota].some((v) => plano(v).includes(q)))
    .sort((a, b) => b.t - a.t);
}

export function agruparPorDia(movs = []) {
  const grupos = [];
  for (const m of movs.slice().sort((a, b) => b.t - a.t)) {
    const dia = claveDia(m.t);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.movimientos.push(m);
    else grupos.push({ dia, movimientos: [m] });
  }
  return grupos;
}

// Movimientos que todavía no se escriben en el Excel (o que fallaron).
export const pendientesExcel = (movs = []) => movs.filter((m) => m.excel && m.excel.estado !== "ok").sort((a, b) => a.t - b.t);

// Frase corta para la lista del historial (texto plano).
export function describirMovimiento(m) {
  const zona = m.zona || "Sin ubicar";
  switch (m.tipo) {
    case "salida":
      return [`Se lo llevó ${m.responsable || "—"}`, m.destino, m.zona && `salió de ${m.zona}`].filter(Boolean).join(" · ");
    case "regreso":
      return [`Regresó a ${zona}`, m.responsable && `lo tenía ${m.responsable}`, Number.isFinite(m.duracion) && `${duracionTexto(m.duracion)} fuera`, m.nota && `revisión: ${m.nota}`].filter(Boolean).join(" · ");
    case "reubicacion":
      return `Se movió${m.de ? ` de ${m.de}` : ""} a ${zona}`;
    case "verificacion": {
      const v = m.verificacion || {};
      const falta = (v.material || []).filter(Boolean);
      return [v.estadoGeneral, v.resultado && `resultado: ${v.resultado}`, Number.isFinite(v.piezasDanadas) && v.piezasDanadas > 0 && `${v.piezasDanadas} piezas dañadas`, falta.length && `falta: ${falta.join(", ")}`, v.comentarios].filter(Boolean).join(" · ");
    }
    case "revision":
      return `Falla resuelta${m.nota ? `: ${m.nota}` : ""}`;
    default:
      return "";
  }
}

// CSV para Excel: con BOM, separado por comas y con saltos \r\n. Del más antiguo al más reciente.
export function csvMovimientos(movs = []) {
  const filas = [["Fecha", "Hora", "Movimiento", "ID equipo", "Equipo", "Responsable", "Destino", "Cuarto", "Tiempo fuera (min)", "Detalle", "Registró", "En Excel"]];
  for (const m of movs.slice().sort((a, b) => a.t - b.t)) {
    filas.push([
      claveDia(m.t), horaTexto(m.t), TIPOS_MOVIMIENTO[m.tipo] || m.tipo, m.codigo, m.sim,
      m.responsable, m.destino, m.cuarto || m.zona, Number.isFinite(m.duracion) ? Math.round(m.duracion / MS_MIN) : "",
      m.tipo === "verificacion" ? describirMovimiento(m) : m.nota, m.por,
      m.excel ? (m.excel.estado === "ok" ? "Sí" : m.excel.estado === "error" ? "Error" : "Pendiente") : "",
    ]);
  }
  const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
}
