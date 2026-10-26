import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarTarjeta,
  codigoDeLectura,
  interpretarLectura,
  urlTarjeta,
  vaEnPlano,
  unirCatalogo,
  zonasDeCuartos,
  moverZona,
  validarTarjeta,
  validarZona,
  validarSalida,
  validarRegreso,
  validarVerificacion,
  datosSalida,
  datosRegreso,
  datosCambioLugar,
  datosRevisionResuelta,
  datosVerificacion,
  enAlerta,
  resumen,
  repartirPorZona,
  coincide,
  duracionTexto,
  claveDia,
  filtrarMovimientos,
  agruparPorDia,
  pendientesExcel,
  describirMovimiento,
  csvMovimientos,
} from "../js/simuladores-logica.js";

// Fechas en hora local, para que las pruebas no dependan de la zona horaria de la máquina.
const AHORA = new Date(2026, 9, 26, 15, 0).getTime();
const MIN = 60000;
const HORA = 60 * MIN;
const USUARIO = { uid: "u1", correo: "ana.lopez@tec.mx", nombre: "Ana López" };

const ZONAS = [
  { id: "SalaA", nombre: "Sala A", orden: 1, tarjeta: "AA11BB22" },
  { id: "SalaB", nombre: "Sala B", orden: 2 },
  { id: "Almacen", nombre: "Almacén", orden: 3 },
];
const sim = (cambios = {}) => ({
  id: "EQ-010", nombre: "Torso de RCP adulto", categoria: "Simulador de RCP",
  zonaId: "SalaB", tarjeta: "04A2B19C", estado: "disponible", responsable: null, destino: null, desde: null, revision: null,
  ...cambios,
});
const fuera = (cambios = {}) => sim({ estado: "en_uso", responsable: "Grupo 3 Enfermería", destino: "Aula 4", desde: AHORA - 90 * MIN, ...cambios });

// ---------- Tarjetas ----------

test("normalizarTarjeta deja solo letras y números en mayúsculas", () => {
  assert.equal(normalizarTarjeta("04:a2:b1:9c"), "04A2B19C");
  assert.equal(normalizarTarjeta(" eq-004 "), "EQ004");
  assert.equal(normalizarTarjeta(null), "");
});

test("codigoDeLectura entiende el enlace de la tarjeta, el del QR y el ID escrito", () => {
  assert.equal(codigoDeLectura("https://aleja246.github.io/Centro_simul/simuladores/#EQ-347"), "EQ-347");
  assert.equal(codigoDeLectura("https://aleja246.github.io/Centro_simul/equipo/?id=EQ-347"), "EQ-347");
  assert.equal(codigoDeLectura("https://x.io/equipo/?modo=1&id=eq-12#arriba"), "EQ-12");
  assert.equal(codigoDeLectura("eq-010"), "EQ-010");
  assert.equal(codigoDeLectura("https://x.io/simuladores/#EQ%2D002"), "EQ-002");
});

test("interpretarLectura reconoce enlace, número de serie, ID escrito y zona", () => {
  const sims = [sim(), sim({ id: "EQ-002", nombre: "Brazo de venopunción", tarjeta: null })];
  assert.equal(interpretarLectura({ textos: ["https://x.io/simuladores/#EQ-002"] }, sims, ZONAS).item.id, "EQ-002");
  assert.equal(interpretarLectura({ textos: ["https://x.io/equipo/?id=EQ-002"] }, sims, ZONAS).item.id, "EQ-002");
  assert.equal(interpretarLectura({ serie: "04:a2:b1:9c", textos: [] }, sims, ZONAS).item.id, "EQ-010");
  assert.equal(interpretarLectura({ serie: "EQ-002", textos: ["EQ-002"] }, sims, ZONAS).item.id, "EQ-002");
  const z = interpretarLectura({ serie: "aa:11:bb:22" }, sims, ZONAS);
  assert.deepEqual([z.tipo, z.item.id], ["zona", "SalaA"]);
  const nueva = interpretarLectura({ serie: "99:88:77" }, sims, ZONAS);
  assert.deepEqual([nueva.tipo, nueva.tarjeta], ["desconocida", "998877"]);
});

test("urlTarjeta arma el enlace con o sin diagonal final", () => {
  assert.equal(urlTarjeta("https://aleja246.github.io/Centro_simul/", "EQ-347"), "https://aleja246.github.io/Centro_simul/simuladores/#EQ-347");
  assert.equal(urlTarjeta("https://aleja246.github.io/Centro_simul", "EQ-347"), "https://aleja246.github.io/Centro_simul/simuladores/#EQ-347");
});

