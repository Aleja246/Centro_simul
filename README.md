# Solicitudes del Centro de Simulación Clínica (CSC)

Sitio web sencillo para que profesores y alumnos soliciten espacios y material del CSC.
**Toda solicitud termina como un correo con el mismo formato**, dirigido a la bandeja del CSC.
El sitio no envía nada por sí mismo: arma el correo y lo abre en el correo de quien solicita,
que solo adjunta (si aplica) y presiona **Enviar** desde su cuenta @tec.mx.

No hay servidor, base de datos ni servicios externos. **El sitio no guarda ningún dato.**

## Lo más común (sin programar)

| Modificaciones | En |
|---|---|
| Cambiar el correo del CSC | En `js/config.js`, cambiar `correoCSC`. |
| Cambiar cuántas horas se tardan en revisar, o el límite de devolución | En `js/config.js`: `horasRevision`, `horasMaxDevolucion`. Los textos del sitio se actualizan solos. |
| Cambiar el formato "Diseño de actividades" | Reemplazar el archivo de la carpeta `formatos/`. Si cambia el nombre o la extensión (por ejemplo a `.docx`), actualizar `urlFormatoDiseno` en `js/config.js`. |
| Cambiar a quién escribir por actividades extracurriculares | En `js/config.js`, cambiar `contactoEspacios`. |
| Probar sin molestar a la Dra. | Poner tu correo en `correoPruebas` (en `js/config.js`): **todos** los correos se arman para esa dirección. **Déjalo vacío (`""`) antes de publicar.** |

Todos los datos que cambian están en **un solo lugar: `js/config.js`**.
Excepción: si cambia `diasAnticipacion`, el mensaje de error se actualiza solo, pero el texto
"al menos una semana" de `profesores/index.html` y `alumnos/index.html` hay que cambiarlo a mano.

## Cómo se ve para quien lo usa

1. **`index.html`**: "Soy profesor" o "Soy alumno". Nadie ve las reglas del otro.
2. **Profesores** (`profesores/`): reglas cortas y un formulario por evento o por bloque.
3. **Alumnos** (`alumnos/`): menú con 4 opciones: espacio del CSC para actividad de clase,
   material para CITES, material fuera del campus y actividad extracurricular (solo información).
4. Al llenar el formulario, el sitio revisa los datos y marca los errores junto a cada campo.
5. Pantalla final: vista previa del correo, aviso grande de que **la solicitud NO está enviada
   hasta que se presione Enviar**, y tres botones: abrir en Outlook (cuenta Tec), abrir en la app
   de correo, o copiar el correo.

### Formato del correo
Texto plano, siempre en el mismo orden.
Asunto: `[CSC][ETIQUETA] dd/mm/aaaa · Nombre de la actividad · FOLIO`
Etiquetas: `PROF-EVENTO`, `PROF-BLOQUE`, `ALUM-ESPACIO`, `ALUM-CITES`, `ALUM-SALIDA`.
Folio: `CSC-AAAAMMDD-XXXX` (fecha de la actividad + 4 caracteres al azar, sin O, 0, I, 1).
Si hay profesor responsable, su correo va en copia (CC).

## Reglas que se validan hoy

El formulario **no deja continuar** si algo de esto falla:

- **Nombres:** al menos 2 palabras; solo letras, acentos, espacios, puntos y guiones.
- **Correos:** formato válido (sin comas, punto y coma, `<>`, ni puntos dobles) y terminan en `@tec.mx`.
- **Alumnos:** el correo del profesor no puede ser el del alumno.
- **Actividad / materia:** obligatoria, máximo 200 caracteres.
- **Fecha de la actividad** (o inicio del bloque): hoy + 7 días naturales como mínimo.
- **Horas:** la de fin es después de la de inicio. **Bloque:** fecha de fin después de la de inicio y al menos un día de lunes a sábado.
- **Material:** al menos una fila, con nombre y cantidad entera de 1 o más.
- **Recogida:** no después del inicio de la actividad y **no antes de hoy**.
  Si `maxDiasAntesRecogida` deja de ser `null`, tampoco más días antes de los indicados.
- **Devolución:** no antes de que termine la actividad y a más tardar `horasMaxDevolucion` (24) horas después.
- **Alumnos sin profesor:** nombre(s) de los alumnos responsables, obligatorio, máximo 300 caracteres.
- **Tipo "Otro":** hay que especificar cuál.
- **Casillas obligatorias:** todas marcadas.

> **No agregar, quitar ni reformular campos o reglas sin consultar a la Dra.**
> Las preguntas actuales se refinaron con ella por prueba y error.

