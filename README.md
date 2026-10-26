# Solicitudes del Centro de Simulación Clínica (CSC)

Sitio web sencillo para que profesores y alumnos soliciten espacios y material del CSC.
**Toda solicitud termina como un correo con el mismo formato**, dirigido a la bandeja del CSC.
El sitio no envía nada por su cuenta: arma el correo y lo abre en el correo de quien solicita,
que solo adjunta (si aplica) y presiona **Enviar** desde su cuenta @tec.mx.

No hay servidor, base de datos ni servicios externos. El sitio no guarda ningún dato.
**Única excepción:** la [bitácora de simuladores](#bitácora-de-simuladores) (`simuladores/`), que usa Firebase y escribe en el Excel del inventario.

## Lo más común

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

1. **`index.html`**: "Soy profesor" o "Soy alumno".
2. **Profesores** (`profesores/`): reglas cortas y un formulario por evento o por bloque.
3. **Alumnos** (`alumnos/`): menú con 4 opciones: espacio del CSC para actividad de clase,
   material para CITES, material fuera del campus y actividad extracurricular.
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

## Reglas por validar

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

## Reglas futuras: pendientes de definir con la Dra.

Reglas **no activas**. Se detectaron al probar el sitio llenándolo mal a propósito.
En el próximo review se agrega a `js/logica.js` y a las pruebas.

1. **Fechas muy lejanas.**
   Una fecha de 2062 en vez de 2026 (error de dedo) hoy pasa.
   ¿Tope máximo (¿cuántos meses o años hacia adelante?).

2. **Cantidad máxima por material.**
   ¿Tope máximo por material (¿cuánto?)
   
3. **Bloque sin sesiones.**
   Un bloque de dos días con solo el sábado marcado nunca tendría una sesión.
   ¿Exigir que al menos uno de los días marcados caiga entre la fecha de inicio y la de fin.

4. **Texto sin sentido escrito en serio** (por ejemplo `asdf asdf` como nombre).
   Ninguna validación puede saber si un texto es verdad.
  

## Pendientes por confirmar

- **`maxDiasAntesRecogida`:** cuántos días antes de la actividad se puede recoger el material. Hoy: `null` (sin límite).
- **Horario del CSC** para recoger y devolver material.
- **`citesRequiereSalidaYCredencial`:** ¿CITES también requiere formato de salida y credencial? Hoy: `true`
  (si cambia a `false`, desaparecen ese aviso y esa casilla en CITES).
- **Formato "Diseño de actividades":** el archivo subido es un **PDF** de una página
  (`formatos/diseno-de-actividades.pdf`). Si se tiene la versión editable en Word, reemplazarla y actualizar `urlFormatoDiseno`.


## Comprobaciones pendientes

- [ ] **Abrir en Outlook (cuenta Tec):** llegan bien Para, Asunto y Cuerpo, con los saltos de línea.
- [ ] **El CC al profesor aparece en Outlook.** Si no aparece, la pantalla ya le pide a la persona que lo agregue a mano
  (nota que sale siempre que hay profesor).
- [ ] **Abrir en mi app de correo** (Mail de iPhone, Gmail, Outlook en Android): llega con CC y saltos de línea.
- [ ] **Copiar correo** funciona en iPhone y en Android.
- [ ] Se ven bien los selectores de fecha y hora en iPhone (Safari) y Android (Chrome).
- [ ] `correoPruebas` está vacío (`""`).

**Navegadores: se necesita un navegador de los últimos años (por ejemplo iOS 15.4 o más reciente, Chrome 93 o más reciente).


## Pruebas automáticas

Sin instalar nada (solo Node.js; probado con Node 22):

```
node --test
```

(Ojo: sin escribir `tests/`; con Node 22 `node --test tests/` falla.)

- `tests/logica.test.js`: validaciones, folio, correo y enlaces.
- `tests/llenado-malo.test.js`: cientos de formas de llenar mal cada formulario; **todas deben ser rechazadas**.
- `tests/datos-ejemplo.js`: datos válidos que usan las pruebas.
- `tests/simuladores.test.js` y `tests/simuladores-excel.test.js`: bitácora de simuladores (tarjetas, validaciones, historial, CSV y escritura en el Excel).

Si se cambia una regla en `js/logica.js`, se cambian o agregan pruebas en el mismo cambio.

## Publicar en GitHub Pages

1. Los cambios deben estar en la rama **`main`**.
2. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/(root)`.
3. Esperar uno o dos minutos. La dirección será `https://USUARIO.github.io/REPO/`
   `https://aleja246.github.io/Centro_simul/`-ACTUAL

Todas las rutas del sitio son relativas, por eso funciona dentro de esa subcarpeta. El archivo `.nojekyll` evita que GitHub procese los archivos.


## Bitácora de simuladores

Página para el **personal del CSC**: `https://aleja246.github.io/Centro_simul/simuladores/`
(no aparece en la portada; se guarda en favoritos).

Cada equipo lleva una tarjeta NFC. Al leerla se registra cuándo sale, quién lo lleva, cuándo regresa,
en qué cuarto se deja y su verificación. **Todo se escribe también en el Excel del inventario.**

- **Plano:** los cuartos del inventario con sus simuladores, y la lista "Fuera ahora" (en rojo si pasan
  `bitacora.horasAlerta` horas fuera).
- **Ficha del equipo** (al leer su tarjeta o tocarlo): registrar salida, registrar regreso (cuarto donde se deja
  y si necesita revisión), cambiarlo de cuarto y verificarlo.
- **Verificar:** en "Leer tarjeta" se elige **Verificar**; cada tarjeta que se lea abre el formulario de verificación.
- **Inventario:** los simuladores o todo el inventario, con buscador.
- **Historial:** todos los movimientos, si ya están en el Excel, y descarga en CSV.
- **Ajustes:** conexión con el Excel, cómo se ven los cuartos, tarjetas de cuarto y sesión.

### Dónde vive cada dato

| Dato | Dónde |
|---|---|
| Equipos, IDs (`EQ-…`), nombre, categoría, cuarto, caja | **Excel del inventario** (hoja *1Inventario*). Los equipos se dan de alta ahí, no en la página. |
| Quién tiene cada equipo, desde cuándo, tarjeta NFC, historial | **Firebase** (en vivo, para todo el personal). Sin Firebase: modo demostración en ese navegador. |
| Cada movimiento | Se agrega como fila en la hoja **Movimientos** del Excel (la página la crea si no existe). |
| Regreso o cambio de cuarto | Actualiza **Zona del cuarto donde estaba** en *1Inventario*. |
| Verificación | En *1Inventario*: Estado general, # piezas dañadas, Material que falta, Revisado por, Fecha de revisión y se agrega el comentario a Notas. En la hoja **Verificación**: Estado físico, Funciona, Ajustes, Resultado, Comentarios, y el encabezado Fecha / Realizó / Hora. |

Si no hay internet o nadie ha conectado su cuenta del Tec, el movimiento queda guardado en la bitácora como
**pendiente** y se pasa al Excel después (Ajustes → "Pasar al Excel ahora"). No se repiten filas al reintentar.

### Antes de conectar el Excel

1. **IDs en la hoja Verificación:** la columna **ID** (B) debe tener el ID de cada equipo, igual que en *1Inventario*.
   Si un equipo no tiene ID ahí, la verificación solo se escribe en *1Inventario*.
2. **Opciones de verificación:** en `js/config.js` → `bitacora.excel.verificacion.opciones` deben ir las mismas opciones
   que las listas del Excel (hoy: Estado físico Bueno/Regular/Malo, Funciona Sí/No, Resultado Pasa/No pasa). **Por confirmar.**
3. **Bitácora de movimientos:** si ya existe una hoja de bitácora en el Excel, poner su nombre en
   `bitacora.excel.bitacora.hoja` y sus encabezados en `bitacora.excel.bitacora.columnas`. Si no, la página crea
   la hoja **Movimientos** con: Fecha, Hora, ID equipo, Equipo, Movimiento, Responsable, Destino / actividad, Cuarto,
   Tiempo fuera (min), Notas, Registró, Folio.

Las columnas se buscan por su **encabezado** (sin importar acentos ni mayúsculas), no por letra: se pueden mover.

### Conectar el Excel (Microsoft 365 del Tec)

1. Entrar a <https://entra.microsoft.com> con la cuenta del Tec → **Aplicaciones → Registros de aplicaciones → Nuevo registro**.
   - Nombre: *Bitácora de simuladores CSC*.
   - Tipos de cuenta: **Solo cuentas de este directorio organizativo** (o "cualquier directorio organizativo").
   - URI de redirección: plataforma **Aplicación de página única (SPA)**:
     `https://aleja246.github.io/Centro_simul/simuladores/`
2. En la app: **Autenticación → Agregar URI** (SPA): `https://aleja246.github.io/Centro_simul/simuladores/vacio.html`
3. **Permisos de API → Microsoft Graph → Permisos delegados:** `User.Read` y `Files.ReadWrite.All`.
   Si el Tec no deja que cada persona lo autorice, **TI tiene que dar "consentimiento de administrador"**.
   Si no se permite registrar apps, pedirle a TI que la registre con estos mismos datos.
4. Copiar el **Id. de aplicación (cliente)** en `js/config.js` → `bitacora.microsoft.clientId`
   (y, si se quiere limitar al Tec, el **Id. de directorio (inquilino)** en `tenant`).
5. En cada Excel: **Compartir → Copiar vínculo** (con permiso de **edición** para el personal) y pegarlo en
   `bitacora.excel.inventario.enlace` y `bitacora.excel.verificacion.enlace`.
6. Subir el cambio a `main`. En la bitácora: **Ajustes → Conectar cuenta del Tec**.

Cada persona que registre movimientos necesita **permiso de edición** en los dos Excel.

### Firebase (para que todo el personal vea lo mismo)

Mientras `bitacora.firebase` en `js/config.js` esté vacío, la bitácora funciona en **modo demostración**:
se guarda solo en ese navegador. Sirve para probar.

1. Entrar a <https://console.firebase.google.com> → **Crear un proyecto** (Analytics no hace falta).
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar.**
3. **Authentication → Usuarios → Agregar usuario**: un correo y contraseña por cada persona del personal.
4. **Firestore Database → Crear base de datos** → modo de producción → ubicación cercana (por ejemplo `nam5`).
5. **Firestore Database → Reglas**: pegar el contenido de `firestore.rules`, poner los correos del
   personal en la lista y **Publicar**.
6. **Configuración del proyecto** (engrane) → **Tus apps → Web (`</>`)** → registrar la app y copiar
   `apiKey`, `authDomain`, `projectId` y `appId` en `js/config.js` → `bitacora.firebase`.
7. **Authentication → Configuración → Dominios autorizados** → agregar `aleja246.github.io`.
8. Subir el cambio a `main`. Al abrir la bitácora pedirá correo y contraseña.

La `apiKey` de Firebase **no es secreta** (va en todas las páginas que usan Firebase): lo que protege
los datos son las cuentas y las reglas de `firestore.rules`.

**Dar acceso a alguien nuevo:** crear su usuario (paso 3), agregar su correo a las reglas (paso 5) y
compartirle los Excel con permiso de edición.

### Tarjetas NFC

Sirven etiquetas NFC comunes **NTAG213 o NTAG215**. Cada tarjeta puede llevar el **enlace** del equipo
(`…/simuladores/#EQ-347`), su **número de serie** guardado en la bitácora, o las dos cosas.
La página también entiende el enlace de los QR (`…/equipo/?id=EQ-347`).

| Dónde | Leer | Grabar el enlace |
|---|---|---|
| **Android con Chrome** | Directo en la página (botón "Leer tarjeta"; la primera vez pide permiso de NFC). | Ficha del equipo → **Tarjeta NFC → Grabar ahora**. |
| **iPhone** | Acercar el iPhone a la tarjeta grabada: abre la ficha del equipo. | Con una app como NFC Tools (la ficha muestra el enlace para copiar). |
| **Computadora** | Lector USB que escriba como teclado (modo HID / *keyboard emulation*). | — |

Si se lee una tarjeta que no está registrada, la página pregunta de qué equipo (o cuarto) es.

### Datos que cambian (`js/config.js` → `bitacora`)

| Dato | Para qué |
|---|---|
| `horasAlerta` | Después de cuántas horas fuera un equipo se marca en rojo. |
| `urlSitio` | Dirección del sitio; va en el enlace que se graba en las tarjetas. Si cambia, hay que volver a grabarlas. |
| `enPlano` | Qué equipos se dibujan en el plano (por Tipo, o por cómo empieza la Categoría: hoy "Simulador…"). |
| `firebase` | Datos del proyecto de Firebase. Vacío = modo demostración. |
| `microsoft` | Id. de la app registrada en Microsoft Entra. Vacío = no se conecta al Excel. |
| `excel` | Enlace, hoja y encabezados de cada Excel (inventario, bitácora y verificación), opciones de verificación y formato de fecha. |

### Archivos de la bitácora

```
simuladores/index.html            La página
simuladores/vacio.html            Página en blanco para la ventana de inicio de sesión de Microsoft
css/simuladores.css               Estilos propios (usa los de styles.css)
js/simuladores-logica.js          Funciones puras: tarjetas, catálogo, validaciones, historial, CSV
js/simuladores-excel-logica.js    Funciones puras: encabezados, filas por ID, celdas que cambian en cada hoja
js/simuladores-excel.js           Microsoft Graph: leer el inventario y escribir en los Excel
js/simuladores-datos.js           Firebase o modo demostración (mismas funciones)
js/simuladores-nfc.js             Web NFC (Android) y lector USB
js/simuladores-ui.js              Todo lo que toca la pantalla
js/vendor/firebase/               Copia local de Firebase 12.19.0 (sin CDN; ver LEEME.md)
js/vendor/msal/                   Copia local de MSAL Browser 4.30.0 (inicio de sesión Microsoft)
firestore.rules                   Reglas de seguridad para pegar en Firebase
tests/simuladores.test.js         Pruebas de simuladores-logica.js
tests/simuladores-excel.test.js   Pruebas de simuladores-excel-logica.js (con hojas de la misma forma que las del CSC)
```

Para probarla en la computadora: `python3 -m http.server` en la raíz y abrir
`http://localhost:8000/simuladores/` (modo demostración; "Probar con un inventario de ejemplo").

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
