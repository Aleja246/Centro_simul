import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import {
  normalizarEncabezado,
  elegirHoja,
  letraColumna,
  parsearDireccion,
  celda,
  buscarEncabezados,
  columna,
  columnas,
  buscarFila,
  catalogoDesdeValores,
  serialFecha,
  serialHora,
  encabezadosBitacora,
  filaBitacora,
  cambiosInventario,
  valoresInventario,
  cambiosVerificacion,
  cambiosEncabezado,
} from "../js/simuladores-excel-logica.js";

const EX = CONFIG.bitacora.excel;
const AHORA = new Date(2026, 9, 26, 15, 30).getTime();

// Hoja con la misma forma que "1Inventario": encabezados en la fila 1, un título de sección en la 2,
// cuatro columnas "Material que falta" y IDs reservados sin artículo. Datos inventados.
const ENC_INV = ["ID equipo", "Nombre / descripción del equipo", "Categoría", "Marca", "Zona del cuarto donde estaba", "Estado general", "¿Reparable?", "Accesorios y cables", "# piezas dañadas", "Acción sugerida", "Prioridad", "Caja sugerida", "Caja real", "Revisado por", "Fecha de revisión", "Notas / enlace a foto", "Material que falta", "Material que falta", "Material que falta", "Material que falta"];
const vacia = () => Array(20).fill("");
const filaInv = (id, nombre, cat, cuarto, caja, notas = "") => { const f = vacia(); Object.assign(f, { 0: id, 1: nombre, 2: cat, 3: "Marca X", 4: cuarto, 5: "Sin probar", 12: caja, 15: notas }); return f; };
const INVENTARIO = [
  ENC_INV,
  ["Inventario de equipos", ...Array(19).fill("")],
  filaInv("EQ-001", "Estetoscopio", "Equipo de diagnóstico manual", "TallerA", "CJ-10"),
  filaInv("EQ-002", "Torso de RCP", "Simulador de RCP", "SalaSim", "CJ-24", "Bolsa rota"),
  filaInv("eq-003", "Brazo de venopunción", "Simulador de tareas (brazo IV, intubación, etc.)", "", "CJ-30"),
  ["EQ-004", ...Array(19).fill("")],
  filaInv("EQ-002", "Duplicado", "Simulador de RCP", "SalaSim", "CJ-24"),
];
const DIR_INV = "'1Inventario'!A1:T7";

