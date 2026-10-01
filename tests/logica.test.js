import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import {
  validarNombre,
  validarCorreo,
  validarTextoObligatorio,
  validarAnticipacion,
  validarHoras,
  validarMaterial,
  validarRecogida,
  validarDevolucion,
  validarProfesor,
  validarAlumnoEspacio,
  validarAlumnoMaterial,
  generarFolio,
  armarCorreo,
  urlOutlook,
  urlMailto,
  textoParaCopiar,
  avisoCorreoLargo,
  momento,
  fechaConDia,
  ahoraLocal,
} from "../js/logica.js";
import { HOY, AHORA, profEvento, profBloque, alumEspacio, alumMaterial } from "./datos-ejemplo.js";

const cfg = (cambios = {}) => ({ ...CONFIG, ...cambios });

// Aleatorio fijo que produce el sufijo K7Q2 (índices 9, 29, 14, 24 del alfabeto de 32 caracteres).
const secuencia = (indices) => {
  let i = 0;
  return () => (indices[i++] + 0.5) / 32;
};
const ALEATORIO_K7Q2 = () => secuencia([9, 29, 14, 24]);

// ---------- Los formularios válidos pasan ----------

test("formularios válidos no tienen errores", () => {
  assert.deepEqual(validarProfesor(profEvento(), HOY, CONFIG), { ok: true, errores: {} });
  assert.deepEqual(validarProfesor(profBloque(), HOY, CONFIG), { ok: true, errores: {} });
  assert.deepEqual(validarAlumnoEspacio(alumEspacio(), HOY, CONFIG), { ok: true, errores: {} });
  assert.deepEqual(validarAlumnoMaterial(alumMaterial(), "salida", HOY, CONFIG), { ok: true, errores: {} });
  assert.deepEqual(validarAlumnoMaterial(alumMaterial({ lugar: "Aula 3" }), "cites", HOY, CONFIG), {
    ok: true,
    errores: {},
  });
});

// ---------- Casos mínimos que deben fallar ----------

test("falla: correo @gmail.com", () => {
  assert.match(validarCorreo("ana@gmail.com", "@tec.mx"), /@tec\.mx/);
  assert.ok(validarProfesor(profEvento({ correo: "juan@gmail.com" }), HOY, CONFIG).errores.correo);
  assert.ok(validarAlumnoEspacio(alumEspacio({ profCorreo: "juan@gmail.com" }), HOY, CONFIG).errores.profCorreo);
});

test("el dominio se compara sin importar mayúsculas", () => {
  assert.equal(validarCorreo("ANA@TEC.MX", "@tec.mx"), null);
  assert.ok(validarCorreo("ana@tec.mx.evil.com", "@tec.mx"));
  assert.ok(validarCorreo("ana tec.mx", "@tec.mx"));
  assert.ok(validarCorreo("", "@tec.mx"));
});

test("falla: nombre de una palabra", () => {
  assert.ok(validarNombre("Ana"));
  assert.ok(validarProfesor(profEvento({ nombre: "Juan" }), HOY, CONFIG).errores.nombre);
});

test("nombre: acentos, puntos y guiones sí; números y símbolos no", () => {
  assert.equal(validarNombre("María José Núñez-Peña"), null);
  assert.equal(validarNombre("Dr. Juan Pérez"), null);
  assert.equal(validarNombre("  Ana   López  "), null);
  assert.ok(validarNombre("Ana L0pez"));
  assert.ok(validarNombre("Ana @López"));
  assert.ok(validarNombre(""));
});

test("falla: actividad en 3 días (con el texto pedido)", () => {
  assert.equal(
    validarAnticipacion("2026-10-03", HOY, 7),
    "Las solicitudes se hacen con al menos 7 días de anticipación. Tu actividad es en 3 días.",
  );
  assert.ok(validarAlumnoEspacio(alumEspacio({ fecha: "2026-10-03" }), HOY, CONFIG).errores.fecha);
});

test("anticipación: hoy + 7 pasa, hoy + 6 falla; profesores con usted", () => {
  assert.equal(validarAnticipacion("2026-10-07", HOY, 7), null);
  assert.ok(validarAnticipacion("2026-10-06", HOY, 7));
  assert.match(validarAnticipacion("2026-10-03", HOY, 7, "usted"), /Su actividad es en 3 días\.$/);
  assert.match(validarAnticipacion("2026-10-01", HOY, 7), /en 1 día\.$/);
  assert.match(validarAnticipacion("2026-09-01", HOY, 7), /ya pasó/);
  assert.ok(validarAnticipacion("", HOY, 7));
  assert.ok(validarAnticipacion("2026-02-30", HOY, 7));
});

