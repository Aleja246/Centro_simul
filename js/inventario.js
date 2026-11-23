// Funciones PURAS del inventario: buscar artículos, ubicaciones, reservas y accesorios.
// No tocan el DOM ni leen la hora del sistema: "ahora" llega como "AAAA-MM-DDTHH:MM".
// Los datos vienen de datos/inventario.json (lo genera scripts/excel_a_json.py desde el Excel).
import { momento } from "./logica.js";

const MS_DIA = 24 * 3600000;
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ESTADOS_CON_ALERTA = ["No funciona", "Funciona con fallas"];

// ---------- Índices ----------

export function indexar(datos) {
  const porId = new Map();
  const hijos = new Map();
  const porKit = new Map();
  const porCaja = new Map();
  for (const a of datos.articulos ?? []) {
    porId.set(a.id, a);
    if (a.pertenece) agregar(hijos, a.pertenece, a);
    if (a.kit) agregar(porKit, a.kit, a);
    if (a.caja) agregar(porCaja, a.caja, a);
  }
  const cajas = new Map((datos.cajas ?? []).map((c) => [c.id, c]));
  return { porId, hijos, porKit, porCaja, cajas, reservas: datos.reservas ?? null, generado: datos.generado ?? "" };
}

function agregar(mapa, clave, valor) {
  if (!mapa.has(clave)) mapa.set(clave, []);
  mapa.get(clave).push(valor);
}

// ---------- Textos ----------

export function nombreCuarto(cuarto, nombres = {}) {
  return nombres[cuarto] ?? cuarto ?? "";
}

// Para buscar sin importar mayúsculas ni acentos.
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Ubicación ----------

// Dónde está un artículo: cuarto, caja (si está en una), estante de la caja y nota libre.
export function ubicacion(articulo, idx, nombres = {}) {
  const caja = articulo.caja ? idx.cajas.get(articulo.caja) : null;
  const partes = [nombreCuarto(articulo.cuarto, nombres)];
  if (articulo.caja) partes.push(`Caja ${articulo.caja}`);
  if (caja?.estante) partes.push(caja.estante);
  if (!articulo.caja && articulo.guardado) partes.push(articulo.guardado);
  return {
    cuarto: articulo.cuarto,
    caja: articulo.caja,
    estante: caja?.estante ?? "",
    texto: partes.filter(Boolean).join(" · ") || "Sin ubicación registrada",
  };
}

// Qué tan lejos está un accesorio de su simulador.
export function relacionUbicacion(accesorio, simulador) {
  if (!accesorio.cuarto || !simulador.cuarto) return "sin-dato";
  if (accesorio.cuarto !== simulador.cuarto) return "otro-cuarto";
  if (accesorio.caja && accesorio.caja === simulador.caja) return "misma-caja";
  return "mismo-cuarto";
}

// ---------- Reservas ----------

export function reservasDe(id, reservas) {
  return (reservas ?? [])
    .filter((r) => r.id === id)
    .sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio));
}

// Estado de reserva de un artículo en este momento.
//   sin-datos: no hay hoja de reservas conectada
//   en-uso:    hay una reserva ocurriendo ahora
//   hoy:       hay una reserva más tarde hoy
//   semana:    hay una reserva en los próximos 7 días
//   libre:     nada en los próximos 7 días
export function estadoReserva(id, reservas, ahora) {
  if (reservas == null) return { estado: "sin-datos", proxima: null };
  const [hoy, hora] = ahora.split("T");
  const t = momento(hoy, hora);
  const futuras = reservasDe(id, reservas).filter((r) => momento(r.fecha, r.fin) > t);
  const proxima = futuras[0] ?? null;
  if (!proxima) return { estado: "libre", proxima: null };
  const inicio = momento(proxima.fecha, proxima.inicio);
  if (inicio <= t) return { estado: "en-uso", proxima };
  if (proxima.fecha === hoy) return { estado: "hoy", proxima };
  if (inicio - t <= 7 * MS_DIA) return { estado: "semana", proxima };
  return { estado: "libre", proxima };
}

