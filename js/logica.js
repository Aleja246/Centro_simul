// Funciones PURAS: validar, armar correo, folio y URLs.
// No tocan el DOM ni leen la fecha del sistema: "hoy" y "ahora" se reciben como parámetro
// ("AAAA-MM-DD" y "AAAA-MM-DDTHH:MM") y la configuración también (ver js/config.js).

export const LIMITE_CORREO = 1800;

const MS_HORA = 3600000;
const MS_DIA = 24 * MS_HORA;
const NOMBRES_DIA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_BLOQUE = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
const PERIODOS = { anual: "Anual", semestral: "Semestral", trimestral: "Trimestral" };
const TIPOS_ACTIVIDAD = { grupo: "Grupo estudiantil", brigada: "Brigada", otro: "Otro" };
const ALFABETO_FOLIO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O, 0, I, 1
const MAX_ACTIVIDAD = 200;
const MAX_ALUMNOS_RESPONSABLES = 300;

export const ETIQUETAS = ["PROF-EVENTO", "PROF-BLOQUE", "ALUM-ESPACIO", "ALUM-CITES", "ALUM-SALIDA"];

// ---------- Fechas y horas ----------

function parseFecha(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? "");
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(anio, mes - 1, dia);
  const d = new Date(t);
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return t;
}

function parseHora(hora) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora ?? "");
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 60000 : null;
}

// Milisegundos (hora "de pared", sin zona) de una fecha + hora; null si alguna no es válida.
export function momento(fecha, hora) {
  const f = parseFecha(fecha);
  const h = parseHora(hora);
  return f === null || h === null ? null : f + h;
}