test("falla: hora de fin antes de inicio (o igual)", () => {
  assert.ok(validarHoras("11:00", "09:00").horaFin);
  assert.ok(validarHoras("09:00", "09:00").horaFin);
  assert.deepEqual(validarHoras("09:00", "09:01"), {});
  assert.ok(validarHoras("", "09:00").horaInicio);
  assert.ok(validarAlumnoEspacio(alumEspacio({ horaInicio: "14:00", horaFin: "13:00" }), HOY, CONFIG).errores.horaFin);
});

test("falla: correo del profesor igual al del alumno (en ambos formularios de alumnos)", () => {
  const igual = { profCorreo: "a01234567@TEC.MX" };
  assert.ok(validarAlumnoEspacio(alumEspacio(igual), HOY, CONFIG).errores.profCorreo);
  assert.ok(validarAlumnoMaterial(alumMaterial(igual), "cites", HOY, CONFIG).errores.profCorreo);
});

test("falla: tabla de material vacía", () => {
  assert.ok(validarMaterial([]).material);
  assert.ok(validarMaterial(undefined).material);
  assert.ok(validarAlumnoMaterial(alumMaterial({ material: [] }), "salida", HOY, CONFIG).errores.material);
});

test("falla: cantidad 0, texto, decimal, negativa o vacía; y material vacío", () => {
  for (const cantidad of ["0", "abc", "2.5", "-1", "", "1e3"]) {
    assert.ok(validarMaterial([{ material: "Guantes", cantidad }])["material-0-cantidad"], `cantidad ${cantidad}`);
  }
  assert.deepEqual(validarMaterial([{ material: "Guantes", cantidad: "3" }]), {});
  assert.deepEqual(validarMaterial([{ material: "Guantes", cantidad: 3 }]), {});
  assert.ok(validarMaterial([{ material: "  ", cantidad: "1" }])["material-0-nombre"]);
});

test("falla: recogida después del inicio de la actividad", () => {
  const inicio = momento("2026-10-15", "09:00");
  assert.ok(validarRecogida(momento("2026-10-15", "09:01"), inicio, null));
  assert.equal(validarRecogida(momento("2026-10-15", "09:00"), inicio, null), null);
  assert.equal(validarRecogida(momento("2026-01-01", "09:00"), inicio, null), null); // sin límite inferior
  const d = alumMaterial({ recogidaHora: "09:30" });
  assert.ok(validarAlumnoMaterial(d, "salida", HOY, CONFIG).errores.recogidaFecha);
});

test("recogida: con maxDiasAntesRecogida no puede ser más temprano", () => {
  const inicio = momento("2026-10-15", "09:00");
  assert.ok(validarRecogida(momento("2026-10-11", "08:00"), inicio, 3));
  assert.equal(validarRecogida(momento("2026-10-12", "09:00"), inicio, 3), null);
});

test("falla: devolución 3 días después (con el texto pedido)", () => {
  const d = alumMaterial({ devolucionFecha: "2026-10-18", devolucionHora: "14:00" });
  assert.equal(
    validarAlumnoMaterial(d, "salida", HOY, CONFIG).errores.devolucionFecha,
    "El material se devuelve a más tardar 24 horas después de que termina tu actividad.",
  );
});

test("devolución: límite exacto de 24 h pasa; antes del fin falla", () => {
  const fin = momento("2026-10-15", "14:00");
  assert.equal(validarDevolucion(momento("2026-10-16", "14:00"), fin, 24), null);
  assert.ok(validarDevolucion(momento("2026-10-16", "14:01"), fin, 24));
  assert.equal(validarDevolucion(momento("2026-10-15", "14:00"), fin, 24), null);
  assert.ok(validarDevolucion(momento("2026-10-15", "13:59"), fin, 24));
});

test("falla: casilla sin marcar (cada una)", () => {
  assert.ok(validarProfesor(profEvento({ casillaFormato: false }), HOY, CONFIG).errores.casillaFormato);
  assert.ok(validarProfesor(profEvento({ casillaOutlook: undefined }), HOY, CONFIG).errores.casillaOutlook);
  assert.ok(validarAlumnoEspacio(alumEspacio({ casillaFormato: false }), HOY, CONFIG).errores.casillaFormato);
  assert.ok(validarAlumnoMaterial(alumMaterial({ casillaInsumos: false }), "salida", HOY, CONFIG).errores.casillaInsumos);
  assert.ok(validarAlumnoMaterial(alumMaterial({ casillaSalida: false }), "salida", HOY, CONFIG).errores.casillaSalida);
});