// ---------- Catálogo y zonas ----------

const REGLAS = { tipos: ["Simulador"], categoriasQueEmpiezanCon: ["Simulador"] };

test("vaEnPlano usa el Tipo si existe y, si no, la categoría", () => {
  assert.equal(vaEnPlano({ categoria: "Simulador de tareas (brazo IV, intubación, etc.)" }, REGLAS), true);
  assert.equal(vaEnPlano({ categoria: "Simulador de paciente (maniquí)" }, REGLAS), true);
  assert.equal(vaEnPlano({ categoria: "Cables, accesorios y consumibles" }, REGLAS), false);
  assert.equal(vaEnPlano({ tipo: "Accesorio", categoria: "Simulador de tareas" }, REGLAS), false);
  assert.equal(vaEnPlano({ tipo: "simulador" }, REGLAS), true);
});

test("unirCatalogo junta el Excel con la bitácora y respeta el dato más reciente", () => {
  const catalogo = [
    { id: "EQ-001", nombre: "Estetoscopio", cuarto: "SalaA" },
    { id: "EQ-002", nombre: "Brazo IV", cuarto: "SalaA" },
    { id: "EQ-003", nombre: "Pelvis", cuarto: "" },
  ];
  const estados = [
    { id: "EQ-001", estado: "en_uso", responsable: "Ana", zonaId: "SalaA", actualizado: AHORA },
    { id: "EQ-002", zonaId: "SalaB", actualizado: AHORA - HORA },
    { id: "EQ-099", nombre: "Ya no está en el Excel", estado: "en_uso", desde: AHORA },
    { id: "EQ-098", nombre: "Borrado y disponible", estado: "disponible" },
  ];
  const leidoAntes = unirCatalogo(catalogo, estados, AHORA - 2 * HORA);
  assert.equal(leidoAntes.find((s) => s.id === "EQ-002").zonaId, "SalaB");
  const leidoDespues = unirCatalogo(catalogo, estados, AHORA - 30 * MIN);
  assert.equal(leidoDespues.find((s) => s.id === "EQ-002").zonaId, "SalaA");
  assert.equal(leidoDespues.find((s) => s.id === "EQ-001").estado, "en_uso");
  assert.equal(leidoDespues.find((s) => s.id === "EQ-003").zonaId, null);
  assert.equal(leidoDespues.find((s) => s.id === "EQ-003").estado, "disponible");
  assert.equal(leidoDespues.find((s) => s.id === "EQ-099").enCatalogo, false);
  assert.equal(leidoDespues.some((s) => s.id === "EQ-098"), false);
});

test("zonasDeCuartos junta los cuartos del inventario con los guardados, en orden", () => {
  const items = [{ zonaId: "SimRoom" }, { zonaId: "ClosetFinal" }, { zonaId: "SimRoom" }, { zonaId: null }];
  const z = zonasDeCuartos(items, [{ id: "SimRoom", nombre: "Sala de simulación", color: 2, orden: 1 }, { id: "Bodega", orden: 2 }]);
  assert.deepEqual(z.map((x) => x.id), ["SimRoom", "Bodega", "ClosetFinal"]);
  assert.equal(z[0].nombre, "Sala de simulación");
  assert.equal(z[2].nombre, "ClosetFinal");
  assert.equal(z[2].guardada, false);
});

test("moverZona intercambia el orden y solo regresa lo que cambia", () => {
  assert.deepEqual(moverZona(ZONAS, "SalaB", -1), [{ id: "SalaB", orden: 1 }, { id: "SalaA", orden: 2 }]);
  assert.deepEqual(moverZona(ZONAS, "SalaA", -1), []);
  assert.deepEqual(moverZona(ZONAS, "Almacen", 1), []);
});

// ---------- Validaciones ----------

test("validarTarjeta pide número y que no sea de otro equipo o zona", () => {
  assert.equal(validarTarjeta("11:22:33", [sim()], ZONAS, "EQ-010").ok, true);
  assert.equal(validarTarjeta("04A2B19C", [sim()], ZONAS, "EQ-010").ok, true);
  assert.match(validarTarjeta("04:a2:b1:9c", [sim()], ZONAS, "EQ-002").errores.tarjeta, /EQ-010/);
  assert.match(validarTarjeta("AA11BB22", [sim()], ZONAS, "EQ-002").errores.tarjeta, /Sala A/);
  assert.ok(validarTarjeta("", [], []).errores.tarjeta);
});