export function formatoFecha(fecha) {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

export function fechaConDia(fecha) {
  return `${NOMBRES_DIA_SEMANA[new Date(parseFecha(fecha)).getUTCDay()]} ${formatoFecha(fecha)}`;
}

// Convierte un Date al texto "AAAA-MM-DDTHH:MM" en hora local (lo usa la interfaz).
export function ahoraLocal(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function limpiar(texto) {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

// ---------- Validaciones de un campo (devuelven null si está bien, o el mensaje) ----------

export function validarNombre(valor) {
  const s = limpiar(valor).normalize("NFC");
  if (!s) return "Falta el nombre completo.";
  if (!/^[\p{L}.\- ]+$/u.test(s)) return "El nombre solo puede tener letras, espacios, puntos y guiones.";
  const palabras = s.split(" ").filter((p) => /\p{L}/u.test(p));
  if (palabras.length < 2) return "El nombre completo debe tener al menos dos palabras.";
  return null;
}

// Caracteres que nunca van en una dirección sola y que los programas de correo
// toman como separador de destinatarios (coma, punto y coma) o como "Nombre <correo>".
const CORREO_CARACTERES_NO_VALIDOS = /[\s,;:<>()[\]"\\]/;

export function validarCorreo(valor, dominio) {
  const s = String(valor ?? "").trim();
  if (!s) return "Falta el correo.";
  const [local, host, ...sobrantes] = s.split("@");
  const formatoValido =
    sobrantes.length === 0 &&
    Boolean(local) &&
    Boolean(host) &&
    !CORREO_CARACTERES_NO_VALIDOS.test(s) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !s.includes("..") &&
    /^[^.]+(\.[^.]+)+$/.test(host);
  if (!formatoValido) return "El correo no tiene un formato válido.";
  if (!s.toLowerCase().endsWith(dominio.toLowerCase())) return `El correo debe terminar en ${dominio}.`;
  return null;
}

export function validarTextoObligatorio(valor, max) {
  const s = limpiar(valor);
  if (!s) return "Este campo es obligatorio.";
  if (s.length > max) return `Máximo ${max} caracteres.`;
  return null;
}

// trato: "tu" (alumnos) o "usted" (profesores)
export function validarAnticipacion(fecha, hoy, dias, trato = "tu") {
  const f = parseFecha(fecha);
  if (f === null) return "Falta una fecha válida.";
  const diff = Math.round((f - parseFecha(hoy)) / MS_DIA);
  if (diff >= dias) return null;
  const regla = `Las solicitudes se hacen con al menos ${dias} días de anticipación.`;
  if (diff < 0) return `Esa fecha ya pasó. ${regla}`;
  const posesivo = trato === "usted" ? "Su" : "Tu";
  return `${regla} ${posesivo} actividad es en ${diff} ${diff === 1 ? "día" : "días"}.`;
}

// Devuelve { horaInicio?, horaFin? } con los errores que haya.
export function validarHoras(horaInicio, horaFin) {
  const errores = {};
  const i = parseHora(horaInicio);
  const f = parseHora(horaFin);
  if (i === null) errores.horaInicio = "Falta la hora de inicio.";
  if (f === null) errores.horaFin = "Falta la hora de fin.";
  if (i !== null && f !== null && f <= i) errores.horaFin = "La hora de fin debe ser después de la hora de inicio.";
  return errores;
}

// filas: [{ material, cantidad }]. Devuelve errores con llaves: material, material-N-nombre, material-N-cantidad.
export function validarMaterial(filas) {
  const errores = {};
  if (!Array.isArray(filas) || filas.length === 0) {
    errores.material = "Agrega al menos un material.";
    return errores;
  }
  filas.forEach((fila, i) => {
    if (!limpiar(fila?.material)) errores[`material-${i}-nombre`] = "Falta el nombre del material.";
    const cantidad = String(fila?.cantidad ?? "").trim();
    if (!/^\d+$/.test(cantidad) || Number(cantidad) < 1) {
      errores[`material-${i}-cantidad`] = "La cantidad debe ser un número entero, 1 o más.";
    }
  });
  return errores;
}

// Recogida: no después del inicio de la actividad; si maxDias no es null, tampoco más días antes.
export function validarRecogida(recogida, inicioActividad, maxDias) {
  if (recogida === null || inicioActividad === null) return null;
  if (recogida > inicioActividad) return "El material se recoge a más tardar cuando empieza tu actividad.";
  if (maxDias !== null && maxDias !== undefined && recogida < inicioActividad - maxDias * MS_DIA) {
    return `Puedes recoger el material hasta ${maxDias} días antes de tu actividad.`;
  }
  return null;
}

// Devolución: no antes del fin de la actividad y no más de horasMax después.
export function validarDevolucion(devolucion, finActividad, horasMax) {
  if (devolucion === null || finActividad === null) return null;
  if (devolucion < finActividad) return "El material se devuelve después de que termina tu actividad, no antes.";
  if (devolucion > finActividad + horasMax * MS_HORA) {
    return `El material se devuelve a más tardar ${horasMax} horas después de que termina tu actividad.`;
  }
  return null;
}

// ---------- Validación de formularios completos ----------
// Todas devuelven { ok, errores } donde errores = { campo: mensaje } en el orden en que se revisan.

function nuevoAcumulador() {
  const errores = {};
  const poner = (campo, mensaje) => {
    if (mensaje && !(campo in errores)) errores[campo] = mensaje;
  };
  const ponerVarios = (objeto) => Object.entries(objeto).forEach(([c, m]) => poner(c, m));
  const resultado = () => ({ ok: Object.keys(errores).length === 0, errores });
  return { poner, ponerVarios, resultado };
}

const CASILLA = "Esta casilla es obligatoria.";

export function validarProfesor(d, hoy, config) {
  const { poner, ponerVarios, resultado } = nuevoAcumulador();
  poner("nombre", validarNombre(d.nombre));
  poner("correo", validarCorreo(d.correo, config.dominioInstitucional));
  poner("actividad", validarTextoObligatorio(d.actividad, MAX_ACTIVIDAD));

  if (d.tipoReserva === "evento") {
    poner("fecha", validarAnticipacion(d.fecha, hoy, config.diasAnticipacion, "usted"));
  } else if (d.tipoReserva === "bloque") {
    if (!Object.hasOwn(PERIODOS, d.periodo)) poner("periodo", "Falta indicar el periodo.");
    poner("fechaInicio", validarAnticipacion(d.fechaInicio, hoy, config.diasAnticipacion, "usted"));
    const ini = parseFecha(d.fechaInicio);
    const fin = parseFecha(d.fechaFin);
    if (fin === null) poner("fechaFin", "Falta una fecha de fin válida.");
    else if (ini !== null && fin <= ini) poner("fechaFin", "La fecha de fin debe ser después de la fecha de inicio.");
    const dias = Array.isArray(d.dias) ? d.dias.filter((n) => Object.hasOwn(DIAS_BLOQUE, n)) : [];
    if (dias.length === 0) poner("dias", "Marque al menos un día de la semana.");
  } else {
    poner("tipoReserva", "Falta indicar si es por evento o por bloque.");
  }

  ponerVarios(validarHoras(d.horaInicio, d.horaFin));
  if (d.casillaFormato !== true) poner("casillaFormato", CASILLA);
  if (d.casillaOutlook !== true) poner("casillaOutlook", CASILLA);
  return resultado();
}

export function validarAlumnoEspacio(d, hoy, config) {
  const { poner, ponerVarios, resultado } = nuevoAcumulador();
  poner("nombre", validarNombre(d.nombre));
  poner("correo", validarCorreo(d.correo, config.dominioInstitucional));
  poner("profNombre", validarNombre(d.profNombre));
  poner("profCorreo", validarCorreo(d.profCorreo, config.dominioInstitucional));
  if (mismoCorreo(d.correo, d.profCorreo)) poner("profCorreo", "El correo del profesor no puede ser el tuyo.");
  poner("actividad", validarTextoObligatorio(d.actividad, MAX_ACTIVIDAD));
  poner("fecha", validarAnticipacion(d.fecha, hoy, config.diasAnticipacion));
  ponerVarios(validarHoras(d.horaInicio, d.horaFin));
  if (d.casillaFormato !== true) poner("casillaFormato", CASILLA);
  return resultado();
}

// tipo: "cites" o "salida"
export function validarAlumnoMaterial(d, tipo, hoy, config) {
  const { poner, ponerVarios, resultado } = nuevoAcumulador();
  poner("nombre", validarNombre(d.nombre));
  poner("correo", validarCorreo(d.correo, config.dominioInstitucional));

  if (d.hayProfesor === true) {
    poner("profNombre", validarNombre(d.profNombre));
    poner("profCorreo", validarCorreo(d.profCorreo, config.dominioInstitucional));
    if (mismoCorreo(d.correo, d.profCorreo)) poner("profCorreo", "El correo del profesor no puede ser el tuyo.");
  } else if (d.hayProfesor === false) {
    poner("alumnosResponsables", validarTextoObligatorio(d.alumnosResponsables, MAX_ALUMNOS_RESPONSABLES));
  } else {
    poner("hayProfesor", "Falta indicar si hay un profesor responsable.");
  }

  if (!Object.hasOwn(TIPOS_ACTIVIDAD, d.tipoActividad)) poner("tipoActividad", "Falta indicar el tipo de actividad.");
  else if (d.tipoActividad === "otro") poner("tipoOtro", validarTextoObligatorio(d.tipoOtro, MAX_ACTIVIDAD));
  poner("actividad", validarTextoObligatorio(d.actividad, MAX_ACTIVIDAD));
  poner("lugar", validarTextoObligatorio(d.lugar, MAX_ACTIVIDAD));

  poner("fecha", validarAnticipacion(d.fecha, hoy, config.diasAnticipacion));
  ponerVarios(validarHoras(d.horaInicio, d.horaFin));
  ponerVarios(validarMaterial(d.material));

  const recogida = momento(d.recogidaFecha, d.recogidaHora);
  if (!parseFecha(d.recogidaFecha)) poner("recogidaFecha", "Falta la fecha en que recogen el material.");
  if (parseHora(d.recogidaHora) === null) poner("recogidaHora", "Falta la hora en que recogen el material.");
  poner("recogidaFecha", validarRecogida(recogida, momento(d.fecha, d.horaInicio), config.maxDiasAntesRecogida));

  const devolucion = momento(d.devolucionFecha, d.devolucionHora);
  if (!parseFecha(d.devolucionFecha)) poner("devolucionFecha", "Falta la fecha en que devuelven el material.");
  if (parseHora(d.devolucionHora) === null) poner("devolucionHora", "Falta la hora en que devuelven el material.");
  poner("devolucionFecha", validarDevolucion(devolucion, momento(d.fecha, d.horaFin), config.horasMaxDevolucion));

  if (d.casillaInsumos !== true) poner("casillaInsumos", CASILLA);
  if (requiereCasillaSalida(tipo, config) && d.casillaSalida !== true) poner("casillaSalida", CASILLA);
  return resultado();
}

export function requiereCasillaSalida(tipo, config) {
  return tipo === "salida" || config.citesRequiereSalidaYCredencial === true;
}

function mismoCorreo(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

// ---------- Folio ----------

// fecha "AAAA-MM-DD" de la actividad; aleatorio: función que devuelve un número en [0, 1)
export function generarFolio(fecha, aleatorio = Math.random) {
  let sufijo = "";
  for (let i = 0; i < 4; i++) sufijo += ALFABETO_FOLIO[Math.floor(aleatorio() * ALFABETO_FOLIO.length)];
  return `CSC-${fecha.replaceAll("-", "")}-${sufijo}`;
}

// ---------- Correo ----------

const linea = (etiqueta, valor) => `${etiqueta}: ${valor}`;
const persona = (nombre, correo) => `${limpiar(nombre)} (${String(correo).trim()})`;
// La cantidad ya se validó como solo dígitos: se quitan los ceros a la izquierda sin convertirla a número
// (un número enorme saldría como 1e+23 en el correo).
const cantidadTexto = (cantidad) => String(cantidad).trim().replace(/^0+(?=\d)/, "");
const horario = (d) => `${d.horaInicio} – ${d.horaFin}`;
const seccion = (titulo, lineas) => ["", `— ${titulo} —`, ...lineas];
const momentoTexto = (fecha, hora) => `${fechaConDia(fecha)} ${hora}`;

const TITULOS = {
  "PROF-EVENTO": "SOLICITUD CSC · PROFESOR · POR EVENTO",
  "PROF-BLOQUE": "SOLICITUD CSC · PROFESOR · POR BLOQUE",
  "ALUM-ESPACIO": "SOLICITUD CSC · ALUMNO · ESPACIO DEL CSC",
  "ALUM-CITES": "SOLICITUD CSC · ALUMNO · MATERIAL PARA CITES",
  "ALUM-SALIDA": "SOLICITUD CSC · ALUMNO · MATERIAL FUERA DEL CAMPUS",
};

const TEXTO_FORMATO = 'Adjuntaré el formato "Diseño de actividades" completo';

export function fechaDeActividad(etiqueta, d) {
  return etiqueta === "PROF-BLOQUE" ? d.fechaInicio : d.fecha;
}

function seccionesDe(etiqueta, d, config) {
  switch (etiqueta) {
    case "PROF-EVENTO":
      return [
        ...seccion("RESPONSABLE", [linea("Profesor responsable", persona(d.nombre, d.correo))]),
        ...seccion("ACTIVIDAD", [
          linea("Nombre", limpiar(d.actividad)),
          linea("Fecha", fechaConDia(d.fecha)),
          linea("Horario", horario(d)),
        ]),
        ...seccion("CONFIRMACIONES", [
          `[x] ${TEXTO_FORMATO}`,
          "[x] Entiendo que la reserva se confirma solo con la invitación de Outlook del CSC",
        ]),
      ];
    case "PROF-BLOQUE":
      return [
        ...seccion("RESPONSABLE", [linea("Profesor responsable", persona(d.nombre, d.correo))]),
        ...seccion("ACTIVIDAD", [
          linea("Nombre", limpiar(d.actividad)),
          linea("Periodo", PERIODOS[d.periodo]),
          linea("Inicio", fechaConDia(d.fechaInicio)),
          linea("Fin", fechaConDia(d.fechaFin)),
          linea("Días", [...d.dias].sort((a, b) => a - b).map((n) => DIAS_BLOQUE[n]).join(", ")),
          linea("Horario", horario(d)),
        ]),
        ...seccion("CONFIRMACIONES", [
          `[x] ${TEXTO_FORMATO}`,
          "[x] Entiendo que la reserva se confirma solo con la invitación de Outlook del CSC",
        ]),
      ];
    case "ALUM-ESPACIO":
      return [
        ...seccion("RESPONSABLES", [
          linea("Alumno", persona(d.nombre, d.correo)),
          linea("Profesor responsable", persona(d.profNombre, d.profCorreo)),
        ]),
        ...seccion("ACTIVIDAD", [
          linea("Nombre", limpiar(d.actividad)),
          linea("Fecha", fechaConDia(d.fecha)),
          linea("Horario", horario(d)),
        ]),
        ...seccion("CONFIRMACIONES", [`[x] ${TEXTO_FORMATO}`]),
      ];
    default:
      return seccionesMaterial(etiqueta, d, config);
  }
}

function seccionesMaterial(etiqueta, d, config) {
  const responsables = [linea("Alumno responsable del material", persona(d.nombre, d.correo))];
  if (d.hayProfesor) responsables.push(linea("Profesor responsable", persona(d.profNombre, d.profCorreo)));
  else responsables.push(linea("Alumno(s) responsable(s) de la actividad", limpiar(d.alumnosResponsables)));

  const tipo = d.tipoActividad === "otro" ? `Otro: ${limpiar(d.tipoOtro)}` : TIPOS_ACTIVIDAD[d.tipoActividad];
  const lugar = etiqueta === "ALUM-CITES" ? `CITES — ${limpiar(d.lugar)}` : limpiar(d.lugar);

  const confirmaciones = ["[x] Entiendo que NO se prestan insumos"];
  if (requiereCasillaSalida(etiqueta === "ALUM-SALIDA" ? "salida" : "cites", config)) {
    confirmaciones.push("[x] Llenaré el formato de salida y dejaré la credencial Tec del responsable");
  }

  return [
    ...seccion("RESPONSABLES", responsables),
    ...seccion("ACTIVIDAD", [
      linea("Tipo", tipo),
      linea("Nombre", limpiar(d.actividad)),
      linea("Lugar", lugar),
      linea("Fecha", fechaConDia(d.fecha)),
      linea("Horario", horario(d)),
    ]),
    ...seccion(
      "MATERIAL (no se prestan insumos)",
      d.material.map((f, i) => `${i + 1}. ${limpiar(f.material)} — ${cantidadTexto(f.cantidad)}`),
    ),
    ...seccion("RECOGIDA Y DEVOLUCIÓN", [
      linea("Recoge", momentoTexto(d.recogidaFecha, d.recogidaHora)),
      linea("Devuelve", momentoTexto(d.devolucionFecha, d.devolucionHora)),
    ]),
    ...seccion("CONFIRMACIONES", confirmaciones),
  ];
}

// etiqueta: una de ETIQUETAS. ahora: "AAAA-MM-DDTHH:MM". aleatorio: ver generarFolio.
// Devuelve { etiqueta, folio, para, cc, asunto, cuerpo }.
export function armarCorreo(etiqueta, d, ahora, config, aleatorio = Math.random) {
  const fecha = fechaDeActividad(etiqueta, d);
  const folio = generarFolio(fecha, aleatorio);
  const generada = `${formatoFecha(ahora.slice(0, 10))} ${ahora.slice(11, 16)}`;

  const cuerpo = [
    TITULOS[etiqueta],
    linea("Folio", folio),
    linea("Generada", generada),
    ...seccionesDe(etiqueta, d, config),
  ].join("\r\n");

  const tieneProfesor = etiqueta === "ALUM-ESPACIO" || (etiqueta.startsWith("ALUM-") && d.hayProfesor === true);
  return {
    etiqueta,
    folio,
    para: config.correoPruebas || config.correoCSC,
    cc: tieneProfesor ? String(d.profCorreo).trim() : "",
    asunto: `[CSC][${etiqueta}] ${formatoFecha(fecha)} · ${limpiar(d.actividad)} · ${folio}`,
    cuerpo,
  };
}

// ---------- URLs y texto para copiar ----------

const codificar = encodeURIComponent;

export function urlOutlook({ para, cc, asunto, cuerpo }) {
  const partes = [`to=${codificar(para)}`];
  if (cc) partes.push(`cc=${codificar(cc)}`);
  partes.push(`subject=${codificar(asunto)}`, `body=${codificar(cuerpo)}`);
  return `https://outlook.office.com/mail/deeplink/compose?${partes.join("&")}`;
}

export function urlMailto({ para, cc, asunto, cuerpo }) {
  const partes = [];
  if (cc) partes.push(`cc=${codificar(cc)}`);
  partes.push(`subject=${codificar(asunto)}`, `body=${codificar(cuerpo)}`);
  return `mailto:${codificar(para).replaceAll("%40", "@")}?${partes.join("&")}`;
}

export function textoParaCopiar({ para, cc, asunto, cuerpo }) {
  return [`Para: ${para}`, `CC: ${cc}`, `Asunto: ${asunto}`, "", cuerpo].join("\r\n");
}

export function avisoCorreoLargo(correo) {
  return correo.cuerpo.length > LIMITE_CORREO
    ? "El correo es largo. Si no abre en Outlook, usa 'Copiar correo'."
    : "";
}
