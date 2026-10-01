// "Alumno apurado que no lee": formas de llenar mal cada formulario.
// Cada fila es [qué hizo, cambios sobre un formulario válido, campo donde debe salir el error].
// TODAS deben ser rechazadas: si alguna pasa la validación, la prueba falla.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import { validarProfesor, validarAlumnoEspacio, validarAlumnoMaterial, armarCorreo } from "../js/logica.js";
import { HOY, AHORA, profEvento, profBloque, alumEspacio, alumMaterial } from "./datos-ejemplo.js";

const U = undefined;

function probar(formulario, base, validar, ataques) {
  for (const [que, cambios, campo] of ataques) {
    test(`${formulario}: ${que}`, () => {
      const { ok, errores } = validar(base(cambios));
      assert.equal(ok, false, `PASÓ la validación: ${que}`);
      assert.ok(campo in errores, `esperaba error en "${campo}" y salió en: ${Object.keys(errores).join(", ")}`);
    });
  }
}

// Correos mal escritos que sirven para cualquier campo de correo.
const correosMalos = (campo) => [
  [`${campo} @gmail.com`, { [campo]: "juan@gmail.com" }, campo],
  [`${campo} con dominio pegado (@tec.mx.com)`, { [campo]: "juan@tec.mx.com" }, campo],
  [`${campo} con espacio en medio`, { [campo]: "juan perez@tec.mx" }, campo],
  [`${campo} con salto de línea (inyectar otro destinatario)`, { [campo]: "juan@tec.mx\r\nBcc: x@gmail.com" }, campo],
  [`${campo} con dos puntos seguidos`, { [campo]: "juan..perez@tec.mx" }, campo],
  [`${campo} con coma (dos destinatarios en uno)`, { [campo]: "juan,perez@tec.mx" }, campo],
  [`${campo} con punto y coma`, { [campo]: "juan;perez@tec.mx" }, campo],
  [`${campo} que empieza con punto`, { [campo]: ".juan@tec.mx" }, campo],
  [`${campo} con punto antes de la @`, { [campo]: "juan.@tec.mx" }, campo],
  [`${campo} con <> estilo "Nombre <correo>"`, { [campo]: "Juan <juan@tec.mx>" }, campo],
  [`${campo} solo el dominio`, { [campo]: "@tec.mx" }, campo],
  [`${campo} sin dominio completo`, { [campo]: "juan@tec" }, campo],
  [`${campo} dos correos separados por coma`, { [campo]: "juan@tec.mx,otro@tec.mx" }, campo],
  [`${campo} vacío`, { [campo]: "" }, campo],
  [`${campo} solo espacios`, { [campo]: "   " }, campo],
];

const nombresMalos = (campo) => [
  [`${campo} de una palabra`, { [campo]: "Juan" }, campo],
  [`${campo} solo iniciales y signos`, { [campo]: "J. -" }, campo],
  [`${campo} con números`, { [campo]: "Juan Pérez2" }, campo],
  [`${campo} con emoji`, { [campo]: "Juan 😀 Pérez" }, campo],
  [`${campo} con arroba`, { [campo]: "juan@tec Pérez" }, campo],
  [`${campo} vacío`, { [campo]: "" }, campo],
  [`${campo} solo guiones y puntos`, { [campo]: ". - . -" }, campo],
];

const horasMalas = [
  ["hora de fin igual a la de inicio", { horaFin: "09:00" }, "horaFin"],
  ["hora de fin antes de la de inicio", { horaInicio: "11:00", horaFin: "09:00" }, "horaFin"],
  ["hora inexistente 25:00", { horaFin: "25:00" }, "horaFin"],
  ["hora de inicio vacía", { horaInicio: "" }, "horaInicio"],
  ["hora de fin vacía", { horaFin: "" }, "horaFin"],
  ["horas con formato 9:00 am", { horaInicio: "9:00 am" }, "horaInicio"],
];

const actividadMala = [
  ["actividad solo espacios y saltos", { actividad: " \n\t " }, "actividad"],
  ["actividad de 201 caracteres", { actividad: "a".repeat(201) }, "actividad"],
  ["actividad vacía", { actividad: "" }, "actividad"],
];

