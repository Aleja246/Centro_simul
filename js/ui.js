// Todo lo que toca el DOM. La lógica (validar, armar correo, URLs) vive en logica.js.
// Cada página solo trae su HTML y carga este archivo; aquí se activa sola
// si encuentra un <form data-formulario="...">.
import { CONFIG } from "./config.js";
import {
  validarProfesor,
  validarAlumnoEspacio,
  validarAlumnoMaterial,
  armarCorreo,
  urlOutlook,
  urlMailto,
  textoParaCopiar,
  avisoCorreoLargo,
  ahoraLocal,
} from "./logica.js";

// ---------- Qué hace cada formulario ----------

const FORMULARIOS = {
  profesor: {
    trato: "usted",
    adjuntaFormato: true,
    etiqueta: (d) => (d.tipoReserva === "bloque" ? "PROF-BLOQUE" : "PROF-EVENTO"),
    validar: (d, hoy) => validarProfesor(d, hoy, CONFIG),
  },
  "alumno-espacio": {
    trato: "tu",
    adjuntaFormato: true,
    etiqueta: () => "ALUM-ESPACIO",
    validar: (d, hoy) => validarAlumnoEspacio(d, hoy, CONFIG),
  },
  "alumno-cites": {
    trato: "tu",
    adjuntaFormato: false,
    etiqueta: () => "ALUM-CITES",
    validar: (d, hoy) => validarAlumnoMaterial(d, "cites", hoy, CONFIG),
  },
  "alumno-salida": {
    trato: "tu",
    adjuntaFormato: false,
    etiqueta: () => "ALUM-SALIDA",
    validar: (d, hoy) => validarAlumnoMaterial(d, "salida", hoy, CONFIG),
  },
};

const TEXTOS = {
  tu: {
    titulo: "Revisa tu correo",
    aviso: "Tu solicitud NO está enviada hasta que presiones Enviar en tu correo.",
    adjunta: "Adjunta el formato de Diseño de actividades antes de enviar.",
    cc: (cc) => `Cuando se abra el correo, revisa que ${cc} aparezca en CC. Si no, agrégalo a mano.`,
    instrucciones: `Si copias el correo: pégalo en un mensaje nuevo desde tu cuenta ${CONFIG.dominioInstitucional}. Pon Para, CC y Asunto en sus casillas y el resto en el mensaje.`,
    copiado: "Copiado. Ahora pégalo en un correo nuevo.",
    noCopiado: "No se pudo copiar. Selecciona el texto de arriba y cópialo a mano.",
  },
  usted: {
    titulo: "Revise su correo",
    aviso: "Su solicitud NO está enviada hasta que presione Enviar en su correo.",
    adjunta: "Adjunte el formato de Diseño de actividades antes de enviar.",
    cc: (cc) => `Cuando se abra el correo, revise que ${cc} aparezca en CC. Si no, agréguelo a mano.`,
    instrucciones: `Si copia el correo: péguelo en un mensaje nuevo desde su cuenta ${CONFIG.dominioInstitucional}. Ponga Para, CC y Asunto en sus casillas y el resto en el mensaje.`,
    copiado: "Copiado. Ahora péguelo en un correo nuevo.",
    noCopiado: "No se pudo copiar. Seleccione el texto de arriba y cópielo a mano.",
  },
};

// ---------- Utilidades ----------

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

// Crea un elemento. Los hijos que son texto se agregan como texto (nunca como HTML).
function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue;
    nodo.setAttribute(nombre, valor === true ? "" : valor);
  }
  nodo.append(...hijos);
  return nodo;
}

function valorConfig(ruta) {
  return ruta.split(".").reduce((objeto, llave) => objeto?.[llave], CONFIG);
}

// La ruta del formato en config.js es relativa a la raíz del sitio; se resuelve desde js/.
function urlFormato() {
  return new URL(`../${CONFIG.urlFormatoDiseno}`, import.meta.url).href;
}

function desactivarControles(nodo, desactivar) {
  for (const control of $$("input, select, textarea, button", nodo)) {
    if (control.closest("[data-solo-si][hidden]")) continue; // lo apagado por config no se reactiva
    control.disabled = desactivar;
  }
}

// ---------- Textos que vienen de config.js ----------