test("validarZona pide nombre único", () => {
  assert.equal(validarZona({ nombre: "Quirófano" }, ZONAS).ok, true);
  assert.ok(validarZona({ nombre: "" }, ZONAS).errores.nombre);
  assert.ok(validarZona({ nombre: "almacen" }, ZONAS).errores.nombre);
  assert.ok(validarZona({ nombre: "salaa" }, ZONAS).errores.nombre);
  assert.equal(validarZona({ nombre: "Almacén" }, ZONAS, "Almacen").ok, true);
});

test("validarSalida pide responsable y que el equipo esté disponible", () => {
  assert.equal(validarSalida({ responsable: "Dra. Treviño", destino: "" }, sim()).ok, true);
  assert.ok(validarSalida({ responsable: "  " }, sim()).errores.responsable);
  assert.ok(validarSalida({ responsable: "x".repeat(101) }, sim()).errores.responsable);
  assert.ok(validarSalida({ responsable: "Ana", destino: "x".repeat(121) }, sim()).errores.destino);
  assert.match(validarSalida({ responsable: "Ana" }, fuera()).errores.general, /Grupo 3/);
  assert.ok(validarSalida({ responsable: "Ana" }, undefined).errores.general);
});

test("validarRegreso pide cuarto cuando hay cuartos y que el equipo esté fuera", () => {
  assert.equal(validarRegreso({ zonaId: "SalaB" }, fuera(), ZONAS).ok, true);
  assert.equal(validarRegreso({}, fuera(), []).ok, true);
  assert.ok(validarRegreso({}, fuera(), ZONAS).errores.zonaId);
  assert.ok(validarRegreso({ zonaId: "Z9" }, fuera(), ZONAS).errores.zonaId);
  assert.ok(validarRegreso({ zonaId: "SalaB" }, sim(), ZONAS).errores.general);
  assert.ok(validarRegreso({ zonaId: "SalaB", revision: true, nota: "x".repeat(301) }, fuera(), ZONAS).errores.nota);
});

const OPCIONES = { estadoGeneral: ["Funciona", "Funciona con fallas", "No funciona", "Sin probar"], estadoFisico: ["Bueno", "Regular", "Malo"], funciona: ["Sí", "No"], resultado: ["Pasa", "No pasa"], conHojaVerificacion: true };

test("validarVerificacion revisa opciones, piezas y largos", () => {
  const bien = { estadoGeneral: "Funciona", estadoFisico: "Bueno", funciona: "Sí", resultado: "Pasa", piezasDanadas: "0", material: ["", ""] };
  assert.equal(validarVerificacion(bien, OPCIONES).ok, true);
  assert.equal(validarVerificacion({ estadoGeneral: "Funciona" }, { ...OPCIONES, conHojaVerificacion: false }).ok, true);
  assert.ok(validarVerificacion({ ...bien, estadoGeneral: "" }, OPCIONES).errores.estadoGeneral);
  assert.ok(validarVerificacion({ ...bien, estadoGeneral: "Excelente" }, OPCIONES).errores.estadoGeneral);
  assert.ok(validarVerificacion({ ...bien, resultado: "" }, OPCIONES).errores.resultado);
  assert.ok(validarVerificacion({ ...bien, piezasDanadas: "-1" }, OPCIONES).errores.piezasDanadas);
  assert.ok(validarVerificacion({ ...bien, piezasDanadas: "dos" }, OPCIONES).errores.piezasDanadas);
  assert.ok(validarVerificacion({ ...bien, material: ["x".repeat(121)] }, OPCIONES).errores.material0);
});

// ---------- Lo que se guarda ----------

test("datosSalida marca en uso, guarda de dónde salió y queda pendiente para el Excel", () => {
  const { simulador, movimiento } = datosSalida(sim(), { responsable: " Dra. Treviño ", destino: "" }, ZONAS, AHORA, USUARIO);
  assert.equal(simulador.estado, "en_uso");
  assert.equal(simulador.responsable, "Dra. Treviño");
  assert.equal(simulador.destino, null);
  assert.equal(simulador.desde, AHORA);
  assert.equal(movimiento.tipo, "salida");
  assert.equal(movimiento.cuarto, "SalaB");
  assert.equal(movimiento.zona, "Sala B");
  assert.equal(movimiento.por, "Ana López");
  assert.deepEqual(movimiento.excel, { estado: "pendiente" });
});