const fechasMalas = (campo) => [
  [`${campo} dentro de 6 días`, { [campo]: "2026-10-06" }, campo],
  [`${campo} dentro de 3 días`, { [campo]: "2026-10-03" }, campo],
  [`${campo} de mañana`, { [campo]: "2026-10-01" }, campo],
  [`${campo} de hoy`, { [campo]: "2026-09-30" }, campo],
  [`${campo} de ayer`, { [campo]: "2026-09-29" }, campo],
  [`${campo} del año pasado (se equivocó de año)`, { [campo]: "2025-10-15" }, campo],
  [`${campo} inexistente (30 de febrero)`, { [campo]: "2027-02-30" }, campo],
  [`${campo} con mes 13`, { [campo]: "2026-13-01" }, campo],
  [`${campo} escrita dd/mm/aaaa`, { [campo]: "15/10/2026" }, campo],
  [`${campo} con año de 5 dígitos`, { [campo]: "20261-10-15" }, campo],
  [`${campo} vacía`, { [campo]: "" }, campo],
];

// ---------- Profesor por evento ----------

probar("profesor/evento", profEvento, (d) => validarProfesor(d, HOY, CONFIG), [
  ...nombresMalos("nombre"),
  ...correosMalos("correo"),
  ...actividadMala,
  ...fechasMalas("fecha"),
  ...horasMalas,
  ["sin elegir tipo de reserva", { tipoReserva: "" }, "tipoReserva"],
  ["tipo de reserva inventado", { tipoReserva: "constructor" }, "tipoReserva"],
  ["tipo de reserva con espacio de más", { tipoReserva: "evento " }, "tipoReserva"],
  ["casilla del formato sin marcar", { casillaFormato: false }, "casillaFormato"],
  ["casilla del formato ausente", { casillaFormato: U }, "casillaFormato"],
  ["casilla de Outlook como texto 'true'", { casillaOutlook: "true" }, "casillaOutlook"],
  ["casilla de Outlook sin marcar", { casillaOutlook: false }, "casillaOutlook"],
]);

// ---------- Profesor por bloque ----------

probar("profesor/bloque", profBloque, (d) => validarProfesor(d, HOY, CONFIG), [
  ["periodo inventado con nombre de propiedad (constructor)", { periodo: "constructor" }, "periodo"],
  ["periodo __proto__", { periodo: "__proto__" }, "periodo"],
  ["periodo toString", { periodo: "toString" }, "periodo"],
  ["periodo vacío", { periodo: "" }, "periodo"],
  ["periodo mensual (no existe)", { periodo: "mensual" }, "periodo"],
  ["periodo en mayúsculas", { periodo: "ANUAL" }, "periodo"],
  ...fechasMalas("fechaInicio"),
  ["fecha de fin igual a la de inicio", { fechaFin: "2026-10-12" }, "fechaFin"],
  ["fecha de fin antes de la de inicio", { fechaFin: "2026-10-01" }, "fechaFin"],
  ["fecha de fin vacía", { fechaFin: "" }, "fechaFin"],
  ["fecha de fin inexistente", { fechaFin: "2026-11-31" }, "fechaFin"],
  ["ningún día marcado", { dias: [] }, "dias"],
  ["días sin definir", { dias: U }, "dias"],
  ["días fuera de rango (0 y 7)", { dias: [0, 7] }, "dias"],
  ["domingo (7) como único día", { dias: [7] }, "dias"],
  ["días como texto '123'", { dias: "123" }, "dias"],
  ["días con nombre de propiedad (toString)", { dias: ["toString"] }, "dias"],
  ["días con constructor", { dias: ["constructor"] }, "dias"],
  ["días con null", { dias: [null] }, "dias"],
  ["día decimal 1.5", { dias: [1.5] }, "dias"],
  ...nombresMalos("nombre"),
  ...correosMalos("correo"),
  ...actividadMala,
  ...horasMalas,
  ["las dos casillas sin marcar", { casillaFormato: false, casillaOutlook: false }, "casillaFormato"],
]);

// ---------- Alumno: espacio del CSC ----------