function aplicarConfig() {
  for (const nodo of $$("[data-config]")) nodo.textContent = valorConfig(nodo.dataset.config);
  for (const enlace of $$("[data-config-href]")) {
    enlace.href = new URL(`../${valorConfig(enlace.dataset.configHref)}`, import.meta.url).href;
  }
  for (const enlace of $$("[data-config-mailto]")) enlace.href = `mailto:${valorConfig(enlace.dataset.configMailto)}`;
  for (const nodo of $$("[data-solo-si]")) {
    if (valorConfig(nodo.dataset.soloSi) !== true) {
      nodo.hidden = true;
      desactivarControles(nodo, true);
    }
  }
}

// ---------- Secciones que aparecen según lo elegido ----------
// data-si="campo=valor" o "campo=valor1|valor2"

function actualizarVisibilidad(form) {
  for (const seccion of $$("[data-si]", form)) {
    const [nombre, valores] = seccion.dataset.si.split("=");
    const elegido = $(`[name="${nombre}"]:checked`, form)?.value;
    const visible = valores.split("|").includes(elegido);
    seccion.hidden = !visible;
    desactivarControles(seccion, !visible);
    if (!visible) for (const campo of $$("[data-campo]", seccion)) quitarError(form, campo);
  }
}

// ---------- Tabla de material ----------

const FILA_MATERIAL = `
<div class="fila-material" data-fila>
  <div class="campo" data-sufijo="nombre">
    <label>Material</label>
    <input type="text" autocomplete="off" data-material="nombre">
  </div>
  <div class="campo" data-sufijo="cantidad">
    <label>Cantidad</label>
    <input type="text" inputmode="numeric" autocomplete="off" data-material="cantidad">
  </div>
  <button type="button" class="boton-quitar" data-quitar></button>
</div>`;

function iniciarMaterial(form) {
  const contenedor = $("[data-filas-material]", form);
  if (!contenedor) return;
  const molde = document.createElement("template");
  molde.innerHTML = FILA_MATERIAL.trim();

  // Mantiene ids, etiquetas y llaves de error alineados con la posición de cada fila
  // (logica.js reporta material-0-nombre, material-0-cantidad, material-1-...).
  const renumerar = () => {
    const filas = $$("[data-fila]", contenedor);
    filas.forEach((fila, i) => {
      for (const campo of $$("[data-sufijo]", fila)) {
        const sufijo = campo.dataset.sufijo;
        const id = `material-${i}-${sufijo}`;
        quitarError(form, campo);
        campo.dataset.campo = id;
        campo.dataset.nombre = `${sufijo === "nombre" ? "Material" : "Cantidad"} ${i + 1}`;
        $("label", campo).htmlFor = id;
        $("input", campo).id = id;
      }
      const boton = $("[data-quitar]", fila);
      const accion = filas.length > 1 ? "Quitar" : "Borrar";
      boton.textContent = accion;
      boton.setAttribute("aria-label", `${accion} material ${i + 1}`);
    });
  };

  const agregar = () => {
    const fila = molde.content.firstElementChild.cloneNode(true);
    contenedor.append(fila);
    renumerar();
    return fila;
  };

  $("[data-agregar-material]", form).addEventListener("click", () => {
    quitarError(form, $("[data-campo='material']", form));
    $("input", agregar()).focus();
  });

  contenedor.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-quitar]");
    if (!boton) return;
    const fila = boton.closest("[data-fila]");
    if ($$("[data-fila]", contenedor).length > 1) fila.remove();
    else for (const campo of $$("input", fila)) campo.value = "";
    renumerar();
    $("[data-fila] input", contenedor).focus();
  });

  agregar();
}

// ---------- Leer el formulario ----------

function leerFormulario(form) {
  const datos = {};
  for (const control of form.elements) {
    if (!control.name || control.disabled) continue;
    if (control.type === "radio") {
      if (control.checked) datos[control.name] = control.value;
    } else if (control.type === "checkbox") {
      if (control.name === "dias") {
        datos.dias ??= [];
        if (control.checked) datos.dias.push(Number(control.value));
      } else {
        datos[control.name] = control.checked;
      }
    } else {
      datos[control.name] = control.value;
    }
  }
  if ("hayProfesor" in datos) datos.hayProfesor = datos.hayProfesor === "si";

  const filas = $$("[data-fila]", form);
  if (filas.length > 0) {
    datos.material = filas.map((fila) => ({
      material: $("[data-material='nombre']", fila).value,
      cantidad: $("[data-material='cantidad']", fila).value,
    }));
  }
  return datos;
}

