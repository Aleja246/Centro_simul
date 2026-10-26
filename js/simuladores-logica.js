// Bitácora de simuladores: funciones PURAS.
// No tocan el DOM, ni Firebase, ni leen el reloj: "ahora" (milisegundos) se recibe como parámetro.
// Así se pueden probar con node --test sin depender del día ni de internet.

export const TIPOS_MOVIMIENTO = {
  salida: "Salida",
  regreso: "Regreso",
  reubicacion: "Cambio de lugar",
  revision: "Revisión resuelta",
};

export const LIMITES = {
  nombre: 80,
  codigo: 20,
  categoria: 60,
  zona: 60,
  responsable: 100,
  destino: 120,
  nota: 300,
};

const MS_MIN = 60000;
const MS_HORA = 60 * MS_MIN;

// ---------- Tarjetas NFC ----------

// Deja solo letras y números en mayúsculas: "04:a2:b1:9c" → "04A2B19C", "SIM-004" → "SIM004".
export function normalizarTarjeta(texto) {
  return String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Si la tarjeta trae un enlace (".../simuladores/#SIM-004"), regresa lo que va después del #.
export function codigoDeLectura(texto) {
  let t = String(texto ?? "").trim();
  if (t.includes("#")) t = t.slice(t.lastIndexOf("#") + 1);
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
    const sim = sims.find((s) => normalizarTarjeta(s.codigo) === cod);
    if (sim) return { tipo: "simulador", item: sim, tarjeta: normalizarTarjeta(serie) };
  }
  const candidatos = [serie, ...textos].map(normalizarTarjeta).filter(Boolean);
  for (const c of candidatos) {
    const sim = sims.find((s) => s.tarjeta && normalizarTarjeta(s.tarjeta) === c);
    if (sim) return { tipo: "simulador", item: sim, tarjeta: c };
    const zona = zonas.find((z) => z.tarjeta && normalizarTarjeta(z.tarjeta) === c);
    if (zona) return { tipo: "zona", item: zona, tarjeta: c };
    const porCodigo = sims.find((s) => normalizarTarjeta(s.codigo) === c);
    if (porCodigo) return { tipo: "simulador", item: porCodigo, tarjeta: c };
  }
  return { tipo: "desconocida", item: null, tarjeta: candidatos[0] || "" };
}

// Enlace que se graba en la tarjeta. `base` es la dirección del sitio (con o sin "/" final).
export function urlTarjeta(base, codigo) {
  const b = String(base ?? "").trim().replace(/\/+$/, "");
  return `${b}/simuladores/#${encodeURIComponent(String(codigo ?? "").trim())}`;
}

// ---------- Validaciones ----------

const vacio = (v) => String(v ?? "").trim() === "";
const largo = (v) => String(v ?? "").trim().length;