// Hoja con la forma de "Verificación": títulos, etiquetas Fecha:/Realizó:/Hora:, resumen,
// encabezados en la fila 9 (desde la columna A) y renglones de área. Datos inventados.
const VERIFICACION = [
  ["CENTRO DE SIMULACIÓN", "", "", "", "", "", "", ""],
  ["Verificación área", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["Fecha:", "", "", "Realizó:", "", "", "Hora:", ""],
  ["Frecuencia:", "", "", "Revisión:", "", "", "", ""],
  ["", "Equipos", "Verificados", "Pasan", "No pasan", "Pendientes", "% que pasa", ""],
  ["Resumen", 3, 0, 0, 0, 3, "0%", ""],
  ["", "", "", "", "", "", "", ""],
  ["Área", "ID", "Equipo", "Estado físico", "Funciona", "Ajustes", "Resultado", "Comentarios"],
  ["Ginecología", "", "", "", "", "", "", ""],
  ["", "EQ-002", "Torso de RCP", "", "", "", "", ""],
  ["", "", "Sin ID todavía", "", "", "", "", ""],
];

test("normalizarEncabezado ignora acentos, mayúsculas, espacios y dos puntos", () => {
  assert.equal(normalizarEncabezado("  Fecha de  revisión "), "fecha de revision");
  assert.equal(normalizarEncabezado("Realizó:"), "realizo");
  assert.equal(normalizarEncabezado("# piezas dañadas"), "# piezas danadas");
});

test("elegirHoja encuentra la hoja aunque tenga número al inicio o acentos distintos", () => {
  const hojas = ["1Inventario", "Cajas", "2Verificación", "Bitácora de movimientos"];
  assert.equal(elegirHoja(hojas, "Inventario"), "1Inventario");
  assert.equal(elegirHoja(hojas, "1Inventario"), "1Inventario");
  assert.equal(elegirHoja(hojas, "Verificacion"), "2Verificación");
  assert.equal(elegirHoja(hojas, "Bitácora de movimientos"), "Bitácora de movimientos");
  assert.equal(elegirHoja(hojas, "Reservas"), null);
});

test("letraColumna, parsearDireccion y celda", () => {
  assert.deepEqual([0, 4, 25, 26, 51, 52].map(letraColumna), ["A", "E", "Z", "AA", "AZ", "BA"]);
  assert.deepEqual(parsearDireccion("'1Inventario'!A1:T498"), { col: 0, fila: 1 });
  assert.deepEqual(parsearDireccion("Hoja1!$C$3:$H$40"), { col: 2, fila: 3 });
  assert.equal(celda({ col: 0, fila: 1 }, 342, 4), "E343");
  assert.equal(celda({ col: 2, fila: 3 }, 0, 0), "C3");
});

test("buscarEncabezados encuentra la fila y guarda columnas repetidas", () => {
  const enc = buscarEncabezados(INVENTARIO, [EX.inventario.columnas.id, EX.inventario.columnas.nombre]);
  assert.equal(enc.fila, 0);
  assert.equal(columna(enc, "zona del cuarto donde estaba"), 4);
  assert.deepEqual(columnas(enc, "Material que falta"), [16, 17, 18, 19]);
  assert.equal(columna(enc, "Material que falta", 2), 18);
  assert.equal(columna(enc, "No existe"), -1);
  const v = buscarEncabezados(VERIFICACION, [EX.verificacion.columnas.id, EX.verificacion.columnas.estadoFisico]);
  assert.equal(v.fila, 8);
  assert.equal(columna(v, "ID"), 1);
  assert.equal(buscarEncabezados(VERIFICACION, ["No existe"]), null);
});

test("buscarFila encuentra el ID sin importar mayúsculas", () => {
  const enc = buscarEncabezados(INVENTARIO, ["ID equipo"]);
  assert.equal(buscarFila(INVENTARIO, enc, 0, "EQ-002"), 3);
  assert.equal(buscarFila(INVENTARIO, enc, 0, "EQ-003"), 4);
  assert.equal(buscarFila(INVENTARIO, enc, 0, "EQ-999"), -1);
  const v = buscarEncabezados(VERIFICACION, ["ID", "Estado físico"]);
  assert.equal(buscarFila(VERIFICACION, v, 1, "eq-002"), 10);
});

test("catalogoDesdeValores salta títulos e IDs vacíos y avisa de repetidos", () => {
  const r = catalogoDesdeValores(INVENTARIO, DIR_INV, EX.inventario.columnas);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => i.id), ["EQ-001", "EQ-002", "EQ-003"]);
  assert.deepEqual(r.repetidos, ["EQ-002"]);
  const torso = r.items[1];
  assert.equal(torso.fila, 4);
  assert.equal(torso.cuarto, "SalaSim");
  assert.equal(torso.caja, "CJ-24");
  assert.equal(torso.estadoGeneral, "Sin probar");
  assert.equal(torso.notas, "Bolsa rota");
  assert.equal(catalogoDesdeValores([["a", "b"]], "A1:B1", EX.inventario.columnas).ok, false);
});

test("serialFecha y serialHora dan los números que usa Excel", () => {
  assert.equal(serialFecha(new Date(2026, 8, 28, 23, 59).getTime()), 46293);
  assert.equal(serialFecha(new Date(1900, 0, 1).getTime()), 2);
  assert.equal(serialHora(new Date(2026, 0, 1, 12, 0).getTime()), 0.5);
  assert.equal(serialHora(new Date(2026, 0, 1, 6, 0).getTime()), 0.25);
});

test("filaBitacora llena cada columna por su encabezado, en cualquier orden", () => {
  const cols = EX.bitacora.columnas;
  const encabezados = encabezadosBitacora(cols);
  assert.equal(encabezados[0], cols.fecha);
  const mov = { id: "abc123", t: AHORA, tipo: "regreso", codigo: "EQ-002", sim: "Torso de RCP", responsable: "Grupo 3", destino: "Aula 4", cuarto: "SalaSim", zona: "Sala de simulación", duracion: 95 * 60000, nota: "No carga", por: "Ana López" };
  const fila = filaBitacora(mov, encabezados, cols);
  const por = Object.fromEntries(encabezados.map((h, i) => [h, fila[i]]));
  assert.deepEqual(por[cols.fecha], { v: serialFecha(AHORA), f: "m/d/yyyy" });
  assert.equal(por[cols.hora].f, "hh:mm");
  assert.equal(por[cols.movimiento].v, "Regreso");
  assert.equal(por[cols.cuarto].v, "SalaSim");
  assert.equal(por[cols.minutos].v, 95);
  assert.equal(por[cols.registro].v, "Ana López");
  assert.equal(por[cols.folio].v, "abc123");
  // Encabezados en otro orden y uno que la página no conoce
  const otra = filaBitacora(mov, ["Observaciones", "ID equipo", "fecha"], cols);
  assert.deepEqual(otra.map((c) => c.v), ["", "EQ-002", serialFecha(AHORA)]);
});

