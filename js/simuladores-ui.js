// Bitácora de simuladores: todo lo que toca la pantalla.
// Reglas y cálculos: simuladores-logica.js · Datos: simuladores-datos.js · Tarjetas: simuladores-nfc.js
import { CONFIG } from "./config.js";
import * as L from "./simuladores-logica.js";
import { crearAlmacen, mensajeDeError } from "./simuladores-datos.js";
import { hayWebNfc, permisoNfc, leerConWebNfc, grabarEnlace, escucharLectorUsb } from "./simuladores-nfc.js";

const HORAS_ALERTA = Number(CONFIG.bitacora.horasAlerta) || 4;
const COLORES = [
  { n: "Azul", c: "#2f62c9" }, { n: "Turquesa", c: "#0f7c7b" }, { n: "Verde", c: "#3b852a" }, { n: "Mostaza", c: "#8a6700" },
  { n: "Naranja", c: "#bd5a10" }, { n: "Rojo", c: "#b5382e" }, { n: "Magenta", c: "#9e3b8a" }, { n: "Violeta", c: "#5f4bbe" }, { n: "Gris", c: "#4a5653" },
];
const TAMANOS = { s: "Chica", m: "Mediana", l: "Grande" };
const VISTAS = ["plano", "inventario", "historial", "ajustes"];
const ICONO_MOV = { salida: "i-salida", regreso: "i-regreso", reubicacion: "i-reubicacion", revision: "i-revision" };