export function siguienteCodigo(sims = []) {
  let max = 0;
  for (const s of sims) {
    const m = /^SIM-(\d+)$/i.exec(String(s.codigo ?? "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return "SIM-" + String(max + 1).padStart(3, "0");
}

// Tarjeta ya usada por otro simulador o zona (sin contar `idPropio`).
function duenoTarjeta(tarjeta, sims, zonas, idPropio) {
  const t = normalizarTarjeta(tarjeta);
  if (!t) return null;
  const s = sims.find((x) => x.id !== idPropio && x.tarjeta && normalizarTarjeta(x.tarjeta) === t);
  if (s) return `el simulador ${s.nombre}`;
  const z = zonas.find((x) => x.id !== idPropio && x.tarjeta && normalizarTarjeta(x.tarjeta) === t);
  if (z) return `la zona ${z.nombre}`;
  return null;
}

export function validarSimulador(d = {}, sims = [], zonas = [], idActual = null) {
  const errores = {};
  const codigo = String(d.codigo ?? "").trim().toUpperCase();
  if (vacio(d.nombre)) errores.nombre = "Escribe el nombre del simulador.";
  else if (largo(d.nombre) > LIMITES.nombre) errores.nombre = `Máximo ${LIMITES.nombre} caracteres.`;
  if (!codigo) errores.codigo = "Escribe un código, por ejemplo SIM-001.";
  else if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(codigo)) errores.codigo = "Usa solo letras, números y guiones (de 2 a 20).";
  else if (sims.some((s) => s.id !== idActual && String(s.codigo ?? "").trim().toUpperCase() === codigo)) errores.codigo = `El código ${codigo} ya lo tiene otro simulador.`;
  if (largo(d.categoria) > LIMITES.categoria) errores.categoria = `Máximo ${LIMITES.categoria} caracteres.`;
  if (d.zonaBase && !zonas.some((z) => z.id === d.zonaBase)) errores.zonaBase = "Esa zona ya no existe. Elige otra.";
  const dueno = duenoTarjeta(d.tarjeta, sims, zonas, idActual);
  if (dueno) errores.tarjeta = `Esa tarjeta ya es de ${dueno}.`;
  return { ok: Object.keys(errores).length === 0, errores };
}

export function validarZona(d = {}, zonas = [], sims = [], idActual = null) {
  const errores = {};
  const nombre = String(d.nombre ?? "").trim();
  if (!nombre) errores.nombre = "Escribe el nombre de la zona.";
  else if (nombre.length > LIMITES.zona) errores.nombre = `Máximo ${LIMITES.zona} caracteres.`;
  else if (zonas.some((z) => z.id !== idActual && String(z.nombre).trim().toLowerCase() === nombre.toLowerCase())) errores.nombre = "Ya hay una zona con ese nombre.";
  const dueno = duenoTarjeta(d.tarjeta, sims, zonas, idActual);
  if (dueno) errores.tarjeta = `Esa tarjeta ya es de ${dueno}.`;
  return { ok: Object.keys(errores).length === 0, errores };
}

export function validarSalida(d = {}, sim) {
  const errores = {};
  if (!sim) errores.general = "Ese simulador ya no existe.";
  else if (sim.estado === "en_uso") errores.general = `Este simulador ya está fuera${sim.responsable ? " (lo tiene " + sim.responsable + ")" : ""}.`;
  if (vacio(d.responsable)) errores.responsable = "Escribe quién se lleva el simulador.";
  else if (largo(d.responsable) > LIMITES.responsable) errores.responsable = `Máximo ${LIMITES.responsable} caracteres.`;
  if (largo(d.destino) > LIMITES.destino) errores.destino = `Máximo ${LIMITES.destino} caracteres.`;
  return { ok: Object.keys(errores).length === 0, errores };
}

export function validarRegreso(d = {}, sim, zonas = []) {
  const errores = {};
  if (!sim) errores.general = "Ese simulador ya no existe.";
  else if (sim.estado !== "en_uso") errores.general = "Este simulador ya estaba registrado como disponible.";
  if (zonas.length && !d.zonaId) errores.zonaId = "Elige la zona donde lo dejas.";
  else if (d.zonaId && !zonas.some((z) => z.id === d.zonaId)) errores.zonaId = "Esa zona ya no existe. Elige otra.";
  if (d.revision && largo(d.nota) > LIMITES.nota) errores.nota = `Máximo ${LIMITES.nota} caracteres.`;
  return { ok: Object.keys(errores).length === 0, errores };
}

// ---------- Cambios que se guardan (sin escribir nada) ----------
// Cada función regresa { simulador: cambios para el documento, movimiento: registro nuevo }.

const quien = (u) => (u && (u.correo || u.uid)) || null;
const nombreZona = (zonas, id) => (zonas.find((z) => z.id === id) || {}).nombre || null;

export function datosSalida(sim, d, zonas, ahora, usuario) {
  const responsable = String(d.responsable).trim();
  const destino = String(d.destino ?? "").trim() || null;
  return {
    simulador: { estado: "en_uso", responsable, destino, desde: ahora, actualizado: ahora, actualizadoPor: quien(usuario) },
    movimiento: {
      t: ahora, tipo: "salida", simId: sim.id, sim: sim.nombre, codigo: sim.codigo,
      zonaId: sim.zonaId || null, zona: nombreZona(zonas, sim.zonaId), responsable, destino, por: quien(usuario),
    },
  };
}

export function datosRegreso(sim, d, zonas, ahora, usuario) {
  const zonaId = d.zonaId || null;
  const nota = d.revision ? (String(d.nota ?? "").trim() || "Sin detalles") : null;
  const simulador = { estado: "disponible", zonaId, responsable: null, destino: null, desde: null, actualizado: ahora, actualizadoPor: quien(usuario) };
  if (d.revision) simulador.revision = nota;
  return {
    simulador,
    movimiento: {
      t: ahora, tipo: "regreso", simId: sim.id, sim: sim.nombre, codigo: sim.codigo,
      zonaId, zona: nombreZona(zonas, zonaId), responsable: sim.responsable || null, destino: sim.destino || null,
      duracion: sim.desde ? Math.max(0, ahora - sim.desde) : null, nota, por: quien(usuario),
    },
  };
}

export function datosCambioLugar(sim, zonaId, zonas, ahora, usuario) {
  return {
    simulador: { zonaId: zonaId || null, actualizado: ahora, actualizadoPor: quien(usuario) },
    movimiento: {
      t: ahora, tipo: "reubicacion", simId: sim.id, sim: sim.nombre, codigo: sim.codigo,
      zonaId: zonaId || null, zona: nombreZona(zonas, zonaId), de: nombreZona(zonas, sim.zonaId), por: quien(usuario),
    },
  };
}

export function datosRevisionResuelta(sim, ahora, usuario) {
  return {
    simulador: { revision: null, actualizado: ahora, actualizadoPor: quien(usuario) },
    movimiento: { t: ahora, tipo: "revision", simId: sim.id, sim: sim.nombre, codigo: sim.codigo, nota: sim.revision || null, por: quien(usuario) },
  };
}

// Nuevo orden de las zonas al subir (-1) o bajar (+1) una. Regresa solo las que cambian: [{ id, orden }].
export function moverZona(zonas = [], id, dir) {
  const lista = ordenarZonas(zonas);
  const i = lista.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return [];
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista.map((z, k) => ({ id: z.id, orden: k + 1, antes: z.orden })).filter((z) => z.orden !== z.antes).map(({ id, orden }) => ({ id, orden }));
}

export function ordenarZonas(zonas = []) {
  return zonas.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre).localeCompare(String(b.nombre), "es"));
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

// Reparte los simuladores disponibles por zona; los que están fuera van aparte (el que lleva más tiempo, primero).
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
  return { porZona, sinUbicar, fuera };
}