## Reglas futuras: pendientes de definir con la Dra.

Estas reglas **no están activas**. Se detectaron al probar el sitio llenándolo mal a propósito.
En el próximo review se agrega a `js/logica.js` y a las pruebas.

1. **Profesor con el mismo nombre que el alumno (pero otro correo).**
   Hoy solo se compara el correo, así que un alumno puede ponerse a sí mismo como profesor usando un segundo correo.
   Propuesta: comparar también los nombres, sin importar mayúsculas ni acentos.
  

2. **Fechas muy lejanas.**
   Una fecha de 2062 en vez de 2026 (error de dedo) hoy pasa.
   Propuesta: poner un tope máximo (¿cuántos meses o años hacia adelante?).

3. **Cantidad máxima por material.**
   Hoy se aceptan cantidades como 5000.
   Propuesta: poner un tope por material (¿cuánto?).
   

4. **Bloque sin sesiones.**
   Un bloque de dos días con solo el sábado marcado nunca tendría una sesión y hoy pasa.
   Propuesta: exigir que al menos uno de los días marcados caiga entre la fecha de inicio y la de fin.


5. **Texto sin sentido escrito en serio** (por ejemplo `asdf asdf` como nombre).
   Ninguna validación puede saber si un texto es verdad. Hoy lo revisa una persona del CSC al recibir el correo.
  

## Pendientes por confirmar con la Dra.

- **`maxDiasAntesRecogida`:** cuántos días antes de la actividad se puede recoger el material. Hoy: `null` (sin límite).
- **Horario del CSC** para recoger y devolver material. Hoy no se valida ni se muestra.
- **`citesRequiereSalidaYCredencial`:** ¿CITES también requiere formato de salida y credencial? Hoy: `true`
  (si cambia a `false`, desaparecen ese aviso y esa casilla en CITES).
- **Formato "Diseño de actividades":** el archivo subido es un **PDF** de una página
  (`formatos/diseno-de-actividades.pdf`). Si la Dra. tiene la versión editable (Word), reemplazarla y actualizar `urlFormatoDiseno`.

## Antes de usarlo con el público

Esto no se puede comprobar desde el código; hay que probarlo con una cuenta real @tec.mx:

- [ ] **Abrir en Outlook (cuenta Tec):** llegan bien Para, Asunto y Cuerpo, con los saltos de línea.
- [ ] **El CC al profesor aparece en Outlook.** Si no aparece, la pantalla ya le pide a la persona que lo agregue a mano
  (nota que sale siempre que hay profesor); decidir si eso es aceptable.
- [ ] **Abrir en mi app de correo** (Mail de iPhone, Gmail, Outlook en Android): llega con CC y saltos de línea.
- [ ] **Copiar correo** funciona en iPhone y en Android.
- [ ] Se ven bien los selectores de fecha y hora en iPhone (Safari) y Android (Chrome).
- [ ] **Escanear los QR** con un celular y llegar a la página correcta.
- [ ] `correoPruebas` está vacío (`""`).

Navegadores: se necesita un navegador de los últimos años (por ejemplo iOS 15.4 o más reciente, Chrome 93 o más reciente).

## Probar en tu computadora

Los módulos de JavaScript no funcionan abriendo el archivo con doble clic. Desde la carpeta del proyecto:

```
python3 -m http.server
```

y abrir <http://localhost:8000> (en el celular de la misma red: la IP de tu computadora y el puerto 8000).

## Pruebas automáticas

Sin instalar nada (solo Node.js; probado con Node 22):

```
node --test
```

(Ojo: sin escribir `tests/`; con Node 22 `node --test tests/` falla.)

- `tests/logica.test.js`: validaciones, folio, correo y enlaces.
- `tests/llenado-malo.test.js`: cientos de formas de llenar mal cada formulario; **todas deben ser rechazadas**.
- `tests/datos-ejemplo.js`: datos válidos que usan las pruebas.

Si se cambia una regla en `js/logica.js`, se cambian o agregan pruebas en el mismo cambio.

## Publicar en GitHub Pages

1. Los cambios deben estar en la rama **`main`**.
2. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/(root)`.
3. Esperar uno o dos minutos. La dirección será `https://USUARIO.github.io/REPO/`
   (para este repositorio, probablemente `https://aleja246.github.io/Centro_simul/`; confirmarla en esa misma pantalla).

Todas las rutas del sitio son relativas, por eso funciona dentro de esa subcarpeta. El archivo `.nojekyll` evita que GitHub procese los archivos.

## Generar los QR

Los QR son **estáticos**: llevan la dirección escrita dentro y no caducan, pero **si la dirección del sitio cambia, hay que generarlos e imprimirlos de nuevo**.

