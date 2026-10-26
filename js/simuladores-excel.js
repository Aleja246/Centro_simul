// Conexión con el Excel del inventario (OneDrive/SharePoint del Tec) a través de Microsoft Graph.
// - Inicia sesión con la cuenta Microsoft de quien usa la página (MSAL, copiado en js/vendor/msal).
// - Lee la hoja de inventario (catálogo) y escribe: una fila por movimiento en la bitácora,
//   el cuarto al regresar o mover un equipo, y la verificación en el inventario y en la hoja de Verificación.
// Las reglas de qué celda cambia están en simuladores-excel-logica.js (funciones puras, con pruebas).

import { CONFIG } from "./config.js";
import * as X from "./simuladores-excel-logica.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const ALCANCES = ["User.Read", "Files.ReadWrite.All"];
const VIGENCIA_LECTURA = 60000; // se vuelve a leer una hoja si pasó más de 1 minuto

export function excelConfigurado() {
  const m = CONFIG.bitacora.microsoft || {};
  const e = CONFIG.bitacora.excel || {};
  return Boolean(m.clientId && e.inventario && e.inventario.enlace);
}

export class ErrorExcel extends Error {
  constructor(codigo, mensaje) {
    super(mensaje || codigo);
    this.codigo = codigo;
  }
}

export function mensajeExcel(e) {
  const c = (e && e.codigo) || "";
  if (c === "sin-sesion") return "Conecta tu cuenta del Tec para escribir en el Excel.";
  if (c === "sin-permiso") return "Tu cuenta no puede editar ese Excel. Pide que te lo compartan con permiso de edición.";
  if (c === "no-encontrado") return "No encontré el Excel. Revisa el enlace en js/config.js.";
  if (c === "sin-hoja") return e.message;
  if (c === "sin-fila") return e.message;
  if (c === "sin-columnas") return e.message;
  if (c === "bloqueado") return "El Excel está ocupado. Se intentará de nuevo en un momento.";
  if (c === "sin-red") return "No hay conexión con Microsoft. Se intentará de nuevo.";
  if (c === "consentimiento") return "Tu organización no ha autorizado esta app. Pide a TI que la apruebe (ver README).";
  return e && e.message ? `Error del Excel: ${e.message}` : "No se pudo escribir en el Excel.";
}