const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function coincide(sim, texto) {
  const q = plano(texto).trim();
  if (!q) return true;
  return [sim.nombre, sim.codigo, sim.categoria, sim.responsable].some((v) => plano(v).includes(q));
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
    .filter((m) => !q || [m.sim, m.codigo, m.responsable, m.zona, m.destino, m.por].some((v) => plano(v).includes(q)))
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
    case "revision":
      return `Falla resuelta${m.nota ? `: ${m.nota}` : ""}`;
    default:
      return "";
  }
}

// CSV para Excel: con BOM, separado por comas y con saltos \r\n. Del más antiguo al más reciente.
export function csvMovimientos(movs = []) {
  const filas = [["Fecha", "Hora", "Movimiento", "Código", "Simulador", "Responsable", "Destino", "Zona", "Tiempo fuera (min)", "Nota", "Registró"]];
  for (const m of movs.slice().sort((a, b) => a.t - b.t)) {
    filas.push([
      claveDia(m.t), horaTexto(m.t), TIPOS_MOVIMIENTO[m.tipo] || m.tipo, m.codigo, m.sim,
      m.responsable, m.destino, m.zona, Number.isFinite(m.duracion) ? Math.round(m.duracion / MS_MIN) : "", m.nota, m.por,
    ]);
  }
  const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
}