// ---------- Reglas según tus respuestas ----------

test("actividad/materia: obligatoria y máximo 200 caracteres", () => {
  assert.ok(validarTextoObligatorio("   ", 200));
  assert.equal(validarTextoObligatorio("a".repeat(200), 200), null);
  assert.ok(validarTextoObligatorio("a".repeat(201), 200));
});

test("bloque: al menos un día, fin > inicio, periodo válido, anticipación desde el inicio", () => {
  assert.ok(validarProfesor(profBloque({ dias: [] }), HOY, CONFIG).errores.dias);
  assert.ok(validarProfesor(profBloque({ dias: undefined }), HOY, CONFIG).errores.dias);
  assert.ok(validarProfesor(profBloque({ fechaFin: "2026-10-12" }), HOY, CONFIG).errores.fechaFin);
  assert.ok(validarProfesor(profBloque({ fechaFin: "2026-10-01" }), HOY, CONFIG).errores.fechaFin);
  assert.ok(validarProfesor(profBloque({ periodo: "mensual" }), HOY, CONFIG).errores.periodo);
  const tarde = validarProfesor(profBloque({ fechaInicio: "2026-10-03" }), HOY, CONFIG);
  assert.match(tarde.errores.fechaInicio, /Su actividad es en 3 días/);
});

test("profesor: debe elegir evento o bloque", () => {
  assert.ok(validarProfesor(profEvento({ tipoReserva: "" }), HOY, CONFIG).errores.tipoReserva);
});

test("material: sin profesor pide alumnos responsables (solo no vacío, máx. 300, sin regla de nombre completo)", () => {
  const sin = { hayProfesor: false, profNombre: "", profCorreo: "", alumnosResponsables: "Ana" };
  assert.deepEqual(validarAlumnoMaterial(alumMaterial(sin), "salida", HOY, CONFIG), { ok: true, errores: {} });
  assert.ok(validarAlumnoMaterial(alumMaterial({ ...sin, alumnosResponsables: " " }), "salida", HOY, CONFIG).errores.alumnosResponsables);
  assert.ok(validarAlumnoMaterial(alumMaterial({ ...sin, alumnosResponsables: "a".repeat(301) }), "salida", HOY, CONFIG).errores.alumnosResponsables);
  assert.ok(validarAlumnoMaterial(alumMaterial({ hayProfesor: undefined }), "salida", HOY, CONFIG).errores.hayProfesor);
});

test("material: tipo 'Otro' obliga a especificar", () => {
  const r = validarAlumnoMaterial(alumMaterial({ tipoActividad: "otro", tipoOtro: "" }), "salida", HOY, CONFIG);
  assert.ok(r.errores.tipoOtro);
  assert.equal(validarAlumnoMaterial(alumMaterial({ tipoActividad: "otro", tipoOtro: "Feria de salud" }), "salida", HOY, CONFIG).ok, true);
});

test("CITES: la casilla de salida/credencial depende de la configuración", () => {
  const sinCasilla = alumMaterial({ casillaSalida: false, lugar: "Aula 3" });
  assert.ok(validarAlumnoMaterial(sinCasilla, "cites", HOY, cfg({ citesRequiereSalidaYCredencial: true })).errores.casillaSalida);
  assert.equal(validarAlumnoMaterial(sinCasilla, "cites", HOY, cfg({ citesRequiereSalidaYCredencial: false })).ok, true);
  assert.ok(validarAlumnoMaterial(sinCasilla, "salida", HOY, cfg({ citesRequiereSalidaYCredencial: false })).errores.casillaSalida);
});

test("errores salen en orden de revisión y vienen todos juntos", () => {
  const r = validarAlumnoEspacio(alumEspacio({ nombre: "Ana", fecha: "2026-10-03", casillaFormato: false }), HOY, CONFIG);
  assert.deepEqual(Object.keys(r.errores), ["nombre", "fecha", "casillaFormato"]);
  assert.equal(r.ok, false);
});

// ---------- Folio ----------

test("folio: formato CSC-AAAAMMDD-XXXX", () => {
  assert.equal(generarFolio("2026-10-15", ALEATORIO_K7Q2()), "CSC-20261015-K7Q2");
});

test("folio: nunca usa O, 0, I, 1", () => {
  for (let i = 0; i < 500; i++) {
    const folio = generarFolio("2026-10-15");
    assert.match(folio, /^CSC-20261015-[A-HJ-NP-Z2-9]{4}$/);
  }
});