// ---------- Errores ----------

function nombreDe(contenedor) {
  const texto = contenedor.dataset.nombre ?? $("label, legend", contenedor)?.textContent.trim() ?? "";
  return texto.length > 40 ? `${texto.slice(0, 37)}…` : texto;
}

function ponerError(contenedor, campo, mensaje) {
  let parrafo = $(":scope > .error", contenedor);
  if (!parrafo) {
    parrafo = el("p", { class: "error", id: `error-${campo}` });
    contenedor.append(parrafo);
  }
  parrafo.textContent = mensaje;
  contenedor.classList.add("con-error");
  for (const control of $$("input, select, textarea", contenedor)) {
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-describedby", parrafo.id);
  }
}

function limpiarError(contenedor) {
  $(":scope > .error", contenedor)?.remove();
  contenedor.classList.remove("con-error");
  for (const control of $$("input, select, textarea", contenedor)) {
    control.removeAttribute("aria-invalid");
    control.removeAttribute("aria-describedby");
  }
}

function quitarError(form, contenedor) {
  if (!contenedor?.classList.contains("con-error")) return;
  limpiarError(contenedor);
  const resumen = $("#resumen-errores", form);
  if (!resumen) return;
  $(`li[data-error-de="${contenedor.dataset.campo}"]`, resumen)?.remove();
  if (!$("li", resumen)) {
    resumen.hidden = true;
    resumen.replaceChildren();
  }
}

function limpiarTodo(form) {
  for (const contenedor of $$(".con-error", form)) limpiarError(contenedor);
  const resumen = $("#resumen-errores", form);
  if (resumen) {
    resumen.hidden = true;
    resumen.replaceChildren();
  }
}

function enfocar(contenedor) {
  const control = $$("input, select, textarea, button", contenedor).find((c) => !c.disabled);
  if (!control) return;
  control.scrollIntoView({ block: "center" });
  control.focus({ preventScroll: true });
}

// errores: { campo: mensaje } en el orden en que los revisa logica.js.
// Aquí se reordenan como aparecen en la pantalla para llevar el foco al primero de arriba.
function mostrarErrores(form, errores) {
  const items = Object.entries(errores).map(([campo, mensaje]) => ({
    campo,
    mensaje,
    contenedor: $(`[data-campo="${campo}"]`, form),
  }));
  items.sort((a, b) => {
    if (!a.contenedor || !b.contenedor) return Number(!a.contenedor) - Number(!b.contenedor);
    return a.contenedor.compareDocumentPosition(b.contenedor) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  for (const { campo, mensaje, contenedor } of items) if (contenedor) ponerError(contenedor, campo, mensaje);

  let resumen = $("#resumen-errores", form);
  if (!resumen) {
    resumen = el("div", { id: "resumen-errores", class: "resumen-errores", role: "alert", tabindex: "-1", hidden: true });
    form.prepend(resumen);
  }
  const lista = el(
    "ul",
    {},
    ...items.map(({ campo, mensaje, contenedor }) => {
      const enlace = el("a", { href: `#error-${campo}` }, `${contenedor ? nombreDe(contenedor) : campo}: ${mensaje}`);
      enlace.addEventListener("click", (evento) => {
        evento.preventDefault();
        if (contenedor) enfocar(contenedor);
      });
      return el("li", { "data-error-de": campo }, enlace);
    }),
  );
  resumen.replaceChildren(el("p", {}, el("strong", {}, "Revisa estos campos:")), lista);
  resumen.hidden = false;

  const primero = items.find((i) => i.contenedor);
  if (primero) enfocar(primero.contenedor);
  else resumen.focus();
}

// ---------- Pantalla final ----------

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // plan B para navegadores sin permiso de portapapeles
  }
  const area = el("textarea", { class: "fuera-de-pantalla", readonly: true, "aria-hidden": "true" });
  area.value = texto;
  document.body.append(area);
  area.select();
  let copiado = false;
  try {
    copiado = document.execCommand("copy");
  } catch {
    copiado = false;
  }
  area.remove();
  return copiado;
}