// "Hoy", "Mañana" o "jueves 29/10".
export function diaRelativo(fecha, hoy) {
  const dias = Math.round((momento(fecha, "00:00") - momento(hoy, "00:00")) / MS_DIA);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  const [, m, d] = fecha.split("-");
  const dia = DIAS_SEMANA[new Date(momento(fecha, "00:00")).getUTCDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d}/${m}`;
}

// ---------- Accesorios y kits ----------

// Agrupa artículos iguales (mismo nombre) y junta sus ubicaciones.
//   [{ nombre, tipo, cantidad, ids, ubicaciones: [{cuarto, caja, cantidad}], alerta }]
export function agruparPorNombre(articulos) {
  const grupos = new Map();
  for (const a of articulos) {
    const clave = normalizar(a.nombre);
    if (!grupos.has(clave)) {
      grupos.set(clave, { nombre: a.nombre, tipo: a.tipo, cantidad: 0, ids: [], ubicaciones: [], alerta: false, articulos: [] });
    }
    const g = grupos.get(clave);
    g.cantidad += 1;
    g.ids.push(a.id);
    g.articulos.push(a);
    if (ESTADOS_CON_ALERTA.includes(a.estado)) g.alerta = true;
    const u = g.ubicaciones.find((x) => x.cuarto === a.cuarto && x.caja === a.caja);
    if (u) u.cantidad += 1;
    else g.ubicaciones.push({ cuarto: a.cuarto, caja: a.caja, guardado: a.guardado, cantidad: 1 });
  }
  return [...grupos.values()];
}

// Ícono de una fila de accesorio respecto a su simulador:
//   alerta (no funciona o con fallas) > traslado (otro cuarto) > ok (mismo cuarto o misma caja).
export function indicadorAccesorio(grupo, simulador) {
  if (grupo.alerta) return "alerta";
  const relaciones = grupo.articulos.map((a) => relacionUbicacion(a, simulador));
  if (relaciones.includes("otro-cuarto")) return "traslado";
  if (relaciones.every((r) => r === "sin-dato")) return "sin-dato";
  return "ok";
}

// Todo lo que pertenece a un simulador, separado en accesorios y consumibles y agrupado por kit/módulo.
//   { accesorios: [{kit, grupos}], consumibles: [{kit, grupos}], total }
export function piezasDe(simuladorId, idx) {
  const piezas = idx.hijos.get(simuladorId) ?? [];
  const porKit = (lista) => {
    const kits = new Map();
    for (const a of lista) agregar(kits, a.kit || "Sin kit", a);
    return [...kits.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([kit, arts]) => ({ kit, grupos: agruparPorNombre(arts) }));
  };
  const consumibles = piezas.filter((a) => a.tipo === "Consumible");
  return {
    accesorios: porKit(piezas.filter((a) => a.tipo !== "Consumible")),
    consumibles: porKit(consumibles),
    total: piezas.length,
  };
}

// Otras piezas del mismo kit/módulo (sirve cuando el simulador aún no está registrado, p. ej. SimMom).
export function mismoKit(articulo, idx) {
  if (!articulo.kit) return [];
  return agruparPorNombre((idx.porKit.get(articulo.kit) ?? []).filter((a) => a.id !== articulo.id));
}

// ---------- Cajas ----------

// Contenido de una caja agrupado por cuarto (hay IDs de caja repetidos en dos cuartos).
export function contenidoCaja(cajaId, idx) {
  const arts = idx.porCaja.get(cajaId) ?? [];
  const cuartos = new Map();
  for (const a of arts) agregar(cuartos, a.cuarto || "", a);
  return [...cuartos.entries()].map(([cuarto, lista]) => ({ cuarto, grupos: agruparPorNombre(lista), total: lista.length }));
}

// ---------- Búsqueda ----------

export function buscar(texto, idx, limite = 40) {
  const q = normalizar(texto);
  if (!q) return [];
  const palabras = q.split(" ");
  const resultados = [];
  for (const c of idx.cajas.values()) {
    if (palabras.every((p) => normalizar(`${c.id} caja ${c.contenido}`).includes(p))) {
      resultados.push({ id: c.id, nombre: c.contenido || "Caja", tipo: "Caja", puntos: normalizar(c.id) === q ? 0 : 2 });
    }
  }
  for (const a of idx.porId.values()) {
    const campos = normalizar(`${a.id} ${a.nombre} ${a.kit} ${a.marca} ${a.tipo}`);
    if (!palabras.every((p) => campos.includes(p))) continue;
    const puntos = normalizar(a.id) === q ? 0 : a.qr ? 1 : 3;
    resultados.push({ id: a.id, nombre: a.nombre, tipo: a.tipo, puntos });
  }
  return resultados.sort((a, b) => a.puntos - b.puntos || a.id.localeCompare(b.id)).slice(0, limite);
}

// ---------- Etiquetas ----------

// Qué etiquetas imprimir. filtro: { prioridad1, prioridad2, cajas, cuarto, ids }
export function etiquetasA(idx, filtro) {
  const ids = (filtro.ids ?? "")
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  const salida = [];
  if (ids.length) {
    for (const id of ids) {
      if (idx.porId.get(id)?.qr) salida.push({ clase: "articulo", articulo: idx.porId.get(id) });
      else if (idx.cajas.has(id)) salida.push({ clase: "caja", caja: idx.cajas.get(id) });
    }
    return salida;
  }
  const enCuarto = (cuarto) => !filtro.cuarto || cuarto === filtro.cuarto;
  for (const a of idx.porId.values()) {
    if (!enCuarto(a.cuarto)) continue;
    if ((a.qr === 1 && filtro.prioridad1) || (a.qr === 2 && filtro.prioridad2)) salida.push({ clase: "articulo", articulo: a });
  }
  if (filtro.cajas) {
    for (const c of idx.cajas.values()) {
      if (!filtro.cuarto || (c.cuartos ?? []).includes(filtro.cuarto)) salida.push({ clase: "caja", caja: c });
    }
  }
  return salida;
}

// ---------- NFC ----------

// Dirección que se graba en la etiqueta NFC (o en el QR) de un artículo o caja.
// paginaActual: la dirección de cualquier página del sitio que esté un nivel abajo de la raíz (p. ej. .../nfc/).
export function urlFicha(paginaActual, id) {
  return new URL(`../equipo/?id=${encodeURIComponent(id)}`, paginaActual).href;
}

// Lee el ID de una dirección grabada en una etiqueta; null si no es de este sitio.
export function idDeUrl(url) {
  try {
    const u = new URL(url);
    if (!/\/equipo\/$/.test(u.pathname)) return null;
    return (u.searchParams.get("id") ?? "").trim().toUpperCase() || null;
  } catch {
    return null;
  }
}
