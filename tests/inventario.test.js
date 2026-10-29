import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  indexar,
  ubicacion,
  relacionUbicacion,
  estadoReserva,
  diaRelativo,
  agruparPorNombre,
  indicadorAccesorio,
  piezasDe,
  mismoKit,
  contenidoCaja,
  buscar,
  etiquetasA,
  normalizar,
} from "../js/inventario.js";

// Inventario chico de ejemplo (estructura igual a datos/inventario.json).
const art = (id, nombre, c = {}) => ({
  id, nombre, tipo: "Accesorio", categoria: "", marca: "", cuarto: "Gineco", caja: "", guardado: "",
  estado: "Sin probar", notas: "", kit: "", pertenece: "", qr: 1, ...c,
});
const DATOS = {
  generado: "2026-10-26T10:00",
  articulos: [
    art("EQ-347", "Birthing Simulator PROMPT Flex", { tipo: "Simulador", caja: "CJ-23", kit: "PROMPT Flex" }),
    art("EQ-303", "PPH Uterus Assembly", { caja: "CJ-18", kit: "Módulo PPH", pertenece: "EQ-347" }),
    art("EQ-307", "PPH Uterus Assembly", { caja: "CJ-19", kit: "Módulo PPH", pertenece: "EQ-347" }),
    art("EQ-348", "Bed Straps", { caja: "CJ-23", kit: "PROMPT Flex", pertenece: "EQ-347" }),
    art("EQ-252", "Bomba de sangrado", { cuarto: "Taller", caja: "CJ-10", kit: "Módulo PPH", pertenece: "EQ-347" }),
    art("EQ-304", "Concentrated Venous Blood", { tipo: "Consumible", qr: null, caja: "CJ-18", kit: "Módulo PPH", pertenece: "EQ-347" }),
    art("EQ-310", "PPH Blood Container", { caja: "CJ-19", kit: "Módulo PPH", pertenece: "EQ-347", estado: "No funciona" }),
    art("EQ-141", "Set de adaptadores SimMom", { cuarto: "Taller", caja: "CJ-09", kit: "SimMom" }),
    art("EQ-142", "Switching power supply", { cuarto: "Taller", caja: "CJ-09", kit: "SimMom" }),
    art("EQ-158", "Link box plus", { cuarto: "Taller", caja: "CJ-10" }),
    art("EQ-097", "Venas niño", { cuarto: "Taller", guardado: "Individual, propia" }),
    art("EQ-001", "Estetoscopio azul", { tipo: "Equipo clínico", qr: 2, cuarto: "Taller" }),
  ],
  cajas: [
    { id: "CJ-10", contenido: "Mixta", estante: "", cuartos: ["Taller", "Gineco"] },
    { id: "CJ-18", contenido: "Módulo PPH 1", estante: "Estante 2, nivel 3", cuartos: ["Gineco"] },
    { id: "CJ-23", contenido: "PROMPT Flex", estante: "", cuartos: ["Gineco"] },
  ],
  reservas: [
    { id: "EQ-347", fecha: "2026-10-26", inicio: "10:00", fin: "12:00", actividad: "Parto", sala: "Sala 2" },
    { id: "EQ-347", fecha: "2026-10-29", inicio: "08:00", fin: "09:00", actividad: "PPH", sala: "Sala 1" },
    { id: "EQ-001", fecha: "2026-11-20", inicio: "08:00", fin: "09:00", actividad: "Lejana", sala: "" },
  ],
};
const idx = indexar(DATOS);

test("ubicación: cuarto, caja y estante de la caja", () => {
  assert.equal(ubicacion(idx.porId.get("EQ-303"), idx).texto, "Gineco · Caja CJ-18 · Estante 2, nivel 3");
  assert.equal(ubicacion(idx.porId.get("EQ-347"), idx).texto, "Gineco · Caja CJ-23");
  assert.equal(ubicacion(idx.porId.get("EQ-097"), idx).texto, "Taller · Individual, propia");
  assert.equal(ubicacion(idx.porId.get("EQ-347"), idx, { Gineco: "Ginecología" }).texto, "Ginecología · Caja CJ-23");
});

