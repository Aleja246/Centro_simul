// Dónde se guardan los datos de la bitácora.
// - Con Firebase configurado (js/config.js → bitacora.firebase): Firestore, compartido por todo el personal,
//   con inicio de sesión (correo y contraseña creados en la consola de Firebase).
// - Sin Firebase: modo demostración, los datos viven solo en este navegador (localStorage).
// Las dos versiones tienen las mismas funciones, así simuladores-ui.js no necesita saber cuál usa.

import { CONFIG } from "./config.js";

const HISTORIAL_INICIAL = 300;

export function firebaseConfigurado(cfg = CONFIG.bitacora && CONFIG.bitacora.firebase) {
  return Boolean(cfg && cfg.apiKey && cfg.projectId);
}

// Error con un código propio que la pantalla traduce a un mensaje.
export class ErrorBitacora extends Error {
  constructor(codigo, mensaje) {
    super(mensaje || codigo);
    this.codigo = codigo;
  }
}

export function mensajeDeError(e) {
  const c = (e && (e.codigo || e.code)) || "";
  if (c === "estado-cambio") return "Alguien más acaba de registrar este simulador. Revisa su estado y vuelve a intentarlo.";
  if (c === "no-existe") return "Ese simulador ya no existe.";
  if (c === "permission-denied") return "Tu cuenta no tiene permiso para esto. Pide que agreguen tu correo a la lista del personal.";
  if (c === "unavailable" || c === "auth/network-request-failed") return "No hay conexión. Revisa el internet e inténtalo otra vez.";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-email") return "Correo o contraseña incorrectos.";
  if (c === "auth/too-many-requests") return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (c === "auth/missing-password") return "Escribe tu contraseña.";
  if (c === "resource-exhausted") return "Se llegó al límite gratuito de Firebase por hoy. Mañana se restablece.";
  return "No se pudo guardar. Inténtalo otra vez.";
}

// alCambiar({ zonas, sims, movs, listo, error }) se llama cada vez que cambia algo.
// alSesion(usuario | null) se llama al entrar o salir.
export async function crearAlmacen({ alCambiar, alSesion }) {
  return firebaseConfigurado() ? crearFirebase(alCambiar, alSesion) : crearDemo(alCambiar, alSesion);
}

// ---------------------------------------------------------------- Firebase

