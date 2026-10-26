// Lectura de tarjetas NFC.
// 1. Web NFC: Chrome en Android lee y graba tarjetas directo (no funciona en iPhone ni en computadora).
// 2. Lector USB "tipo teclado": escribe el número de la tarjeta muy rápido y termina con Enter.
// Las dos formas entregan { serie, textos } a la misma función.

export const hayWebNfc = () => typeof window !== "undefined" && "NDEFReader" in window;

// ¿Ya dio permiso antes? Así se puede encender sin que toquen un botón.
export async function permisoNfc() {
  if (!hayWebNfc() || !navigator.permissions) return "prompt";
  try { return (await navigator.permissions.query({ name: "nfc" })).state; } catch { return "prompt"; }
}

function textoDeRegistro(r) {
  try {
    if (r.recordType === "text") return new TextDecoder(r.encoding || "utf-8").decode(r.data);
    if (r.recordType === "url" || r.recordType === "absolute-url") return new TextDecoder().decode(r.data);
  } catch { /* registro que no es texto */ }
  return "";
}

// Empieza a escuchar tarjetas. Regresa una función para detenerse.
export async function leerConWebNfc(alLeer, alError) {
  const lector = new window.NDEFReader();
  const control = new AbortController();
  await lector.scan({ signal: control.signal });
  lector.onreading = (e) => {
    const textos = Array.from(e.message?.records || []).map(textoDeRegistro).filter(Boolean);
    alLeer({ serie: e.serialNumber || "", textos });
  };
  lector.onreadingerror = () => alError("No se pudo leer la tarjeta. Vuelve a acercarla.");
  return () => control.abort();
}

// Graba un enlace en la tarjeta que se acerque. Se rechaza si pasa `tiempoMs` sin tarjeta.
export async function grabarEnlace(url, tiempoMs = 20000) {
  const lector = new window.NDEFReader();
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), tiempoMs);
  try {
    await lector.write({ records: [{ recordType: "url", data: url }] }, { overwrite: true, signal: control.signal });
  } finally {
    clearTimeout(reloj);
  }
}

// Lector USB en modo teclado. Ignora lo que la persona escribe en campos de texto
// (salvo los que tienen data-lector) y solo acepta ráfagas rápidas que terminan en Enter.
export function escucharLectorUsb(alLeer) {
  let texto = "";
  let ultimo = 0;
  let pausas = [];
  const alTeclear = (e) => {
    const t = e.target;
    if (t && t.matches && t.matches("input, textarea, select, [contenteditable='true']")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const ahora = performance.now();
    const pausa = ahora - ultimo;
    if (pausa > 120) { texto = ""; pausas = []; }
    ultimo = ahora;
    if (e.key === "Enter") {
      const rapido = pausas.length > 0 && pausas.reduce((a, b) => a + b, 0) / pausas.length < 60;
      if (texto.length >= 4 && rapido) { e.preventDefault(); alLeer({ serie: texto, textos: [texto] }); }
      texto = ""; pausas = [];
      return;
    }
    if (e.key.length === 1) {
      if (texto) pausas.push(pausa);
      texto += e.key;
    }
  };
  document.addEventListener("keydown", alTeclear, true);
  return () => document.removeEventListener("keydown", alTeclear, true);
}