// ---------- Correo ----------

const EJEMPLO_SALIDA = [
  "SOLICITUD CSC · ALUMNO · MATERIAL FUERA DEL CAMPUS",
  "Folio: CSC-20261015-K7Q2",
  "Generada: 30/09/2026 14:32",
  "",
  "— RESPONSABLES —",
  "Alumno responsable del material: Ana López García (A01234567@tec.mx)",
  "Profesor responsable: Juan Pérez Ruiz (juan.perez@tec.mx)",
  "",
  "— ACTIVIDAD —",
  "Tipo: Brigada",
  "Nombre: Brigada de salud comunitaria",
  "Lugar: Col. Independencia, Monterrey",
  "Fecha: jueves 15/10/2026",
  "Horario: 09:00 – 14:00",
  "",
  "— MATERIAL (no se prestan insumos) —",
  "1. Simulador RCP adulto — 2",
  "2. Baumanómetro — 4",
  "",
  "— RECOGIDA Y DEVOLUCIÓN —",
  "Recoge: jueves 15/10/2026 08:00",
  "Devuelve: jueves 15/10/2026 15:30",
  "",
  "— CONFIRMACIONES —",
  "[x] Entiendo que NO se prestan insumos",
  "[x] Llenaré el formato de salida y dejaré la credencial Tec del responsable",
].join("\r\n");

test("correo ALUM-SALIDA: idéntico al ejemplo de CLAUDE.md", () => {
  const c = armarCorreo("ALUM-SALIDA", alumMaterial(), AHORA, CONFIG, ALEATORIO_K7Q2());
  assert.equal(c.cuerpo, EJEMPLO_SALIDA);
  assert.equal(c.asunto, "[CSC][ALUM-SALIDA] 15/10/2026 · Brigada de salud comunitaria · CSC-20261015-K7Q2");
  assert.equal(c.para, "centrodesimulacion@outlook.com");
  assert.equal(c.cc, "juan.perez@tec.mx");
  assert.ok(c.cuerpo.length < 1800);
});

test("correo: con correoPruebas todo va a ese correo", () => {
  const c = armarCorreo("ALUM-SALIDA", alumMaterial(), AHORA, cfg({ correoPruebas: "prueba@tec.mx" }), ALEATORIO_K7Q2());
  assert.equal(c.para, "prueba@tec.mx");
});

test("correo: usa solo saltos \\r\\n (sin \\n sueltos)", () => {
  const c = armarCorreo("PROF-EVENTO", profEvento(), AHORA, CONFIG);
  assert.equal(c.cuerpo.replaceAll("\r\n", "").includes("\n"), false);
});

test("correo: espacios y saltos extra en los textos se limpian", () => {
  const c = armarCorreo("PROF-EVENTO", profEvento({ actividad: "  Taller \n de   sutura " }), AHORA, CONFIG);
  assert.match(c.asunto, / · Taller de sutura · /);
  assert.ok(c.cuerpo.includes("Nombre: Taller de sutura"));
});

test("correo PROF-EVENTO: sin CC, etiqueta y secciones", () => {
  const c = armarCorreo("PROF-EVENTO", profEvento(), AHORA, CONFIG, ALEATORIO_K7Q2());
  assert.equal(c.cc, "");
  assert.match(c.asunto, /^\[CSC\]\[PROF-EVENTO\] 15\/10\/2026 · Taller de sutura · CSC-20261015-K7Q2$/);
  assert.ok(c.cuerpo.includes("Profesor responsable: Juan Pérez Ruiz (juan.perez@tec.mx)"));
  assert.ok(c.cuerpo.includes("Horario: 09:00 – 11:00"));
});

test("correo PROF-BLOQUE: folio y asunto con la fecha de inicio; días ordenados", () => {
  const c = armarCorreo("PROF-BLOQUE", profBloque({ dias: [3, 1] }), AHORA, CONFIG, ALEATORIO_K7Q2());
  assert.equal(c.folio, "CSC-20261012-K7Q2");
  assert.match(c.asunto, /^\[CSC\]\[PROF-BLOQUE\] 12\/10\/2026 · /);
  assert.ok(c.cuerpo.includes("Periodo: Semestral"));
  assert.ok(c.cuerpo.includes("Días: Lunes, Miércoles"));
  assert.ok(c.cuerpo.includes("Fin: viernes 04/12/2026"));
});

