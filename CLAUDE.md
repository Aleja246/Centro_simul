# CLAUDE.md — Solicitudes del Centro de Simulación Clínica (CSC)

## Contexto
El CSC recibe solicitudes de profesores y alumnos por correo. Hoy se contesta con una autorespuesta larga que mezcla las reglas de ambos; la gente no la lee y llegan solicitudes incompletas o con errores. La coordinadora del CSC (la Dra.) necesita que TODA solicitud le llegue como correo a la bandeja del CSC, completa y siempre con el mismo formato.

Este repo es un sitio estático que:
1. Separa a profesores y alumnos desde la primera pantalla (nadie ve las reglas del otro).
2. Pide solo los datos necesarios según el tipo de solicitud y los valida.
3. Arma un correo con formato estándar y lo abre en el correo del solicitante, ya dirigido al CSC. El solicitante solo adjunta (si aplica) y presiona Enviar desde su cuenta @tec.mx.

No hay servidor, base de datos ni servicios externos. El sitio no guarda ningún dato.

## Reglas del proyecto (no negociables)
- **Permanente**: HTML + CSS + JavaScript puro (módulos ES). Sin frameworks, sin build, sin CDNs, sin API keys, sin servicios de formularios de terceros, sin acortadores de URL. Todo archivo que use el sitio vive en este repo.
- **El resultado siempre es un correo** al CSC con el formato de la sección "Formato del correo".
- **Rutas separadas** para profesores y alumnos.
- **No agregar, quitar ni reformular campos o reglas sin preguntarme**: las preguntas actuales fueron refinadas por la Dra. por prueba y error.
- **Un solo lugar para datos que cambian**: `js/config.js`.
- **Mobile first**: la mayoría entrará desde un QR con el celular. Botones grandes, texto corto, alto contraste, sin necesidad de zoom.
- Español claro y breve. Profesores: trato de usted. Alumnos: tú.
- Rutas relativas en todo el sitio (se publica en un subdirectorio de GitHub Pages).

## Estructura
```
/index.html                     ¿Eres profesor o alumno? (dos botones grandes)
/profesores/index.html          Reglas cortas + formulario (por evento / por bloque)
/alumnos/index.html             Menú: ¿qué necesitas? (4 opciones)
/alumnos/espacio-csc.html       Espacio del CSC para actividad de clase
/alumnos/cites.html             Material para CITES
/alumnos/salida-material.html   Material fuera del campus (brigadas, etc.)
/alumnos/extracurricular.html   Solo información (sin formulario)
/formatos/diseno-de-actividades.docx   Lo sube el CSC (reemplaza el tinyurl)
/js/config.js                   Datos que cambian
/js/logica.js                   Funciones PURAS: validar, armar correo, folio, URLs
/js/ui.js                       Todo lo que toca el DOM
/css/styles.css
/tests/*.test.js                Pruebas con node --test (sin dependencias)
/scripts/generar_qr.py          Genera QR estáticos
/qr/                            QR generados (PNG y SVG)
/package.json                   Solo {"type": "module"} para las pruebas; sin dependencias
/.nojekyll
/README.md                      Guía para quien mantenga el sitio
```

## js/config.js
```js
export const CONFIG = {
  correoCSC: "centrodesimulacion@outlook.com", // cambiar aquí cuando exista el institucional
  correoPruebas: "",          // si tiene valor, TODOS los correos van aquí (para probar)
  dominioInstitucional: "@tec.mx",
  diasAnticipacion: 7,
  horasRevision: 48,
  maxDiasAntesRecogida: null, // POR DEFINIR con la Dra. null = sin límite (solo se valida que no sea después del inicio)
  horasMaxDevolucion: 24,     // confirmado: máximo 24 h después de que termina la actividad
  citesRequiereSalidaYCredencial: true, // POR DEFINIR. Si es false, se ocultan ese aviso y esa casilla en CITES
  contactoEspacios: { nombre: "Carmen Paz", correo: "carmen.paz@tec.mx" },
  urlFormatoDiseno: "formatos/diseno-de-actividades.docx", // relativa a la raíz
};
```

## Textos de reglas (máximo lo que está aquí)

**Profesores** (arriba del formulario):
- Solicite con al menos una semana de anticipación, desde su correo @tec.mx.
- Puede reservar por evento o por bloque (anual, semestral o trimestral).
- Adjunte el formato "Diseño de actividades" completo ([descargar]).
- Revisamos en máximo 48 horas hábiles. Si hay disponibilidad, recibirá una invitación de Outlook; si no, le contactaremos para buscar alternativas.

