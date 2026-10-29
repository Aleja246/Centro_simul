// Grabar etiquetas NFC (nfc/). Cada etiqueta guarda la dirección de la ficha: .../equipo/?id=EQ-347
// Grabar solo funciona con Web NFC (Chrome en Android, sitio con https). En otros casos se copia el enlace.
import { CONFIG } from "./config.js";
import { indexar, etiquetasA, nombreCuarto, normalizar, ubicacion, urlFicha, idDeUrl } from "./inventario.js";

const RAIZ = "../";
const CUARTOS = CONFIG.inventario.nombresCuartos;
const CLAVE = "csc-nfc-grabadas"; // solo en este celular: para saber por dónde vas
const HAY_NFC = "NDEFReader" in window;
const $ = (id) => document.getElementById(id);

function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue;
    nodo.setAttribute(nombre, valor === true ? "" : valor);
  }
  nodo.append(...hijos.flat().filter((h) => h != null && h !== false));
  return nodo;
}

function leerGrabadas() {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE) ?? "[]")); } catch { return new Set(); }
}
function guardarGrabadas(set) {
  try { localStorage.setItem(CLAVE, JSON.stringify([...set])); } catch { /* sin almacenamiento: no pasa nada */ }
}

let grabadas = leerGrabadas();
let grabando = null; // AbortController de la grabación en curso

async function grabar(id, boton, estado) {
  grabando?.abort();
  grabando = new AbortController();
  const url = urlFicha(location.href, id);
  boton.disabled = true;
  estado.textContent = "Acerca la etiqueta a la parte de atrás del celular…";
  estado.className = "estado-nfc esperando";
  try {
    const ndef = new NDEFReader();
    await ndef.write({ records: [{ recordType: "url", data: url }] }, { signal: grabando.signal, overwrite: true });
    grabadas.add(id);
    guardarGrabadas(grabadas);
    estado.textContent = "✓ Grabada. Pruébala acercando el celular con la pantalla desbloqueada.";
    estado.className = "estado-nfc ok";
    boton.textContent = "Grabar de nuevo";
    actualizarProgreso();
  } catch (e) {
    const mensajes = {
      NotAllowedError: "Permiso de NFC denegado. Actívalo en los ajustes del sitio.",
      NotSupportedError: "El NFC del celular está apagado o la etiqueta no es compatible.",
      AbortError: "Grabación cancelada.",
      NetworkError: "Se perdió la etiqueta. Acércala otra vez y mantenla quieta.",
    };
    estado.textContent = mensajes[e.name] ?? `No se pudo grabar (${e.name || e.message}).`;
    estado.className = "estado-nfc error";
  } finally {
    boton.disabled = false;
  }
}

async function copiar(id, boton) {
  const url = urlFicha(location.href, id);
  try {
    await navigator.clipboard.writeText(url);
    boton.textContent = "✓ Copiado";
  } catch {
    prompt("Copia este enlace:", url);
  }
  setTimeout(() => (boton.textContent = "Copiar enlace"), 2000);
}

async function leerEtiqueta() {
  const salida = $("lectura");
  salida.hidden = false;
  salida.textContent = "Acerca la etiqueta…";
  try {
    const ndef = new NDEFReader();
    const ctrl = new AbortController();
    await ndef.scan({ signal: ctrl.signal });
    ndef.addEventListener("reading", ({ message }) => {
      ctrl.abort();
      const urlRec = message.records.find((r) => r.recordType === "url" || r.recordType === "absolute-url");
      const texto = urlRec ? new TextDecoder().decode(urlRec.data) : "";
      const id = idDeUrl(texto);
      salida.textContent = id ? `Esta etiqueta es de ${id}.` : texto ? `Tiene otra dirección: ${texto}` : "La etiqueta está vacía.";
    }, { once: true });
  } catch (e) {
    salida.textContent = `No se pudo leer (${e.name || e.message}).`;
  }
}

let idx;
let filas = [];

function pintar() {
  const filtro = {
    prioridad1: $("prioridad1").checked,
    prioridad2: $("prioridad2").checked,
    cajas: $("cajas").checked,
    cuarto: $("cuarto").value,
  };
  const q = normalizar($("buscar").value);
  filas = etiquetasA(idx, filtro).map((e) => {
    const a = e.articulo;
    const c = e.caja;
    return {
      id: a?.id ?? c.id,
      nombre: a?.nombre ?? c.contenido ?? "Caja",
      kit: a?.kit ?? "",
      donde: a ? ubicacion(a, idx, CUARTOS).texto : (c.cuartos ?? []).map((x) => nombreCuarto(x, CUARTOS)).join(" / "),
    };
  }).filter((f) => !q || normalizar(`${f.id} ${f.nombre} ${f.kit}`).includes(q));

  const visibles = $("ocultarGrabadas").checked ? filas.filter((f) => !grabadas.has(f.id)) : filas;
  $("lista").replaceChildren(...visibles.map((f) => {
    const estado = el("p", { class: "estado-nfc", "aria-live": "polite" });
    const yaGrabada = grabadas.has(f.id);
    const botones = [];
    if (HAY_NFC) {
      const b = el("button", { type: "button", class: "boton-nfc" }, yaGrabada ? "Grabar de nuevo" : "Grabar");
      b.addEventListener("click", () => grabar(f.id, b, estado));
      botones.push(b);
    }
    const copia = el("button", { type: "button", class: "boton-nfc secundario" }, "Copiar enlace");
    copia.addEventListener("click", () => copiar(f.id, copia));
    botones.push(copia);
    return el("li", { class: yaGrabada ? "grabada" : "" },
      el("div", {},
        el("p", { class: "fuerte" }, `${yaGrabada ? "✓ " : ""}${f.id} · ${f.nombre}`),
        el("p", { class: "tenue" }, f.donde),
      ),
      el("div", { class: "botones-nfc" }, botones),
      estado,
    );
  }));
  actualizarProgreso();
}

function actualizarProgreso() {
  const hechas = filas.filter((f) => grabadas.has(f.id)).length;
  $("progreso").textContent = filas.length ? `${hechas} de ${filas.length} grabadas en este celular` : "No hay equipos con esos filtros.";
}

async function iniciar() {
  $(HAY_NFC ? "con-nfc" : "sin-nfc").hidden = false;
  try {
    const r = await fetch(RAIZ + CONFIG.inventario.urlDatos, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    const datos = await r.json();
    idx = indexar(datos);
    const cuartos = [...new Set(datos.articulos.map((a) => a.cuarto).filter(Boolean))];
    $("cuarto").append(...cuartos.map((c) => el("option", { value: c }, nombreCuarto(c, CUARTOS))));
  } catch {
    $("progreso").textContent = "No se pudo cargar el inventario.";
    return;
  }
  $("filtros").addEventListener("input", pintar);
  $("leer").addEventListener("click", leerEtiqueta);
  pintar();
}

iniciar();