probar("alumno/espacio", alumEspacio, (d) => validarAlumnoEspacio(d, HOY, CONFIG), [
  ["profesor con el mismo correo del alumno", { profCorreo: "A01234567@tec.mx" }, "profCorreo"],
  ["profesor con el mismo correo en otras mayúsculas", { profCorreo: "a01234567@TEC.MX" }, "profCorreo"],
  ["profesor con el mismo correo con espacios", { profCorreo: "  a01234567@tec.mx  " }, "profCorreo"],
  ...correosMalos("profCorreo"),
  ...correosMalos("correo"),
  ...nombresMalos("profNombre"),
  ...nombresMalos("nombre"),
  ...actividadMala,
  ...fechasMalas("fecha"),
  ...horasMalas,
  ["casilla del formato sin marcar", { casillaFormato: false }, "casillaFormato"],
  ["casilla del formato ausente", { casillaFormato: U }, "casillaFormato"],
  ["casilla del formato como texto 'on'", { casillaFormato: "on" }, "casillaFormato"],
]);

// ---------- Alumno: material (CITES y fuera del campus; mismas reglas) ----------

const filaMala = (fila) => ({ material: [fila] });
const ataquesMaterial = [
  ["tabla de material vacía", { material: [] }, "material"],
  ["tabla de material sin definir", { material: U }, "material"],
  ["tabla de material que no es lista", { material: "guantes" }, "material"],
  ["cantidad 0", filaMala({ material: "Guantes", cantidad: "0" }), "material-0-cantidad"],
  ["cantidad 00", filaMala({ material: "Guantes", cantidad: "00" }), "material-0-cantidad"],
  ["cantidad negativa", filaMala({ material: "Guantes", cantidad: "-2" }), "material-0-cantidad"],
  ["cantidad escrita con letras", filaMala({ material: "Guantes", cantidad: "dos" }), "material-0-cantidad"],
  ["cantidad con unidad ('2 piezas')", filaMala({ material: "Guantes", cantidad: "2 piezas" }), "material-0-cantidad"],
  ["cantidad decimal", filaMala({ material: "Guantes", cantidad: "2.5" }), "material-0-cantidad"],
  ["cantidad con coma", filaMala({ material: "Guantes", cantidad: "2,5" }), "material-0-cantidad"],
  ["cantidad en notación científica", filaMala({ material: "Guantes", cantidad: "1e3" }), "material-0-cantidad"],
  ["cantidad con signo +", filaMala({ material: "Guantes", cantidad: "+2" }), "material-0-cantidad"],
  ["cantidad vacía", filaMala({ material: "Guantes", cantidad: "" }), "material-0-cantidad"],
  ["cantidad solo espacios", filaMala({ material: "Guantes", cantidad: "   " }), "material-0-cantidad"],
  ["cantidad con dígitos de ancho completo", filaMala({ material: "Guantes", cantidad: "２" }), "material-0-cantidad"],
  ["material en blanco", filaMala({ material: "   ", cantidad: "1" }), "material-0-nombre"],
  ["fila vacía", filaMala({ material: "", cantidad: "" }), "material-0-nombre"],
  ["segunda fila mala (la primera bien)", { material: [{ material: "Guantes", cantidad: "1" }, { material: "", cantidad: "0" }] }, "material-1-nombre"],
  ["recogida un minuto después del inicio", { recogidaHora: "09:01", horaInicio: "09:00", recogidaFecha: "2026-10-15" }, "recogidaFecha"],
  ["recogida el día siguiente a la actividad", { recogidaFecha: "2026-10-16" }, "recogidaFecha"],
  ["recogida de ayer", { recogidaFecha: "2026-09-29" }, "recogidaFecha"],
  ["recogida de hace un mes", { recogidaFecha: "2026-08-30" }, "recogidaFecha"],
  ["recogida del año pasado (se equivocó de año)", { recogidaFecha: "2025-10-15" }, "recogidaFecha"],
  ["recogida sin fecha", { recogidaFecha: "" }, "recogidaFecha"],
  ["recogida sin hora", { recogidaHora: "" }, "recogidaHora"],
  ["devolución 3 días después", { devolucionFecha: "2026-10-18" }, "devolucionFecha"],
  ["devolución 24 h y 1 min después", { devolucionFecha: "2026-10-16", devolucionHora: "14:01" }, "devolucionFecha"],
  ["devolución antes de que termine", { devolucionHora: "13:59" }, "devolucionFecha"],
  ["devolución un día antes", { devolucionFecha: "2026-10-14" }, "devolucionFecha"],
  ["devolución sin fecha", { devolucionFecha: "" }, "devolucionFecha"],
  ["devolución sin hora", { devolucionHora: "" }, "devolucionHora"],
  ["no elige si hay profesor", { hayProfesor: U }, "hayProfesor"],
  ["'hayProfesor' como texto 'si'", { hayProfesor: "si" }, "hayProfesor"],
  ["dice que hay profesor pero no lo escribe", { profNombre: "", profCorreo: "" }, "profNombre"],
  ["profesor con el mismo correo del alumno", { profCorreo: "a01234567@TEC.MX" }, "profCorreo"],
  ["profesor con correo @gmail.com", { profCorreo: "juan@gmail.com" }, "profCorreo"],
  ["profesor con dos correos en uno", { profCorreo: "juan,perez@tec.mx" }, "profCorreo"],
  ["dice que no hay profesor y deja vacíos a los alumnos", { hayProfesor: false, alumnosResponsables: "" }, "alumnosResponsables"],
  ["alumnos responsables solo espacios", { hayProfesor: false, alumnosResponsables: "  \n " }, "alumnosResponsables"],
  ["alumnos responsables de 301 caracteres", { hayProfesor: false, alumnosResponsables: "a".repeat(301) }, "alumnosResponsables"],
  ["no elige tipo de actividad", { tipoActividad: "" }, "tipoActividad"],
  ["tipo de actividad inventado (constructor)", { tipoActividad: "constructor" }, "tipoActividad"],
  ["tipo de actividad toString", { tipoActividad: "toString" }, "tipoActividad"],
  ["tipo 'Otro' sin especificar", { tipoActividad: "otro", tipoOtro: "" }, "tipoOtro"],
  ["tipo 'Otro' con solo espacios", { tipoActividad: "otro", tipoOtro: "   " }, "tipoOtro"],
  ["lugar vacío", { lugar: "" }, "lugar"],
  ["lugar solo espacios", { lugar: "   " }, "lugar"],
  ["casilla de insumos sin marcar", { casillaInsumos: false }, "casillaInsumos"],
  ["casilla de insumos ausente", { casillaInsumos: U }, "casillaInsumos"],
  ["casilla de formato de salida sin marcar", { casillaSalida: false }, "casillaSalida"],
  ...nombresMalos("nombre"),
  ...correosMalos("correo"),
  ...actividadMala,
  ...fechasMalas("fecha"),
  ...horasMalas,
];

