# Firebase (copia local)

Copia sin modificar de los módulos para navegador del SDK de Firebase JS **12.19.0**
(paquete `firebase` de npm), para que el sitio no dependa de un CDN.

Archivos: `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`.

Único cambio: en `firebase-auth.js` y `firebase-firestore.js` el import
`https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js` se cambió a `./firebase-app.js`,
y se quitó la línea `sourceMappingURL`.

Licencia: Apache-2.0, © Google LLC. https://github.com/firebase/firebase-js-sdk

## Actualizar

```
npm pack firebase@VERSION
tar -xzf firebase-VERSION.tgz
# copiar package/firebase-app.js, firebase-auth.js y firebase-firestore.js aquí
# y repetir el cambio del import de firebase-app.js
```