function mostrarPantallaFinal(form, correo, ajustes) {
  const t = TEXTOS[ajustes.trato];
  const texto = textoParaCopiar(correo);
  $("#pantalla-final")?.remove();

  const estado = el("p", { class: "pequeno", role: "status" });
  const botonCopiar = el("button", { type: "button", class: "boton boton-secundario" }, "Copiar correo");
  botonCopiar.addEventListener("click", async () => {
    estado.textContent = (await copiar(texto)) ? t.copiado : t.noCopiado;
  });

  const botonVolver = el("button", { type: "button", class: "boton-texto" }, "Volver a editar");

  const partes = [
    el("h2", { id: "titulo-final", tabindex: "-1" }, t.titulo),
    el("p", { class: "aviso-grande" }, t.aviso),
  ];
  if (ajustes.adjuntaFormato) {
    partes.push(
      el("p", { class: "aviso-grande" }, t.adjunta, " ", el("a", { href: urlFormato(), download: true }, "Descargar formato")),
    );
  }
  if (correo.cc) partes.push(el("p", { class: "aviso" }, t.cc(correo.cc)));
  partes.push(
    el("pre", { class: "vista-previa" }, texto),
    el(
      "div",
      { class: "botones" },
      el(
        "a",
        { class: "boton boton-primario", href: urlOutlook(correo), target: "_blank", rel: "noopener noreferrer" },
        "Abrir en Outlook (cuenta Tec)",
      ),
      el("a", { class: "boton boton-secundario", href: urlMailto(correo) }, "Abrir en mi app de correo"),
      botonCopiar,
    ),
    estado,
    el("p", { class: "pequeno" }, t.instrucciones),
  );
  const largo = avisoCorreoLargo(correo);
  if (largo) partes.push(el("p", { class: "pequeno" }, largo));
  partes.push(botonVolver);

  const final = el("section", { id: "pantalla-final", "aria-labelledby": "titulo-final" }, ...partes);
  form.after(final);
  document.body.classList.add("fase-final");
  window.scrollTo(0, 0);
  $("#titulo-final").focus();

  botonVolver.addEventListener("click", () => {
    final.remove();
    document.body.classList.remove("fase-final");
    window.scrollTo(0, 0);
    $("input:not([disabled])", form)?.focus();
  });
}

// ---------- Formulario de material (compartido por CITES y salida) ----------
// Es el mismo formulario para las dos páginas: vive aquí, una sola vez.