function cargarMsal() {
  if (window.msal) return Promise.resolve(window.msal);
  return new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = new URL("./vendor/msal/msal-browser.min.js", import.meta.url).href;
    s.onload = () => (window.msal ? ok(window.msal) : mal(new Error("MSAL no cargó")));
    s.onerror = () => mal(new Error("MSAL no cargó"));
    document.head.appendChild(s);
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const idCompartido = (enlace) => "u!" + btoa(unescape(encodeURIComponent(enlace.trim()))).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");

// alCambiar({ conectado, cuenta: { nombre, correo } | null, error }) se llama al entrar o salir.
export async function crearExcel({ alCambiar }) {
  const msal = await cargarMsal();
  const dir = new URL(".", location.href).href; // .../simuladores/
  const app = new msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.bitacora.microsoft.clientId,
      authority: `https://login.microsoftonline.com/${CONFIG.bitacora.microsoft.tenant || "organizations"}`,
      redirectUri: dir,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await app.initialize();
  let error = null;
  try {
    const r = await app.handleRedirectPromise();
    if (r && r.account) app.setActiveAccount(r.account);
  } catch (e) { error = traducirMsal(e); }
  if (!app.getActiveAccount() && app.getAllAccounts().length) app.setActiveAccount(app.getAllAccounts()[0]);

  const cuenta = () => {
    const a = app.getActiveAccount();
    return a ? { nombre: a.name || a.username, correo: a.username } : null;
  };
  const avisar = () => alCambiar({ conectado: Boolean(app.getActiveAccount()), cuenta: cuenta(), error });

  function traducirMsal(e) {
    const t = `${e && e.errorCode} ${e && e.message}`;
    if (/AADSTS65001|AADSTS90094|consent|admin/i.test(t)) return new ErrorExcel("consentimiento");
    if (/user_cancelled|popup_window_error|monitor_window_timeout/i.test(t)) return new ErrorExcel("cancelado", "No se completó el inicio de sesión.");
    return new ErrorExcel("sin-sesion", e && e.message);
  }

  async function token(interactivo) {
    const account = app.getActiveAccount();
    if (!account) throw new ErrorExcel("sin-sesion");
    try {
      return (await app.acquireTokenSilent({ scopes: ALCANCES, account })).accessToken;
    } catch (e) {
      if (!interactivo) throw new ErrorExcel("sin-sesion", e && e.message);
      try { return (await app.acquireTokenPopup({ scopes: ALCANCES, account, redirectUri: new URL("vacio.html", dir).href })).accessToken; }
      catch (e2) { throw traducirMsal(e2); }
    }
  }

  async function graph(metodo, ruta, cuerpo, intento = 0) {
    const t = await token(false);
    let r;
    try {
      r = await fetch(GRAPH + ruta, {
        method: metodo,
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch { throw new ErrorExcel("sin-red"); }
    if ((r.status === 429 || r.status === 503 || r.status === 504 || r.status === 423) && intento < 2) {
      const s = Math.min(10, Number(r.headers.get("Retry-After")) || 2 * (intento + 1));
      await esperar(s * 1000);
      return graph(metodo, ruta, cuerpo, intento + 1);
    }
    if (!r.ok) {
      let det = null;
      try { det = (await r.json()).error; } catch { /* sin detalle */ }
      const codigo = r.status === 401 ? "sin-sesion" : r.status === 403 ? "sin-permiso" : r.status === 404 ? "no-encontrado" : r.status === 423 ? "bloqueado" : "graph";
      throw new ErrorExcel(codigo, det && det.message ? det.message : `HTTP ${r.status}`);
    }
    return r.status === 204 ? null : r.json();
  }

  // ---------- Libros, hojas y lecturas ----------
  const libros = new Map();
  async function libro(enlace) {
    if (libros.has(enlace)) return libros.get(enlace);
    const item = await graph("GET", `/shares/${idCompartido(enlace)}/driveItem?$select=id,name,parentReference`);
    const l = { base: `/drives/${item.parentReference.driveId}/items/${item.id}/workbook`, nombre: item.name, hojas: null, lecturas: new Map() };
    libros.set(enlace, l);
    return l;
  }
  async function hoja(l, buscada, { crear = false } = {}) {
    if (!l.hojas) l.hojas = (await graph("GET", `${l.base}/worksheets?$select=name`)).value.map((w) => w.name);
    const nombre = X.elegirHoja(l.hojas, buscada);
    if (nombre || !crear) return nombre;
    await graph("POST", `${l.base}/worksheets/add`, { name: buscada });
    l.hojas.push(buscada);
    return buscada;
  }
  const rutaHoja = (l, nombre) => `${l.base}/worksheets/${encodeURIComponent(nombre)}`;
  async function leerHoja(l, nombre, fresca = false) {
    const prev = l.lecturas.get(nombre);
    if (prev && !fresca && Date.now() - prev.t < VIGENCIA_LECTURA) return prev;
    const r = await graph("GET", `${rutaHoja(l, nombre)}/usedRange(valuesOnly=true)?$select=address,values`);
    const lectura = { t: Date.now(), valores: r.values || [], direccion: r.address || "A1", origen: X.parsearDireccion(r.address || "A1") };
    l.lecturas.set(nombre, lectura);
    return lectura;
  }
  // Escribe varias celdas en una sola llamada ($batch), una después de otra.
  async function escribirCeldas(l, nombre, celdas) {
    for (let i = 0; i < celdas.length; i += 20) {
      const grupo = celdas.slice(i, i + 20);
      const requests = grupo.map((c, k) => ({
        id: String(k + 1), method: "PATCH", headers: { "Content-Type": "application/json" },
        url: `${rutaHoja(l, nombre)}/range(address='${c.direccion}')`,
        body: c.formato ? { values: [[c.valor]], numberFormat: [[c.formato]] } : { values: [[c.valor]] },
        ...(k ? { dependsOn: [String(k)] } : {}),
      }));
      const r = await graph("POST", "/$batch", { requests });
      const mala = (r.responses || []).find((x) => x.status >= 400);
      if (mala) {
        const det = mala.body && mala.body.error;
        throw new ErrorExcel(mala.status === 403 ? "sin-permiso" : mala.status === 423 ? "bloqueado" : "graph", det && det.message ? det.message : `HTTP ${mala.status}`);
      }
    }
    l.lecturas.delete(nombre);
  }

  const cfg = () => CONFIG.bitacora.excel;
  const enlaceBitacora = () => cfg().bitacora.enlace || cfg().inventario.enlace;

  async function hojaInventario(fresca) {
    const l = await libro(cfg().inventario.enlace);
    const nombre = await hoja(l, cfg().inventario.hoja);
    if (!nombre) throw new ErrorExcel("sin-hoja", `No encontré la hoja "${cfg().inventario.hoja}" en ${l.nombre}.`);
    return { l, nombre, ...(await leerHoja(l, nombre, fresca)) };
  }

  // ---------- Lo que usa la página ----------
  async function leerCatalogo() {
    const h = await hojaInventario(true);
    const r = X.catalogoDesdeValores(h.valores, h.direccion, cfg().inventario.columnas);
    if (!r.ok) throw new ErrorExcel("sin-columnas", `En la hoja ${h.nombre} faltan las columnas: ${r.faltan.join(", ")}.`);
    return { items: r.items, repetidos: r.repetidos, hoja: h.nombre, libro: h.l.nombre };
  }

  // Lo que hay hoy en el Excel para ese equipo (para llenar el formulario de verificación).
  async function leerParaVerificar(id) {
    const cols = cfg().inventario.columnas;
    const h = await hojaInventario(false);
    const enc = X.buscarEncabezados(h.valores, [cols.id, cols.nombre]);
    const f = X.buscarFila(h.valores, enc, X.columna(enc, cols.id), id);
    const inventario = f >= 0 ? X.valoresInventario(h.valores[f], enc, cols) : null;
    let enHojaVerificacion = null;
    if (cfg().verificacion.enlace) {
      const v = await hojaVerificacion(false);
      enHojaVerificacion = v.f(id) >= 0;
    }
    return { inventario, enHojaVerificacion, materiales: inventario ? inventario.material.length : X.columnas(enc, cols.materialQueFalta).length };
  }

  async function hojaVerificacion(fresca) {
    const c = cfg().verificacion;
    const l = await libro(c.enlace);
    const nombre = await hoja(l, c.hoja);
    if (!nombre) throw new ErrorExcel("sin-hoja", `No encontré la hoja "${c.hoja}" en ${l.nombre}.`);
    const lec = await leerHoja(l, nombre, fresca);
    const enc = X.buscarEncabezados(lec.valores, [c.columnas.id, c.columnas.estadoFisico]);
    if (!enc) throw new ErrorExcel("sin-columnas", `En la hoja ${nombre} no encontré los encabezados "${c.columnas.id}" y "${c.columnas.estadoFisico}".`);
    const colId = X.columna(enc, c.columnas.id);
    return { l, nombre, ...lec, enc, f: (id) => X.buscarFila(lec.valores, enc, colId, id) };
  }

  async function pasoBitacora(m) {
    const c = cfg().bitacora;
    const l = await libro(enlaceBitacora());
    const existia = Boolean(await hoja(l, c.hoja));
    const nombre = await hoja(l, c.hoja, { crear: true });
    const ruta = rutaHoja(l, nombre);
    let tablas = (await graph("GET", `${ruta}/tables?$select=name`)).value;
    if (!existia) {
      // Hoja nueva: encabezados en negritas y una tabla para que cada fila se agregue sin pisar otra.
      const enc = X.encabezadosBitacora(c.columnas);
      const dir = `A1:${X.letraColumna(enc.length - 1)}1`;
      await graph("PATCH", `${ruta}/range(address='${dir}')`, { values: [enc] });
      await graph("PATCH", `${ruta}/range(address='${dir}')/format/font`, { bold: true });
      const t = await graph("POST", `${l.base}/tables/add`, { address: `'${nombre}'!${dir}`, hasHeaders: true });
      tablas = [{ name: t.name }];
    }
    if (tablas.length) {
      const t = encodeURIComponent(tablas[0].name);
      const enc = (await graph("GET", `${l.base}/tables/${t}/headerRowRange?$select=values`)).values[0];
      if (!X.buscarEncabezados([enc], [c.columnas.id, c.columnas.fecha])) {
        throw new ErrorExcel("sin-columnas", `La tabla de la hoja ${nombre} no tiene los encabezados "${c.columnas.fecha}" y "${c.columnas.id}". Ajusta bitacora.columnas en js/config.js.`);
      }
      const fila = X.filaBitacora(m, enc, c.columnas, { fecha: c.formatoFecha });
      const r = await graph("POST", `${l.base}/tables/${t}/rows`, { values: [fila.map((x) => x.v)] });
      if (fila.some((x) => x.f)) {
        await graph("PATCH", `${l.base}/tables/${t}/rows/itemAt(index=${r.index})/range`, { numberFormat: [fila.map((x) => x.f || "General")] });
      }
      return;
    }
    // Hoja sin tabla: se escribe en la primera fila vacía después de lo usado.
    const lec = await leerHoja(l, nombre, true);
    const encI = X.buscarEncabezados(lec.valores, [c.columnas.id, c.columnas.fecha]);
    if (!encI) throw new ErrorExcel("sin-columnas", `En la hoja ${nombre} no encontré los encabezados "${c.columnas.fecha}" y "${c.columnas.id}".`);
    const enc = lec.valores[encI.fila];
    const fila = X.filaBitacora(m, enc, c.columnas, { fecha: c.formatoFecha });
    const n = lec.origen.fila + lec.valores.length;
    const dir = `${X.letraColumna(lec.origen.col)}${n}:${X.letraColumna(lec.origen.col + enc.length - 1)}${n}`;
    await graph("PATCH", `${ruta}/range(address='${dir}')`, { values: [fila.map((x) => x.v)], numberFormat: [fila.map((x) => x.f || "General")] });
    l.lecturas.delete(nombre);
  }

  async function pasoInventario(m) {
    const cols = cfg().inventario.columnas;
    const h = await hojaInventario(true);
    const enc = X.buscarEncabezados(h.valores, [cols.id, cols.nombre]);
    const f = X.buscarFila(h.valores, enc, X.columna(enc, cols.id), m.codigo);
    if (f < 0) throw new ErrorExcel("sin-fila", `No encontré ${m.codigo} en la hoja ${h.nombre}.`);
    const cambios = X.cambiosInventario(m, h.valores[f], enc, cols, { fecha: cfg().inventario.formatoFecha });
    if (!cambios.length) return;
    await escribirCeldas(h.l, h.nombre, cambios.map((c) => ({ direccion: X.celda(h.origen, f, c.col), valor: c.valor, formato: c.formato })));
  }

  async function pasoVerificacion(m) {
    const c = cfg().verificacion;
    const v = await hojaVerificacion(true);
    const f = v.f(m.codigo);
    if (f < 0) return "sin-fila"; // el equipo no está en el formato de verificación: no es un error
    const celdas = X.cambiosVerificacion(m, v.enc, c.columnas).map((x) => ({ direccion: X.celda(v.origen, f, x.col), valor: x.valor, formato: x.formato }));
    for (const x of X.cambiosEncabezado(v.valores, c.encabezado, m, { fecha: c.formatoFecha })) {
      celdas.push({ direccion: X.celda(v.origen, x.fila, x.col), valor: x.valor, formato: x.formato });
    }
    await escribirCeldas(v.l, v.nombre, celdas);
    return "ok";
  }

  // Escribe un movimiento en el Excel. `hechos` dice qué pasos ya se hicieron (para no repetir filas al reintentar);
  // `alPaso(nombre)` se llama al terminar cada uno para guardarlo.
  async function aplicar(m, hechos = {}, alPaso = async () => {}) {
    const pasos = [["bitacora", pasoBitacora]];
    if (["regreso", "reubicacion", "verificacion"].includes(m.tipo)) pasos.push(["inventario", pasoInventario]);
    if (m.tipo === "verificacion" && cfg().verificacion.enlace) pasos.push(["verificacion", pasoVerificacion]);
    for (const [nombre, fn] of pasos) {
      if (hechos[nombre]) continue;
      const r = await fn(m);
      hechos = { ...hechos, [nombre]: r || true };
      await alPaso(nombre, hechos);
    }
    return hechos;
  }

  avisar();
  return {
    get conectado() { return Boolean(app.getActiveAccount()); },
    get cuenta() { return cuenta(); },
    async conectar() {
      error = null;
      try {
        const r = await app.loginPopup({ scopes: ALCANCES, redirectUri: new URL("vacio.html", dir).href, prompt: "select_account" });
        app.setActiveAccount(r.account);
      } catch (e) {
        const t = `${e && e.errorCode}`;
        if (/popup_window_error|empty_window_error/.test(t)) { await app.loginRedirect({ scopes: ALCANCES }); return; }
        error = traducirMsal(e);
      }
      avisar();
      if (error) throw error;
    },
    async desconectar() {
      const account = app.getActiveAccount();
      if (account) await app.logoutRedirect({ account, onRedirectNavigate: () => false });
      libros.clear();
      avisar();
    },
    // Pide permiso con ventana si hace falta (llamar desde un toque).
    async revisarPermiso() { await token(true); },
    leerCatalogo,
    leerParaVerificar,
    aplicar,
  };
}
