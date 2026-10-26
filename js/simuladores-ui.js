// Bitácora de simuladores: todo lo que toca la pantalla.
// Reglas y cálculos: simuladores-logica.js · Bitácora: simuladores-datos.js
// Excel (Microsoft): simuladores-excel.js · Tarjetas: simuladores-nfc.js
import { CONFIG } from "./config.js";
import * as L from "./simuladores-logica.js";
import { crearAlmacen, mensajeDeError } from "./simuladores-datos.js";
import { excelConfigurado, crearExcel, mensajeExcel } from "./simuladores-excel.js";
import { hayWebNfc, permisoNfc, leerConWebNfc, grabarEnlace, escucharLectorUsb } from "./simuladores-nfc.js";

const B = CONFIG.bitacora;
const HORAS_ALERTA = Number(B.horasAlerta) || 4;
const COLORES = [
  { n: "Azul", c: "#2f62c9" }, { n: "Turquesa", c: "#0f7c7b" }, { n: "Verde", c: "#3b852a" }, { n: "Mostaza", c: "#8a6700" },
  { n: "Naranja", c: "#bd5a10" }, { n: "Rojo", c: "#b5382e" }, { n: "Magenta", c: "#9e3b8a" }, { n: "Violeta", c: "#5f4bbe" }, { n: "Gris", c: "#4a5653" },
];
const TAMANOS = { s: "Chica", m: "Mediana", l: "Grande" };
const VISTAS = ["plano", "inventario", "historial", "ajustes"];
const ICONO_MOV = { salida: "i-salida", regreso: "i-regreso", reubicacion: "i-reubicacion", revision: "i-revision", verificacion: "i-verificar" };
const EXCEL_ACTIVO = excelConfigurado();
const CON_HOJA_VERIF = Boolean(B.excel && B.excel.verificacion && B.excel.verificacion.enlace);

const E = {
  almacen: null, usuario: null,
  catalogo: [], catalogoLeido: 0, catalogoPor: null, catalogoEjemplo: false, estados: [], zonasGuardadas: [], movs: [], pendientes: [],
  sims: [], zonas: [], listo: false, historialListo: false, hayMas: false, error: null,
  vista: "plano", qPlano: "", qInv: "", categoria: "", todoInventario: false, tipo: "todos", qHist: "", mostrar: 100,
  hoja: null, capturar: null, ocupado: false, paleta: null, ajustesPendiente: false,
  nfcActivo: false, grabando: false, modoLectura: "ficha",
  excel: null, excelEstado: { conectado: false, cuenta: null, error: null }, sincronizando: false, leyendoCatalogo: false, errorCatalogo: null, falloCatalogo: 0,
  mios: new Set(), // movimientos registrados en este dispositivo (se pasan al Excel de inmediato)
};