const E = {
  almacen: null, usuario: null, zonas: [], sims: [], movs: [], listo: false, historialListo: false, hayMas: false, error: null,
  vista: "plano", qPlano: "", qInv: "", categoria: "", tipo: "todos", qHist: "", mostrar: 100,
  hoja: null, capturar: null, ultimoHash: null, ocupado: false, paleta: null, ajustesPendiente: false,
  nfcActivo: false, grabando: false,
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
const colorDe = (z) => (COLORES[z && Number.isInteger(z.color) ? z.color : 8] || COLORES[8]).c;
const zonaChip = (z) => (z ? `<span class="zona-chip" style="--z:${colorDe(z)}">${esc(z.nombre)}</span>` : '<span class="zona-chip" style="--z:#8a97a8">Sin ubicar</span>');
const ahora = () => Date.now();
const zonasOrdenadas = () => L.ordenarZonas(E.zonas);
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
const quienRegistro = (correo) => {
  if (!correo || correo === "demo") return "";
  if (E.usuario && correo === E.usuario.correo) return "tú";
  return correo.split("@")[0];
};
function pildora(s) {
  if (L.estaFuera(s)) return L.enAlerta(s, ahora(), HORAS_ALERTA) ? '<span class="pildora p-alerta">Fuera mucho tiempo</span>' : '<span class="pildora p-uso">En uso</span>';
  return '<span class="pildora p-ok">Disponible</span>';
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
  relojMensaje = setTimeout(() => { m.hidden = true; }, tipo === "malo" ? 5500 : 3000);
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
  enlazarEventos();
  escucharLectorUsb(alLeerTarjeta);
  setInterval(tic, 30000);
  pintar();
  try {
    E.almacen = await crearAlmacen({ alCambiar, alSesion });
  } catch (e) {
    console.error(e);
    $("#avisos").innerHTML = `<div class="avisito error">${ic("i-alerta")}<div class="avisito-cuerpo"><p><b>No se pudo cargar la bitácora.</b> Revisa la conexión a internet y vuelve a abrir la página.</p></div></div>`;
    return;
  }
  if (hayWebNfc() && (await permisoNfc()) === "granted") encenderNfc(false);
}

function alSesion(u) {
  E.usuario = u;
  if (!u) { E.listo = false; cerrarHoja(); }
  pintar();
}

function alCambiar(d) {
  Object.assign(E, { zonas: d.zonas, sims: d.sims, movs: d.movs, listo: d.listo, historialListo: d.historialListo, hayMas: d.hayMas, error: d.error });
  pintar();
  refrescarHoja();
  revisarEnlace();
}

function tic() {
  if (!E.listo) return;
  pintarResumen();
  pintarFuera();
  $$(".tiempo[data-desde]").forEach((el) => { el.textContent = "hace " + L.duracionTexto(ahora() - Number(el.dataset.desde)); });
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

function pintarAvisos() {
  let h = "";
  if (!E.almacen) h = '<div class="cargando"><span class="girando"></span>Abriendo la bitácora…</div>';
  if (E.almacen && E.almacen.modo === "demo") {
    h += `<div class="avisito demo">${ic("i-info")}<div class="avisito-cuerpo"><p><b>Modo demostración.</b> Los datos se guardan solo en este navegador. Para que todo el personal vea lo mismo, conecta Firebase (instrucciones en el README).</p></div></div>`;
  }
  if (E.error && E.usuario) {
    h += `<div class="avisito error">${ic("i-alerta")}<div class="avisito-cuerpo"><p>${esc(mensajeDeError(E.error))}</p></div></div>`;
  }
  const a = $("#avisos");
  if (a.dataset.h !== h) { a.innerHTML = h; a.dataset.h = h; }
}

function pintarResumen() {
  const r = L.resumen(E.sims, ahora(), HORAS_ALERTA);
  const n = (v) => (E.listo ? v : "–");
  const dato = (clase, num, nombre, sub) => `<div class="dato ${clase} ${num === 0 ? "cero" : ""}"><span class="dato-num">${n(num)}</span><span class="dato-nombre">${nombre}</span><span class="dato-sub">${sub}</span></div>`;
  $("#resumen").innerHTML =
    dato("d-ok", r.disponibles, "Disponibles", r.total ? `de ${r.total} simuladores` : "sin simuladores aún") +
    dato("d-uso", r.enUso, "En uso", r.enUso ? "fuera de su zona" : "ninguno fuera") +
    dato(`d-alerta ${r.alerta ? "activo" : ""}`, r.alerta, `Más de ${HORAS_ALERTA} h fuera`, r.alerta ? "confirma si ya regresaron" : "sin retrasos") +
    dato("d-revision", r.revision, "En revisión", r.revision ? "reportados con falla" : "todo en orden");
}

function pintarFuera() {
  const { fuera } = L.repartirPorZona(E.sims, E.zonas);
  $("#fuera-n").textContent = fuera.length;
  let h;
  if (!E.listo) h = '<div class="cargando"><span class="girando"></span>Cargando…</div>';
  else if (!fuera.length) h = `<div class="todo-en-lugar">${ic("i-ok")}Todos los simuladores están en su lugar.</div>`;
  else h = fuera.map((s) => {
    const tarde = L.enAlerta(s, ahora(), HORAS_ALERTA);
    return `<button type="button" class="salida-tarjeta ${tarde ? "tarde" : ""}" data-sim="${esc(s.id)}">
      <span class="salida-arriba"><span class="codigo">${esc(s.codigo)}</span><span class="salida-tiempo">${ic("i-reloj")}${esc(L.duracionTexto(ahora() - (s.desde || ahora())))}</span></span>
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
    <span class="etiqueta-cod"><span class="punto"></span>${esc(s.codigo)}${s.tarjeta || s.enlaceGrabado ? `<span class="con-nfc" title="Tiene tarjeta NFC">${ic("i-nfc")}</span>` : ""}${s.revision ? `<span class="con-falla" title="Necesita revisión">${ic("i-revision")}</span>` : ""}</span>
    <span class="etiqueta-nombre">${esc(s.nombre)}</span>
  </button>`;
}

function pintarPlano() {
  const el = $("#plano");
  if (!E.listo) { el.style.display = "block"; el.innerHTML = '<div class="cargando"><span class="girando"></span>Cargando el plano…</div>'; return; }
  if (!E.zonas.length && !E.sims.length) {
    el.style.display = "block";
    el.innerHTML = `<div class="vacio">
      <h3>Arma el plano del centro</h3>
      <p>Aquí verás cada sala con sus simuladores y quién se llevó cuál. Para empezar:</p>
      <ol class="pasos">
        <li><span><b>Crea las zonas</b> del centro (salas, quirófano, almacén) en Ajustes.</span></li>
        <li><span><b>Registra los simuladores</b> y la zona donde se guardan.</span></li>
        <li><span><b>Vincula una tarjeta NFC</b> a cada simulador.</span></li>
      </ol>
      <div class="fila-botones">
        <button type="button" class="boton-chico boton-chico-primario" data-accion="ejemplo">Cargar un centro de ejemplo</button>
        <button type="button" class="boton-chico" data-vista="ajustes">Empezar desde cero</button>
      </div>
      <p class="pequeno">El ejemplo crea 6 zonas y 9 simuladores marcados como «ejemplo». Se borran desde Ajustes.</p>
    </div>`;
    return;
  }
  el.style.display = "";
  const { porZona, sinUbicar } = L.repartirPorZona(E.sims, E.zonas);
  let h = zonasOrdenadas().map((z) => {
    const aqui = porZona.get(z.id) || [];
    return `<article class="zona t-${esc(z.tamano || "m")}" data-zona="${esc(z.id)}" style="--z:${colorDe(z)}">
      <header class="zona-banda"><span class="zona-nombre">${esc(z.nombre)}</span><span class="zona-n" title="Simuladores aquí">${aqui.length}</span></header>
      <div class="zona-cuerpo">${aqui.length ? aqui.map((s) => etiqueta(s, z)).join("") : '<span class="zona-vacia">Sin simuladores aquí</span>'}</div>
    </article>`;
  }).join("");
  if (sinUbicar.length) {
    h += `<article class="zona sin-zona t-m"><header class="zona-banda"><span class="zona-nombre">Sin ubicar</span><span class="zona-n">${sinUbicar.length}</span></header>
      <div class="zona-cuerpo">${sinUbicar.map((s) => etiqueta(s, null)).join("")}</div></article>`;
  }
  el.innerHTML = h;
}

function pintarInventario() {
  $("#inv-n").textContent = E.sims.length;
  const cats = [...new Set(E.sims.map((s) => s.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  if (E.categoria && !cats.includes(E.categoria)) E.categoria = "";
  $("#categorias").innerHTML = cats.length > 1
    ? `<button type="button" class="chip" data-categoria="" aria-pressed="${!E.categoria}">Todas</button>` + cats.map((c) => `<button type="button" class="chip" data-categoria="${esc(c)}" aria-pressed="${E.categoria === c}">${esc(c)}</button>`).join("")
    : "";
  const el = $("#inventario");
  if (!E.listo) { el.innerHTML = '<div class="cargando"><span class="girando"></span>Cargando…</div>'; return; }
  if (!E.sims.length) {
    el.innerHTML = `<div class="vacio"><h3>Todavía no hay simuladores</h3><p>Registra cada simulador con su nombre, un código corto y la zona donde se guarda. Después vincúlale una tarjeta NFC.</p><button type="button" class="boton-chico boton-chico-primario" data-accion="nuevo">${ic("i-mas")}Registrar el primero</button></div>`;
    return;
  }
  const lista = E.sims.filter((s) => L.coincide(s, E.qInv) && (!E.categoria || s.categoria === E.categoria))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  if (!lista.length) { el.innerHTML = '<p class="muted">Ningún simulador coincide con la búsqueda.</p>'; return; }
  el.innerHTML = `<div class="tabla">
    <div class="fila fila-titulos" aria-hidden="true"><span>Código</span><span>Simulador</span><span>Estado</span><span>Dónde está</span><span>NFC</span></div>
    ${lista.map((s) => {
      const lugar = L.estaFuera(s) ? `Con ${esc(s.responsable || "alguien")} · ${esc(L.duracionTexto(ahora() - (s.desde || ahora())))}` : zonaChip(zona(s.zonaId));
      const nfc = s.tarjeta || s.enlaceGrabado;
      return `<button type="button" class="fila" data-sim="${esc(s.id)}">
        <span><span class="codigo">${esc(s.codigo)}</span></span>
        <span class="fila-nombre"><b>${esc(s.nombre)}</b><span>${esc(s.categoria || "Sin categoría")}${s.ejemplo ? ' · <span class="ej">ejemplo</span>' : ""}</span></span>
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
      : '<div class="vacio"><h3>Aún no hay movimientos</h3><p>Cada vez que alguien se lleve, regrese o cambie de lugar un simulador, quedará anotado aquí con la hora y quién lo registró.</p></div>';
    return;
  }
  let h = L.agruparPorDia(todos.slice(0, E.mostrar)).map((g) => `<section class="dia">
    <h3 class="dia-titulo">${esc(nombreDia(g.dia))}<span class="cuenta">${g.movimientos.length}</span></h3>
    <div class="tabla">${g.movimientos.map((m) => {
      const por = quienRegistro(m.por);
      return `<div class="mov">
        <span class="mov-icono k-${esc(m.tipo)}" title="${esc(L.TIPOS_MOVIMIENTO[m.tipo] || "")}">${ic(ICONO_MOV[m.tipo] || "i-reubicacion")}</span>
        <div class="mov-titulo"><span class="hora">${esc(L.horaTexto(m.t))}</span><span class="codigo">${esc(m.codigo)}</span>${esc(m.sim)}</div>
        <div class="mov-detalle">${esc(L.TIPOS_MOVIMIENTO[m.tipo] || "")} · ${esc(L.describirMovimiento(m))}${por ? ` · <span class="por">registró ${esc(por)}</span>` : ""}</div>
      </div>`;
    }).join("")}</div></section>`).join("");
  if (todos.length > E.mostrar) h += '<div class="mas"><button type="button" class="boton-chico" data-accion="mostrar-mas">Mostrar más</button></div>';
  else if (E.hayMas) h += '<div class="mas"><button type="button" class="boton-chico" data-accion="mas-historial">Cargar movimientos anteriores</button></div>';
  el.innerHTML = h;
}

function pintarAjustes() {
  const panel = $("#v-ajustes");
  if (panel.contains(document.activeElement) && document.activeElement.matches("input, select, textarea")) { E.ajustesPendiente = true; return; }
  E.ajustesPendiente = false;
  const zs = zonasOrdenadas();
  const hayEjemplo = E.sims.some((s) => s.ejemplo) || E.zonas.some((z) => z.ejemplo);
  const filas = zs.map((z, i) => `<div class="zona-ed" data-zona="${esc(z.id)}" style="--z:${colorDe(z)}">
      <button type="button" class="color" data-accion="paleta" data-id="${esc(z.id)}" aria-label="Color de ${esc(z.nombre)}"></button>
      <input value="${esc(z.nombre)}" data-campo-zona="nombre" maxlength="${L.LIMITES.zona}" aria-label="Nombre de la zona">
      <span class="herramientas">
        <select data-campo-zona="tamano" aria-label="Tamaño en el plano">${Object.entries(TAMANOS).map(([k, v]) => `<option value="${k}" ${(z.tamano || "m") === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <button type="button" class="icono-btn" data-accion="zona-subir" data-id="${esc(z.id)}" aria-label="Subir" ${i === 0 ? "disabled" : ""}>${ic("i-subir")}</button>
        <button type="button" class="icono-btn" data-accion="zona-bajar" data-id="${esc(z.id)}" aria-label="Bajar" ${i === zs.length - 1 ? "disabled" : ""}>${ic("i-bajar")}</button>
        <button type="button" class="icono-btn" data-accion="zona-tarjeta" data-id="${esc(z.id)}" aria-label="Tarjeta NFC de la zona" title="${z.tarjeta ? "Tarjeta " + esc(z.tarjeta) : "Vincular tarjeta de zona"}" style="${z.tarjeta ? "color:var(--color-primario)" : ""}">${ic("i-nfc")}</button>
        <button type="button" class="icono-btn" data-accion="zona-borrar" data-id="${esc(z.id)}" aria-label="Borrar zona" data-confirmar="¿Borrar? Toca otra vez">${ic("i-borrar")}</button>
      </span>
      ${E.paleta === z.id ? `<div class="paleta">${COLORES.map((c, ci) => `<button type="button" data-accion="color" data-id="${esc(z.id)}" data-color="${ci}" style="--z:${c.c}" aria-label="${c.n}" aria-pressed="${(z.color ?? 8) === ci}"></button>`).join("")}</div>` : ""}
    </div>`).join("");
  const nfcEstado = hayWebNfc()
    ? `<p><b>Lector NFC de este celular:</b> ${E.nfcActivo ? "encendido." : "apagado."}</p>${E.nfcActivo ? "" : '<div><button type="button" class="boton-chico" data-accion="encender-nfc">Encender lector NFC</button></div>'}`
    : "<p>Este navegador no puede leer NFC directo. Usa un lector USB, o un celular Android con Chrome.</p>";
  const sesion = E.almacen && E.almacen.modo === "firebase"
    ? `<p>Entraste como <b>${esc(E.usuario ? E.usuario.correo : "")}</b>.</p><div><button type="button" class="boton-chico" data-accion="salir">Cerrar sesión</button></div>`
    : "<p>Modo demostración: no hay cuentas y los datos se quedan en este navegador. Conecta Firebase para compartirlos (ver README).</p>";
  $("#ajustes").innerHTML = `<div class="tarjetas">
    <section>
      <h3>Zonas del centro</h3>
      <p>Cada zona aparece en el plano con su color. Ordénalas como están en el centro para que sea fácil ubicarlas.</p>
      <div class="zonas-ed">${filas || '<p class="muted">Aún no hay zonas.</p>'}</div>
      <div><button type="button" class="boton-chico" data-accion="zona-nueva">${ic("i-mas")}Agregar zona</button></div>
    </section>
    <section>
      <h3>Tarjetas NFC</h3>
      <div class="guia">
        <div><h4>${ic("i-nfc")}Celular Android</h4><p>Con Chrome, esta página lee las tarjetas directo y también puede grabarlas (ficha del simulador → Tarjeta NFC).</p></div>
        <div><h4>${ic("i-nfc")}iPhone</h4><p>Acerca el iPhone a una tarjeta grabada con el enlace del simulador: se abre su ficha. Para grabar tarjetas desde iPhone usa una app como NFC Tools.</p></div>
        <div><h4>${ic("i-nfc")}Computadora</h4><p>Con un lector USB que escriba como teclado (modo HID). Con la página abierta, pasa la tarjeta.</p></div>
        <div><h4>${ic("i-pin")}Tarjetas de zona <span class="pequeno">(opcional)</span></h4><p>Pega una tarjeta en cada sala y vincúlala con el botón NFC de la zona. Al regresar un simulador, leerla elige la zona.</p></div>
        ${nfcEstado}
      </div>
    </section>
    <section>
      <h3>Datos</h3>
      <p>Las alertas se encienden después de ${HORAS_ALERTA} horas fuera (se cambia en js/config.js).</p>
      <div class="fila-botones">
        <button type="button" class="boton-chico" data-accion="csv">${ic("i-descargar")}Descargar historial (CSV)</button>
        ${!E.zonas.length && !E.sims.length ? '<button type="button" class="boton-chico" data-accion="ejemplo">Cargar centro de ejemplo</button>' : ""}
        ${hayEjemplo ? `<button type="button" class="boton-chico boton-chico-peligro" data-accion="borrar-ejemplo" data-confirmar="¿Borrar los ejemplos? Toca otra vez">${ic("i-borrar")}Borrar datos de ejemplo</button>` : ""}
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
  poner("dl-categorias", [...new Set([...E.sims.map((s) => s.categoria).filter(Boolean), "Maniquí de alta fidelidad", "Reanimación", "Vía aérea", "Habilidades", "Obstetricia", "Pediatría", "Exploración física"])]);
}

// ---------- Hojas ----------
function abrirHoja(html, estado) {
  E.hoja = estado;
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
  if (!E.zonas.length) return '<p class="muted">Aún no hay zonas; quedará como «Sin ubicar». Créalas en Ajustes.</p>';
  return `<div class="zonas-elegir" role="group" aria-label="Zonas">${zonasOrdenadas().map((z) => `<button type="button" class="zona-op" data-elegir-zona="${esc(z.id)}" aria-pressed="${z.id === elegida}" style="--z:${colorDe(z)}"><span class="muestra"></span><span class="zona-op-t">${esc(z.nombre)}${z.id === habitual ? "<small>habitual</small>" : ""}</span>${ic("i-ok", "marca-ok")}</button>`).join("")}</div>`;
}

const firma = (s) => [s.estado, s.actualizado, s.revision, s.tarjeta, s.enlaceGrabado, s.nombre, s.codigo, s.zonaId, s.zonaBase, s.categoria].join("|");
const zonaInicial = (s) => (L.estaFuera(s) ? (zona(s.zonaBase) ? s.zonaBase : zona(s.zonaId) ? s.zonaId : null) : null);

function htmlSimulador(s, leida) {
  const z = zona(s.zonaId), base = zona(s.zonaBase);
  const tarde = L.enAlerta(s, ahora(), HORAS_ALERTA);
  const zonasConTarjeta = E.zonas.some((x) => x.tarjeta);
  let h = `<header class="hoja-cabeza">
    <div class="hoja-ids"><span class="codigo">${esc(s.codigo)}</span>${pildora(s)}${leida ? `<span class="leida">${ic("i-nfc")}Tarjeta leída</span>` : ""}</div>
    <h2 id="hoja-titulo">${esc(s.nombre)}</h2>
    <p>${esc(s.categoria || "Sin categoría")}${s.ejemplo ? ' · <span class="ej">ejemplo</span>' : ""}</p>
    ${botonCerrar()}
  </header>`;
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
      <div class="campo"><p class="pregunta">¿Dónde lo dejas?</p>${selectorZonas(E.hoja && E.hoja.zonaElegida, s.zonaBase)}<p class="error" data-err="zonaId" hidden></p>
        ${zonasConTarjeta ? '<p class="pequeno">También puedes leer la tarjeta NFC de la zona.</p>' : ""}</div>
      <label class="opcion"><input type="checkbox" id="r-revision"> Necesita revisión o reparación</label>
      <div class="campo" id="r-nota-campo" hidden><label for="r-nota">¿Qué le pasa?</label><textarea id="r-nota" maxlength="${L.LIMITES.nota}" placeholder="Ej. La batería no carga, falta una pieza"></textarea><p class="error" data-err="nota" hidden></p></div>
      <p class="error" data-err="general" hidden></p>
      <button class="boton boton-primario" type="submit">${ic("i-regreso")}Registrar regreso</button>
    </form>`;
  } else {
    h += `<div class="estado e-ok"><div class="estado-fila"><span>Está en</span><span>${zonaChip(z)}</span></div></div>
    <form class="accion" id="f-salida" novalidate>
      <h3>Registrar salida</h3>
      <div class="campo"><label for="s-responsable">¿Quién lo lleva?</label><input id="s-responsable" list="dl-responsables" maxlength="${L.LIMITES.responsable}" autocomplete="off" placeholder="Nombre de la persona o grupo responsable" value="${esc(guardado.leer("responsable", ""))}"><p class="error" data-err="responsable" hidden></p></div>
      <div class="campo"><label for="s-destino">¿Para qué o a dónde? <span class="pequeno">(opcional)</span></label><input id="s-destino" list="dl-destinos" maxlength="${L.LIMITES.destino}" autocomplete="off" placeholder="Ej. Práctica de RCP, Aula 4"><p class="error" data-err="destino" hidden></p></div>
      <p class="error" data-err="general" hidden></p>
      <button class="boton boton-primario" type="submit">${ic("i-salida")}Registrar salida</button>
    </form>
    <details class="otra-accion" id="d-mover"><summary>${ic("i-reubicacion")}Cambiarlo de lugar sin sacarlo</summary>
      <div class="campo">${selectorZonas(E.hoja && E.hoja.zonaElegida, s.zonaBase)}<p class="error" data-err="zonaId" hidden></p></div>
      <button type="button" class="boton boton-secundario" data-accion="mover" data-id="${esc(s.id)}">${ic("i-pin")}Mover a la zona elegida</button>
    </details>`;
  }
  const tarjeta = [s.enlaceGrabado && "Enlace grabado", s.tarjeta && `Número ${s.tarjeta}`].filter(Boolean).join(" · ") || "Sin tarjeta";
  h += `<section class="seccion"><h3>Ficha</h3>
    <dl class="datos"><dt>Zona habitual</dt><dd>${base ? zonaChip(base) : "No definida"}</dd><dt>Tarjeta NFC</dt><dd>${esc(tarjeta)}</dd></dl>
    <div class="fila-botones"><button type="button" class="boton-chico" data-accion="tarjeta" data-id="${esc(s.id)}">${ic("i-nfc")}Tarjeta NFC</button><button type="button" class="boton-chico" data-accion="editar" data-id="${esc(s.id)}">${ic("i-editar")}Editar</button></div>
  </section>`;
  const movs = E.movs.filter((m) => m.simId === s.id).slice(0, 6);
  h += `<section class="seccion"><h3>Movimientos recientes</h3>${movs.length ? `<ul class="mini">${movs.map((m) => `<li><span class="mov-icono k-${esc(m.tipo)}">${ic(ICONO_MOV[m.tipo] || "i-reubicacion")}</span><div><small>${esc(fechaHora(m.t))}${quienRegistro(m.por) ? " · registró " + esc(quienRegistro(m.por)) : ""}</small>${esc(L.TIPOS_MOVIMIENTO[m.tipo] || "")} · ${esc(L.describirMovimiento(m))}</div></li>`).join("")}</ul>` : '<p class="muted">Sin movimientos todavía.</p>'}</section>`;
  return h;
}

function abrirSimulador(id, { leida = false } = {}) {
  const s = sim(id);
  if (!s) return;
  abrirHoja("", { tipo: "sim", id, estado: s.estado, firma: firma(s), zonaElegida: zonaInicial(s), leida });
  $("#hoja-in").innerHTML = htmlSimulador(s, leida);
}

// Si otra persona cambia el simulador mientras la ficha está abierta, se actualiza sin perder lo escrito.
function refrescarHoja() {
  const h = E.hoja;
  if (!h || h.tipo !== "sim") return;
  const s = sim(h.id);
  if (!s) { cerrarHoja(); mensaje("Ese simulador se borró.", "malo"); return; }
  if (firma(s) === h.firma) return;
  const cambioEstado = s.estado !== h.estado;
  const escrito = {};
  $$("#hoja-in input, #hoja-in textarea").forEach((el) => { if (el.id) escrito[el.id] = el.type === "checkbox" ? el.checked : el.value; });
  const moverAbierto = $("#d-mover") && $("#d-mover").open;
  if (cambioEstado) { h.zonaElegida = zonaInicial(s); mensaje("Alguien más acaba de actualizar este simulador."); }
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

function abrirLeer() {
  const android = hayWebNfc();
  abrirHoja(`<header class="hoja-cabeza"><h2 id="hoja-titulo" class="oculto">Leer tarjeta</h2>${botonCerrar()}</header>
    <div class="lector"><div class="onda">${ic("i-nfc")}</div>
      <h2>${android ? "Acerca la tarjeta al celular" : "Pasa la tarjeta por el lector"}</h2>
      <p>${android ? "Pon la tarjeta en la parte de atrás del celular. Se abrirá la ficha del simulador." : "Con un lector USB, pasa la tarjeta y se abrirá la ficha del simulador. En iPhone, acerca el teléfono a la tarjeta con la pantalla desbloqueada."}</p>
    </div>
    <form id="f-codigo" class="campo" novalidate>
      <label for="c-codigo">O escribe el código del simulador</label>
      <div class="en-linea"><input id="c-codigo" autocomplete="off" autocapitalize="characters" placeholder="SIM-001"><button class="boton-chico boton-chico-primario" type="submit">Buscar</button></div>
    </form>`, { tipo: "leer" });
  if (android && !E.nfcActivo) encenderNfc(true);
}

async function encenderNfc(conToque) {
  if (!hayWebNfc() || E.nfcActivo) return;
  try {
    await leerConWebNfc(alLeerTarjeta, (t) => mensaje(t, "malo"));
    E.nfcActivo = true;
    document.body.classList.add("nfc-activo");
    if (E.vista === "ajustes") pintarAjustes();
  } catch (e) {
    if (conToque) mensaje(e && e.name === "NotAllowedError" ? "Permite el uso de NFC para leer tarjetas." : "No se pudo encender el NFC. Revisa que esté activado en el celular.", "malo");
  }
}

function abrirTarjeta(id) {
  const s = sim(id);
  if (!s) return;
  const url = L.urlTarjeta(CONFIG.bitacora.urlSitio, s.codigo);
  abrirHoja(`<header class="hoja-cabeza"><div class="hoja-ids"><span class="codigo">${esc(s.codigo)}</span></div><h2 id="hoja-titulo">Tarjeta NFC de ${esc(s.nombre)}</h2>${botonCerrar()}</header>
    <div class="metodo">
      <h3>${ic("i-nfc")}Grabar el enlace en la tarjeta</h3>
      <p>Así cualquier celular (iPhone o Android) que toque la tarjeta abre esta ficha.</p>
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
  const v = L.validarSimulador({ ...s, tarjeta: numero }, E.sims, E.zonas, id);
  if (v.errores.tarjeta) { mensaje(v.errores.tarjeta, "malo"); E.capturar = (l) => guardarNumero(id, l); return; }
  if (await guardar(() => E.almacen.actualizarSimulador(id, { tarjeta: numero }), `Tarjeta guardada para ${s.nombre}`)) { pitido(); abrirSimulador(id); }
}

function abrirDesconocida(numero) {
  const libres = E.sims.filter((s) => !s.tarjeta).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  abrirHoja(`<header class="hoja-cabeza"><div class="hoja-ids"><span class="leida">${ic("i-nfc")}Tarjeta leída</span></div><h2 id="hoja-titulo">Tarjeta nueva</h2><p>Número <span class="codigo">${esc(numero)}</span></p>${botonCerrar()}</header>
    <div class="accion">
      <p class="pregunta">¿De qué simulador es?</p>
      ${libres.length ? `<div class="elegir-lista">${libres.map((s) => `<button type="button" class="elegir" data-accion="vincular-sim" data-id="${esc(s.id)}">${esc(s.nombre)}<span class="codigo">${esc(s.codigo)}</span></button>`).join("")}</div>` : '<p class="muted">Todos los simuladores ya tienen tarjeta.</p>'}
      <div style="margin-top:12px"><button type="button" class="boton-chico boton-chico-primario" data-accion="nuevo-con-tarjeta">${ic("i-mas")}Registrar un simulador nuevo con esta tarjeta</button></div>
    </div>
    ${E.zonas.length ? `<details class="otra-accion"><summary>${ic("i-pin")}Es la tarjeta de una zona</summary><div class="elegir-lista">${zonasOrdenadas().map((z) => `<button type="button" class="elegir" data-accion="vincular-zona" data-id="${esc(z.id)}">${zonaChip(z)}${z.tarjeta ? '<span class="pequeno">ya tiene tarjeta</span>' : ""}</button>`).join("")}</div></details>` : ""}`,
  { tipo: "desconocida", numero });
}

function abrirEditar(id, previo = {}) {
  const s = id ? sim(id) : null;
  const v = s || { nombre: "", codigo: L.siguienteCodigo(E.sims), categoria: "", zonaBase: "", tarjeta: previo.tarjeta || "" };
  abrirHoja(`<header class="hoja-cabeza"><h2 id="hoja-titulo">${s ? "Editar simulador" : "Nuevo simulador"}</h2>${botonCerrar()}</header>
    <form id="f-editar" class="accion" novalidate>
      <div class="campo"><label for="m-nombre">Nombre</label><input id="m-nombre" maxlength="${L.LIMITES.nombre}" value="${esc(v.nombre)}" placeholder="Ej. Maniquí adulto de alta fidelidad" autocomplete="off"><p class="error" data-err="nombre" hidden></p></div>
      <div class="campo"><label for="m-codigo">Código</label><input id="m-codigo" maxlength="${L.LIMITES.codigo}" value="${esc(v.codigo)}" autocomplete="off" autocapitalize="characters">
        <p class="pequeno">Va en la etiqueta y en el enlace de la tarjeta. Letras, números y guiones.${s && s.enlaceGrabado ? " Si lo cambias, vuelve a grabar la tarjeta." : ""}</p><p class="error" data-err="codigo" hidden></p></div>
      <div class="campo"><label for="m-categoria">Categoría <span class="pequeno">(opcional)</span></label><input id="m-categoria" list="dl-categorias" maxlength="${L.LIMITES.categoria}" value="${esc(v.categoria)}" autocomplete="off" placeholder="Ej. Reanimación"><p class="error" data-err="categoria" hidden></p></div>
      <div class="campo"><label for="m-zona">Zona habitual</label><select id="m-zona"><option value="">Ninguna</option>${zonasOrdenadas().map((z) => `<option value="${esc(z.id)}" ${v.zonaBase === z.id ? "selected" : ""}>${esc(z.nombre)}</option>`).join("")}</select>
        ${s ? "" : '<p class="pequeno">Ahí quedará al darlo de alta.</p>'}<p class="error" data-err="zonaBase" hidden></p></div>
      <div class="campo"><label for="m-tarjeta">Número de tarjeta NFC <span class="pequeno">(opcional)</span></label><input id="m-tarjeta" maxlength="64" value="${esc(v.tarjeta || "")}" autocomplete="off"><p class="error" data-err="tarjeta" hidden></p></div>
      <button class="boton boton-primario" type="submit">${s ? "Guardar cambios" : "Registrar simulador"}</button>
      ${s ? `<button type="button" class="boton-chico boton-chico-peligro" data-accion="borrar-sim" data-id="${esc(s.id)}" data-confirmar="¿Borrar el simulador? Toca otra vez">${ic("i-borrar")}Borrar simulador</button>` : ""}
    </form>`, { tipo: "editar", id: id || null });
  const ponerNumero = (lectura) => {
    const i = $("#m-tarjeta");
    if (!i) return;
    i.value = L.normalizarTarjeta(lectura.serie || (lectura.textos || [])[0]);
    pitido();
    E.capturar = ponerNumero;
  };
  E.capturar = ponerNumero;
}

function abrirTarjetaZona(zid) {
  const z = zona(zid);
  if (!z) return;
  abrirHoja(`<header class="hoja-cabeza"><h2 id="hoja-titulo">Tarjeta de la zona</h2><p>${zonaChip(z)}</p>${botonCerrar()}</header>
    <div class="lector"><div class="onda">${ic("i-nfc")}</div><h2>${hayWebNfc() ? "Acerca la tarjeta de la zona" : "Pasa la tarjeta de la zona por el lector"}</h2>
      <p>${z.tarjeta ? `Número actual: <span class="codigo">${esc(z.tarjeta)}</span>` : "Al regresar un simulador, leer esta tarjeta elegirá la zona."}</p></div>
    <form id="f-numero-zona" class="en-linea" novalidate><label class="oculto" for="z-numero">Número de la tarjeta</label><input id="z-numero" autocomplete="off" placeholder="O escribe el número"><button class="boton-chico" type="submit">Guardar</button></form>
    ${z.tarjeta ? `<div><button type="button" class="boton-chico boton-chico-peligro" data-accion="quitar-numero-zona" data-id="${esc(z.id)}">Quitar tarjeta</button></div>` : ""}`, { tipo: "tarjeta-zona", id: zid });
  E.capturar = (lectura) => guardarNumeroZona(zid, lectura);
  if (hayWebNfc() && !E.nfcActivo) encenderNfc(false);
}

async function guardarNumeroZona(zid, lectura) {
  const z = zona(zid);
  const numero = L.normalizarTarjeta(lectura.serie || (lectura.textos || [])[0]);
  if (!z || !numero) return;
  const v = L.validarZona({ ...z, tarjeta: numero }, E.zonas, E.sims, zid);
  if (v.errores.tarjeta) { mensaje(v.errores.tarjeta, "malo"); E.capturar = (l) => guardarNumeroZona(zid, l); return; }
  if (await guardar(() => E.almacen.actualizarZona(zid, { tarjeta: numero }), `Tarjeta guardada para ${z.nombre}`)) { pitido(); cerrarHoja(); }
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
    mensaje(`Zona elegida: ${r.item.nombre}`);
    return;
  }
  if (r.tipo === "simulador") { abrirSimulador(r.item.id, { leida: true }); return; }
  if (r.tipo === "zona") {
    cerrarHoja();
    irA("plano");
    requestAnimationFrame(() => {
      const el = document.querySelector(`.zona[data-zona="${CSS.escape(r.item.id)}"]`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("destello"); void el.offsetWidth; el.classList.add("destello"); }
    });
    mensaje(`Zona: ${r.item.nombre}`);
    return;
  }
  abrirDesconocida(r.tarjeta);
}

// La tarjeta graba ".../simuladores/#SIM-004": al abrir ese enlace, se abre la ficha.
function revisarEnlace() {
  let h = "";
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { /* enlace raro */ }
  if (!h || h === E.ultimoHash || !E.listo) return;
  E.ultimoHash = h;
  const cod = L.normalizarTarjeta(h);
  const s = E.sims.find((x) => L.normalizarTarjeta(x.codigo) === cod);
  if (s) abrirSimulador(s.id, { leida: true });
  else mensaje(`No encontré el simulador ${h}. Revisa el enlace grabado en la tarjeta.`, "malo");
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* sin historial */ }
  E.ultimoHash = null;
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
  return guardar(() => E.almacen.registrar(s.id, datos.simulador, datos.movimiento, requiere), textoBien);
}

async function enviarSalida() {
  const s = sim(E.hoja.id);
  const d = { responsable: $("#s-responsable").value, destino: $("#s-destino").value };
  const v = L.validarSalida(d, s);
  if (!v.ok) { mostrarErrores(v.errores); return; }
  const datos = L.datosSalida(s, d, E.zonas, ahora(), E.usuario);
  if (await registrar(s, datos, "disponible", `Salida registrada: ${s.nombre}`)) { guardado.poner("responsable", datos.simulador.responsable); cerrarHoja(); }
}

async function enviarRegreso() {
  const s = sim(E.hoja.id);
  const d = { zonaId: E.hoja.zonaElegida, revision: $("#r-revision").checked, nota: $("#r-nota").value };
  const v = L.validarRegreso(d, s, E.zonas);
  if (!v.ok) { mostrarErrores(v.errores); return; }
  const datos = L.datosRegreso(s, d, E.zonas, ahora(), E.usuario);
  if (await registrar(s, datos, "en_uso", `Regreso registrado en ${datos.movimiento.zona || "Sin ubicar"}`)) cerrarHoja();
}

async function moverDeLugar(id) {
  const s = sim(id);
  const destino = E.hoja && E.hoja.zonaElegida;
  if (!destino) { mostrarErrores({ zonaId: "Elige la zona a donde lo mueves." }); return; }
  if (destino === s.zonaId) { mensaje("Ya está en esa zona."); return; }
  const datos = L.datosCambioLugar(s, destino, E.zonas, ahora(), E.usuario);
  if (await registrar(s, datos, "disponible", `Movido a ${datos.movimiento.zona}`)) cerrarHoja();
}

async function enviarEdicion() {
  const id = E.hoja.id;
  const d = {
    nombre: $("#m-nombre").value.trim(),
    codigo: $("#m-codigo").value.trim().toUpperCase(),
    categoria: $("#m-categoria").value.trim(),
    zonaBase: $("#m-zona").value || null,
    tarjeta: L.normalizarTarjeta($("#m-tarjeta").value) || null,
  };
  const v = L.validarSimulador(d, E.sims, E.zonas, id);
  if (!v.ok) { mostrarErrores(v.errores); return; }
  const t = ahora();
  const quien = E.usuario ? E.usuario.correo || E.usuario.uid : null;
  if (id) {
    if (await guardar(() => E.almacen.actualizarSimulador(id, { ...d, categoria: d.categoria || null, actualizado: t, actualizadoPor: quien }), "Cambios guardados")) abrirSimulador(id);
  } else {
    let nuevo = null;
    const ok = await guardar(async () => {
      nuevo = await E.almacen.crearSimulador({
        ...d, categoria: d.categoria || null, zonaId: d.zonaBase, enlaceGrabado: false,
        estado: "disponible", responsable: null, destino: null, desde: null, revision: null, creado: t, actualizado: t, actualizadoPor: quien,
      });
    }, `${d.nombre} registrado`);
    if (ok && nuevo) setTimeout(() => abrirSimulador(nuevo), 0);
  }
}

async function nuevaZona() {
  const usados = E.zonas.map((z) => z.color);
  const color = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !usados.includes(c)) ?? E.zonas.length % 8;
  let n = E.zonas.length + 1;
  while (E.zonas.some((z) => z.nombre === `Zona ${n}`)) n++;
  const orden = E.zonas.reduce((m, z) => Math.max(m, z.orden || 0), 0) + 1;
  let id = null;
  if (await guardar(async () => { id = await E.almacen.crearZona({ nombre: `Zona ${n}`, color, tamano: "m", orden, tarjeta: null }); }, "Zona agregada")) {
    setTimeout(() => { const i = document.querySelector(`.zona-ed[data-zona="${CSS.escape(id)}"] input`); if (i) { i.focus(); i.select(); } }, 150);
  }
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
    await grabarEnlace(L.urlTarjeta(CONFIG.bitacora.urlSitio, s.codigo));
    pitido();
    await guardar(() => E.almacen.actualizarSimulador(id, { enlaceGrabado: true }), "Tarjeta grabada");
    abrirTarjeta(id);
  } catch (e) {
    mensaje(e && e.name === "AbortError" ? "No se acercó ninguna tarjeta. Inténtalo otra vez." : "No se pudo grabar la tarjeta. Revisa que no esté bloqueada.", "malo");
  } finally {
    setTimeout(() => { E.grabando = false; }, 800);
  }
}

async function alAccion(b) {
  const accion = b.dataset.accion;
  const id = b.dataset.id;
  switch (accion) {
    case "leer": abrirLeer(); break;
    case "cerrar": cerrarHoja(); break;
    case "nuevo": abrirEditar(null); break;
    case "editar": abrirEditar(id); break;
    case "tarjeta": abrirTarjeta(id); break;
    case "grabar": grabar(id); break;
    case "copiar": copiar(b.dataset.texto); break;
    case "ya-grabada": if (await guardar(() => E.almacen.actualizarSimulador(id, { enlaceGrabado: true }), "Listo")) abrirTarjeta(id); break;
    case "quitar-numero": if (await guardar(() => E.almacen.actualizarSimulador(id, { tarjeta: null }), "Número quitado")) abrirTarjeta(id); break;
    case "resolver": { const s = sim(id); if (s) await registrar(s, L.datosRevisionResuelta(s, ahora(), E.usuario), null, "Revisión marcada como resuelta"); break; }
    case "mover": moverDeLugar(id); break;
    case "borrar-sim": if (confirmado(b)) { const s = sim(id); if (await guardar(() => E.almacen.borrarSimulador(id), `${s ? s.nombre : "Simulador"} borrado`)) cerrarHoja(); } break;
    case "vincular-sim": { const n = E.hoja && E.hoja.numero; if (n) await guardarNumero(id, { serie: n }); break; }
    case "vincular-zona": { const n = E.hoja && E.hoja.numero; if (n) await guardarNumeroZona(id, { serie: n }); break; }
    case "nuevo-con-tarjeta": abrirEditar(null, { tarjeta: E.hoja && E.hoja.numero }); break;
    case "ejemplo": b.disabled = true; await guardar(() => E.almacen.cargarEjemplo(), "Centro de ejemplo listo. Toca un simulador para probar."); b.disabled = false; break;
    case "borrar-ejemplo": if (confirmado(b)) await guardar(() => E.almacen.borrarEjemplo(E.zonas, E.sims), "Datos de ejemplo borrados"); break;
    case "zona-nueva": nuevaZona(); break;
    case "zona-subir": case "zona-bajar": { const c = L.moverZona(E.zonas, id, accion === "zona-subir" ? -1 : 1); if (c.length) await guardar(() => E.almacen.ordenarZonas(c)); break; }
    case "zona-tarjeta": abrirTarjetaZona(id); break;
    case "quitar-numero-zona": if (await guardar(() => E.almacen.actualizarZona(id, { tarjeta: null }), "Tarjeta quitada")) cerrarHoja(); break;
    case "zona-borrar": if (confirmado(b)) { const z = zona(id); await guardar(() => E.almacen.borrarZona(id, E.sims), `Zona ${z ? z.nombre : ""} borrada`); } break;
    case "paleta": E.paleta = E.paleta === id ? null : id; pintarAjustes(); break;
    case "color": E.paleta = null; await guardar(() => E.almacen.actualizarZona(id, { color: Number(b.dataset.color) })); pintarAjustes(); break;
    case "mostrar-mas": E.mostrar += 100; pintarHistorial(); break;
    case "mas-historial": E.almacen.masHistorial(); break;
    case "csv": descargarCsv(); break;
    case "encender-nfc": encenderNfc(true); break;
    case "salir": cerrarHoja(); await E.almacen.salir(); break;
    case "recuperar": recuperarClave(); break;
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
    const z = t.closest("[data-elegir-zona]");
    if (z) { elegirZona(z.dataset.elegirZona); return; }
    const tipo = t.closest("[data-tipo]");
    if (tipo) { E.tipo = tipo.dataset.tipo; E.mostrar = 100; pintarHistorial(); return; }
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
    else if (f.id === "f-editar") enviarEdicion();
    else if (f.id === "f-codigo") { const v = $("#c-codigo").value; $("#c-codigo").value = ""; if (v.trim()) alLeerTarjeta({ serie: v, textos: [v] }); }
    else if (f.id === "f-numero") { const v = $("#n-numero").value; if (v.trim()) guardarNumero(E.hoja.id, { serie: v }); }
    else if (f.id === "f-numero-zona") { const v = $("#z-numero").value; if (v.trim()) guardarNumeroZona(E.hoja.id, { serie: v }); }
  });

  // En el campo de número de tarjeta, el Enter del lector USB no debe enviar el formulario.
  document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target && ev.target.id === "m-tarjeta") ev.preventDefault(); }, true);

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.id === "r-revision") { $("#r-nota-campo").hidden = !t.checked; if (t.checked) $("#r-nota").focus(); return; }
    const campo = t.dataset && t.dataset.campoZona;
    if (!campo) return;
    const fila = t.closest("[data-zona]");
    const z = fila && zona(fila.dataset.zona);
    if (!z) return;
    const valor = campo === "nombre" ? t.value.trim() : t.value;
    if (z[campo] === valor) return;
    if (campo === "nombre") {
      const v = L.validarZona({ ...z, nombre: valor }, E.zonas, E.sims, z.id);
      if (!v.ok) { mensaje(v.errores.nombre || "Revisa el nombre.", "malo"); t.value = z.nombre; return; }
    }
    guardar(() => E.almacen.actualizarZona(z.id, { [campo]: valor }));
  });
  $("#v-ajustes").addEventListener("focusout", () => setTimeout(() => { if (E.ajustesPendiente && E.vista === "ajustes") pintarAjustes(); }, 0));

  $("#q-plano").addEventListener("input", (e) => { E.qPlano = e.target.value.trim(); pintarPlano(); });
  $("#q-inv").addEventListener("input", (e) => { E.qInv = e.target.value.trim(); pintarInventario(); });
  $("#q-hist").addEventListener("input", (e) => { E.qHist = e.target.value.trim(); E.mostrar = 100; pintarHistorial(); });
  window.addEventListener("hashchange", revisarEnlace);
}

iniciar();
