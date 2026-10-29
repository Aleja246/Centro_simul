// Hoja imprimible de etiquetas QR (etiquetas/). La selección vive en inventario.js (etiquetasA).
import { CONFIG } from "./config.js";
import { indexar, etiquetasA, nombreCuarto } from "./inventario.js";

const RAIZ = "../";
const CUARTOS = CONFIG.inventario.nombresCuartos;
const $ = (id) => document.getElementById(id);

function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue;
    nodo.setAttribute(nombre, valor === true ? "" : valor);
  }
  nodo.append(...hijos.flat().filter((h) => h != null && h !== false).map((h) => (typeof h === "string" ? h.replace(/\b(CJ|EST|EQ)-/g, "$1‑") : h)));
  return nodo;
}

const qr = (id) => el("img", { class: "etiqueta-qr", src: `${RAIZ}qr/equipos/${encodeURIComponent(id)}.svg`, alt: "" });

function etiquetaArticulo(a) {
  return el("div", { class: "etiqueta" },
    qr(a.id),
    el("div", { class: "etiqueta-texto" },
      el("p", { class: "etiqueta-id" }, a.id),
      el("p", { class: "etiqueta-nombre" }, a.nombre),
      el("p", { class: "etiqueta-meta" }, a.pertenece ? `Va con ${a.pertenece}` : a.kit || nombreCuarto(a.cuarto, CUARTOS)),
      el("p", { class: "etiqueta-pie" }, "CSC · Acerca tu celular o escanea"),
    ),
  );
}

function etiquetaCaja(c) {
  return el("div", { class: "etiqueta etiqueta-caja" },
    qr(c.id),
    el("div", { class: "etiqueta-texto" },
      el("p", { class: "etiqueta-id" }, c.id),
      el("p", { class: "etiqueta-nombre" }, c.contenido || "Caja"),
      el("p", { class: "etiqueta-meta" }, (c.cuartos ?? []).map((x) => nombreCuarto(x, CUARTOS)).join(" / ")),
      el("p", { class: "etiqueta-pie" }, "CSC · Acerca tu celular: contenido"),
    ),
  );
}

function pintar(idx) {
  const t = CONFIG.etiquetas.find((x) => x.id === $("tamano").value) ?? CONFIG.etiquetas[0];
  const lista = etiquetasA(idx, {
    prioridad1: $("prioridad1").checked,
    prioridad2: $("prioridad2").checked,
    cajas: $("cajas").checked,
    cuarto: $("cuarto").value,
    ids: $("ids").value,
  });
  const porHoja = t.columnas * t.filas;
  const hojas = [];
  for (let i = 0; i < lista.length; i += porHoja) hojas.push(lista.slice(i, i + porHoja));

  $("estilo-pagina").textContent = `@page { size: ${t.pagina[0]}mm ${t.pagina[1]}mm; margin: 0; }`;
  const contenedor = $("hojas");
  contenedor.className = `hojas${$("bordes").checked ? " con-bordes" : ""}`;
  contenedor.style.cssText = [
    `--pw:${t.pagina[0]}mm`, `--ph:${t.pagina[1]}mm`, `--w:${t.ancho}mm`, `--h:${t.alto}mm`,
    `--cols:${t.columnas}`, `--mt:${t.margenSup}mm`, `--ml:${t.margenIzq}mm`, `--gap:${t.separacion}mm`,
  ].join(";");
  contenedor.replaceChildren(...hojas.map((h) =>
    el("section", { class: "hoja" }, h.map((e) => (e.clase === "caja" ? etiquetaCaja(e.caja) : etiquetaArticulo(e.articulo)))),
  ));
  $("resumen").textContent = lista.length
    ? `${lista.length} etiquetas · ${hojas.length} ${hojas.length === 1 ? "hoja" : "hojas"}`
    : "No hay etiquetas con esas opciones.";
}

async function iniciar() {
  let datos;
  try {
    const r = await fetch(RAIZ + CONFIG.inventario.urlDatos, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    datos = await r.json();
  } catch {
    $("resumen").textContent = "No se pudo cargar el inventario.";
    return;
  }
  const idx = indexar(datos);
  $("tamano").append(...CONFIG.etiquetas.map((t) => el("option", { value: t.id }, t.nombre)));
  const cuartos = [...new Set(datos.articulos.map((a) => a.cuarto).filter(Boolean))];
  $("cuarto").append(...cuartos.map((c) => el("option", { value: c }, nombreCuarto(c, CUARTOS))));
  $("opciones").addEventListener("input", () => pintar(idx));
  $("imprimir").addEventListener("click", () => window.print());
  pintar(idx);
}

iniciar();