**Alumnos** (en el menú):
- Solicita con al menos una semana de anticipación, desde tu correo @tec.mx.
- Los espacios del CSC son solo para actividades de clase.
- No se prestan insumos.
- Revisamos en máximo 48 horas hábiles.

**Préstamo de material** (en CITES y salida de material):
- Recoge el material lo más cerca posible de tu actividad y devuélvelo a más tardar 24 horas después de que termine: otros grupos lo necesitan.
- Al recoger llenarás un formato de salida y dejarás tu credencial Tec. (En CITES, mostrar solo si `CONFIG.citesRequiereSalidaYCredencial` es true.)

## Formularios

### Campos comunes
- Nombre completo del solicitante
- Correo del solicitante (@tec.mx)

### Profesores — `profesores/index.html`
Tipo de reserva: **Por evento** | **Por bloque**
- Nombre completo del profesor responsable
- Correo institucional (@tec.mx)
- Nombre de la actividad / materia
- Por evento: fecha, hora de inicio, hora de fin
- Por bloque: periodo (anual / semestral / trimestral), fecha de inicio, fecha de fin, días de la semana (casillas L–S), hora de inicio, hora de fin
- Casillas obligatorias:
  - [ ] Adjuntaré el formato "Diseño de actividades" completo antes de enviar el correo (con liga de descarga)
  - [ ] Entiendo que la reserva se confirma solo con la invitación de Outlook del CSC

Etiqueta: `PROF-EVENTO` o `PROF-BLOQUE`

### Alumnos — Espacio del CSC (actividad de clase) — `alumnos/espacio-csc.html`
- Nombre completo y correo @tec.mx del alumno
- Nombre completo y correo @tec.mx del profesor responsable (obligatorio; va en CC)
- Nombre de la actividad / materia
- Fecha, hora de inicio, hora de fin
- Casilla: [ ] Adjuntaré el formato "Diseño de actividades" completo antes de enviar

Etiqueta: `ALUM-ESPACIO`

### Alumnos — Material para CITES / Material fuera del campus
Mismo formulario para las dos páginas; cambia la etiqueta y el campo de lugar.
- Nombre completo y correo @tec.mx del alumno responsable del material
- ¿Hay un profesor responsable? Sí / No
  - Sí → nombre completo y correo @tec.mx del profesor (va en CC)
  - No → nombre(s) del/los alumno(s) responsable(s) de la actividad
- Tipo de actividad: Grupo estudiantil / Brigada / Otro (especificar) + nombre de la actividad
- Lugar: CITES → "CITES" fijo + espacio específico; Salida → dirección o comunidad
- Fecha de la actividad, hora de inicio, hora de fin
- Material solicitado: tabla dinámica (Material | Cantidad), botón para agregar/quitar filas. Aviso visible: "NO se prestan insumos."
- Fecha y hora en que recogen el material
- Fecha y hora en que devuelven el material
- Casillas obligatorias:
  - [ ] Entiendo que NO se prestan insumos
  - [ ] Al recoger llenaré el formato de salida y dejaré la credencial Tec del responsable (en CITES, según `CONFIG.citesRequiereSalidaYCredencial`)

Etiquetas: `ALUM-CITES` o `ALUM-SALIDA`

### Alumnos — Extracurricular — `alumnos/extracurricular.html`
Sin formulario. Texto: los espacios del CSC son para actividades de clase; para aula, auditorio o laboratorio de una actividad extracurricular, escribir a Carmen Paz (botón mailto con `CONFIG.contactoEspacios`). Si además necesitan material del CSC, liga a CITES o a salida de material.

## Validaciones (bloquean el envío)
- Nombre completo: al menos 2 palabras; solo letras, acentos, espacios, puntos y guiones.
- Correos: formato válido y terminan en `CONFIG.dominioInstitucional` (sin importar mayúsculas).
- En formularios de alumnos: el correo del profesor no puede ser igual al del alumno.
- Fecha de actividad (o inicio de bloque) ≥ hoy + `diasAnticipacion`. Mensaje: "Las solicitudes se hacen con al menos 7 días de anticipación. Tu actividad es en X días."
- Hora de fin > hora de inicio. Bloque: fecha de fin > fecha de inicio y al menos un día marcado.
- Material: al menos una fila; material no vacío; cantidad entero ≥ 1.
- Recogida: no después del inicio de la actividad y no antes de hoy. Si `maxDiasAntesRecogida` no es null, tampoco más de esos días antes.
- Devolución: no antes del fin de la actividad y no más de `horasMaxDevolucion` horas después del fin. Mensaje: "El material se devuelve a más tardar 24 horas después de que termina tu actividad."
- Todas las casillas obligatorias marcadas.