// ---------- Utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (id, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const guardado = {
  leer(k, d) { try { const v = localStorage.getItem("csc.bitacora." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  poner(k, v) { try { localStorage.setItem("csc.bitacora." + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const zona = (id) => (id ? E.zonas.find((z) => z.id === id) : null) || null;
const sim = (id) => E.sims.find((s) => s.id === id) || null;
const colorDe = (z) => {
  if (!z) return "#8a97a8";
  if (Number.isInteger(z.color)) return (COLORES[z.color] || COLORES[8]).c;
  const i = L.ordenarZonas(E.zonas).findIndex((x) => x.id === z.id);
  return COLORES[(i < 0 ? 8 : i) % 8].c;
};
const zonaChip = (z) => `<span class="zona-chip" style="--z:${colorDe(z)}">${z ? esc(z.nombre) : "Sin ubicar"}</span>`;
const ahora = () => Date.now();
const enPlano = (s) => L.vaEnPlano(s, B.enPlano);
const visibles = () => E.sims.filter((s) => enPlano(s) || L.estaFuera(s) || s.revision);
const fechaHora = (t) => {
  const hoy = L.claveDia(ahora()), ayer = L.claveDia(ahora() - 864e5), dia = L.claveDia(t);
  const pre = dia === hoy ? "hoy" : dia === ayer ? "ayer" : new Date(t).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  return `${pre} a las ${L.horaTexto(t)}`;
};
const nombreDia = (dia) => {
  if (dia === L.claveDia(ahora())) return "Hoy";
  if (dia === L.claveDia(ahora() - 864e5)) return "Ayer";
  const s = new Date(dia + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
// Quién registra: nombre de la cuenta Microsoft si está conectada; si no, el correo de la bitácora.
const usuarioActual = () => {
  const c = E.excelEstado.cuenta;
  if (c) return { uid: E.usuario && E.usuario.uid, correo: c.correo, nombre: c.nombre };
  return E.usuario && E.usuario.correo !== "demo" ? E.usuario : null;
};
function pildora(s) {
  if (L.estaFuera(s)) return L.enAlerta(s, ahora(), HORAS_ALERTA) ? '<span class="pildora p-alerta">Fuera mucho tiempo</span>' : '<span class="pildora p-uso">En uso</span>';
  return '<span class="pildora p-ok">Disponible</span>';
}
function marcaExcel(m) {
  if (!EXCEL_ACTIVO || !m.excel) return "";
  const e = m.excel.estado;
  if (e === "ok") return `<span class="excel-ok" title="Ya está en el Excel">${ic("i-ok")}Excel</span>`;
  if (e === "error") return `<span class="excel-error" title="${esc(m.excel.mensaje || "")}">${ic("i-alerta")}Excel</span>`;
  return `<span class="excel-pend" title="Todavía no está en el Excel">${ic("i-reloj")}Excel</span>`;
}

let relojMensaje = null;
function mensaje(texto, tipo = "bien") {
  const m = $("#mensaje");
  const hoja = $("#hoja");
  (hoja.open ? hoja : document.body).appendChild(m);
  m.className = "mensaje" + (tipo === "malo" ? " malo" : "");
  m.innerHTML = ic(tipo === "malo" ? "i-alerta" : "i-ok") + "<span></span>";
  m.querySelector("span").textContent = texto;
  m.hidden = false;
  clearTimeout(relojMensaje);
  relojMensaje = setTimeout(() => { m.hidden = true; }, tipo === "malo" ? 6000 : 3000);
}
let audio = null;
function pitido() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1320; g.gain.value = 0.05;
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.09);
  } catch { /* sin sonido */ }
  if (navigator.vibrate) navigator.vibrate(60);
}

// Ejecuta un guardado: evita dobles toques y traduce los errores.
async function guardar(fn, textoBien) {
  if (E.ocupado) return false;
  E.ocupado = true;
  $$("#hoja-in button[type=submit]").forEach((b) => { b.disabled = true; });
  try {
    await fn();
    if (textoBien) mensaje(textoBien);
    return true;
  } catch (e) {
    console.error(e);
    mensaje(mensajeDeError(e), "malo");
    return false;
  } finally {
    E.ocupado = false;
    $$("#hoja-in button[type=submit]").forEach((b) => { b.disabled = false; });
  }
}

function mostrarErrores(errores) {
  $$("#hoja-in [data-err]").forEach((p) => { p.hidden = true; p.textContent = ""; p.closest(".campo")?.classList.remove("con-error"); });
  let primero = null;
  for (const [campo, texto] of Object.entries(errores)) {
    const p = $(`#hoja-in [data-err="${campo}"]`);
    if (!p) { mensaje(texto, "malo"); continue; }
    p.textContent = texto; p.hidden = false;
    const c = p.closest(".campo");
    if (c) { c.classList.add("con-error"); primero = primero || c.querySelector("input, select, textarea, button"); }
  }
  if (primero) primero.focus();
}

// Botón que pide un segundo toque para confirmar (la página no usa ventanas de confirmación).
function confirmado(b) {
  if (b.dataset.armado === "1") return true;
  b.dataset.armado = "1";
  const antes = b.innerHTML;
  b.textContent = b.dataset.confirmar || "¿Seguro? Toca otra vez";
  b.classList.add("armado");
  setTimeout(() => { if (b.isConnected) { b.dataset.armado = ""; b.innerHTML = antes; b.classList.remove("armado"); } }, 3500);
  return false;
}

// ---------- Arranque ----------
async function iniciar() {
  const v = guardado.leer("vista", "plano");
  if (VISTAS.includes(v)) E.vista = v;
  E.modoLectura = guardado.leer("modoLectura", "ficha") === "verificar" ? "verificar" : "ficha";
  enlazarEventos();
  escucharLectorUsb(alLeerTarjeta);
  setInterval(tic, 30000);
  pintarModo();
  pintar();
  try {
    E.almacen = await crearAlmacen({ alCambiar, alSesion });
  } catch (e) {
    console.error(e);
    $("#avisos").innerHTML = `<div class="avisito error">${ic("i-alerta")}<div class="avisito-cuerpo"><p><b>No se pudo cargar la bitácora.</b> Revisa la conexión a internet y vuelve a abrir la página.</p></div></div>`;
    return;
  }
  if (EXCEL_ACTIVO) {
    try {
      E.excel = await crearExcel({ alCambiar: alCambiarExcel });
    } catch (e) {
      console.error(e);
      E.excelEstado = { conectado: false, cuenta: null, error: { codigo: "carga", message: "No se pudo cargar el inicio de sesión de Microsoft." } };
      pintar();
    }
  }
  if (hayWebNfc() && (await permisoNfc()) === "granted") encenderNfc(false);
}

function alSesion(u) {
  E.usuario = u;
  if (!u) { E.listo = false; cerrarHoja(); }
  pintar();
}

function alCambiar(d) {
  Object.assign(E, {
    catalogo: d.catalogo, catalogoLeido: d.catalogoLeido, catalogoPor: d.catalogoPor, catalogoEjemplo: d.catalogoEjemplo,
    estados: d.estados, zonasGuardadas: d.zonas, movs: d.movs, pendientes: d.pendientes || [],
    listo: d.listo, historialListo: d.historialListo, hayMas: d.hayMas, error: d.error,
  });
  E.sims = L.unirCatalogo(E.catalogo, E.estados, E.catalogoLeido);
  E.zonas = L.zonasDeCuartos(E.sims, E.zonasGuardadas);
  pintar();
  refrescarHoja();
  revisarEnlace();
  programarSincronizacion();
  revisarCatalogo();
}

function alCambiarExcel(estado) {
  const antes = E.excelEstado.conectado;
  E.excelEstado = estado;
  pintar();
  if (estado.conectado && !antes) { revisarCatalogo(true); programarSincronizacion(); }
}

function tic() {
  if (!E.listo) return;
  pintarResumen();
  pintarFuera();
  $$(".tiempo[data-desde]").forEach((el) => { el.textContent = "hace " + L.duracionTexto(ahora() - Number(el.dataset.desde)); });
}

// ---------- Excel: inventario y pendientes ----------

// Lee el inventario del Excel cuando hay cuenta conectada y la copia está vieja (o se pide a mano).
async function revisarCatalogo(forzar = false) {
  if (!E.excel || !E.excelEstado.conectado || !E.usuario || !E.listo || E.leyendoCatalogo) return;
  if (!forzar && E.catalogoLeido && ahora() - E.catalogoLeido < 10 * 60000 && E.catalogo.length && !E.catalogoEjemplo) return;
  if (!forzar && ahora() - E.falloCatalogo < 2 * 60000) return; // después de un error, espera antes de reintentar solo
  E.leyendoCatalogo = true;
  E.errorCatalogo = null;
  pintarAjustesSiVisible();
  try {
    const r = await E.excel.leerCatalogo();
    const quien = usuarioActual();
    await E.almacen.guardarCatalogo(r.items, ahora(), quien ? quien.nombre || quien.correo : null);
    if (forzar === "manual") mensaje(`Inventario actualizado: ${r.items.length} equipos de la hoja ${r.hoja}.`);
    if (r.repetidos.length) mensaje(`Hay IDs repetidos en el Excel: ${r.repetidos.slice(0, 5).join(", ")}. Se usa la primera fila.`, "malo");
  } catch (e) {
    console.error(e);
    E.errorCatalogo = e;
    E.falloCatalogo = ahora();
    if (forzar === "manual") mensaje(mensajeExcel(e), "malo");
  } finally {
    E.leyendoCatalogo = false;
    pintar();
  }
}

let relojSync = null;
function programarSincronizacion() {
  clearTimeout(relojSync);
  relojSync = setTimeout(() => sincronizarExcel(false), 800);
}

// Escribe en el Excel los movimientos pendientes, del más antiguo al más reciente.
// Automático: solo los "pendiente" (los de otro dispositivo, después de 30 s). A mano: también los que fallaron.
async function sincronizarExcel(manual) {
  if (!E.excel || !E.excelEstado.conectado || E.sincronizando || !E.almacen) return;
  const lista = E.pendientes
    .filter((m) => manual ? true : (m.excel.estado === "pendiente" && (E.mios.has(m.id) || ahora() - m.t > 30000)))
    .sort((a, b) => a.t - b.t);
  if (!lista.length) { if (manual) mensaje("No hay cambios pendientes para el Excel."); return; }
  E.sincronizando = true;
  pintarAjustesSiVisible();
  let hechos = 0;
  let ultimoError = null;
  try {
    for (const m of lista) {
      const quien = usuarioActual();
      const tomado = await E.almacen.tomarParaExcel(m.id, quien && quien.nombre);
      if (!tomado) continue;
      let pasos = tomado.pasos || {};
      try {
        pasos = await E.excel.aplicar({ ...m }, pasos, async (_, p) => { pasos = p; await E.almacen.marcarExcel(m.id, { ...tomado, pasos: p }); });
        await E.almacen.marcarExcel(m.id, { estado: "ok", pasos, t: ahora() });
        hechos++;
      } catch (e) {
        console.error(e);
        ultimoError = e;
        await E.almacen.marcarExcel(m.id, { estado: "error", pasos, mensaje: mensajeExcel(e), t: ahora() }).catch(() => {});
        // Si el problema es de la cuenta, la red o el archivo, no tiene caso seguir con los demás.
        if (!["sin-fila", "graph"].includes(e.codigo)) break;
      }
    }
  } finally {
    E.sincronizando = false;
    pintar();
  }
  if (manual && hechos) mensaje(`${hechos} ${hechos === 1 ? "cambio pasó" : "cambios pasaron"} al Excel.`);
  if (ultimoError && (manual || ultimoError.codigo !== "sin-red")) mensaje(mensajeExcel(ultimoError), "malo");
}

// ---------- Pintar ----------
function pintar() {
  const conSesion = Boolean(E.almacen && E.usuario);
  $("#v-entrar").hidden = !(E.almacen && E.almacen.modo === "firebase" && !E.usuario);
  $("#pestanas").hidden = !conSesion;
  $("#boton-leer").hidden = !conSesion;
  $$(".pestana").forEach((b) => b.setAttribute("aria-current", b.dataset.vista === E.vista ? "page" : "false"));
  VISTAS.forEach((v) => { $("#v-" + v).hidden = !conSesion || v !== E.vista; });
  pintarAvisos();
  if (!conSesion) return;
  pintarResumen();
  pintarFuera();
  pintarPlano();
  if (E.vista === "inventario") pintarInventario();
  if (E.vista === "historial") pintarHistorial();
  if (E.vista === "ajustes") pintarAjustes();
  pintarListas();
}
const pintarAjustesSiVisible = () => { if (E.vista === "ajustes" && E.usuario) pintarAjustes(); };

function pintarModo() {
  const v = E.modoLectura === "verificar";
  document.body.classList.toggle("modo-verificar", v);
  $$("[data-texto-leer]").forEach((el) => { el.textContent = v ? "Verificar" : "Leer tarjeta"; });
}

function pintarAvisos() {
  let h = "";
  if (!E.almacen) h = '<div class="cargando"><span class="girando"></span>Abriendo la bitácora…</div>';
  if (E.almacen && E.almacen.modo === "demo") {
    h += `<div class="avisito demo">${ic("i-info")}<div class="avisito-cuerpo"><p><b>Modo demostración.</b> La bitácora se guarda solo en este navegador. Para que todo el personal vea lo mismo, conecta Firebase (instrucciones en el README).</p></div></div>`;
  }
  if (E.error && E.usuario) {
    h += `<div class="avisito error">${ic("i-alerta")}<div class="avisito-cuerpo"><p>${esc(mensajeDeError(E.error))}</p></div></div>`;
  }
  if (E.usuario && EXCEL_ACTIVO) {
    const pend = E.pendientes.length;
    if (!E.excelEstado.conectado && pend) {
      h += `<div class="avisito">${ic("i-excel")}<div class="avisito-cuerpo"><p><b>${pend} ${pend === 1 ? "cambio" : "cambios"} todavía no ${pend === 1 ? "está" : "están"} en el Excel.</b> Conecta tu cuenta del Tec para pasarlos.</p><div><button type="button" class="boton-chico" data-accion="excel-conectar">Conectar cuenta del Tec</button></div></div></div>`;
    } else if (E.excelEstado.conectado && E.pendientes.some((m) => m.excel.estado === "error")) {
      const m = E.pendientes.find((x) => x.excel.estado === "error");
      h += `<div class="avisito error">${ic("i-excel")}<div class="avisito-cuerpo"><p><b>Un cambio no se pudo pasar al Excel:</b> ${esc(m.excel.mensaje || "")}</p><div><button type="button" class="boton-chico" data-accion="excel-sincronizar">Intentar de nuevo</button></div></div></div>`;
    }
  }
  const a = $("#avisos");
  if (a.dataset.h !== h) { a.innerHTML = h; a.dataset.h = h; }
}

function pintarResumen() {
  const r = L.resumen(visibles(), ahora(), HORAS_ALERTA);
  const n = (v) => (E.listo ? v : "–");
  const dato = (clase, num, nombre, sub) => `<div class="dato ${clase} ${num === 0 ? "cero" : ""}"><span class="dato-num">${n(num)}</span><span class="dato-nombre">${nombre}</span><span class="dato-sub">${sub}</span></div>`;
  $("#resumen").innerHTML =
    dato("d-ok", r.disponibles, "Disponibles", r.total ? `de ${r.total} simuladores` : "sin inventario aún") +
    dato("d-uso", r.enUso, "En uso", r.enUso ? "fuera de su cuarto" : "ninguno fuera") +
    dato(`d-alerta ${r.alerta ? "activo" : ""}`, r.alerta, `Más de ${HORAS_ALERTA} h fuera`, r.alerta ? "confirma si ya regresaron" : "sin retrasos") +
    dato("d-revision", r.revision, "En revisión", r.revision ? "reportados con falla" : "todo en orden");
}

function pintarFuera() {
  const { fuera } = L.repartirPorZona(E.sims, E.zonas);
  $("#fuera-n").textContent = fuera.length;
  let h;
  if (!E.listo) h = '<div class="cargando"><span class="girando"></span>Cargando…</div>';
  else if (!fuera.length) h = `<div class="todo-en-lugar">${ic("i-ok")}Todo está en su lugar.</div>`;
  else h = fuera.map((s) => {
    const tarde = L.enAlerta(s, ahora(), HORAS_ALERTA);
    return `<button type="button" class="salida-tarjeta ${tarde ? "tarde" : ""}" data-sim="${esc(s.id)}">
      <span class="salida-arriba"><span class="codigo">${esc(s.id)}</span><span class="salida-tiempo">${ic("i-reloj")}${esc(L.duracionTexto(ahora() - (s.desde || ahora())))}</span></span>
      <span class="salida-nombre">${esc(s.nombre)}</span>
      <span class="salida-quien">${esc(s.responsable || "Sin responsable")}${s.destino ? " · " + esc(s.destino) : ""}</span>
      <span class="salida-accion">Registrar regreso ${ic("i-flecha")}</span>
    </button>`;
  }).join("");
  $("#fuera").innerHTML = h;
}

function etiqueta(s, z) {
  const q = E.qPlano;
  const clase = q ? (L.coincide(s, q) ? "encontrada" : "tenue") : "";
  return `<button type="button" class="etiqueta ${clase}" data-sim="${esc(s.id)}" style="--z:${colorDe(z)}">
    <span class="etiqueta-cod"><span class="punto"></span>${esc(s.id)}${s.tarjeta || s.enlaceGrabado ? `<span class="con-nfc" title="Tiene tarjeta NFC">${ic("i-nfc")}</span>` : ""}${s.revision ? `<span class="con-falla" title="Necesita revisión">${ic("i-revision")}</span>` : ""}</span>
    <span class="etiqueta-nombre">${esc(s.nombre)}</span>
  </button>`;
}

function htmlSinInventario() {
  if (EXCEL_ACTIVO && !E.excelEstado.conectado) {
    return `<div class="vacio"><h3>Conecta el Excel del inventario</h3>
      <p>Los equipos, sus IDs y sus cuartos salen del Excel del inventario. Entra con tu cuenta del Tec para cargarlo.</p>
      <div class="fila-botones"><button type="button" class="boton-chico boton-chico-primario" data-accion="excel-conectar">Conectar cuenta del Tec</button></div></div>`;
  }
  if (EXCEL_ACTIVO && E.leyendoCatalogo) return '<div class="cargando"><span class="girando"></span>Leyendo el inventario del Excel…</div>';
  if (EXCEL_ACTIVO && E.errorCatalogo) {
    return `<div class="vacio"><h3>No se pudo leer el inventario</h3><p>${esc(mensajeExcel(E.errorCatalogo))}</p>
      <div class="fila-botones"><button type="button" class="boton-chico boton-chico-primario" data-accion="excel-leer">Intentar de nuevo</button></div></div>`;
  }
  return `<div class="vacio"><h3>Falta conectar el Excel del inventario</h3>
    <p>Los equipos salen del Excel del inventario. Para conectarlo hay que llenar <b>bitacora.microsoft</b> y los enlaces de <b>bitacora.excel</b> en <code>js/config.js</code> (pasos en el README).</p>
    <p>Mientras, puedes probar la página con un inventario de ejemplo.</p>
    <div class="fila-botones"><button type="button" class="boton-chico boton-chico-primario" data-accion="ejemplo">Probar con un inventario de ejemplo</button></div></div>`;
}

function pintarPlano() {
  const el = $("#plano");
  if (!E.listo) { el.style.display = "block"; el.innerHTML = '<div class="cargando"><span class="girando"></span>Cargando el plano…</div>'; return; }
  if (!E.catalogo.length) { el.style.display = "block"; el.innerHTML = htmlSinInventario(); return; }
  el.style.display = "";
  const lista = E.sims.filter(enPlano);
  if (!lista.length) { el.style.display = "block"; el.innerHTML = '<div class="vacio"><h3>No hay simuladores en el inventario</h3><p>Revisa la regla <b>bitacora.enPlano</b> en js/config.js. Los demás equipos están en la pestaña Inventario.</p></div>'; return; }
  const { porZona, sinUbicar } = L.repartirPorZona(lista, E.zonas);
  let h = L.ordenarZonas(E.zonas).map((z) => {
    const aqui = porZona.get(z.id) || [];
    return `<article class="zona t-${esc(z.tamano || "m")}" data-zona="${esc(z.id)}" style="--z:${colorDe(z)}">
      <header class="zona-banda"><span class="zona-nombre">${esc(z.nombre)}</span><span class="zona-n" title="Simuladores aquí">${aqui.length}</span></header>
      <div class="zona-cuerpo">${aqui.length ? aqui.map((s) => etiqueta(s, z)).join("") : '<span class="zona-vacia">Sin simuladores aquí</span>'}</div>
    </article>`;
  }).join("");
  if (sinUbicar.length) {
    h += `<article class="zona sin-zona t-m"><header class="zona-banda"><span class="zona-nombre">Sin cuarto en el Excel</span><span class="zona-n">${sinUbicar.length}</span></header>
      <div class="zona-cuerpo">${sinUbicar.map((s) => etiqueta(s, null)).join("")}</div></article>`;
  }
  el.innerHTML = h;
}

function pintarInventario() {
  const base = E.todoInventario ? E.sims : E.sims.filter(enPlano);
  $("#inv-n").textContent = base.length;
  const nPlano = E.sims.filter(enPlano).length;
  const cats = [...new Set(base.map((s) => s.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  if (E.categoria && !cats.includes(E.categoria)) E.categoria = "";
  $("#alcance").innerHTML = `<button type="button" class="chip" data-alcance="plano" aria-pressed="${!E.todoInventario}">Simuladores (${nPlano})</button><button type="button" class="chip" data-alcance="todo" aria-pressed="${E.todoInventario}">Todo el inventario (${E.sims.length})</button>`;
  $("#categorias").innerHTML = cats.length > 1
    ? `<button type="button" class="chip" data-categoria="" aria-pressed="${!E.categoria}">Todas</button>` + cats.map((c) => `<button type="button" class="chip" data-categoria="${esc(c)}" aria-pressed="${E.categoria === c}">${esc(c)}</button>`).join("")
    : "";
  const el = $("#inventario");
  if (!E.listo) { el.innerHTML = '<div class="cargando"><span class="girando"></span>Cargando…</div>'; return; }
  if (!E.catalogo.length) { el.innerHTML = htmlSinInventario(); return; }
  const lista = base.filter((s) => L.coincide(s, E.qInv) && (!E.categoria || s.categoria === E.categoria))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "es", { numeric: true }));
  if (!lista.length) { el.innerHTML = '<p class="muted">Ningún equipo coincide con la búsqueda.</p>'; return; }
  el.innerHTML = `<div class="tabla">
    <div class="fila fila-titulos" aria-hidden="true"><span>ID</span><span>Equipo</span><span>Estado</span><span>Dónde está</span><span>NFC</span></div>
    ${lista.map((s) => {
      const lugar = L.estaFuera(s) ? `Con ${esc(s.responsable || "alguien")} · ${esc(L.duracionTexto(ahora() - (s.desde || ahora())))}` : `${zonaChip(zona(s.zonaId))}${s.caja ? ` <span class="pequeno">· ${esc(s.caja)}</span>` : ""}`;
      const nfc = s.tarjeta || s.enlaceGrabado;
      return `<button type="button" class="fila" data-sim="${esc(s.id)}">
        <span><span class="codigo">${esc(s.id)}</span></span>
        <span class="fila-nombre"><b>${esc(s.nombre)}</b><span>${esc(s.categoria || "Sin categoría")}${s.estadoGeneral ? " · " + esc(s.estadoGeneral) : ""}</span></span>
        <span>${pildora(s)}${s.revision ? ' <span class="pildora p-revision">Revisión</span>' : ""}</span>
        <span class="fila-lugar">${lugar}</span>
        <span class="fila-nfc ${nfc ? "si" : ""}" title="${nfc ? "Tiene tarjeta" : "Sin tarjeta"}">${ic("i-nfc")}<span class="oculto">${nfc ? "Tiene tarjeta" : "Sin tarjeta"}</span></span>
      </button>`;
    }).join("")}
  </div>`;
}

function pintarHistorial() {
  $$("#tipos .chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.tipo === E.tipo));
  const el = $("#historial");
  if (!E.historialListo) { el.innerHTML = '<div class="cargando"><span class="girando"></span>Cargando historial…</div>'; return; }
  const todos = L.filtrarMovimientos(E.movs, { tipo: E.tipo, texto: E.qHist });
  if (!todos.length) {
    el.innerHTML = E.movs.length ? '<p class="muted">Ningún movimiento coincide con el filtro.</p>'
      : '<div class="vacio"><h3>Aún no hay movimientos</h3><p>Cada salida, regreso, cambio de lugar o verificación queda anotada aquí con la hora y quién la registró.</p></div>';
    return;
  }
  let h = L.agruparPorDia(todos.slice(0, E.mostrar)).map((g) => `<section class="dia">
    <h3 class="dia-titulo">${esc(nombreDia(g.dia))}<span class="cuenta">${g.movimientos.length}</span></h3>
    <div class="tabla">${g.movimientos.map((m) => `<div class="mov">
        <span class="mov-icono k-${esc(m.tipo)}" title="${esc(L.TIPOS_MOVIMIENTO[m.tipo] || "")}">${ic(ICONO_MOV[m.tipo] || "i-reubicacion")}</span>
        <div class="mov-titulo"><span class="hora">${esc(L.horaTexto(m.t))}</span><span class="codigo">${esc(m.codigo)}</span>${esc(m.sim)}</div>
        <div class="mov-detalle">${esc(L.TIPOS_MOVIMIENTO[m.tipo] || "")} · ${esc(L.describirMovimiento(m))}${m.por ? ` · <span class="por">registró ${esc(m.por)}</span>` : ""} ${marcaExcel(m)}</div>
      </div>`).join("")}</div></section>`).join("");
  if (todos.length > E.mostrar) h += '<div class="mas"><button type="button" class="boton-chico" data-accion="mostrar-mas">Mostrar más</button></div>';
  else if (E.hayMas) h += '<div class="mas"><button type="button" class="boton-chico" data-accion="mas-historial">Cargar movimientos anteriores</button></div>';
  el.innerHTML = h;
}

function htmlExcelAjustes() {
  if (!EXCEL_ACTIVO) {
    return `<p>El Excel todavía no está conectado. Hay que registrar la app en Microsoft Entra y llenar <b>bitacora.microsoft</b> y los enlaces de <b>bitacora.excel</b> en <code>js/config.js</code>. Los pasos están en el README.</p>
      <p>Mientras, la bitácora guarda todo y lo pasará al Excel cuando se conecte.</p>`;
  }
  const x = E.excelEstado;
  const pend = E.pendientes.length;
  const errores = E.pendientes.filter((m) => m.excel.estado === "error");
  let h = "";
  if (x.error && x.error.codigo !== "cancelado") h += `<p class="error">${esc(mensajeExcel(x.error))}</p>`;
  if (!x.conectado) {
    h += `<p>Entra con tu cuenta del Tec para leer el inventario y escribir los movimientos en el Excel.</p>
      <div><button type="button" class="boton-chico boton-chico-primario" data-accion="excel-conectar">Conectar cuenta del Tec</button></div>`;
  } else {
    h += `<p>Conectado como <b>${esc(x.cuenta.nombre)}</b> (${esc(x.cuenta.correo)}).</p>`;
    h += `<p>${E.catalogo.length && !E.catalogoEjemplo ? `Inventario: <b>${E.catalogo.length} equipos</b>, leído ${esc(fechaHora(E.catalogoLeido))}${E.catalogoPor ? " por " + esc(E.catalogoPor) : ""}.` : "Todavía no se ha leído el inventario."}</p>`;
    h += `<div class="fila-botones">
      <button type="button" class="boton-chico" data-accion="excel-leer" ${E.leyendoCatalogo ? "disabled" : ""}>${E.leyendoCatalogo ? "Leyendo…" : "Actualizar inventario desde el Excel"}</button>
      <button type="button" class="boton-chico" data-accion="excel-desconectar">Desconectar</button>
    </div>`;
  }
  h += `<p>${pend ? `<b>${pend} ${pend === 1 ? "cambio" : "cambios"} por pasar al Excel</b>${errores.length ? ` (${errores.length} con error)` : ""}.` : "Todos los movimientos ya están en el Excel."}</p>`;
  if (pend && x.conectado) h += `<div><button type="button" class="boton-chico boton-chico-primario" data-accion="excel-sincronizar" ${E.sincronizando ? "disabled" : ""}>${E.sincronizando ? "Pasando…" : "Pasar al Excel ahora"}</button></div>`;
  if (errores.length) h += `<ul class="errores-excel">${errores.slice(0, 5).map((m) => `<li><span class="codigo">${esc(m.codigo)}</span> ${esc(L.TIPOS_MOVIMIENTO[m.tipo] || "")}: ${esc(m.excel.mensaje || "")}</li>`).join("")}</ul>`;
  return h;
}

function pintarAjustes() {
  const panel = $("#v-ajustes");
  if (panel.contains(document.activeElement) && document.activeElement.matches("input, select, textarea")) { E.ajustesPendiente = true; return; }
  E.ajustesPendiente = false;
  const zs = L.ordenarZonas(E.zonas);
  const conEquipos = new Set(E.sims.map((s) => s.zonaId));
  const filas = zs.map((z, i) => `<div class="zona-ed" data-zona="${esc(z.id)}" style="--z:${colorDe(z)}">
      <button type="button" class="color" data-accion="paleta" data-id="${esc(z.id)}" aria-label="Color de ${esc(z.nombre)}"></button>
      <span class="zona-ed-nombre"><input value="${esc(z.nombre)}" data-campo-zona="nombre" maxlength="${L.LIMITES.zona}" aria-label="Nombre en la página"><span class="pequeno">En el Excel: ${esc(z.id)}</span></span>
      <span class="herramientas">
        <select data-campo-zona="tamano" aria-label="Tamaño en el plano">${Object.entries(TAMANOS).map(([k, v]) => `<option value="${k}" ${(z.tamano || "m") === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <button type="button" class="icono-btn" data-accion="zona-subir" data-id="${esc(z.id)}" aria-label="Subir" ${i === 0 ? "disabled" : ""}>${ic("i-subir")}</button>
        <button type="button" class="icono-btn" data-accion="zona-bajar" data-id="${esc(z.id)}" aria-label="Bajar" ${i === zs.length - 1 ? "disabled" : ""}>${ic("i-bajar")}</button>
        <button type="button" class="icono-btn" data-accion="zona-tarjeta" data-id="${esc(z.id)}" aria-label="Tarjeta NFC del cuarto" title="${z.tarjeta ? "Tarjeta " + esc(z.tarjeta) : "Vincular tarjeta del cuarto"}" style="${z.tarjeta ? "color:var(--color-primario)" : ""}">${ic("i-nfc")}</button>
        <button type="button" class="icono-btn" data-accion="zona-borrar" data-id="${esc(z.id)}" aria-label="Quitar cuarto" data-confirmar="¿Quitar? Toca otra vez" ${conEquipos.has(z.id) ? 'disabled title="Tiene equipos: no se puede quitar"' : ""}>${ic("i-borrar")}</button>
      </span>
      ${E.paleta === z.id ? `<div class="paleta">${COLORES.map((c, ci) => `<button type="button" data-accion="color" data-id="${esc(z.id)}" data-color="${ci}" style="--z:${c.c}" aria-label="${c.n}" aria-pressed="${z.color === ci}"></button>`).join("")}</div>` : ""}
    </div>`).join("");
  const nfcEstado = hayWebNfc()
    ? `<p><b>Lector NFC de este celular:</b> ${E.nfcActivo ? "encendido." : "apagado."}</p>${E.nfcActivo ? "" : '<div><button type="button" class="boton-chico" data-accion="encender-nfc">Encender lector NFC</button></div>'}`
    : "<p>Este navegador no puede leer NFC directo. Usa un lector USB, o un celular Android con Chrome.</p>";
  const sesion = E.almacen && E.almacen.modo === "firebase"
    ? `<p>Bitácora: entraste como <b>${esc(E.usuario ? E.usuario.correo : "")}</b>.</p><div><button type="button" class="boton-chico" data-accion="salir">Cerrar sesión</button></div>`
    : "<p>Modo demostración: la bitácora se queda en este navegador. Conecta Firebase para compartirla (ver README).</p>";
  $("#ajustes").innerHTML = `<div class="tarjetas">
    <section>
      <h3>Excel del inventario</h3>
      ${htmlExcelAjustes()}
    </section>
    <section>
      <h3>Cuartos</h3>
      <p>Salen de la columna de cuarto del inventario. Aquí solo cambias cómo se ven en el plano.</p>
      <div class="zonas-ed">${filas || '<p class="muted">Aún no hay cuartos.</p>'}</div>
      <form id="f-cuarto" class="en-linea" novalidate><label class="oculto" for="c-nuevo">Cuarto nuevo</label><input id="c-nuevo" maxlength="${L.LIMITES.zona}" placeholder="Cuarto nuevo (como se escribirá en el Excel)" autocomplete="off"><button type="submit" class="boton-chico">${ic("i-mas")}Agregar</button></form>
    </section>
    <section>
      <h3>Tarjetas NFC</h3>
      <div class="guia">
        <div><h4>${ic("i-nfc")}Celular Android</h4><p>Con Chrome, esta página lee las tarjetas directo y también puede grabarlas (ficha del equipo → Tarjeta NFC).</p></div>
        <div><h4>${ic("i-nfc")}iPhone</h4><p>Acerca el iPhone a una tarjeta grabada con el enlace del equipo: se abre su ficha. Para grabar tarjetas desde iPhone usa una app como NFC Tools.</p></div>
        <div><h4>${ic("i-nfc")}Computadora</h4><p>Con un lector USB que escriba como teclado (modo HID). Con la página abierta, pasa la tarjeta.</p></div>
        <div><h4>${ic("i-verificar")}Verificación</h4><p>En «${hayWebNfc() ? "Leer tarjeta" : "Leer tarjeta"}» elige <b>Verificar</b>: cada tarjeta que leas abre directo el formulario de verificación.</p></div>
        <div><h4>${ic("i-pin")}Tarjetas de cuarto <span class="pequeno">(opcional)</span></h4><p>Pega una tarjeta en cada cuarto y vincúlala con el botón NFC. Al regresar un equipo, leerla elige el cuarto.</p></div>
        ${nfcEstado}
      </div>
    </section>
    <section>
      <h3>Datos</h3>
      <p>Las alertas se encienden después de ${HORAS_ALERTA} horas fuera (se cambia en js/config.js).</p>
      <div class="fila-botones">
        <button type="button" class="boton-chico" data-accion="csv">${ic("i-descargar")}Descargar historial (CSV)</button>
        ${E.catalogoEjemplo ? `<button type="button" class="boton-chico boton-chico-peligro" data-accion="borrar-ejemplo" data-confirmar="¿Quitar el ejemplo? Toca otra vez">${ic("i-borrar")}Quitar inventario de ejemplo</button>` : ""}
      </div>
    </section>
    <section><h3>Sesión</h3>${sesion}</section>
  </div>`;
}

function pintarListas() {
  const recientes = (k) => [...new Set(E.movs.map((m) => m[k]).filter(Boolean))].slice(0, 40);
  const poner = (id, arr) => {
    const h = arr.map((v) => `<option value="${esc(v)}"></option>`).join("");
    const el = $("#" + id);
    if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
  };
  poner("dl-responsables", recientes("responsable"));
  poner("dl-destinos", recientes("destino"));
}

// ---------- Hojas ----------
function abrirHoja(html, estado) {
  E.hoja = estado;
  E.capturar = null;
  const d = $("#hoja");
  $("#hoja-in").innerHTML = html;
  if (!d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
  d.scrollTop = 0;
}
function cerrarHoja() {
  const d = $("#hoja");
  if (d.open) d.close();
  E.hoja = null;
  E.capturar = null;
}
const botonCerrar = () => `<button type="button" class="icono-btn hoja-cerrar" data-accion="cerrar" aria-label="Cerrar">${ic("i-cerrar")}</button>`;

function selectorZonas(elegida, habitual) {
  if (!E.zonas.length) return '<p class="muted">Aún no hay cuartos. Agrégalos en Ajustes.</p>';
  return `<div class="zonas-elegir" role="group" aria-label="Cuartos">${L.ordenarZonas(E.zonas).map((z) => `<button type="button" class="zona-op" data-elegir-zona="${esc(z.id)}" aria-pressed="${z.id === elegida}" style="--z:${colorDe(z)}"><span class="muestra"></span><span class="zona-op-t">${esc(z.nombre)}${z.id === habitual ? "<small>donde estaba</small>" : ""}</span>${ic("i-ok", "marca-ok")}</button>`).join("")}</div>`;
}

const firma = (s) => [s.estado, s.actualizado, s.revision, s.tarjeta, s.enlaceGrabado, s.nombre, s.zonaId, s.estadoGeneral].join("|");

function htmlSimulador(s, leida) {
  const z = zona(s.zonaId);
  const tarde = L.enAlerta(s, ahora(), HORAS_ALERTA);
  const zonasConTarjeta = E.zonas.some((x) => x.tarjeta);
  let h = `<header class="hoja-cabeza">
    <div class="hoja-ids"><span class="codigo">${esc(s.id)}</span>${pildora(s)}${leida ? `<span class="leida">${ic("i-nfc")}Tarjeta leída</span>` : ""}</div>
    <h2 id="hoja-titulo">${esc(s.nombre)}</h2>
    <p>${esc(s.categoria || "Sin categoría")}${s.marca ? " · " + esc(s.marca) : ""}${s.ejemplo ? ' · <span class="ej">ejemplo</span>' : ""}</p>
    ${botonCerrar()}
  </header>`;
  if (!s.enCatalogo) h += `<div class="avisito">${ic("i-info")}<div class="avisito-cuerpo"><p>Este equipo ya no aparece en el Excel del inventario. Regístralo de regreso y revisa el Excel.</p></div></div>`;
  if (s.revision) {
    h += `<div class="avisito revision">${ic("i-revision")}<div class="avisito-cuerpo"><p><b>Necesita revisión:</b> ${esc(s.revision)}</p><div><button type="button" class="boton-chico" data-accion="resolver" data-id="${esc(s.id)}">${ic("i-ok")}Marcar como resuelto</button></div></div></div>`;
  }
  if (L.estaFuera(s)) {
    h += `<div class="estado ${tarde ? "e-alerta" : "e-uso"}">
      <div class="estado-fila"><span>Lo tiene</span><span>${esc(s.responsable || "—")}</span></div>
      ${s.destino ? `<div class="estado-fila"><span>Para</span><span>${esc(s.destino)}</span></div>` : ""}
      <div class="estado-fila"><span>Salió</span><span>${esc(fechaHora(s.desde))} · <span class="tiempo" data-desde="${Number(s.desde) || ahora()}">hace ${esc(L.duracionTexto(ahora() - (s.desde || ahora())))}</span></span></div>
      ${z ? `<div class="estado-fila"><span>Salió de</span><span>${zonaChip(z)}</span></div>` : ""}
    </div>
    <form class="accion" id="f-regreso" novalidate>
      <h3>Registrar regreso</h3>
      <div class="campo"><p class="pregunta">¿En qué cuarto lo dejas?</p>${selectorZonas(E.hoja && E.hoja.zonaElegida, s.zonaId)}<p class="error" data-err="zonaId" hidden></p>
        ${zonasConTarjeta ? '<p class="pequeno">También puedes leer la tarjeta NFC del cuarto.</p>' : ""}</div>
      <label class="opcion"><input type="checkbox" id="r-revision"> Necesita revisión o reparación</label>
      <div class="campo" id="r-nota-campo" hidden><label for="r-nota">¿Qué le pasa?</label><textarea id="r-nota" maxlength="${L.LIMITES.nota}" placeholder="Ej. La batería no carga, falta una pieza"></textarea><p class="error" data-err="nota" hidden></p></div>
      <p class="error" data-err="general" hidden></p>
      <button class="boton boton-primario" type="submit">${ic("i-regreso")}Registrar regreso</button>
    </form>`;
  } else {
    h += `<div class="estado e-ok"><div class="estado-fila"><span>Está en</span><span>${zonaChip(z)}${s.caja ? ` · caja ${esc(s.caja)}` : ""}</span></div></div>
    <form class="accion" id="f-salida" novalidate>
      <h3>Registrar salida</h3>
      <div class="campo"><label for="s-responsable">¿Quién lo lleva?</label><input id="s-responsable" list="dl-responsables" maxlength="${L.LIMITES.responsable}" autocomplete="off" placeholder="Nombre de la persona o grupo responsable" value="${esc(guardado.leer("responsable", ""))}"><p class="error" data-err="responsable" hidden></p></div>
      <div class="campo"><label for="s-destino">¿Para qué o a dónde? <span class="pequeno">(opcional)</span></label><input id="s-destino" list="dl-destinos" maxlength="${L.LIMITES.destino}" autocomplete="off" placeholder="Ej. Práctica de RCP, Aula 4"><p class="error" data-err="destino" hidden></p></div>
      <p class="error" data-err="general" hidden></p>
      <button class="boton boton-primario" type="submit">${ic("i-salida")}Registrar salida</button>
    </form>
    <details class="otra-accion" id="d-mover"><summary>${ic("i-reubicacion")}Cambiarlo de cuarto sin sacarlo</summary>
      <div class="campo">${selectorZonas(E.hoja && E.hoja.zonaElegida, s.zonaId)}<p class="error" data-err="zonaId" hidden></p></div>
      <button type="button" class="boton boton-secundario" data-accion="mover" data-id="${esc(s.id)}">${ic("i-pin")}Mover al cuarto elegido</button>
    </details>`;
  }
  h += `<div><button type="button" class="boton boton-secundario" data-accion="verificar" data-id="${esc(s.id)}">${ic("i-verificar")}Verificar este equipo</button></div>`;
  const tarjeta = [s.enlaceGrabado && "Enlace grabado", s.tarjeta && `Número ${s.tarjeta}`].filter(Boolean).join(" · ") || "Sin tarjeta";
  const ultima = s.ultimaVerificacion ? `${fechaHora(s.ultimaVerificacion.t)}${s.ultimaVerificacion.resultado ? " · " + s.ultimaVerificacion.resultado : ""}` : "—";
  h += `<section class="seccion"><h3>Ficha</h3>
    <dl class="datos">
      <dt>Estado general</dt><dd>${esc(s.estadoGeneral || "—")}</dd>
      <dt>Caja</dt><dd>${esc(s.caja || "—")}</dd>
      <dt>Última verificación</dt><dd>${esc(ultima)}</dd>
      ${s.notas ? `<dt>Notas</dt><dd>${esc(s.notas)}</dd>` : ""}
      <dt>Tarjeta NFC</dt><dd>${esc(tarjeta)}</dd>
      ${s.fila ? `<dt>En el Excel</dt><dd>Fila ${esc(s.fila)}</dd>` : ""}
    </dl>
    <div class="fila-botones"><button type="button" class="boton-chico" data-accion="tarjeta" data-id="${esc(s.id)}">${ic("i-nfc")}Tarjeta NFC</button></div>
  </section>`;
  const movs = E.movs.filter((m) => m.simId === s.id).slice(0, 6);
  h += `<section class="seccion"><h3>Movimientos recientes</h3>${movs.length ? `<ul class="mini">${movs.map((m) => `<li><span class="mov-icono k-${esc(m.tipo)}">${ic(ICONO_MOV[m.tipo] || "i-reubicacion")}</span><div><small>${esc(fechaHora(m.t))}${m.por ? " · registró " + esc(m.por) : ""} ${marcaExcel(m)}</small>${esc(L.TIPOS_MOVIMIENTO[m.tipo] || "")} · ${esc(L.describirMovimiento(m))}</div></li>`).join("")}</ul>` : '<p class="muted">Sin movimientos todavía.</p>'}</section>`;
  return h;
}

function abrirSimulador(id, { leida = false } = {}) {
  const s = sim(id);
  if (!s) return;
  abrirHoja("", { tipo: "sim", id, estado: s.estado, firma: firma(s), zonaElegida: L.estaFuera(s) ? (zona(s.zonaId) ? s.zonaId : null) : null, leida });
  $("#hoja-in").innerHTML = htmlSimulador(s, leida);
}

// Si otra persona cambia el equipo mientras la ficha está abierta, se actualiza sin perder lo escrito.
function refrescarHoja() {
  const h = E.hoja;
  if (!h || h.tipo !== "sim") return;
  const s = sim(h.id);
  if (!s) { cerrarHoja(); mensaje("Ese equipo ya no está en el inventario.", "malo"); return; }
  if (firma(s) === h.firma) return;
  const cambioEstado = s.estado !== h.estado;
  const escrito = {};
  $$("#hoja-in input, #hoja-in textarea").forEach((el) => { if (el.id) escrito[el.id] = el.type === "checkbox" ? el.checked : el.value; });
  const moverAbierto = $("#d-mover") && $("#d-mover").open;
  if (cambioEstado) { h.zonaElegida = L.estaFuera(s) && zona(s.zonaId) ? s.zonaId : null; mensaje("Alguien más acaba de actualizar este equipo."); }
  h.estado = s.estado;
  h.firma = firma(s);
  $("#hoja-in").innerHTML = htmlSimulador(s, h.leida);
  if (!cambioEstado) {
    for (const [k, v] of Object.entries(escrito)) { const el = document.getElementById(k); if (el) { if (el.type === "checkbox") el.checked = v; else el.value = v; } }
    if ($("#r-revision") && $("#r-revision").checked) $("#r-nota-campo").hidden = false;
    if (moverAbierto && $("#d-mover")) $("#d-mover").open = true;
  }
}

function elegirZona(id) {
  if (!E.hoja) return;
  E.hoja.zonaElegida = id;
  $$("#hoja-in [data-elegir-zona]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.elegirZona === id));
}

// ----- Verificación -----
const opcionesVerif = () => ({
  estadoGeneral: (B.excel.inventario.estadosGenerales || []),
  estadoFisico: B.excel.verificacion.opciones.estadoFisico,
  funciona: B.excel.verificacion.opciones.funciona,
  resultado: B.excel.verificacion.opciones.resultado,
});
const radios = (nombre, opciones, actual) => `<div class="radios" role="radiogroup">${opciones.map((o) => `<label class="radio"><input type="radio" name="${nombre}" value="${esc(o)}" ${o === actual ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</div>`;

function htmlVerificar(s, previo, cargando) {
  const op = opcionesVerif();
  const p = previo || {};
  const inv = p.inventario || {};
  const conHoja = CON_HOJA_VERIF && p.enHojaVerificacion !== false;
  const nMaterial = Math.max(p.materiales || 0, (inv.material || []).length, 1);
  const sug = L.sugerenciaVerificacion(inv.estadoGeneral || s.estadoGeneral, B.excel.verificacion.sugerencias);
  let h = `<header class="hoja-cabeza">
    <div class="hoja-ids"><span class="codigo">${esc(s.id)}</span><span class="pildora p-revision">Verificación</span>${E.hoja && E.hoja.leida ? `<span class="leida">${ic("i-nfc")}Tarjeta leída</span>` : ""}</div>
    <h2 id="hoja-titulo">${esc(s.nombre)}</h2>
    <p>${zona(s.zonaId) ? esc(zona(s.zonaId).nombre) : "Sin cuarto"}${s.caja ? " · caja " + esc(s.caja) : ""}</p>
    ${botonCerrar()}
  </header>`;
  if (cargando) h += '<div class="cargando"><span class="girando"></span>Leyendo lo que hay hoy en el Excel…</div>';
  else if (!EXCEL_ACTIVO) h += `<div class="avisito">${ic("i-info")}<div class="avisito-cuerpo"><p>El Excel no está conectado: la verificación se guarda en la bitácora y se pasará al Excel cuando se conecte.</p></div></div>`;
  else if (!E.excelEstado.conectado) h += `<div class="avisito">${ic("i-info")}<div class="avisito-cuerpo"><p>Conecta tu cuenta del Tec para ver lo que hay hoy en el Excel. Igual puedes guardar: se pasará después.</p><div><button type="button" class="boton-chico" data-accion="excel-conectar">Conectar cuenta del Tec</button></div></div></div>`;
  else if (p.error) h += `<div class="avisito error">${ic("i-alerta")}<div class="avisito-cuerpo"><p>${esc(mensajeExcel(p.error))}</p></div></div>`;
  if (CON_HOJA_VERIF && p.enHojaVerificacion === false) h += `<div class="avisito">${ic("i-info")}<div class="avisito-cuerpo"><p>Este equipo no está en la hoja de Verificación (o le falta su ID en la columna de ID). Solo se actualizará el inventario.</p></div></div>`;
  h += `<form class="accion" id="f-verificar" novalidate>
    <div class="campo"><p class="pregunta">Estado general</p>${radios("v-estado", op.estadoGeneral, inv.estadoGeneral || s.estadoGeneral)}<p class="error" data-err="estadoGeneral" hidden></p></div>
    ${conHoja ? `
    <div class="campo"><p class="pregunta">Estado físico</p>${radios("v-fisico", op.estadoFisico, "")}<p class="error" data-err="estadoFisico" hidden></p></div>
    <div class="campo"><p class="pregunta">¿Funciona?</p>${radios("v-funciona", op.funciona, sug.funciona || "")}<p class="error" data-err="funciona" hidden></p></div>
    <div class="campo"><label for="v-ajustes">Ajustes <span class="pequeno">(opcional)</span></label><input id="v-ajustes" maxlength="${L.LIMITES.nota}" autocomplete="off" placeholder="Qué se ajustó o reparó"><p class="error" data-err="ajustes" hidden></p></div>
    <div class="campo"><p class="pregunta">Resultado</p>${radios("v-resultado", op.resultado, sug.resultado || "")}<p class="error" data-err="resultado" hidden></p></div>` : ""}
    <div class="campo"><label for="v-piezas"># piezas dañadas <span class="pequeno">(opcional)</span></label><input id="v-piezas" inputmode="numeric" maxlength="3" value="${esc(inv.piezasDanadas || "")}" autocomplete="off"><p class="error" data-err="piezasDanadas" hidden></p></div>
    <fieldset class="campo"><legend>Material que falta <span class="pequeno">(opcional)</span></legend>
      ${Array.from({ length: nMaterial }, (_, i) => `<input id="v-material-${i}" class="material" maxlength="${L.LIMITES.material}" value="${esc((inv.material || [])[i] || "")}" autocomplete="off" aria-label="Material que falta ${i + 1}" placeholder="${i === 0 ? "Ej. Membrana" : ""}"><p class="error" data-err="material${i}" hidden></p>`).join("")}
    </fieldset>
    <div class="campo"><label for="v-comentarios">Comentarios <span class="pequeno">(opcional)</span></label><textarea id="v-comentarios" maxlength="${L.LIMITES.nota}" placeholder="Ej. Bolsa rota"></textarea><p class="error" data-err="comentarios" hidden></p>
      ${inv.notas ? `<p class="pequeno">Notas actuales en el inventario: ${esc(inv.notas)}</p>` : ""}</div>
    <p class="error" data-err="general" hidden></p>
    <button class="boton boton-primario" type="submit" ${cargando ? "disabled" : ""}>${ic("i-verificar")}Guardar verificación</button>
  </form>`;
  return h;
}

async function abrirVerificar(id, { leida = false } = {}) {
  const s = sim(id);
  if (!s) return;
  abrirHoja(htmlVerificar(s, null, Boolean(E.excel && E.excelEstado.conectado)), { tipo: "verificar", id, leida, previo: null, tocados: {} });
  if (!E.excel || !E.excelEstado.conectado) return;
  let previo;
  try { previo = await E.excel.leerParaVerificar(id); }
  catch (e) { console.error(e); previo = { error: e }; }
  if (!E.hoja || E.hoja.tipo !== "verificar" || E.hoja.id !== id) return;
  E.hoja.previo = previo;
  $("#hoja-in").innerHTML = htmlVerificar(s, previo, false);
}

async function enviarVerificacion() {
  const s = sim(E.hoja.id);
  if (!s) return;
  const valor = (n) => { const r = $(`#hoja-in input[name="${n}"]:checked`); return r ? r.value : ""; };
  const previo = E.hoja.previo || {};
  const conHoja = CON_HOJA_VERIF && previo.enHojaVerificacion !== false;
  const d = {
    estadoGeneral: valor("v-estado"),
    estadoFisico: conHoja ? valor("v-fisico") : "",
    funciona: conHoja ? valor("v-funciona") : "",
    resultado: conHoja ? valor("v-resultado") : "",
    ajustes: conHoja ? $("#v-ajustes").value : "",
    piezasDanadas: $("#v-piezas").value,
    material: $$("#hoja-in input.material").map((i) => i.value),
    comentarios: $("#v-comentarios").value,
  };
  const v = L.validarVerificacion(d, { ...opcionesVerif(), conHojaVerificacion: conHoja });
  if (!v.ok) { mostrarErrores(v.errores); return; }
  const datos = L.datosVerificacion(s, d, E.zonas, ahora(), usuarioActual());
  if (await registrar(s, datos, null, `Verificación guardada: ${s.nombre}`)) cerrarHoja();
}

// ----- Leer tarjeta -----
function abrirLeer() {
  const android = hayWebNfc();
  const verif = E.modoLectura === "verificar";
  abrirHoja(`<header class="hoja-cabeza"><h2 id="hoja-titulo" class="oculto">Leer tarjeta</h2>${botonCerrar()}</header>
    <div class="modo" role="group" aria-label="Al leer una tarjeta">
      <button type="button" data-modo="ficha" aria-pressed="${!verif}">${ic("i-plano")}Préstamo</button>
      <button type="button" data-modo="verificar" aria-pressed="${verif}">${ic("i-verificar")}Verificar</button>
    </div>
    <div class="lector"><div class="onda">${ic("i-nfc")}</div>
      <h2>${android ? "Acerca la tarjeta al celular" : "Pasa la tarjeta por el lector"}</h2>
      <p>${verif ? "Cada tarjeta que leas abre el formulario de verificación de ese equipo." : android ? "Pon la tarjeta en la parte de atrás del celular. Se abrirá la ficha del equipo." : "Con un lector USB, pasa la tarjeta y se abrirá la ficha del equipo. En iPhone, acerca el teléfono a la tarjeta con la pantalla desbloqueada."}</p>
    </div>
    <form id="f-codigo" class="campo" novalidate>
      <label for="c-codigo">O escribe el ID del equipo</label>
      <div class="en-linea"><input id="c-codigo" autocomplete="off" autocapitalize="characters" placeholder="EQ-347"><button class="boton-chico boton-chico-primario" type="submit">Buscar</button></div>
    </form>`, { tipo: "leer" });
  if (android && !E.nfcActivo) encenderNfc(true);
}

function cambiarModo(m) {
  E.modoLectura = m === "verificar" ? "verificar" : "ficha";
  guardado.poner("modoLectura", E.modoLectura);
  pintarModo();
  if (E.hoja && E.hoja.tipo === "leer") abrirLeer();
}

async function encenderNfc(conToque) {
  if (!hayWebNfc() || E.nfcActivo) return;
  try {
    await leerConWebNfc(alLeerTarjeta, (t) => mensaje(t, "malo"));
    E.nfcActivo = true;
    document.body.classList.add("nfc-activo");
    pintarAjustesSiVisible();
  } catch (e) {
    if (conToque) mensaje(e && e.name === "NotAllowedError" ? "Permite el uso de NFC para leer tarjetas." : "No se pudo encender el NFC. Revisa que esté activado en el celular.", "malo");
  }
}

// ----- Tarjeta NFC de un equipo -----
function abrirTarjeta(id) {
  const s = sim(id);
  if (!s) return;
  const url = L.urlTarjeta(B.urlSitio, s.id);
  abrirHoja(`<header class="hoja-cabeza"><div class="hoja-ids"><span class="codigo">${esc(s.id)}</span></div><h2 id="hoja-titulo">Tarjeta NFC de ${esc(s.nombre)}</h2>${botonCerrar()}</header>
    <div class="metodo">
      <h3>${ic("i-nfc")}Grabar el enlace en la tarjeta</h3>
      <p>Así cualquier celular (iPhone o Android) que toque la tarjeta abre la ficha de este equipo.</p>
      ${hayWebNfc()
        ? `<button type="button" class="boton boton-primario" data-accion="grabar" data-id="${esc(s.id)}">${ic("i-nfc")}Grabar ahora</button><p class="pequeno">Toca el botón y acerca la tarjeta al celular.</p>`
        : `<ol><li>Abre una app para grabar NFC, por ejemplo NFC Tools.</li><li>Elige <b>Escribir → Agregar registro → URL</b> y pega este enlace:</li></ol>
           <div class="enlace-caja"><code id="enlace-tarjeta">${esc(url)}</code><button type="button" class="boton-chico" data-accion="copiar" data-texto="${esc(url)}">${ic("i-copiar")}Copiar</button></div>
           ${s.enlaceGrabado ? "" : `<div><button type="button" class="boton-chico" data-accion="ya-grabada" data-id="${esc(s.id)}">${ic("i-ok")}Ya grabé la tarjeta</button></div>`}`}
      ${s.enlaceGrabado ? '<p><span class="pildora p-ok">Enlace grabado</span></p>' : ""}
    </div>
    <div class="metodo">
      <h3>${ic("i-nfc")}Guardar el número de la tarjeta</h3>
      <p>${s.tarjeta ? `Número guardado: <span class="codigo">${esc(s.tarjeta)}</span>. Lee otra tarjeta para cambiarlo.` : "Sirve para lectores USB y para tarjetas que no tienen enlace."}</p>
      <div class="escuchando"><div class="onda chica">${ic("i-nfc")}</div><span>${hayWebNfc() ? "Acerca la tarjeta al celular…" : "Pasa la tarjeta por el lector…"}</span></div>
      <form id="f-numero" class="en-linea" novalidate><label class="oculto" for="n-numero">Número de la tarjeta</label><input id="n-numero" autocomplete="off" placeholder="O escribe el número"><button class="boton-chico" type="submit">Guardar</button></form>
      ${s.tarjeta ? `<div><button type="button" class="boton-chico boton-chico-peligro" data-accion="quitar-numero" data-id="${esc(s.id)}">Quitar número</button></div>` : ""}
    </div>`, { tipo: "tarjeta", id });
  E.capturar = (lectura) => guardarNumero(id, lectura);
  if (hayWebNfc() && !E.nfcActivo) encenderNfc(false);
}

async function guardarNumero(id, lectura) {
  const s = sim(id);
  const numero = L.normalizarTarjeta(lectura.serie || (lectura.textos || [])[0]);
  if (!s || !numero) return;
  const v = L.validarTarjeta(numero, E.sims, E.zonas, id);
  if (!v.ok) { mensaje(v.errores.tarjeta, "malo"); E.capturar = (l) => guardarNumero(id, l); return; }
  if (await guardar(() => E.almacen.guardarEstado(id, { tarjeta: numero, nombre: s.nombre }), `Tarjeta guardada para ${s.nombre}`)) { pitido(); abrirSimulador(id); }
}

function htmlListaDesconocida(q) {
  const libres = E.sims.filter((s) => !s.tarjeta && (q ? L.coincide(s, q) : enPlano(s)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "es", { numeric: true })).slice(0, 60);
  return libres.length ? libres.map((s) => `<button type="button" class="elegir" data-accion="vincular-sim" data-id="${esc(s.id)}">${esc(s.nombre)}<span class="codigo">${esc(s.id)}</span></button>`).join("")
    : '<p class="muted">Ningún equipo sin tarjeta coincide.</p>';
}

function abrirDesconocida(numero) {
  abrirHoja(`<header class="hoja-cabeza"><div class="hoja-ids"><span class="leida">${ic("i-nfc")}Tarjeta leída</span></div><h2 id="hoja-titulo">Tarjeta nueva</h2><p>Número <span class="codigo">${esc(numero)}</span></p>${botonCerrar()}</header>
    <div class="accion">
      <p class="pregunta">¿De qué equipo es?</p>
      <label class="buscar"><span class="oculto">Buscar equipo</span>${ic("i-buscar")}<input id="q-desconocida" type="search" placeholder="Nombre o ID (EQ-347)" autocomplete="off"></label>
      <div class="elegir-lista" id="lista-desconocida">${htmlListaDesconocida("")}</div>
      <p class="pequeno">¿No aparece? Primero dalo de alta en el Excel del inventario y actualiza el inventario en Ajustes.</p>
    </div>
    ${E.zonas.length ? `<details class="otra-accion"><summary>${ic("i-pin")}Es la tarjeta de un cuarto</summary><div class="elegir-lista">${L.ordenarZonas(E.zonas).map((z) => `<button type="button" class="elegir" data-accion="vincular-zona" data-id="${esc(z.id)}">${zonaChip(z)}${z.tarjeta ? '<span class="pequeno">ya tiene tarjeta</span>' : ""}</button>`).join("")}</div></details>` : ""}`,
  { tipo: "desconocida", numero });
}

function abrirTarjetaZona(zid) {
  const z = zona(zid);
  if (!z) return;
  abrirHoja(`<header class="hoja-cabeza"><h2 id="hoja-titulo">Tarjeta del cuarto</h2><p>${zonaChip(z)}</p>${botonCerrar()}</header>
    <div class="lector"><div class="onda">${ic("i-nfc")}</div><h2>${hayWebNfc() ? "Acerca la tarjeta del cuarto" : "Pasa la tarjeta del cuarto por el lector"}</h2>
      <p>${z.tarjeta ? `Número actual: <span class="codigo">${esc(z.tarjeta)}</span>` : "Al regresar un equipo, leer esta tarjeta elegirá el cuarto."}</p></div>
    <form id="f-numero-zona" class="en-linea" novalidate><label class="oculto" for="z-numero">Número de la tarjeta</label><input id="z-numero" autocomplete="off" placeholder="O escribe el número"><button class="boton-chico" type="submit">Guardar</button></form>
    ${z.tarjeta ? `<div><button type="button" class="boton-chico boton-chico-peligro" data-accion="quitar-numero-zona" data-id="${esc(z.id)}">Quitar tarjeta</button></div>` : ""}`, { tipo: "tarjeta-zona", id: zid });
  E.capturar = (lectura) => guardarNumeroZona(zid, lectura);
  if (hayWebNfc() && !E.nfcActivo) encenderNfc(false);
}

async function guardarNumeroZona(zid, lectura) {
  const z = zona(zid);
  const numero = L.normalizarTarjeta(lectura.serie || (lectura.textos || [])[0]);
  if (!z || !numero) return;
  const v = L.validarTarjeta(numero, E.sims, E.zonas, zid);
  if (!v.ok) { mensaje(v.errores.tarjeta, "malo"); E.capturar = (l) => guardarNumeroZona(zid, l); return; }
  if (await guardar(() => E.almacen.guardarZona(zid, { tarjeta: numero }), `Tarjeta guardada para ${z.nombre}`)) { pitido(); cerrarHoja(); }
}

// ---------- Lecturas de tarjetas ----------
function alLeerTarjeta(lectura) {
  if (E.grabando) return;
  if (!E.usuario) return;
  if (E.capturar) { const f = E.capturar; E.capturar = null; f(lectura); return; }
  if (!E.listo) { mensaje("Todavía se están cargando los datos.", "malo"); return; }
  const r = L.interpretarLectura(lectura, E.sims, E.zonas);
  pitido();
  if (r.tipo === "zona" && E.hoja && E.hoja.tipo === "sim" && $("#hoja-in [data-elegir-zona]")) {
    elegirZona(r.item.id);
    if ($("#d-mover")) $("#d-mover").open = true;
    mensaje(`Cuarto elegido: ${r.item.nombre}`);
    return;
  }
  if (r.tipo === "simulador") {
    if (E.modoLectura === "verificar") abrirVerificar(r.item.id, { leida: true });
    else abrirSimulador(r.item.id, { leida: true });
    return;
  }
  if (r.tipo === "zona") {
    cerrarHoja();
    irA("plano");
    requestAnimationFrame(() => {
      const el = document.querySelector(`.zona[data-zona="${CSS.escape(r.item.id)}"]`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("destello"); void el.offsetWidth; el.classList.add("destello"); }
    });
    mensaje(`Cuarto: ${r.item.nombre}`);
    return;
  }
  abrirDesconocida(r.tarjeta);
}

// La tarjeta graba ".../simuladores/#EQ-347": al abrir ese enlace, se abre la ficha (o la verificación).
let ultimoEnlace = null;
function revisarEnlace() {
  let h = "";
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { /* enlace raro */ }
  if (!h || h === ultimoEnlace || !E.listo || !E.catalogo.length) return;
  ultimoEnlace = h;
  const cod = L.normalizarTarjeta(L.codigoDeLectura(h));
  const s = E.sims.find((x) => L.normalizarTarjeta(x.id) === cod);
  if (s) { if (E.modoLectura === "verificar") abrirVerificar(s.id, { leida: true }); else abrirSimulador(s.id, { leida: true }); }
  else mensaje(`No encontré el equipo ${h} en el inventario.`, "malo");
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* sin historial */ }
  ultimoEnlace = null;
}

// ---------- Acciones ----------
function irA(v) {
  if (!VISTAS.includes(v)) return;
  E.vista = v;
  guardado.poner("vista", v);
  pintar();
  window.scrollTo({ top: 0 });
}

async function registrar(s, datos, requiere, textoBien) {
  const ok = await guardar(async () => { E.mios.add(await E.almacen.registrar(s.id, datos.simulador, datos.movimiento, requiere)); }, textoBien);
  if (ok) programarSincronizacion();
  return ok;
}

async function enviarSalida() {
  const s = sim(E.hoja.id);
  const d = { responsable: $("#s-responsable").value, destino: $("#s-destino").value };
  const v = L.validarSalida(d, s);
  if (!v.ok) { mostrarErrores(v.errores); return; }
  const datos = L.datosSalida(s, d, E.zonas, ahora(), usuarioActual());
  if (await registrar(s, datos, "disponible", `Salida registrada: ${s.nombre}`)) { guardado.poner("responsable", datos.simulador.responsable); cerrarHoja(); }
}

async function enviarRegreso() {
  const s = sim(E.hoja.id);
  const d = { zonaId: E.hoja.zonaElegida, revision: $("#r-revision").checked, nota: $("#r-nota").value };
  const v = L.validarRegreso(d, s, E.zonas);
  if (!v.ok) { mostrarErrores(v.errores); return; }
  const datos = L.datosRegreso(s, d, E.zonas, ahora(), usuarioActual());
  if (await registrar(s, datos, "en_uso", `Regreso registrado en ${datos.movimiento.zona || "Sin cuarto"}`)) cerrarHoja();
}

async function moverDeLugar(id) {
  const s = sim(id);
  const destino = E.hoja && E.hoja.zonaElegida;
  if (!destino) { mostrarErrores({ zonaId: "Elige el cuarto a donde lo mueves." }); return; }
  if (destino === s.zonaId) { mensaje("Ya está en ese cuarto."); return; }
  const datos = L.datosCambioLugar(s, destino, E.zonas, ahora(), usuarioActual());
  if (await registrar(s, datos, "disponible", `Movido a ${datos.movimiento.zona}`)) cerrarHoja();
}

async function nuevoCuarto() {
  const i = $("#c-nuevo");
  const nombre = i.value.trim();
  const v = L.validarZona({ nombre }, E.zonas);
  if (!v.ok) { mensaje(v.errores.nombre, "malo"); i.focus(); return; }
  const orden = E.zonas.reduce((m, z) => Math.max(m, Number.isFinite(z.orden) && z.orden < 1000 ? z.orden : 0), 0) + 1;
  if (await guardar(() => E.almacen.guardarZona(nombre, { nombre, orden, tamano: "m" }), `Cuarto agregado: ${nombre}`)) i.value = "";
}

function descargarCsv() {
  const movs = L.filtrarMovimientos(E.movs, { tipo: E.tipo, texto: E.qHist });
  if (!movs.length) { mensaje("Todavía no hay movimientos para descargar.", "malo"); return; }
  const blob = new Blob([L.csvMovimientos(movs)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bitacora-simuladores-${L.claveDia(ahora())}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); mensaje("Enlace copiado"); }
  catch {
    const c = $("#enlace-tarjeta");
    if (c) { const r = document.createRange(); r.selectNodeContents(c); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    mensaje("Selecciona el enlace y cópialo.", "malo");
  }
}

async function grabar(id) {
  const s = sim(id);
  if (!s) return;
  E.grabando = true;
  mensaje("Acerca la tarjeta al celular para grabarla…");
  try {
    await grabarEnlace(L.urlTarjeta(B.urlSitio, s.id));
    pitido();
    await guardar(() => E.almacen.guardarEstado(id, { enlaceGrabado: true, nombre: s.nombre }), "Tarjeta grabada");
    abrirTarjeta(id);
  } catch (e) {
    mensaje(e && e.name === "AbortError" ? "No se acercó ninguna tarjeta. Inténtalo otra vez." : "No se pudo grabar la tarjeta. Revisa que no esté bloqueada.", "malo");
  } finally {
    setTimeout(() => { E.grabando = false; }, 800);
  }
}

async function conectarExcel() {
  if (!E.excel) { mensaje(EXCEL_ACTIVO ? "No se pudo cargar el inicio de sesión de Microsoft." : "Falta configurar el Excel en js/config.js (ver README).", "malo"); return; }
  try { await E.excel.conectar(); mensaje("Cuenta del Tec conectada."); }
  catch (e) { if (e.codigo !== "cancelado") mensaje(mensajeExcel(e), "malo"); }
}

async function alAccion(b) {
  const accion = b.dataset.accion;
  const id = b.dataset.id;
  switch (accion) {
    case "leer": abrirLeer(); break;
    case "cerrar": cerrarHoja(); break;
    case "tarjeta": abrirTarjeta(id); break;
    case "verificar": abrirVerificar(id); break;
    case "grabar": grabar(id); break;
    case "copiar": copiar(b.dataset.texto); break;
    case "ya-grabada": { const s = sim(id); if (await guardar(() => E.almacen.guardarEstado(id, { enlaceGrabado: true, nombre: s && s.nombre }), "Listo")) abrirTarjeta(id); break; }
    case "quitar-numero": if (await guardar(() => E.almacen.guardarEstado(id, { tarjeta: null }), "Número quitado")) abrirTarjeta(id); break;
    case "resolver": { const s = sim(id); if (s) await registrar(s, L.datosRevisionResuelta(s, ahora(), usuarioActual()), null, "Revisión marcada como resuelta"); break; }
    case "mover": moverDeLugar(id); break;
    case "vincular-sim": { const n = E.hoja && E.hoja.numero; if (n) await guardarNumero(id, { serie: n }); break; }
    case "vincular-zona": { const n = E.hoja && E.hoja.numero; if (n) await guardarNumeroZona(id, { serie: n }); break; }
    case "ejemplo": b.disabled = true; await guardar(() => E.almacen.cargarEjemplo(), "Inventario de ejemplo listo. Toca un simulador para probar."); b.disabled = false; break;
    case "borrar-ejemplo": if (confirmado(b)) await guardar(() => E.almacen.borrarEjemplo(E.estados), "Inventario de ejemplo quitado"); break;
    case "zona-subir": case "zona-bajar": { const c = L.moverZona(E.zonas, id, accion === "zona-subir" ? -1 : 1); if (c.length) await guardar(() => E.almacen.ordenarZonas(c)); break; }
    case "zona-tarjeta": abrirTarjetaZona(id); break;
    case "quitar-numero-zona": if (await guardar(() => E.almacen.guardarZona(id, { tarjeta: null }), "Tarjeta quitada")) cerrarHoja(); break;
    case "zona-borrar": if (confirmado(b)) { const z = zona(id); await guardar(() => E.almacen.borrarZona(id), `Cuarto quitado: ${z ? z.nombre : ""}`); } break;
    case "paleta": E.paleta = E.paleta === id ? null : id; pintarAjustes(); break;
    case "color": E.paleta = null; await guardar(() => E.almacen.guardarZona(id, { color: Number(b.dataset.color) })); pintarAjustes(); break;
    case "mostrar-mas": E.mostrar += 100; pintarHistorial(); break;
    case "mas-historial": E.almacen.masHistorial(); break;
    case "csv": descargarCsv(); break;
    case "encender-nfc": encenderNfc(true); break;
    case "salir": cerrarHoja(); await E.almacen.salir(); break;
    case "recuperar": recuperarClave(); break;
    case "excel-conectar": conectarExcel(); break;
    case "excel-desconectar": if (E.excel) await E.excel.desconectar(); break;
    case "excel-leer": revisarCatalogo("manual"); break;
    case "excel-sincronizar": sincronizarExcel(true); break;
  }
}

async function entrar() {
  const correo = $("#e-correo").value.trim();
  const clave = $("#e-clave").value;
  const err = $("#e-error");
  err.hidden = true;
  if (!correo || !clave) { err.textContent = "Escribe tu correo y tu contraseña."; err.hidden = false; return; }
  const b = $("#f-entrar button[type=submit]");
  b.disabled = true;
  try { await E.almacen.entrar(correo, clave); $("#e-clave").value = ""; }
  catch (e) { err.textContent = mensajeDeError(e); err.hidden = false; }
  finally { b.disabled = false; }
}

async function recuperarClave() {
  const correo = $("#e-correo").value.trim();
  const err = $("#e-error");
  if (!correo) { err.textContent = "Escribe tu correo arriba y vuelve a tocar «Olvidé mi contraseña»."; err.hidden = false; $("#e-correo").focus(); return; }
  try { await E.almacen.recuperar(correo); mensaje("Si el correo tiene cuenta, te llegará un enlace para cambiar la contraseña."); }
  catch (e) { err.textContent = mensajeDeError(e); err.hidden = false; }
}

function enlazarEventos() {
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    const vista = t.closest("[data-vista]");
    if (vista) { irA(vista.dataset.vista); return; }
    const modo = t.closest("[data-modo]");
    if (modo) { cambiarModo(modo.dataset.modo); return; }
    const z = t.closest("[data-elegir-zona]");
    if (z) { elegirZona(z.dataset.elegirZona); return; }
    const tipo = t.closest("[data-tipo]");
    if (tipo) { E.tipo = tipo.dataset.tipo; E.mostrar = 100; pintarHistorial(); return; }
    const alc = t.closest("[data-alcance]");
    if (alc) { E.todoInventario = alc.dataset.alcance === "todo"; E.categoria = ""; pintarInventario(); return; }
    const cat = t.closest("[data-categoria]");
    if (cat) { E.categoria = cat.dataset.categoria; pintarInventario(); return; }
    const a = t.closest("[data-accion]");
    if (a) { alAccion(a); return; }
    const s = t.closest("[data-sim]");
    if (s) abrirSimulador(s.dataset.sim);
  });

  const hoja = $("#hoja");
  hoja.addEventListener("click", (ev) => { if (ev.target === hoja) cerrarHoja(); });
  hoja.addEventListener("close", () => {
    E.hoja = null; E.capturar = null;
    const m = $("#mensaje");
    if (m.parentElement !== document.body) document.body.appendChild(m);
  });

  document.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === "f-entrar") entrar();
    else if (f.id === "f-salida") enviarSalida();
    else if (f.id === "f-regreso") enviarRegreso();
    else if (f.id === "f-verificar") enviarVerificacion();
    else if (f.id === "f-cuarto") nuevoCuarto();
    else if (f.id === "f-codigo") { const v = $("#c-codigo").value; $("#c-codigo").value = ""; if (v.trim()) alLeerTarjeta({ serie: v, textos: [v] }); }
    else if (f.id === "f-numero") { const v = $("#n-numero").value; if (v.trim()) guardarNumero(E.hoja.id, { serie: v }); }
    else if (f.id === "f-numero-zona") { const v = $("#z-numero").value; if (v.trim()) guardarNumeroZona(E.hoja.id, { serie: v }); }
  });

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.id === "r-revision") { $("#r-nota-campo").hidden = !t.checked; if (t.checked) $("#r-nota").focus(); return; }
    if (t.name === "v-funciona" || t.name === "v-resultado") { if (E.hoja) E.hoja.tocados[t.name] = true; return; }
    if (t.name === "v-estado" && E.hoja && E.hoja.tipo === "verificar") {
      // Propone Funciona y Resultado según el Estado general, sin pisar lo que ya eligió la persona.
      const sug = L.sugerenciaVerificacion(t.value, B.excel.verificacion.sugerencias);
      for (const [campo, nombre] of [["funciona", "v-funciona"], ["resultado", "v-resultado"]]) {
        if (!sug[campo] || E.hoja.tocados[nombre]) continue;
        const r = $(`#hoja-in input[name="${nombre}"][value="${CSS.escape(sug[campo])}"]`);
        if (r) r.checked = true;
      }
      return;
    }
    const campo = t.dataset && t.dataset.campoZona;
    if (!campo) return;
    const fila = t.closest("[data-zona]");
    const z = fila && zona(fila.dataset.zona);
    if (!z) return;
    const valor = campo === "nombre" ? t.value.trim() : t.value;
    if (z[campo] === valor) return;
    if (campo === "nombre" && !valor) { t.value = z.nombre; return; }
    guardar(() => E.almacen.guardarZona(z.id, { [campo]: valor }));
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id === "q-desconocida") $("#lista-desconocida").innerHTML = htmlListaDesconocida(ev.target.value.trim());
  });
  $("#v-ajustes").addEventListener("focusout", () => setTimeout(() => { if (E.ajustesPendiente && E.vista === "ajustes") pintarAjustes(); }, 0));

  $("#q-plano").addEventListener("input", (e) => { E.qPlano = e.target.value.trim(); pintarPlano(); });
  $("#q-inv").addEventListener("input", (e) => { E.qInv = e.target.value.trim(); pintarInventario(); });
  $("#q-hist").addEventListener("input", (e) => { E.qHist = e.target.value.trim(); E.mostrar = 100; pintarHistorial(); });
  window.addEventListener("hashchange", revisarEnlace);
  // Al volver a la página (por ejemplo, después de la ventana de Microsoft), intenta pasar lo pendiente.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") programarSincronizacion(); });
}

iniciar();
