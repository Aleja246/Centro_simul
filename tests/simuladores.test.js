import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarTarjeta,
  codigoDeLectura,
  interpretarLectura,
  urlTarjeta,
  siguienteCodigo,
  validarSimulador,
  validarZona,
  validarSalida,
  validarRegreso,
  datosSalida,
  datosRegreso,
  datosCambioLugar,
  datosRevisionResuelta,
  moverZona,
  enAlerta,
  resumen,
  repartirPorZona,
  coincide,
  duracionTexto,
  claveDia,
  filtrarMovimientos,
  agruparPorDia,
  describirMovimiento,
  csvMovimientos,
} from "../js/simuladores-logica.js";

// Fechas en hora local, para que las pruebas no dependan de la zona horaria de la máquina.
const AHORA = new Date(2026, 9, 26, 15, 0).getTime();
const MIN = 60000;
const HORA = 60 * MIN;
const USUARIO = { uid: "u1", correo: "ana.lopez@tec.mx" };

const ZONAS = [
  { id: "z1", nombre: "Sala de alta fidelidad", orden: 1, tarjeta: "AA11BB22" },
  { id: "z2", nombre: "Sala de habilidades", orden: 2 },
  { id: "z3", nombre: "Almacén", orden: 3 },
];
const sim = (cambios = {}) => ({
  id: "s1", codigo: "SIM-001", nombre: "Torso de RCP adulto", categoria: "Reanimación",
  zonaBase: "z2", zonaId: "z2", tarjeta: "04A2B19C", estado: "disponible", responsable: null, destino: null, desde: null, revision: null,
  ...cambios,
});
const fuera = (cambios = {}) => sim({ estado: "en_uso", responsable: "Grupo 3 Enfermería", destino: "Aula 4", desde: AHORA - 90 * MIN, ...cambios });

// ---------- Tarjetas ----------

test("normalizarTarjeta deja solo letras y números en mayúsculas", () => {
  assert.equal(normalizarTarjeta("04:a2:b1:9c"), "04A2B19C");
  assert.equal(normalizarTarjeta(" sim-004 "), "SIM004");
  assert.equal(normalizarTarjeta(null), "");
});

test("codigoDeLectura toma lo que va después del # en un enlace", () => {
  assert.equal(codigoDeLectura("https://aleja246.github.io/Centro_simul/simuladores/#SIM-004"), "SIM-004");
  assert.equal(codigoDeLectura("sim-010"), "SIM-010");
  assert.equal(codigoDeLectura("https://x.io/simuladores/#SIM%2D002"), "SIM-002");
});

test("interpretarLectura reconoce enlace, número de serie, código escrito y zona", () => {
  const sims = [sim(), sim({ id: "s2", codigo: "SIM-002", nombre: "Brazo de venopunción", tarjeta: null })];
  assert.equal(interpretarLectura({ serie: "", textos: ["https://x.io/simuladores/#SIM-002"] }, sims, ZONAS).item.id, "s2");
  assert.equal(interpretarLectura({ serie: "04:a2:b1:9c", textos: [] }, sims, ZONAS).item.id, "s1");
  assert.equal(interpretarLectura({ serie: "SIM-002", textos: ["SIM-002"] }, sims, ZONAS).item.id, "s2");
  const z = interpretarLectura({ serie: "aa:11:bb:22" }, sims, ZONAS);
  assert.equal(z.tipo, "zona");
  assert.equal(z.item.id, "z1");
  const nueva = interpretarLectura({ serie: "99:88:77" }, sims, ZONAS);
  assert.deepEqual([nueva.tipo, nueva.tarjeta], ["desconocida", "998877"]);
});

test("urlTarjeta arma el enlace con o sin diagonal final", () => {
  assert.equal(urlTarjeta("https://aleja246.github.io/Centro_simul/", "SIM-004"), "https://aleja246.github.io/Centro_simul/simuladores/#SIM-004");
  assert.equal(urlTarjeta("https://aleja246.github.io/Centro_simul", "SIM-004"), "https://aleja246.github.io/Centro_simul/simuladores/#SIM-004");
});