Mostrar errores junto a cada campo en lenguaje simple, un resumen arriba y llevar el foco al primer error. Nunca deshabilitar el botón sin explicar por qué.

## Formato del correo
Texto plano (sin HTML). Saltos de línea `\r\n`. Mismo orden siempre.

**Asunto**: `[CSC][ETIQUETA] dd/mm/aaaa · Nombre de la actividad · FOLIO`
**Folio**: `CSC-AAAAMMDD-XXXX` (fecha de la actividad + 4 caracteres aleatorios A–Z/2–9, sin O, 0, I, 1).
**Para**: `CONFIG.correoPruebas` si tiene valor; si no, `CONFIG.correoCSC`.
**CC**: correo del profesor, cuando aplique.

Ejemplo de cuerpo (ALUM-SALIDA):
```
SOLICITUD CSC · ALUMNO · MATERIAL FUERA DEL CAMPUS
Folio: CSC-20261015-K7Q2
Generada: 30/09/2026 14:32

— RESPONSABLES —
Alumno responsable del material: Ana López García (A01234567@tec.mx)
Profesor responsable: Juan Pérez Ruiz (juan.perez@tec.mx)

— ACTIVIDAD —
Tipo: Brigada
Nombre: Brigada de salud comunitaria
Lugar: Col. Independencia, Monterrey
Fecha: jueves 15/10/2026
Horario: 09:00 – 14:00

— MATERIAL (no se prestan insumos) —
1. Simulador RCP adulto — 2
2. Baumanómetro — 4

— RECOGIDA Y DEVOLUCIÓN —
Recoge: jueves 15/10/2026 08:00
Devuelve: jueves 15/10/2026 15:30

— CONFIRMACIONES —
[x] Entiendo que NO se prestan insumos
[x] Llenaré el formato de salida y dejaré la credencial Tec del responsable
```
Los demás tipos siguen la misma estructura con sus secciones. Mantener el cuerpo por debajo de ~1,800 caracteres cuando sea posible (límite práctico de mailto).

## Pantalla final (después de validar)
1. Vista previa del correo tal como llegará.
2. Aviso grande: "Tu solicitud NO está enviada hasta que presiones Enviar en tu correo." Si aplica: "Adjunta el formato de Diseño de actividades antes de enviar."
3. Tres botones:
   - **Abrir en Outlook (cuenta Tec)** → `https://outlook.office.com/mail/deeplink/compose?to=…&cc=…&subject=…&body=…` en pestaña nueva.
   - **Abrir en mi app de correo** → `mailto:…?cc=…&subject=…&body=…`
   - **Copiar correo** → copia Para, CC, Asunto y Cuerpo al portapapeles, con instrucciones.
   Usar `encodeURIComponent`. Verificar en prueba real que `cc` y los saltos de línea funcionan en ambos; si `cc` no funciona en el deeplink, mostrar la instrucción de agregarlo a mano.

## Pruebas
- Las funciones de `js/logica.js` son puras y se prueban con `node --test tests/` (sin dependencias). La fecha "de hoy" se inyecta como parámetro para que las pruebas no dependan del día.
- Casos mínimos que deben fallar: correo @gmail.com, nombre de una palabra, actividad en 3 días, hora de fin antes de inicio, correo del profesor igual al del alumno, tabla de material vacía, cantidad 0 o texto, recogida después del inicio, devolución 3 días después, casilla sin marcar.
- Para probar en navegador: `python3 -m http.server` en la raíz (los módulos ES no funcionan abriendo el archivo con doble clic).

## QR
`scripts/generar_qr.py` (librería `qrcode`) genera PNG y SVG para: raíz, `/profesores/`, `/alumnos/`. La URL base se pasa como argumento. Son QR estáticos: codifican la URL directamente y no caducan.

## Publicación
GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `(root)`. URL: `https://USUARIO.github.io/REPO/`.

## Cómo trabajar conmigo
- Antes de escribir código, muéstrame el plan y espera mi aprobación.
- Commits pequeños, mensajes en español.
- Al terminar cada formulario, muéstrame un ejemplo del correo generado.
- Si algo no está definido aquí, pregunta; no lo inventes.

## Datos confirmados
- Devolución: máximo 24 horas después de que termina la actividad.
- EMIS = Escuela de Medicina y Ciencias de la Salud del Tec.

## Pendientes por confirmar con la Dra. (no inventar)
- Cuántos días antes se puede recoger el material (`maxDiasAntesRecogida`) y horario del CSC para recoger/devolver.
- ¿CITES también requiere formato de salida y credencial? (`citesRequiereSalidaYCredencial`)
- Archivo actual del formato "Diseño de actividades" para subirlo a `/formatos/`.