function plantillaMaterial(tipo) {
  const cites = tipo === "cites";
  const campoTexto = (nombre, etiqueta, extra = "") =>
    `<div class="campo" data-campo="${nombre}"><label for="${nombre}">${etiqueta}</label><input id="${nombre}" name="${nombre}" type="text" ${extra}></div>`;
  const campoCorreo = (nombre, etiqueta) =>
    `<div class="campo" data-campo="${nombre}"><label for="${nombre}">${etiqueta}</label><input id="${nombre}" name="${nombre}" type="email" inputmode="email" autocapitalize="none" autocomplete="off"></div>`;
  const opcion = (nombre, valor, texto) =>
    `<label class="opcion"><input type="radio" name="${nombre}" value="${valor}"> ${texto}</label>`;
  const casilla = (nombre, texto, extra = "") =>
    `<div class="campo" ${extra} data-campo="${nombre}"><label class="opcion"><input type="checkbox" name="${nombre}"> ${texto}</label></div>`;

  return `
<div class="reglas">
  <ul>
    <li>Recoge el material lo más cerca posible de tu actividad y devuélvelo a más tardar <span data-config="horasMaxDevolucion"></span> horas después de que termine: otros grupos lo necesitan.</li>
    <li${cites ? ' data-solo-si="citesRequiereSalidaYCredencial"' : ""}>Al recoger llenarás un formato de salida y dejarás tu credencial Tec.</li>
  </ul>
</div>

<h2>Responsable del material</h2>
${campoTexto("nombre", "Tu nombre completo (responsable del material)", 'autocomplete="name"')}
${campoCorreo("correo", `Tu correo ${CONFIG.dominioInstitucional}`)}

<fieldset class="campo" data-campo="hayProfesor">
  <legend>¿Hay un profesor responsable?</legend>
  ${opcion("hayProfesor", "si", "Sí")}
  ${opcion("hayProfesor", "no", "No")}
</fieldset>
<div data-si="hayProfesor=si" hidden>
  ${campoTexto("profNombre", "Nombre completo del profesor responsable")}
  ${campoCorreo("profCorreo", `Correo ${CONFIG.dominioInstitucional} del profesor`)}
</div>
<div data-si="hayProfesor=no" hidden>
  <div class="campo" data-campo="alumnosResponsables">
    <label for="alumnosResponsables">Nombre(s) del/los alumno(s) responsable(s) de la actividad</label>
    <textarea id="alumnosResponsables" name="alumnosResponsables" rows="2"></textarea>
  </div>
</div>

<h2>Actividad</h2>
<fieldset class="campo" data-campo="tipoActividad">
  <legend>Tipo de actividad</legend>
  ${opcion("tipoActividad", "grupo", "Grupo estudiantil")}
  ${opcion("tipoActividad", "brigada", "Brigada")}
  ${opcion("tipoActividad", "otro", "Otro (especificar)")}
</fieldset>
<div data-si="tipoActividad=otro" hidden>
  ${campoTexto("tipoOtro", "Especifica el tipo de actividad")}
</div>
${campoTexto("actividad", "Nombre de la actividad")}
${
  cites
    ? `<p>Lugar: <strong>CITES</strong></p>${campoTexto("lugar", "Espacio específico de CITES")}`
    : campoTexto("lugar", "Lugar: dirección o comunidad")
}
<div class="campo" data-campo="fecha"><label for="fecha">Fecha de la actividad</label><input id="fecha" name="fecha" type="date"></div>
<div class="dos-columnas">
  <div class="campo" data-campo="horaInicio"><label for="horaInicio">Hora de inicio</label><input id="horaInicio" name="horaInicio" type="time"></div>
  <div class="campo" data-campo="horaFin"><label for="horaFin">Hora de fin</label><input id="horaFin" name="horaFin" type="time"></div>
</div>

<h2>Material</h2>
<fieldset class="campo" data-campo="material">
  <legend>Material solicitado</legend>
  <p class="aviso"><strong>NO se prestan insumos.</strong></p>
  <div data-filas-material></div>
  <button type="button" class="boton boton-secundario" data-agregar-material>+ Agregar material</button>
</fieldset>

<h2>Recogida y devolución</h2>
<div class="campo" data-campo="recogidaFecha"><label for="recogidaFecha">Fecha en que recogen el material</label><input id="recogidaFecha" name="recogidaFecha" type="date"></div>
<div class="campo" data-campo="recogidaHora"><label for="recogidaHora">Hora en que recogen el material</label><input id="recogidaHora" name="recogidaHora" type="time"></div>
<div class="campo" data-campo="devolucionFecha"><label for="devolucionFecha">Fecha en que devuelven el material</label><input id="devolucionFecha" name="devolucionFecha" type="date"></div>
<div class="campo" data-campo="devolucionHora"><label for="devolucionHora">Hora en que devuelven el material</label><input id="devolucionHora" name="devolucionHora" type="time"></div>

${casilla("casillaInsumos", "Entiendo que NO se prestan insumos")}
${casilla(
  "casillaSalida",
  "Al recoger llenaré el formato de salida y dejaré la credencial Tec del responsable",
  cites ? 'data-solo-si="citesRequiereSalidaYCredencial"' : "",
)}

<button class="boton boton-primario" type="submit">Preparar mi correo</button>`;
}

// ---------- Arranque ----------

function iniciarFormulario(form, ajustes) {
  form.noValidate = true;
  iniciarMaterial(form);
  actualizarVisibilidad(form);

  form.addEventListener("change", () => actualizarVisibilidad(form));
  // En cuanto se corrige un campo, se quita su error.
  const alEditar = (evento) => quitarError(form, evento.target.closest("[data-campo]"));
  form.addEventListener("input", alEditar);
  form.addEventListener("change", alEditar);

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    limpiarTodo(form);
    const datos = leerFormulario(form);
    const ahora = ahoraLocal(new Date());
    const { ok, errores } = ajustes.validar(datos, ahora.slice(0, 10));
    if (!ok) {
      mostrarErrores(form, errores);
      return;
    }
    mostrarPantallaFinal(form, armarCorreo(ajustes.etiqueta(datos), datos, ahora, CONFIG), ajustes);
  });
}

function iniciar() {
  const form = $("form[data-formulario]");
  const tipo = form?.dataset.formulario;
  const ajustes = FORMULARIOS[tipo];
  if (form && ajustes && tipo.startsWith("alumno-") && tipo !== "alumno-espacio") {
    form.innerHTML = plantillaMaterial(tipo === "alumno-cites" ? "cites" : "salida");
  }
  aplicarConfig();
  if (form && ajustes) iniciarFormulario(form, ajustes);
}

iniciar();