// ---------- Validaciones ----------

test("siguienteCodigo continúa la numeración", () => {
  assert.equal(siguienteCodigo([]), "SIM-001");
  assert.equal(siguienteCodigo([{ codigo: "SIM-009" }, { codigo: "SIM-002" }, { codigo: "OTRO" }]), "SIM-010");
});

test("validarSimulador acepta un simulador correcto, también al editarse a sí mismo", () => {
  assert.deepEqual(validarSimulador({ nombre: "Pad de sutura", codigo: "sim-002", zonaBase: "z1" }, [sim()], ZONAS), { ok: true, errores: {} });
  assert.equal(validarSimulador({ nombre: "Torso", codigo: "SIM-001", tarjeta: "04A2B19C" }, [sim()], ZONAS, "s1").ok, true);
});

test("validarSimulador rechaza lo que está mal", () => {
  const malos = [
    [{ nombre: "", codigo: "SIM-002" }, "nombre"],
    [{ nombre: "x".repeat(81), codigo: "SIM-002" }, "nombre"],
    [{ nombre: "Pad", codigo: "" }, "codigo"],
    [{ nombre: "Pad", codigo: "SIM 002" }, "codigo"],
    [{ nombre: "Pad", codigo: "-SIM" }, "codigo"],
    [{ nombre: "Pad", codigo: "S" }, "codigo"],
    [{ nombre: "Pad", codigo: "sim-001" }, "codigo"],
    [{ nombre: "Pad", codigo: "SIM-002", tarjeta: "04:a2:b1:9c" }, "tarjeta"],
    [{ nombre: "Pad", codigo: "SIM-002", tarjeta: "AA11BB22" }, "tarjeta"],
    [{ nombre: "Pad", codigo: "SIM-002", zonaBase: "z9" }, "zonaBase"],
  ];
  for (const [d, campo] of malos) {
    const r = validarSimulador(d, [sim()], ZONAS);
    assert.equal(r.ok, false, JSON.stringify(d));
    assert.ok(r.errores[campo], `${campo}: ${JSON.stringify(d)}`);
  }
});

test("validarZona pide nombre único y tarjeta libre", () => {
  assert.equal(validarZona({ nombre: "Quirófano" }, ZONAS, [sim()]).ok, true);
  assert.ok(validarZona({ nombre: "" }, ZONAS, []).errores.nombre);
  assert.ok(validarZona({ nombre: "almacén" }, ZONAS, []).errores.nombre);
  assert.equal(validarZona({ nombre: "Almacén" }, ZONAS, [], "z3").ok, true);
  assert.ok(validarZona({ nombre: "Quirófano", tarjeta: "04A2B19C" }, ZONAS, [sim()]).errores.tarjeta);
});

test("validarSalida pide responsable y que el simulador esté disponible", () => {
  assert.equal(validarSalida({ responsable: "Dra. Treviño", destino: "" }, sim()).ok, true);
  assert.ok(validarSalida({ responsable: "  " }, sim()).errores.responsable);
  assert.ok(validarSalida({ responsable: "x".repeat(101) }, sim()).errores.responsable);
  assert.ok(validarSalida({ responsable: "Ana", destino: "x".repeat(121) }, sim()).errores.destino);
  assert.match(validarSalida({ responsable: "Ana" }, fuera()).errores.general, /Grupo 3/);
  assert.ok(validarSalida({ responsable: "Ana" }, undefined).errores.general);
});

test("validarRegreso pide zona cuando hay zonas y que el simulador esté fuera", () => {
  assert.equal(validarRegreso({ zonaId: "z2" }, fuera(), ZONAS).ok, true);
  assert.equal(validarRegreso({}, fuera(), []).ok, true);
  assert.ok(validarRegreso({}, fuera(), ZONAS).errores.zonaId);
  assert.ok(validarRegreso({ zonaId: "z9" }, fuera(), ZONAS).errores.zonaId);
  assert.ok(validarRegreso({ zonaId: "z2" }, sim(), ZONAS).errores.general);
  assert.ok(validarRegreso({ zonaId: "z2", revision: true, nota: "x".repeat(301) }, fuera(), ZONAS).errores.nota);
});

