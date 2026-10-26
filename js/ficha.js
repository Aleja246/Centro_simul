// Página de escaneo (equipo/): ficha de un simulador, accesorio o caja, y buscador.
// Todo lo que toca la pantalla vive aquí; la lógica está en inventario.js (funciones puras).
import { CONFIG } from "./config.js";
import { ahoraLocal, formatoFecha } from "./logica.js";
import {
  indexar,
  ubicacion,
  nombreCuarto,
  estadoReserva,
  diaRelativo,
  relacionUbicacion,
  indicadorAccesorio,
  piezasDe,
  mismoKit,
  contenidoCaja,
  buscar,
} from "./inventario.js";

const RAIZ = "../";
const CUARTOS = CONFIG.inventario.nombresCuartos;
const cuarto = (c) => nombreCuarto(c, CUARTOS);

// ---------- Utilidades de DOM ----------

// Crea un elemento. Los hijos que son texto se agregan como texto (nunca como HTML).
function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue;
    nodo.setAttribute(nombre, valor === true ? "" : valor);
  }
  nodo.append(...hijos.flat().filter((h) => h !== null && h !== undefined && h !== false).map((h) => (typeof h === "string" ? sinCorte(h) : h)));
  return nodo;
}

// Guion que no se corta: "CJ-23" nunca queda partido en dos renglones.
function sinCorte(texto) {
  return String(texto).replace(/\b(CJ|EST|EQ)-/g, "$1‑");
}