test("datosRegreso deja el equipo en el cuarto, calcula el tiempo fuera y guarda la falla", () => {
  const r = datosRegreso(fuera(), { zonaId: "Almacen", revision: true, nota: "No carga la batería" }, ZONAS, AHORA, USUARIO);
  assert.equal(r.simulador.estado, "disponible");
  assert.equal(r.simulador.zonaId, "Almacen");
  assert.equal(r.simulador.responsable, null);
  assert.equal(r.simulador.revision, "No carga la batería");
  assert.equal(r.movimiento.duracion, 90 * MIN);
  assert.equal(r.movimiento.cuarto, "Almacen");
  assert.equal(r.movimiento.zona, "Almacén");
  assert.equal(r.movimiento.responsable, "Grupo 3 Enfermería");
  const sinFalla = datosRegreso(fuera(), { zonaId: "SalaB" }, ZONAS, AHORA, USUARIO);
  assert.equal("revision" in sinFalla.simulador, false);
  assert.equal(sinFalla.movimiento.nota, null);
  assert.equal(datosRegreso(fuera(), { zonaId: "SalaB", revision: true, nota: " " }, ZONAS, AHORA, USUARIO).simulador.revision, "Sin detalles");
});

test("datosCambioLugar, datosRevisionResuelta y datosVerificacion", () => {
  const c = datosCambioLugar(sim(), "SalaA", ZONAS, AHORA, USUARIO);
  assert.equal(c.simulador.zonaId, "SalaA");
  assert.equal(c.movimiento.de, "Sala B");
  assert.equal(c.movimiento.cuarto, "SalaA");
  const r = datosRevisionResuelta(sim({ revision: "Falta pieza" }), AHORA, USUARIO);
  assert.equal(r.simulador.revision, null);
  assert.equal(r.movimiento.nota, "Falta pieza");
  const v = datosVerificacion(sim(), { estadoGeneral: "Funciona con fallas", piezasDanadas: "2", material: ["Membrana", " ", "", ""], estadoFisico: "Regular", funciona: "Sí", resultado: "No pasa", ajustes: "", comentarios: "Bolsa rota" }, ZONAS, AHORA, USUARIO);
  assert.equal(v.movimiento.tipo, "verificacion");
  assert.deepEqual(v.movimiento.verificacion.material, ["Membrana", "", "", ""]);
  assert.equal(v.movimiento.verificacion.piezasDanadas, 2);
  assert.equal(v.movimiento.verificacion.ajustes, null);
  assert.equal(v.simulador.estadoGeneral, "Funciona con fallas");
  assert.equal(v.simulador.ultimaVerificacion.resultado, "No pasa");
  assert.equal(datosVerificacion(sim(), { estadoGeneral: "Funciona", piezasDanadas: "" }, ZONAS, AHORA, USUARIO).movimiento.verificacion.piezasDanadas, null);
});

// ---------- Estado del centro ----------

test("enAlerta y resumen usan las horas de la configuración", () => {
  assert.equal(enAlerta(fuera({ desde: AHORA - 5 * HORA }), AHORA, 4), true);
  assert.equal(enAlerta(fuera({ desde: AHORA - 3 * HORA }), AHORA, 4), false);
  assert.equal(enAlerta(sim(), AHORA, 4), false);
  const sims = [sim(), fuera({ id: "s2", desde: AHORA - 5 * HORA }), fuera({ id: "s3" }), sim({ id: "s4", revision: "Falta pieza" })];
  assert.deepEqual(resumen(sims, AHORA, 4), { total: 4, disponibles: 2, enUso: 2, alerta: 1, revision: 1 });
});

test("repartirPorZona separa disponibles por cuarto (por ID), sin ubicar y fuera", () => {
  const sims = [sim({ id: "EQ-010" }), sim({ id: "EQ-002" }), sim({ id: "EQ-020", zonaId: "Z9" }), fuera({ id: "s3", desde: AHORA - HORA }), fuera({ id: "s4", desde: AHORA - 3 * HORA })];
  const r = repartirPorZona(sims, ZONAS);
  assert.deepEqual(r.porZona.get("SalaB").map((s) => s.id), ["EQ-002", "EQ-010"]);
  assert.deepEqual(r.porZona.get("SalaA"), []);
  assert.deepEqual(r.sinUbicar.map((s) => s.id), ["EQ-020"]);
  assert.deepEqual(r.fuera.map((s) => s.id), ["s4", "s3"]);
});

test("coincide busca sin importar acentos ni mayúsculas", () => {
  assert.equal(coincide(sim(), "rcp"), true);
  assert.equal(coincide(sim(), "eq-010"), true);
  assert.equal(coincide(sim({ caja: "CJ-10" }), "cj-10"), true);
  assert.equal(coincide(sim(), "parto"), false);
  assert.equal(coincide(sim(), ""), true);
});