// ---------- Lo que se guarda ----------

test("datosSalida marca en uso y registra quién y desde dónde", () => {
  const { simulador, movimiento } = datosSalida(sim(), { responsable: " Dra. Treviño ", destino: "" }, ZONAS, AHORA, USUARIO);
  assert.deepEqual(simulador, { estado: "en_uso", responsable: "Dra. Treviño", destino: null, desde: AHORA, actualizado: AHORA, actualizadoPor: "ana.lopez@tec.mx" });
  assert.equal(movimiento.tipo, "salida");
  assert.equal(movimiento.zona, "Sala de habilidades");
  assert.equal(movimiento.por, "ana.lopez@tec.mx");
});

test("datosRegreso deja el simulador en la zona, calcula el tiempo fuera y guarda la falla", () => {
  const r = datosRegreso(fuera(), { zonaId: "z3", revision: true, nota: "No carga la batería" }, ZONAS, AHORA, USUARIO);
  assert.equal(r.simulador.estado, "disponible");
  assert.equal(r.simulador.zonaId, "z3");
  assert.equal(r.simulador.responsable, null);
  assert.equal(r.simulador.revision, "No carga la batería");
  assert.equal(r.movimiento.duracion, 90 * MIN);
  assert.equal(r.movimiento.zona, "Almacén");
  assert.equal(r.movimiento.responsable, "Grupo 3 Enfermería");
  const sinFalla = datosRegreso(fuera(), { zonaId: "z2" }, ZONAS, AHORA, USUARIO);
  assert.equal("revision" in sinFalla.simulador, false);
  assert.equal(sinFalla.movimiento.nota, null);
  assert.equal(datosRegreso(fuera(), { zonaId: "z2", revision: true, nota: " " }, ZONAS, AHORA, USUARIO).simulador.revision, "Sin detalles");
});

test("datosCambioLugar y datosRevisionResuelta", () => {
  const c = datosCambioLugar(sim(), "z1", ZONAS, AHORA, USUARIO);
  assert.equal(c.simulador.zonaId, "z1");
  assert.equal(c.movimiento.de, "Sala de habilidades");
  assert.equal(c.movimiento.zona, "Sala de alta fidelidad");
  const r = datosRevisionResuelta(sim({ revision: "Falta pieza" }), AHORA, USUARIO);
  assert.equal(r.simulador.revision, null);
  assert.equal(r.movimiento.nota, "Falta pieza");
});

test("moverZona intercambia el orden y solo regresa lo que cambia", () => {
  assert.deepEqual(moverZona(ZONAS, "z2", -1), [{ id: "z2", orden: 1 }, { id: "z1", orden: 2 }]);
  assert.deepEqual(moverZona(ZONAS, "z1", -1), []);
  assert.deepEqual(moverZona(ZONAS, "z3", 1), []);
});

// ---------- Estado del centro ----------

test("enAlerta y resumen usan las horas de la configuración", () => {
  assert.equal(enAlerta(fuera({ desde: AHORA - 5 * HORA }), AHORA, 4), true);
  assert.equal(enAlerta(fuera({ desde: AHORA - 3 * HORA }), AHORA, 4), false);
  assert.equal(enAlerta(sim(), AHORA, 4), false);
  const sims = [sim(), fuera({ id: "s2", desde: AHORA - 5 * HORA }), fuera({ id: "s3" }), sim({ id: "s4", revision: "Falta pieza" })];
  assert.deepEqual(resumen(sims, AHORA, 4), { total: 4, disponibles: 2, enUso: 2, alerta: 1, revision: 1 });
});