// Íconos (trazos simples, heredan el color del texto). Son constantes: no llevan datos del Excel.
const ICONOS = {
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>',
  traslado: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.3" r=".6" fill="currentColor"/>',
  "sin-dato": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="16.5" cy="16" r="3.2" fill="var(--color-fondo)"/><path d="M16.5 14.6V16l1 .8"/>',
  caja: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  simulador: '<circle cx="12" cy="6" r="2.6"/><path d="M6 21v-5.5a6 6 0 0 1 12 0V21M9 21v-4M15 21v-4"/>',
  pieza: '<path d="M9 3.5h6v4h4v6h-4v7H9v-7H5v-6h4z"/>',
  buscar: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  enlace: '<path d="M9 6h9v9M18 6 6 18"/>',
};
function icono(nombre, clase = "") {
  const span = el("span", { class: `icono ${clase}`.trim(), "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre]}</svg>`;
  return span;
}

const enlaceFicha = (id) => `./?id=${encodeURIComponent(id)}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------- Piezas comunes ----------

function chipReserva(estado) {
  const p = estado.proxima;
  switch (estado.estado) {
    case "en-uso": return el("span", { class: "chip chip-rojo" }, `En uso · hasta ${p.fin}`);
    case "hoy": return el("span", { class: "chip chip-ambar" }, `Se usa hoy ${p.inicio}–${p.fin}`);
    case "semana":
    case "libre": return el("span", { class: "chip chip-verde" }, "Disponible ahora");
    default: return null;
  }
}

function chipEstado(estado) {
  const clases = { Funciona: "chip-verde-suave", "Funciona con fallas": "chip-ambar", "No funciona": "chip-rojo", "Sin probar": "chip-gris" };
  return estado ? el("span", { class: `chip ${clases[estado] ?? "chip-gris"}` }, estado) : null;
}

function foto(articulo) {
  const marco = el("div", { class: "ficha-foto" }, icono(articulo.tipo === "Simulador" ? "simulador" : "pieza"));
  const img = el("img", { src: `${RAIZ}${CONFIG.inventario.carpetaFotos}${encodeURIComponent(articulo.id)}.jpg`, alt: "", loading: "lazy" });
  img.addEventListener("load", () => marco.classList.add("con-foto"));
  img.addEventListener("error", () => img.remove());
  marco.append(img);
  return marco;
}

function seccion(titulo, ...hijos) {
  return el("section", { class: "ficha-seccion" }, el("h2", {}, titulo), ...hijos);
}

function seccionReserva(estado, hoy) {
  if (estado.estado === "sin-datos") {
    return seccion("Próxima reserva", el("p", { class: "tenue" }, "Las reservas todavía no están conectadas al inventario."));
  }
  const p = estado.proxima;
  if (!p) return seccion("Próxima reserva", el("p", { class: "tenue" }, "Sin reservas próximas."));
  return seccion(
    "Próxima reserva",
    el("div", { class: "fila-icono" },
      icono("calendario"),
      el("div", {},
        el("p", { class: "fuerte" }, `${diaRelativo(p.fecha, hoy)}, ${p.inicio}–${p.fin}`),
        el("p", { class: "tenue" }, [p.actividad, p.sala].filter(Boolean).join(" · ") || "Sin descripción"),
      ),
    ),
  );
}

// Texto de ubicaciones de un grupo: "Cuarto de la tortura · CJ-18 (2), CJ-19 (1)".
function textoUbicaciones(grupo) {
  const porCuarto = new Map();
  for (const u of grupo.ubicaciones) {
    if (!porCuarto.has(u.cuarto)) porCuarto.set(u.cuarto, []);
    const donde = u.caja || u.guardado || "";
    if (donde) porCuarto.get(u.cuarto).push(grupo.cantidad > 1 ? `${donde} (${u.cantidad})` : donde);
  }
  return [...porCuarto.entries()]
    .map(([c, lugares]) => [cuarto(c) || "Sin cuarto", lugares.join(", ")].filter(Boolean).join(" · "))
    .join(" / ");
}

const NOTA_INDICADOR = { ok: "", traslado: "Requiere traslado", alerta: "Verificar antes de usar", "sin-dato": "Ubicación por registrar" };

function filaPieza(grupo, indicador) {
  const nota = [textoUbicaciones(grupo), NOTA_INDICADOR[indicador]].filter(Boolean).join(" · ");
  return el("li", { class: `pieza pieza-${indicador}` },
    icono(indicador),
    el("div", {},
      el("a", { href: enlaceFicha(grupo.ids[0]), class: "pieza-nombre" }, grupo.nombre, grupo.cantidad > 1 ? el("span", { class: "cantidad" }, ` ×${grupo.cantidad}`) : null),
      el("p", { class: "pieza-nota" }, `Ubicación: ${nota}`),
      grupo.alerta ? el("p", { class: "pieza-nota pieza-alerta-texto" }, "Hay piezas marcadas como «No funciona» o «Funciona con fallas».") : null,
    ),
  );
}

function listaKits(kits, referencia, abiertos) {
  return kits.map(({ kit, grupos }) => {
    const total = grupos.reduce((s, g) => s + g.cantidad, 0);
    // "PROMPT Flex · Módulo PPH" dentro de la ficha del PROMPT Flex se muestra como "Módulo PPH".
    const prefijo = referencia.kit ? `${referencia.kit} · ` : "";
    const titulo = prefijo && kit.startsWith(prefijo) ? kit.slice(prefijo.length) : kit;
    const lugares = [...new Set(grupos.flatMap((g) => g.ubicaciones.map((u) => u.caja || u.guardado)).filter(Boolean))];
    const indicadores = grupos.map((g) => indicadorAccesorio(g, referencia));
    const resumen = [
      lugares.length ? `${lugares.length === 1 ? "Caja" : "Cajas"} ${lugares.join(", ")}` : "",
      indicadores.includes("traslado") ? "parte en otro cuarto" : "",
      indicadores.includes("alerta") ? "revisar piezas" : "",
    ].filter(Boolean).join(" · ");
    return el("details", { class: "kit", open: abiertos },
      el("summary", {},
        el("span", {}, el("span", { class: "kit-titulo" }, sinCorte(titulo)), resumen ? el("span", { class: "kit-resumen" }, sinCorte(resumen)) : null),
        el("span", { class: "cuenta" }, plural(total, "pieza", "piezas")),
      ),
      el("ul", { class: "lista-piezas" }, grupos.map((g) => filaPieza(g, indicadorAccesorio(g, referencia)))),
    );
  });
}

function detalles(articulo) {
  const filas = [
    ["Tipo", articulo.tipo],
    ["Categoría", articulo.categoria],
    ["Marca", articulo.marca],
    ["Kit / módulo", articulo.kit],
    ["Notas", articulo.notas],
  ].filter(([, v]) => v);
  return seccion("Detalles", el("dl", { class: "detalles" }, filas.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])));
}

// ---------- Fichas ----------

function fichaArticulo(a, idx, ahora) {
  const hoy = ahora.slice(0, 10);
  const reserva = estadoReserva(a.id, idx.reservas, ahora);
  const padre = a.pertenece ? idx.porId.get(a.pertenece) : null;

  const partes = [
    el("header", { class: "ficha-cabecera" },
      foto(a),
      el("div", {},
        el("h1", {}, `${a.id} · ${a.nombre}`),
        el("p", { class: "tenue" }, `Ubicación registrada: ${ubicacion(a, idx, CUARTOS).texto}`),
        el("p", { class: "chips" }, chipReserva(reserva), chipEstado(a.estado)),
      ),
    ),
    seccionReserva(reserva, hoy),
  ];

  if (padre) {
    const rel = relacionUbicacion(a, padre);
    partes.push(seccion("Pertenece a",
      el("a", { class: "tarjeta-enlace", href: enlaceFicha(padre.id) },
        icono("simulador"),
        el("div", {},
          el("p", { class: "fuerte" }, `${padre.id} · ${padre.nombre}`),
          el("p", { class: "tenue" }, ubicacion(padre, idx, CUARTOS).texto + (rel === "otro-cuarto" ? " · Está en otro cuarto" : "")),
        ),
        icono("enlace", "icono-chico"),
      ),
    ));
  }

  const piezas = piezasDe(a.id, idx);
  if (piezas.total) {
    partes.push(el("section", { class: "ficha-seccion" },
      el("h2", {}, "Accesorios relacionados ", el("span", { class: "cuenta" }, String(piezas.accesorios.reduce((s, k) => s + k.grupos.reduce((t, g) => t + g.cantidad, 0), 0)))),
      el("p", { class: "leyenda" },
        el("span", { class: "pieza-ok" }, icono("ok", "icono-chico"), " mismo cuarto"),
        el("span", { class: "pieza-traslado" }, icono("traslado", "icono-chico"), " otro cuarto"),
        el("span", { class: "pieza-alerta" }, icono("alerta", "icono-chico"), " verificar"),
      ),
      listaKits(piezas.accesorios, a, piezas.accesorios.length <= 3),
    ));
    if (piezas.consumibles.length) {
      partes.push(seccion("Consumibles para este simulador", listaKits(piezas.consumibles, a, false)));
    }
  }

  const hermanos = mismoKit(a, idx).filter((g) => !g.ids.includes(a.pertenece));
  if (a.kit && !piezas.total && hermanos.length) {
    const referencia = padre ?? a;
    partes.push(seccion(`Otras piezas de «${a.kit}»`,
      el("ul", { class: "lista-piezas" }, hermanos.map((g) => filaPieza(g, indicadorAccesorio(g, referencia)))),
    ));
  }

  partes.push(detalles(a));
  return el("article", { class: "ficha" }, partes);
}

function fichaCaja(c, idx) {
  const contenido = contenidoCaja(c.id, idx);
  const cuartos = (c.cuartos ?? []).map(cuarto);
  const total = contenido.reduce((s, x) => s + x.total, 0);
  const partes = [
    el("header", { class: "ficha-cabecera" },
      el("div", { class: "ficha-foto" }, icono("caja")),
      el("div", {},
        el("h1", {}, `${c.id} · Caja`),
        el("p", { class: "tenue" }, `Ubicación registrada: ${[cuartos.join(" / "), c.estante].filter(Boolean).join(" · ") || "Sin ubicación registrada"}`),
        el("p", { class: "chips" }, el("span", { class: "chip chip-gris" }, plural(total, "artículo", "artículos"))),
      ),
    ),
  ];
  if (cuartos.length > 1) {
    partes.push(el("p", { class: "aviso" }, `Hay ${cuartos.length} cajas distintas con el ID ${c.id} (${cuartos.join(" y ")}). Revisa en qué cuarto estás.`));
  }
  for (const grupoCuarto of contenido) {
    partes.push(seccion(
      contenido.length > 1 ? `Contenido · ${cuarto(grupoCuarto.cuarto)}` : "Contenido",
      el("ul", { class: "lista-piezas" }, grupoCuarto.grupos.map((g) =>
        el("li", { class: "pieza" },
          icono(g.tipo === "Simulador" ? "simulador" : g.tipo === "Consumible" ? "caja" : "pieza"),
          el("div", {},
            el("a", { href: enlaceFicha(g.ids[0]), class: "pieza-nombre" }, g.nombre, g.cantidad > 1 ? el("span", { class: "cantidad" }, ` ×${g.cantidad}`) : null),
            el("p", { class: "pieza-nota" }, [g.tipo, g.articulos[0].kit].filter(Boolean).join(" · ")),
          ),
        ))),
    ));
  }
  if (!total) partes.push(el("p", { class: "tenue" }, "No hay artículos registrados en esta caja."));
  return el("article", { class: "ficha" }, partes);
}

// ---------- Buscador ----------

function vistaBuscador(idx, textoInicial = "", aviso = "") {
  const entrada = el("input", { type: "search", id: "buscar", placeholder: "Ej. PROMPT, SimMom, CJ-20, EQ-347", autocomplete: "off", value: textoInicial });
  const resultados = el("ul", { class: "resultados", "aria-live": "polite" });

  const simuladores = [...idx.porId.values()].filter((a) => a.tipo === "Simulador").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const fila = (r) => {
    const a = idx.porId.get(r.id);
    const sub = a ? ubicacion(a, idx, CUARTOS).texto : (idx.cajas.get(r.id)?.cuartos ?? []).map(cuarto).join(" / ");
    return el("li", {}, el("a", { href: enlaceFicha(r.id) },
      el("span", { class: "fuerte" }, `${r.id} · ${r.nombre}`),
      el("span", { class: "tenue" }, [r.tipo, sub].filter(Boolean).join(" · ")),
    ));
  };
  const pintar = () => {
    const q = entrada.value;
    resultados.replaceChildren();
    if (!q.trim()) {
      resultados.append(el("li", { class: "titulo-lista" }, `Simuladores (${simuladores.length})`), ...simuladores.map((a) => fila({ id: a.id, nombre: a.nombre, tipo: "" })));
      return;
    }
    const lista = buscar(q, idx);
    resultados.append(...(lista.length ? lista.map(fila) : [el("li", { class: "tenue" }, "Nada coincide con esa búsqueda.")]));
  };
  entrada.addEventListener("input", pintar);
  pintar();

  return el("div", {},
    el("h1", {}, "Inventario del CSC"),
    aviso ? el("p", { class: "aviso" }, aviso) : null,
    el("label", { for: "buscar" }, "Busca un simulador, accesorio o caja"),
    el("div", { class: "campo-buscar" }, icono("buscar"), entrada),
    resultados,
  );
}

// ---------- Arranque ----------

async function iniciar() {
  const contenido = document.getElementById("contenido");
  let datos;
  try {
    const respuesta = await fetch(RAIZ + CONFIG.inventario.urlDatos, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(respuesta.status);
    datos = await respuesta.json();
  } catch {
    contenido.replaceChildren(el("p", { class: "aviso" }, "No se pudo cargar el inventario. Revisa tu conexión e inténtalo de nuevo."));
    return;
  }
  const idx = indexar(datos);
  const ahora = ahoraLocal(new Date());
  const id = (new URLSearchParams(location.search).get("id") ?? "").trim().toUpperCase();

  let vista;
  if (!id) {
    vista = vistaBuscador(idx);
  } else if (idx.porId.has(id)) {
    const a = idx.porId.get(id);
    document.title = `${a.id} · ${a.nombre} · CSC`;
    vista = el("div", {}, el("a", { class: "volver", href: "./" }, "← Buscar otro"), fichaArticulo(a, idx, ahora));
  } else if (idx.cajas.has(id)) {
    document.title = `${id} · Caja · CSC`;
    vista = el("div", {}, el("a", { class: "volver", href: "./" }, "← Buscar otro"), fichaCaja(idx.cajas.get(id), idx));
  } else {
    vista = vistaBuscador(idx, "", `No encontramos «${id}» en el inventario. Búscalo por nombre:`);
  }
  contenido.replaceChildren(vista);

  if (idx.generado) {
    const [f, h] = idx.generado.split("T");
    document.getElementById("actualizado").textContent = `Inventario actualizado el ${formatoFecha(f)} a las ${h}.`;
  }
}

iniciar();