async function crearFirebase(alCambiar, alSesion) {
  const { initializeApp } = await import("./vendor/firebase/firebase-app.js");
  const au = await import("./vendor/firebase/firebase-auth.js");
  const fs = await import("./vendor/firebase/firebase-firestore.js");

  const app = initializeApp(CONFIG.bitacora.firebase);
  const auth = au.getAuth(app);
  const db = fs.getFirestore(app);

  const estado = { zonas: [], sims: [], movs: [], listo: { zonas: false, sims: false, movs: false }, error: null };
  let limite = HISTORIAL_INICIAL;
  let quitar = [];
  let usuario = null;

  const avisar = () => alCambiar({ ...estado, listo: estado.listo.zonas && estado.listo.sims, historialListo: estado.listo.movs });
  const alError = (e) => { console.error(e); estado.error = e; avisar(); };
  const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  function escucharHistorial() {
    const q = fs.query(fs.collection(db, "movimientos"), fs.orderBy("t", "desc"), fs.limit(limite));
    return fs.onSnapshot(q, (s) => { estado.movs = docs(s); estado.listo.movs = true; estado.hayMas = s.size >= limite; avisar(); }, alError);
  }

  function escuchar() {
    dejarDeEscuchar();
    quitar = [
      fs.onSnapshot(fs.collection(db, "zonas"), (s) => { estado.zonas = docs(s); estado.listo.zonas = true; estado.error = null; avisar(); }, alError),
      fs.onSnapshot(fs.collection(db, "simuladores"), (s) => { estado.sims = docs(s); estado.listo.sims = true; estado.error = null; avisar(); }, alError),
      escucharHistorial(),
    ];
  }
  function dejarDeEscuchar() {
    quitar.forEach((f) => f());
    quitar = [];
  }

  au.onAuthStateChanged(auth, (u) => {
    usuario = u ? { uid: u.uid, correo: u.email || "" } : null;
    if (usuario) escuchar();
    else {
      dejarDeEscuchar();
      Object.assign(estado, { zonas: [], sims: [], movs: [], listo: { zonas: false, sims: false, movs: false }, error: null });
    }
    alSesion(usuario);
  });

  const ref = (col, id) => fs.doc(db, col, id);

  return {
    modo: "firebase",
    get usuario() { return usuario; },
    entrar: (correo, contrasena) => au.signInWithEmailAndPassword(auth, correo.trim(), contrasena),
    salir: () => au.signOut(auth),
    recuperar: (correo) => au.sendPasswordResetEmail(auth, correo.trim()),

    masHistorial() {
      limite += HISTORIAL_INICIAL;
      if (quitar[2]) quitar[2]();
      quitar[2] = escucharHistorial();
    },

    // Cambia el simulador y agrega el movimiento juntos. Si `requiereEstado` no coincide con lo guardado, no hace nada.
    async registrar(simId, cambios, movimiento, requiereEstado) {
      await fs.runTransaction(db, async (tx) => {
        const r = ref("simuladores", simId);
        const snap = await tx.get(r);
        if (!snap.exists()) throw new ErrorBitacora("no-existe");
        if (requiereEstado && snap.data().estado !== requiereEstado) throw new ErrorBitacora("estado-cambio");
        tx.update(r, cambios);
        tx.set(fs.doc(fs.collection(db, "movimientos")), movimiento);
      });
    },

    async crearSimulador(datos) {
      const r = fs.doc(fs.collection(db, "simuladores"));
      await fs.setDoc(r, datos);
      return r.id;
    },
    actualizarSimulador: (id, cambios) => fs.updateDoc(ref("simuladores", id), cambios),
    borrarSimulador: (id) => fs.deleteDoc(ref("simuladores", id)),

    async crearZona(datos) {
      const r = fs.doc(fs.collection(db, "zonas"));
      await fs.setDoc(r, datos);
      return r.id;
    },
    actualizarZona: (id, cambios) => fs.updateDoc(ref("zonas", id), cambios),
    async ordenarZonas(cambios) {
      const b = fs.writeBatch(db);
      cambios.forEach((c) => b.update(ref("zonas", c.id), { orden: c.orden }));
      await b.commit();
    },
    // Borra la zona y deja "sin ubicar" a los simuladores que estaban o vivían ahí.
    async borrarZona(id, sims) {
      const b = fs.writeBatch(db);
      sims.filter((s) => s.zonaId === id || s.zonaBase === id).forEach((s) => {
        b.update(ref("simuladores", s.id), { zonaId: s.zonaId === id ? null : s.zonaId ?? null, zonaBase: s.zonaBase === id ? null : s.zonaBase ?? null });
      });
      b.delete(ref("zonas", id));
      await b.commit();
    },

    async cargarEjemplo() {
      const b = fs.writeBatch(db);
      const { zonas, sims } = ejemplo(Date.now(), () => fs.doc(fs.collection(db, "zonas")).id);
      zonas.forEach((z) => b.set(ref("zonas", z.id), sinId(z)));
      sims.forEach((s) => b.set(fs.doc(fs.collection(db, "simuladores")), s));
      await b.commit();
    },
    async borrarEjemplo(zonas, sims) {
      const b = fs.writeBatch(db);
      const ejZ = new Set(zonas.filter((z) => z.ejemplo).map((z) => z.id));
      sims.forEach((s) => {
        if (s.ejemplo) b.delete(ref("simuladores", s.id));
        else if (ejZ.has(s.zonaId) || ejZ.has(s.zonaBase)) b.update(ref("simuladores", s.id), { zonaId: ejZ.has(s.zonaId) ? null : s.zonaId ?? null, zonaBase: ejZ.has(s.zonaBase) ? null : s.zonaBase ?? null });
      });
      ejZ.forEach((id) => b.delete(ref("zonas", id)));
      await b.commit();
    },
  };
}

// ---------------------------------------------------------------- Demostración (solo este navegador)

const CLAVE_DEMO = "csc.bitacora.demo";