test("duracionTexto", () => {
  assert.equal(duracionTexto(20 * 1000), "menos de 1 min");
  assert.equal(duracionTexto(45 * MIN), "45 min");
  assert.equal(duracionTexto(2 * HORA), "2 h");
  assert.equal(duracionTexto(2 * HORA + 14 * MIN), "2 h 14 min");
  assert.equal(duracionTexto(26 * HORA), "1 día 2 h");
  assert.equal(duracionTexto(48 * HORA), "2 días");
});

// ---------- Historial ----------

const MOVS = [
  { t: new Date(2026, 9, 25, 18, 30).getTime(), tipo: "reubicacion", sim: "Pad de sutura", codigo: "EQ-009", zona: "Almacén", de: "Sala B", por: "Ana López", excel: { estado: "ok" } },
  { t: new Date(2026, 9, 26, 9, 56).getTime(), tipo: "salida", sim: "Maniquí pediátrico", codigo: "EQ-002", zona: "Sala 2", responsable: "Dra. Treviño", destino: "Aula 4, \"Pediatría\"", por: "Ana López", excel: { estado: "pendiente" } },
  { t: new Date(2026, 9, 26, 14, 30).getTime(), tipo: "regreso", sim: "Maniquí pediátrico", codigo: "EQ-002", zona: "Sala 2", cuarto: "Sala2", responsable: "Dra. Treviño", duracion: 274 * MIN, nota: null, por: "Luis", excel: { estado: "error", mensaje: "sin red" } },
];

test("claveDia usa el día local", () => {
  assert.equal(claveDia(new Date(2026, 0, 5, 23, 59).getTime()), "2026-01-05");
});

test("filtrarMovimientos por tipo y por texto, del más reciente al más antiguo", () => {
  assert.deepEqual(filtrarMovimientos(MOVS).map((m) => m.tipo), ["regreso", "salida", "reubicacion"]);
  assert.deepEqual(filtrarMovimientos(MOVS, { tipo: "salida" }).map((m) => m.codigo), ["EQ-002"]);
  assert.equal(filtrarMovimientos(MOVS, { texto: "trevino" }).length, 2);
  assert.equal(filtrarMovimientos(MOVS, { texto: "luis" }).length, 1);
});

test("agruparPorDia y pendientesExcel", () => {
  assert.deepEqual(agruparPorDia(MOVS).map((x) => [x.dia, x.movimientos.length]), [["2026-10-26", 2], ["2026-10-25", 1]]);
  assert.deepEqual(pendientesExcel(MOVS).map((m) => m.tipo), ["salida", "regreso"]);
});

test("describirMovimiento arma frases cortas", () => {
  assert.equal(describirMovimiento(MOVS[1]), 'Se lo llevó Dra. Treviño · Aula 4, "Pediatría" · salió de Sala 2');
  assert.equal(describirMovimiento(MOVS[2]), "Regresó a Sala 2 · lo tenía Dra. Treviño · 4 h 34 min fuera");
  assert.equal(describirMovimiento(MOVS[0]), "Se movió de Sala B a Almacén");
  assert.equal(describirMovimiento({ tipo: "regreso" }), "Regresó a Sin ubicar");
  assert.equal(describirMovimiento({ tipo: "revision", nota: "Falta pieza" }), "Falla resuelta: Falta pieza");
  assert.equal(describirMovimiento({ tipo: "verificacion", verificacion: { estadoGeneral: "No funciona", resultado: "No pasa", piezasDanadas: 3, material: ["Campana", "", "Membrana"], comentarios: "Manguera suelta" } }),
    "No funciona · resultado: No pasa · 3 piezas dañadas · falta: Campana, Membrana · Manguera suelta");
});

test("csvMovimientos: BOM, comillas escapadas, \\r\\n, orden cronológico y estado del Excel", () => {
  const csv = csvMovimientos(MOVS);
  assert.ok(csv.startsWith("﻿\"Fecha\""));
  const lineas = csv.slice(1).split("\r\n");
  assert.equal(lineas.length, 4);
  assert.match(lineas[1], /^"2026-10-25","18:30","Cambio de lugar"/);
  assert.match(lineas[1], /"Sí"$/);
  assert.match(lineas[2], /"Aula 4, ""Pediatría"""/);
  assert.match(lineas[2], /"Pendiente"$/);
  assert.match(lineas[3], /"274"/);
  assert.match(lineas[3], /"Error"$/);
});