test("correo ALUM-ESPACIO: profesor siempre en CC", () => {
  const c = armarCorreo("ALUM-ESPACIO", alumEspacio(), AHORA, CONFIG);
  assert.equal(c.cc, "juan.perez@tec.mx");
  assert.ok(c.cuerpo.includes("Alumno: Ana López García (A01234567@tec.mx)"));
});

test("correo ALUM-CITES: lugar fijo CITES, sin profesor no hay CC", () => {
  const d = alumMaterial({ hayProfesor: false, alumnosResponsables: "Ana López y Luis Soto", lugar: "Aula 3" });
  const c = armarCorreo("ALUM-CITES", d, AHORA, CONFIG);
  assert.equal(c.cc, "");
  assert.ok(c.cuerpo.includes("Lugar: CITES — Aula 3"));
  assert.ok(c.cuerpo.includes("Alumno(s) responsable(s) de la actividad: Ana López y Luis Soto"));
  assert.ok(!c.cuerpo.includes("Profesor responsable"));
});

test("correo ALUM-CITES: sin la casilla de salida cuando la configuración lo oculta", () => {
  const c = armarCorreo("ALUM-CITES", alumMaterial(), AHORA, cfg({ citesRequiereSalidaYCredencial: false }));
  assert.ok(!c.cuerpo.includes("formato de salida"));
  assert.ok(armarCorreo("ALUM-CITES", alumMaterial(), AHORA, CONFIG).cuerpo.includes("formato de salida"));
});

test("correo: tipo 'Otro' muestra lo especificado", () => {
  const c = armarCorreo("ALUM-SALIDA", alumMaterial({ tipoActividad: "otro", tipoOtro: "Feria de salud" }), AHORA, CONFIG);
  assert.ok(c.cuerpo.includes("Tipo: Otro: Feria de salud"));
});

// ---------- URLs, copiar, aviso ----------

test("URLs: codifican acentos y saltos de línea; cc solo si existe", () => {
  const c = { para: "centrodesimulacion@outlook.com", cc: "juan.perez@tec.mx", asunto: "[CSC] Ñandú · X", cuerpo: "Línea 1\r\nLínea 2" };
  const outlook = urlOutlook(c);
  assert.ok(outlook.startsWith("https://outlook.office.com/mail/deeplink/compose?to=centrodesimulacion%40outlook.com&cc=juan.perez%40tec.mx&subject="));
  assert.ok(outlook.endsWith("&body=L%C3%ADnea%201%0D%0AL%C3%ADnea%202"));
  const mailto = urlMailto(c);
  assert.ok(mailto.startsWith("mailto:centrodesimulacion@outlook.com?cc=juan.perez%40tec.mx&subject="));
  assert.ok(mailto.includes("%0D%0A"));
  assert.ok(!urlOutlook({ ...c, cc: "" }).includes("cc="));
  assert.ok(!urlMailto({ ...c, cc: "" }).includes("cc="));
});

test("URLs: el asunto con corchetes y · se codifica y se recupera igual", () => {
  const c = armarCorreo("ALUM-ESPACIO", alumEspacio(), AHORA, CONFIG, ALEATORIO_K7Q2());
  const volver = new URL(urlOutlook(c)).searchParams;
  assert.equal(volver.get("subject"), c.asunto);
  assert.equal(volver.get("body"), c.cuerpo);
  assert.equal(volver.get("cc"), c.cc);
});

test("texto para copiar: Para, CC, Asunto y cuerpo", () => {
  const t = textoParaCopiar({ para: "a@b.mx", cc: "c@d.mx", asunto: "As", cuerpo: "Cuerpo" });
  assert.equal(t, "Para: a@b.mx\r\nCC: c@d.mx\r\nAsunto: As\r\n\r\nCuerpo");
});

test("aviso de correo largo: solo arriba de 1,800 caracteres", () => {
  assert.equal(avisoCorreoLargo({ cuerpo: "a".repeat(1800) }), "");
  assert.equal(
    avisoCorreoLargo({ cuerpo: "a".repeat(1801) }),
    "El correo es largo. Si no abre en Outlook, usa 'Copiar correo'.",
  );
});

// ---------- Utilidades de fecha ----------

test("fechaConDia y ahoraLocal", () => {
  assert.equal(fechaConDia("2026-10-15"), "jueves 15/10/2026");
  assert.equal(fechaConDia("2026-12-04"), "viernes 04/12/2026");
  assert.equal(ahoraLocal(new Date(2026, 8, 30, 14, 32)), "2026-09-30T14:32");
  assert.equal(momento("2026-13-01", "09:00"), null);
  assert.equal(momento("2026-10-15", "25:00"), null);
});