function crearDemo(alCambiar, alSesion) {
  let datos = leer();
  const usuario = { uid: "demo", correo: "demo" };

  function leer() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE_DEMO) || "null");
      if (d && Array.isArray(d.zonas) && Array.isArray(d.sims) && Array.isArray(d.movs)) return d;
    } catch { /* sin almacenamiento: se trabaja en memoria */ }
    return { zonas: [], sims: [], movs: [] };
  }
  function guardar() {
    try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(datos)); } catch { /* en memoria */ }
    avisar();
  }
  function avisar() {
    const movs = datos.movs.slice().sort((a, b) => b.t - a.t);
    alCambiar({ zonas: datos.zonas.slice(), sims: datos.sims.slice(), movs, listo: true, historialListo: true, hayMas: false, error: null });
  }
  const nuevoId = () => Math.random().toString(36).slice(2, 12);
  const sim = (id) => datos.sims.find((s) => s.id === id);

  window.addEventListener("storage", (e) => { if (e.key === CLAVE_DEMO) { datos = leer(); avisar(); } });
  setTimeout(() => { alSesion(usuario); avisar(); }, 0);

  return {
    modo: "demo",
    usuario,
    entrar: async () => {},
    salir: async () => {},
    recuperar: async () => {},
    masHistorial() {},

    async registrar(simId, cambios, movimiento, requiereEstado) {
      const s = sim(simId);
      if (!s) throw new ErrorBitacora("no-existe");
      if (requiereEstado && s.estado !== requiereEstado) throw new ErrorBitacora("estado-cambio");
      Object.assign(s, cambios);
      datos.movs.push({ id: nuevoId(), ...movimiento });
      guardar();
    },
    async crearSimulador(d) { const id = nuevoId(); datos.sims.push({ id, ...d }); guardar(); return id; },
    async actualizarSimulador(id, cambios) { const s = sim(id); if (!s) throw new ErrorBitacora("no-existe"); Object.assign(s, cambios); guardar(); },
    async borrarSimulador(id) { datos.sims = datos.sims.filter((s) => s.id !== id); guardar(); },
    async crearZona(d) { const id = nuevoId(); datos.zonas.push({ id, ...d }); guardar(); return id; },
    async actualizarZona(id, cambios) { const z = datos.zonas.find((x) => x.id === id); if (z) Object.assign(z, cambios); guardar(); },
    async ordenarZonas(cambios) { cambios.forEach((c) => { const z = datos.zonas.find((x) => x.id === c.id); if (z) z.orden = c.orden; }); guardar(); },
    async borrarZona(id) {
      datos.sims.forEach((s) => { if (s.zonaId === id) s.zonaId = null; if (s.zonaBase === id) s.zonaBase = null; });
      datos.zonas = datos.zonas.filter((z) => z.id !== id);
      guardar();
    },
    async cargarEjemplo() {
      const { zonas, sims } = ejemplo(Date.now(), nuevoId);
      datos.zonas.push(...zonas);
      datos.sims.push(...sims.map((s) => ({ id: nuevoId(), ...s })));
      guardar();
    },
    async borrarEjemplo() {
      const ejZ = new Set(datos.zonas.filter((z) => z.ejemplo).map((z) => z.id));
      datos.sims = datos.sims.filter((s) => !s.ejemplo);
      datos.sims.forEach((s) => { if (ejZ.has(s.zonaId)) s.zonaId = null; if (ejZ.has(s.zonaBase)) s.zonaBase = null; });
      datos.zonas = datos.zonas.filter((z) => !z.ejemplo);
      guardar();
    },
  };
}

// ---------------------------------------------------------------- Centro de ejemplo

const sinId = ({ id, ...resto }) => resto;

function ejemplo(ahora, nuevoId) {
  const zonas = [
    ["Sala de alta fidelidad 1", 0, "l"],
    ["Sala de alta fidelidad 2", 1, "m"],
    ["Quirófano simulado", 5, "m"],
    ["Sala de habilidades", 2, "l"],
    ["Sala de debriefing", 7, "s"],
    ["Almacén", 8, "m"],
  ].map(([nombre, color, tamano], i) => ({ id: nuevoId(), nombre, color, tamano, orden: i + 1, tarjeta: null, ejemplo: true }));
  const sims = [
    ["Maniquí adulto de alta fidelidad", "Maniquí de alta fidelidad", 0],
    ["Maniquí pediátrico", "Pediatría", 1],
    ["Simulador de parto", "Obstetricia", 1],
    ["Entrenador de vía aérea", "Vía aérea", 2],
    ["Torso de RCP adulto", "Reanimación", 3],
    ["Torso de RCP lactante", "Reanimación", 3],
    ["Brazo de venopunción", "Habilidades", 3],
    ["Simulador de auscultación", "Exploración física", 5],
    ["Pad de sutura", "Habilidades", 5],
  ].map(([nombre, categoria, z], i) => ({
    codigo: "SIM-" + String(i + 1).padStart(3, "0"), nombre, categoria,
    zonaBase: zonas[z].id, zonaId: zonas[z].id, tarjeta: null, enlaceGrabado: false,
    estado: "disponible", responsable: null, destino: null, desde: null, revision: null,
    ejemplo: true, creado: ahora, actualizado: ahora,
  }));
  return { zonas, sims };
}