test("filaBitacora resume la verificación en la columna de notas", () => {
  const cols = EX.bitacora.columnas;
  const mov = { t: AHORA, tipo: "verificacion", codigo: "EQ-001", verificacion: { estadoGeneral: "No funciona", resultado: "No pasa", piezasDanadas: 2, material: ["Campana", ""], ajustes: "Se apretó la oliva", comentarios: "Manguera suelta" } };
  const fila = filaBitacora(mov, [cols.notas], cols);
  assert.equal(fila[0].v, "Estado: No funciona · Resultado: No pasa · Piezas dañadas: 2 · Falta: Campana · Ajustes: Se apretó la oliva · Manguera suelta");
});

test("cambiosInventario: el regreso solo cambia el cuarto", () => {
  const enc = buscarEncabezados(INVENTARIO, ["ID equipo"]);
  const c = cambiosInventario({ t: AHORA, tipo: "regreso", cuarto: "TallerA" }, INVENTARIO[3], enc, EX.inventario.columnas);
  assert.deepEqual(c, [{ col: 4, valor: "TallerA", formato: null }]);
  assert.deepEqual(cambiosInventario({ t: AHORA, tipo: "salida" }, INVENTARIO[3], enc, EX.inventario.columnas), []);
  assert.equal(cambiosInventario({ t: AHORA, tipo: "reubicacion", cuarto: "SalaSim" }, INVENTARIO[3], enc, EX.inventario.columnas)[0].col, 4);
});

test("cambiosInventario: la verificación llena estado, piezas, material, revisó, fecha y agrega la nota", () => {
  const enc = buscarEncabezados(INVENTARIO, ["ID equipo"]);
  const mov = { t: AHORA, tipo: "verificacion", por: "Ana López", verificacion: { estadoGeneral: "Funciona con fallas", piezasDanadas: 1, material: ["Membrana", "", "", ""], comentarios: "Se cambió la membrana" } };
  const c = cambiosInventario(mov, INVENTARIO[3], enc, EX.inventario.columnas);
  const por = Object.fromEntries(c.map((x) => [x.col, x]));
  assert.equal(por[5].valor, "Funciona con fallas");
  assert.equal(por[8].valor, 1);
  assert.equal(por[13].valor, "Ana López");
  assert.deepEqual([por[14].valor, por[14].formato], [serialFecha(AHORA), "m/d/yyyy"]);
  assert.equal(por[15].valor, "Bolsa rota | 26/10/2026: Se cambió la membrana");
  assert.deepEqual([16, 17, 18, 19].map((i) => por[i].valor), ["Membrana", "", "", ""]);
  const sinNota = cambiosInventario({ ...mov, verificacion: { estadoGeneral: "Funciona", material: [] } }, INVENTARIO[2], enc, EX.inventario.columnas);
  assert.equal(sinNota.some((x) => x.col === 15), false);
});

test("valoresInventario lee lo que hay hoy en la fila", () => {
  const enc = buscarEncabezados(INVENTARIO, ["ID equipo"]);
  const fila = INVENTARIO[3].slice();
  fila[8] = 2; fila[16] = "Campana"; fila[19] = "Olivas";
  const v = valoresInventario(fila, enc, EX.inventario.columnas);
  assert.deepEqual(v, { estadoGeneral: "Sin probar", piezasDanadas: "2", material: ["Campana", "", "", "Olivas"], notas: "Bolsa rota", revisadoPor: "" });
});

test("cambiosVerificacion y cambiosEncabezado para la hoja de Verificación", () => {
  const enc = buscarEncabezados(VERIFICACION, ["ID", "Estado físico"]);
  const mov = { t: AHORA, tipo: "verificacion", por: "Ana López", verificacion: { estadoFisico: "Bueno", funciona: "Sí", ajustes: null, resultado: "Pasa", comentarios: "Sin novedad" } };
  assert.deepEqual(cambiosVerificacion(mov, enc, EX.verificacion.columnas).map((c) => [c.col, c.valor]), [[3, "Bueno"], [4, "Sí"], [6, "Pasa"], [7, "Sin novedad"]]);
  const e = cambiosEncabezado(VERIFICACION, EX.verificacion.encabezado, mov);
  assert.deepEqual(e.map((c) => [c.fila, c.col, c.valor]), [[3, 1, serialFecha(AHORA)], [3, 4, "Ana López"], [3, 7, serialHora(AHORA)]]);
});