```
pip install "qrcode[pil]"
python3 scripts/generar_qr.py https://USUARIO.github.io/REPO/
```
Crea en `qr/` un PNG (para pantallas e impresiones sencillas) y un SVG (para impresión grande) de:
`inicio` (raíz), `profesores` y `alumnos`.

> Los QR que ya están en `qr/` se generaron con `https://aleja246.github.io/Centro_simul/`.
> 
## Estructura

```
index.html                       ¿Profesor o alumno?
profesores/index.html            Reglas + formulario (por evento / por bloque)
alumnos/index.html               Menú de 4 opciones
alumnos/espacio-csc.html         Espacio del CSC para actividad de clase
alumnos/cites.html               Material para CITES
alumnos/salida-material.html     Material fuera del campus
alumnos/extracurricular.html     Solo información (sin formulario)
formatos/                        Formato "Diseño de actividades"
js/config.js                     Datos que cambian (un solo lugar)
js/logica.js                     Funciones puras: validar, armar correo, folio, enlaces
js/ui.js                         Todo lo que toca la pantalla
css/styles.css                   Estilos (pensados para celular)
tests/                           Pruebas automáticas
scripts/generar_qr.py            Genera los QR
qr/                              QR generados
```

Notas para quien programe:

- HTML, CSS y JavaScript puro (módulos ES). Sin frameworks, sin build, sin CDNs, sin servicios de terceros.
- Los formularios de **CITES y de salida de material son el mismo**: viven una sola vez en `js/ui.js` (`plantillaMaterial`).
  Los de profesores y de espacio del CSC están en su HTML.
- Los campos se llaman igual en el HTML y en `js/logica.js` (`nombre`, `correo`, `profCorreo`, `fecha`…); así los errores caen junto al campo correcto.
- La fecha "de hoy" se pasa como parámetro a las funciones de `logica.js`; por eso las pruebas no dependen del día en que se corran.
# Centro_simul
Base: package.json, .nojekyll, js/config.js (igual al de CLAUDE.md), css/styles.css para celular, y index.html con los botones Profesor / Alumno.
js/logica.js + tests/: primero las pruebas con los 10 casos que deben fallar, luego las funciones puras:
validar nombre, correo y fechas (con "hoy" como parámetro), horas, material, recogida y devolución;
generar el folio;
armar asunto y cuerpo con \r\n;
armar el mailto, el enlace de Outlook y el texto para copiar.
js/ui.js: errores junto a cada campo, resumen arriba, foco al primer error, y la pantalla final (vista previa, aviso y los 3 botones).
profesores/index.html (por evento / por bloque). Te muestro un correo de ejemplo de cada uno y espero tu visto bueno.
alumnos/index.html (reglas y menú de 4 opciones) y alumnos/extracurricular.html.
alumnos/espacio-csc.html, con su correo de ejemplo.
alumnos/cites.html y alumnos/salida-material.html: un solo formulario que cambia de etiqueta y del campo de lugar. Correos de ejemplo de los dos.
scripts/generar_qr.py y la carpeta qr/ (raíz, /profesores/, /alumnos/).
README.md para quien mantenga el sitio: cómo cambiar config.js, probar, publicar y generar los QR.
Prueba en navegador con pantalla de celular (375 px). Yo no puedo probar desde aquí el envío real en Outlook y en la app de correo; eso tendrías que hacerlo tú.
Dudas (no voy a inventar las respuestas)


Campos y reglas

"Nombre de la actividad / materia": ¿es un solo campo?
Días del bloque "L–S": ¿son 6 casillas, de lunes a sábado?
Los 7 días de anticipación: ¿son días naturales? En bloque, ¿cuentan desde la fecha de inicio?
En el asunto y el folio de un bloque, ¿uso la fecha de inicio?
El mensaje "Tu actividad es en X días" usa "tú". Para profesores, ¿lo paso a "Su actividad es en X días"?
Cuando no hay profesor, el campo "nombre(s) del/los alumno(s) responsable(s)" puede tener varios nombres. ¿Solo valido que no esté vacío, o aplico la regla de nombre completo?
Tipo "Otro (especificar)": ¿es obligatorio escribir qué es?
¿La fecha de recogida también debe ser a partir de hoy o de hoy + 7 días? Hoy solo está definido que no sea después del inicio.
Si el correo pasa de ~1,800 caracteres (mucho material), ¿qué hago? Mi propuesta: avisar y recomendar el botón "Copiar correo".
Extracurricular: el botón para escribirle a Carmen Paz, ¿lleva un asunto ya escrito o va vacío?