test("repartirPorZona separa disponibles por zona, sin ubicar y fuera", () => {
  const sims = [sim(), sim({ id: "s2", zonaId: "z9" }), fuera({ id: "s3", desde: AHORA - HORA }), fuera({ id: "s4", desde: AHORA - 3 * HORA })];
  const r = repartirPorZona(sims, ZONAS);
  assert.deepEqual(r.porZona.get("z2").map((s) => s.id), ["s1"]);
  assert.deepEqual(r.porZona.get("z1"), []);
  assert.deepEqual(r.sinUbicar.map((s) => s.id), ["s2"]);
  assert.deepEqual(r.fuera.map((s) => s.id), ["s4", "s3"]);
});

test("coincide busca sin importar acentos ni mayúsculas", () => {
  assert.equal(coincide(sim(), "reanimacion"), true);
  assert.equal(coincide(sim(), "sim-001"), true);
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
  { t: new Date(2026, 9, 25, 18, 30).getTime(), tipo: "reubicacion", sim: "Pad de sutura", codigo: "SIM-009", zona: "Almacén", de: "Sala de habilidades", por: "ana.lopez@tec.mx" },
  { t: new Date(2026, 9, 26, 9, 56).getTime(), tipo: "salida", sim: "Maniquí pediátrico", codigo: "SIM-002", zona: "Sala 2", responsable: "Dra. Treviño", destino: "Aula 4, \"Pediatría\"", por: "ana.lopez@tec.mx" },
  { t: new Date(2026, 9, 26, 14, 30).getTime(), tipo: "regreso", sim: "Maniquí pediátrico", codigo: "SIM-002", zona: "Sala 2", responsable: "Dra. Treviño", duracion: 274 * MIN, nota: null, por: "luis@tec.mx" },
];

test("claveDia usa el día local", () => {
  assert.equal(claveDia(new Date(2026, 0, 5, 23, 59).getTime()), "2026-01-05");
});

test("filtrarMovimientos por tipo y por texto, del más reciente al más antiguo", () => {
  assert.deepEqual(filtrarMovimientos(MOVS).map((m) => m.tipo), ["regreso", "salida", "reubicacion"]);
  assert.deepEqual(filtrarMovimientos(MOVS, { tipo: "salida" }).map((m) => m.codigo), ["SIM-002"]);
  assert.equal(filtrarMovimientos(MOVS, { texto: "trevino" }).length, 2);
  assert.equal(filtrarMovimientos(MOVS, { texto: "luis" }).length, 1);
});

test("agruparPorDia junta los movimientos de cada día", () => {
  const g = agruparPorDia(MOVS);
  assert.deepEqual(g.map((x) => [x.dia, x.movimientos.length]), [["2026-10-26", 2], ["2026-10-25", 1]]);
});

test("describirMovimiento arma frases cortas", () => {
  assert.equal(describirMovimiento(MOVS[1]), 'Se lo llevó Dra. Treviño · Aula 4, "Pediatría" · salió de Sala 2');
  assert.equal(describirMovimiento(MOVS[2]), "Regresó a Sala 2 · lo tenía Dra. Treviño · 4 h 34 min fuera");
  assert.equal(describirMovimiento(MOVS[0]), "Se movió de Sala de habilidades a Almacén");
  assert.equal(describirMovimiento({ tipo: "regreso" }), "Regresó a Sin ubicar");
  assert.equal(describirMovimiento({ tipo: "revision", nota: "Falta pieza" }), "Falla resuelta: Falta pieza");
});

test("csvMovimientos: BOM, comillas escapadas, \\r\\n y orden cronológico", () => {
  const csv = csvMovimientos(MOVS);
  assert.ok(csv.startsWith("﻿\"Fecha\""));
  const lineas = csv.slice(1).split("\r\n");
  assert.equal(lineas.length, 4);
  assert.match(lineas[1], /^"2026-10-25","18:30","Cambio de lugar"/);
  assert.match(lineas[2], /"Aula 4, ""Pediatría"""/);
  assert.match(lineas[3], /"274"/);
});
