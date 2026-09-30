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

Formato de Diseño de actividades

Es un PDF que no parece editable, pero las reglas piden "adjuntar el formato completo". ¿La Dra. tiene la versión Word o PowerPoint? Si no, ¿dejo el PDF y en urlFormatoDiseno pongo formatos/diseno-de-actividades.pdf?

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

Correo (lo tienes que confirmar tú con una cuenta @tec.mx)

No es seguro que el enlace de Outlook web acepte cc. Te propongo mostrar siempre, en solicitudes con profesor: "Verifica que el profesor esté en CC; si no, agrégalo a mano". ¿Te parece?

Publicación

¿La URL final es https://aleja246.github.io/centro_simul/? La necesito exacta, con mayúsculas y minúsculas, para los QR.
Voy a trabajar en esta rama. ¿Quieres que al final abra un PR a main para que se publique?