test("relación de un accesorio con su simulador", () => {
  const sim = idx.porId.get("EQ-347");
  assert.equal(relacionUbicacion(idx.porId.get("EQ-348"), sim), "misma-caja");
  assert.equal(relacionUbicacion(idx.porId.get("EQ-303"), sim), "mismo-cuarto");
  assert.equal(relacionUbicacion(idx.porId.get("EQ-252"), sim), "otro-cuarto");
  assert.equal(relacionUbicacion({ cuarto: "" }, sim), "sin-dato");
});

test("estado de reserva según la hora", () => {
  const r = DATOS.reservas;
  assert.equal(estadoReserva("EQ-347", r, "2026-10-26T09:00").estado, "hoy");
  assert.equal(estadoReserva("EQ-347", r, "2026-10-26T10:00").estado, "en-uso");
  assert.equal(estadoReserva("EQ-347", r, "2026-10-26T11:59").estado, "en-uso");
  const despues = estadoReserva("EQ-347", r, "2026-10-26T12:00");
  assert.equal(despues.estado, "semana");
  assert.equal(despues.proxima.fecha, "2026-10-29");
  assert.equal(estadoReserva("EQ-347", r, "2026-10-29T09:00").estado, "libre");
  assert.equal(estadoReserva("EQ-303", r, "2026-10-26T09:00").estado, "libre");
});

test("reserva a más de 7 días: libre, pero se informa la próxima", () => {
  const e = estadoReserva("EQ-001", DATOS.reservas, "2026-10-26T09:00");
  assert.equal(e.estado, "libre");
  assert.equal(e.proxima.fecha, "2026-11-20");
});

test("sin hoja de reservas: sin-datos", () => {
  assert.equal(estadoReserva("EQ-347", null, "2026-10-26T09:00").estado, "sin-datos");
  assert.equal(indexar({ ...DATOS, reservas: null }).reservas, null);
});

test("día relativo", () => {
  assert.equal(diaRelativo("2026-10-26", "2026-10-26"), "Hoy");
  assert.equal(diaRelativo("2026-10-27", "2026-10-26"), "Mañana");
  assert.equal(diaRelativo("2026-10-29", "2026-10-26"), "Jueves 29/10");
});

test("agrupar artículos iguales junta cantidades y ubicaciones", () => {
  const [g] = agruparPorNombre([idx.porId.get("EQ-303"), idx.porId.get("EQ-307")]);
  assert.equal(g.cantidad, 2);
  assert.deepEqual(g.ubicaciones.map((u) => u.caja), ["CJ-18", "CJ-19"]);
  assert.deepEqual(g.ids, ["EQ-303", "EQ-307"]);
});

test("piezas de un simulador: accesorios y consumibles por kit", () => {
  const p = piezasDe("EQ-347", idx);
  assert.equal(p.total, 6);
  assert.deepEqual(p.accesorios.map((k) => k.kit), ["Módulo PPH", "PROMPT Flex"]);
  assert.equal(p.consumibles.length, 1);
  assert.equal(p.consumibles[0].grupos[0].nombre, "Concentrated Venous Blood");
  assert.deepEqual(piezasDe("EQ-999", idx), { accesorios: [], consumibles: [], total: 0 });
});

test("indicador de cada accesorio", () => {
  const sim = idx.porId.get("EQ-347");
  const grupos = piezasDe("EQ-347", idx).accesorios.flatMap((k) => k.grupos);
  const de = (nombre) => indicadorAccesorio(grupos.find((g) => g.nombre === nombre), sim);
  assert.equal(de("PPH Uterus Assembly"), "ok");
  assert.equal(de("Bed Straps"), "ok");
  assert.equal(de("Bomba de sangrado"), "traslado");
  assert.equal(de("PPH Blood Container"), "alerta");
});