probar("alumno/cites", alumMaterial, (d) => validarAlumnoMaterial(d, "cites", HOY, CONFIG), ataquesMaterial);
probar("alumno/salida", alumMaterial, (d) => validarAlumnoMaterial(d, "salida", HOY, CONFIG), ataquesMaterial);

// ---------- Lo que pasa validación no debe romper el correo ----------

test("cantidades enormes o con ceros a la izquierda se escriben tal cual, sin notación científica", () => {
  const d = alumMaterial({
    material: [
      { material: "Guantes", cantidad: "007" },
      { material: "Gasas", cantidad: "99999999999999999999999" },
    ],
  });
  const c = armarCorreo("ALUM-SALIDA", d, AHORA, CONFIG);
  assert.ok(c.cuerpo.includes("1. Guantes — 7\r\n"));
  assert.ok(c.cuerpo.includes("2. Gasas — 99999999999999999999999\r\n"));
});

test("correo: nada de lo que escribe el alumno puede meter líneas nuevas en el asunto ni cabeceras en el cuerpo", () => {
  const d = alumMaterial({
    actividad: "Brigada\r\nBcc: x@gmail.com",
    lugar: "Col. Centro\nCc: y@gmail.com",
    tipoActividad: "otro",
    tipoOtro: "Feria\r\nTo: z@gmail.com",
    material: [{ material: "Guantes\r\nBcc: w@gmail.com", cantidad: "1" }],
  });
  const c = armarCorreo("ALUM-SALIDA", d, AHORA, CONFIG);
  assert.ok(!/[\r\n]/.test(c.asunto));
  for (const linea of c.cuerpo.split("\r\n")) assert.ok(!/^(Bcc|Cc|To):/i.test(linea), `cabecera falsa: ${linea}`);
  assert.ok(!c.cuerpo.includes("\n") || c.cuerpo.split("\r\n").join("").indexOf("\n") === -1);
});