test("mismo kit sin simulador registrado (SimMom)", () => {
  const otros = mismoKit(idx.porId.get("EQ-141"), idx);
  assert.deepEqual(otros.map((g) => g.nombre), ["Switching power supply"]);
  assert.deepEqual(mismoKit(idx.porId.get("EQ-158"), idx), []);
});

test("contenido de una caja con ID repetido en dos cuartos", () => {
  const c = contenidoCaja("CJ-10", idx);
  assert.deepEqual(c.map((x) => x.cuarto), ["Taller"]);
  assert.equal(c[0].total, 2);
  assert.deepEqual(contenidoCaja("CJ-99", idx), []);
});

test("buscar sin acentos ni mayúsculas; el ID exacto va primero", () => {
  assert.equal(normalizar("  Módulo   PPH "), "modulo pph");
  assert.equal(buscar("eq-303", idx)[0].id, "EQ-303");
  assert.ok(buscar("modulo pph", idx).some((r) => r.id === "EQ-252"));
  assert.ok(buscar("venas nino", idx).some((r) => r.id === "EQ-097"));
  assert.equal(buscar("cj-18", idx)[0].tipo, "Caja");
  assert.deepEqual(buscar("   ", idx), []);
});

test("etiquetas: por prioridad, cuarto, cajas o lista de IDs", () => {
  const ids = (f) => etiquetasA(idx, f).map((e) => e.articulo?.id ?? e.caja.id);
  assert.equal(ids({ prioridad1: true }).length, 10);
  assert.deepEqual(ids({ prioridad2: true }), ["EQ-001"]);
  assert.deepEqual(ids({ cajas: true, cuarto: "Gineco" }), ["CJ-10", "CJ-18", "CJ-23"]);
  assert.deepEqual(ids({ prioridad1: true, cuarto: "Taller" }), ["EQ-252", "EQ-141", "EQ-142", "EQ-158", "EQ-097"]);
  // Los consumibles nunca tienen etiqueta propia, aunque se pidan por ID.
  assert.deepEqual(ids({ ids: "eq-347, EQ-304 cj-18" }), ["EQ-347", "CJ-18"]);
});

test("el JSON real del repo tiene la forma esperada", () => {
  const real = JSON.parse(readFileSync(new URL("../datos/inventario.json", import.meta.url), "utf8"));
  const i = indexar(real);
  assert.ok(i.porId.size > 0);
  for (const a of real.articulos) {
    assert.match(a.id, /^EQ-\d+$/);
    if (a.pertenece) assert.ok(i.porId.has(a.pertenece), `${a.id} pertenece a ${a.pertenece}, que no existe`);
    if (a.tipo === "Consumible" || a.tipo === "Electrónica / general") assert.equal(a.qr, null);
  }
});

test("NFC: dirección que se graba y lectura del ID", async () => {
  const { urlFicha, idDeUrl } = await import("../js/inventario.js");
  const pagina = "https://aleja246.github.io/Centro_simul/nfc/";
  assert.equal(urlFicha(pagina, "EQ-347"), "https://aleja246.github.io/Centro_simul/equipo/?id=EQ-347");
  assert.equal(urlFicha(pagina + "?cuarto=x", "CJ-10.1"), "https://aleja246.github.io/Centro_simul/equipo/?id=CJ-10.1");
  assert.equal(idDeUrl("https://aleja246.github.io/Centro_simul/equipo/?id=eq-347"), "EQ-347");
  assert.equal(idDeUrl("https://ejemplo.com/otra/?id=EQ-1"), null);
  assert.equal(idDeUrl("no es url"), null);
  assert.equal(idDeUrl("https://aleja246.github.io/Centro_simul/equipo/"), null);
});
