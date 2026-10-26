// Dónde se guarda la bitácora (lo que cambia minuto a minuto).
// - Con Firebase configurado (js/config.js → bitacora.firebase): Firestore, compartido por todo el personal,
//   con inicio de sesión (correo y contraseña creados en la consola de Firebase).
// - Sin Firebase: modo demostración, los datos viven solo en este navegador (localStorage).
// Las dos versiones tienen las mismas funciones, así simuladores-ui.js no necesita saber cuál usa.
//
// Colecciones:
//   catalogo/actual     copia del inventario leído del Excel (para quien no ha conectado su cuenta Microsoft)
//   simuladores/{ID}    estado de cada equipo (ID del Excel): quién lo tiene, cuarto, tarjeta NFC…
//   zonas/{cuarto}      cómo se ve cada cuarto en el plano (nombre, color, tamaño, orden, tarjeta)
//   movimientos/{id}    historial; excel.estado dice si ya se escribió en el Excel

import { CONFIG } from "./config.js";

const HISTORIAL_INICIAL = 300;

export function firebaseConfigurado(cfg = CONFIG.bitacora && CONFIG.bitacora.firebase) {
  return Boolean(cfg && cfg.apiKey && cfg.projectId);
}

export class ErrorBitacora extends Error {
  constructor(codigo, mensaje) {
    super(mensaje || codigo);
    this.codigo = codigo;
  }
}

export function mensajeDeError(e) {
  const c = (e && (e.codigo || e.code)) || "";
  if (c === "estado-cambio") return "Alguien más acaba de registrar este equipo. Revisa su estado y vuelve a intentarlo.";
  if (c === "no-existe") return "Ese equipo ya no existe.";
  if (c === "permission-denied") return "Tu cuenta no tiene permiso para esto. Pide que agreguen tu correo a la lista del personal.";
  if (c === "unavailable" || c === "auth/network-request-failed") return "No hay conexión. Revisa el internet e inténtalo otra vez.";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-email") return "Correo o contraseña incorrectos.";
  if (c === "auth/too-many-requests") return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (c === "auth/missing-password") return "Escribe tu contraseña.";
  if (c === "resource-exhausted") return "Se llegó al límite gratuito de Firebase por hoy. Mañana se restablece.";
  return "No se pudo guardar. Inténtalo otra vez.";
}

// alCambiar(datos) se llama cada vez que cambia algo; alSesion(usuario | null) al entrar o salir.
export async function crearAlmacen({ alCambiar, alSesion }) {
  return firebaseConfigurado() ? crearFirebase(alCambiar, alSesion) : crearDemo(alCambiar, alSesion);
}

const idZona = (cuarto) => encodeURIComponent(String(cuarto));

// ---------------------------------------------------------------- Firebase

async function crearFirebase(alCambiar, alSesion) {
  const { initializeApp } = await import("./vendor/firebase/firebase-app.js");
  const au = await import("./vendor/firebase/firebase-auth.js");
  const fs = await import("./vendor/firebase/firebase-firestore.js");

  const app = initializeApp(CONFIG.bitacora.firebase);
  const auth = au.getAuth(app);
  const db = fs.getFirestore(app);

  const vacio = () => ({ catalogo: [], catalogoLeido: 0, catalogoPor: null, catalogoEjemplo: false, estados: [], zonas: [], movs: [], pendientes: [], hayMas: false, error: null, listo: { catalogo: false, estados: false, zonas: false, movs: false } });
  const e = vacio();
  let limite = HISTORIAL_INICIAL;
  let quitar = {};
  let usuario = null;

  const avisar = () => alCambiar({ ...e, listo: e.listo.catalogo && e.listo.estados && e.listo.zonas, historialListo: e.listo.movs });
  const alError = (err) => { console.error(err); e.error = err; avisar(); };
  const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const ref = (col, id) => fs.doc(db, col, id);

  function escucharHistorial() {
    const q = fs.query(fs.collection(db, "movimientos"), fs.orderBy("t", "desc"), fs.limit(limite));
    return fs.onSnapshot(q, (s) => { e.movs = docs(s); e.listo.movs = true; e.hayMas = s.size >= limite; avisar(); }, alError);
  }
  function escuchar() {
    dejar();
    quitar = {
      catalogo: fs.onSnapshot(ref("catalogo", "actual"), (d) => {
        const v = d.exists() ? d.data() : {};
        Object.assign(e, { catalogo: v.items || [], catalogoLeido: v.leido || 0, catalogoPor: v.por || null, catalogoEjemplo: Boolean(v.ejemplo) });
        e.listo.catalogo = true; avisar();
      }, alError),
      estados: fs.onSnapshot(fs.collection(db, "simuladores"), (s) => { e.estados = docs(s); e.listo.estados = true; e.error = null; avisar(); }, alError),
      zonas: fs.onSnapshot(fs.collection(db, "zonas"), (s) => { e.zonas = docs(s).map((z) => ({ ...z, id: z.cuarto || decodeURIComponent(z.id) })); e.listo.zonas = true; avisar(); }, alError),
      pendientes: fs.onSnapshot(fs.query(fs.collection(db, "movimientos"), fs.where("excel.estado", "in", ["pendiente", "error", "escribiendo"]), fs.limit(200)), (s) => { e.pendientes = docs(s); avisar(); }, alError),
      movs: escucharHistorial(),
    };
  }
  function dejar() {
    Object.values(quitar).forEach((f) => f());
    quitar = {};
  }

  au.onAuthStateChanged(auth, (u) => {
    usuario = u ? { uid: u.uid, correo: u.email || "" } : null;
    if (usuario) escuchar();
    else { dejar(); Object.assign(e, vacio()); }
    alSesion(usuario);
  });

  return {
    modo: "firebase",
    get usuario() { return usuario; },
    entrar: (correo, contrasena) => au.signInWithEmailAndPassword(auth, correo.trim(), contrasena),
    salir: () => au.signOut(auth),
    recuperar: (correo) => au.sendPasswordResetEmail(auth, correo.trim()),
    masHistorial() {
      limite += HISTORIAL_INICIAL;
      if (quitar.movs) quitar.movs();
      quitar.movs = escucharHistorial();
    },

    // Cambia el estado del equipo y agrega el movimiento juntos. Si `requiereEstado` no coincide, no hace nada.
    async registrar(simId, cambios, movimiento, requiereEstado) {
      const movRef = fs.doc(fs.collection(db, "movimientos"));
      await fs.runTransaction(db, async (tx) => {
        const r = ref("simuladores", simId);
        const snap = await tx.get(r);
        const actual = snap.exists() ? snap.data().estado || "disponible" : "disponible";
        if (requiereEstado && actual !== requiereEstado) throw new ErrorBitacora("estado-cambio");
        tx.set(r, cambios, { merge: true });
        tx.set(movRef, movimiento);
      });
      return movRef.id;
    },
    guardarEstado: (id, cambios) => fs.setDoc(ref("simuladores", id), cambios, { merge: true }),
    marcarExcel: (movId, excel) => fs.updateDoc(ref("movimientos", movId), { excel }),
    // Aparta el movimiento para escribirlo en el Excel, para que otro dispositivo no lo escriba al mismo tiempo.
    tomarParaExcel(movId, quien) {
      return fs.runTransaction(db, async (tx) => {
        const r = ref("movimientos", movId);
        const s = await tx.get(r);
        if (!s.exists()) return null;
        const x = s.data().excel || {};
        if (x.estado === "ok" || (x.estado === "escribiendo" && Date.now() - (x.desde || 0) < 120000)) return null;
        const nuevo = { ...x, estado: "escribiendo", desde: Date.now(), por: quien || null };
        tx.update(r, { excel: nuevo });
        return nuevo;
      });
    },

    guardarZona: (cuarto, cambios) => fs.setDoc(ref("zonas", idZona(cuarto)), { ...cambios, cuarto }, { merge: true }),
    borrarZona: (cuarto) => fs.deleteDoc(ref("zonas", idZona(cuarto))),
    async ordenarZonas(cambios) {
      const b = fs.writeBatch(db);
      cambios.forEach((c) => b.set(ref("zonas", idZona(c.id)), { orden: c.orden, cuarto: c.id }, { merge: true }));
      await b.commit();
    },

    guardarCatalogo: (items, leido, por) => fs.setDoc(ref("catalogo", "actual"), { items, leido, por: por || null, ejemplo: false }),
    cargarEjemplo: () => fs.setDoc(ref("catalogo", "actual"), { items: ejemplo(), leido: Date.now(), por: null, ejemplo: true }),
    async borrarEjemplo(estados = []) {
      const b = fs.writeBatch(db);
      b.delete(ref("catalogo", "actual"));
      estados.filter((s) => /^EJ-/.test(s.id)).forEach((s) => b.delete(ref("simuladores", s.id)));
      await b.commit();
    },
  };
}

// ---------------------------------------------------------------- Demostración (solo este navegador)

const CLAVE_DEMO = "csc.bitacora.demo.v2";

function crearDemo(alCambiar, alSesion) {
  const usuario = { uid: "demo", correo: "demo" };
  const vacio = () => ({ catalogo: [], catalogoLeido: 0, catalogoPor: null, catalogoEjemplo: false, estados: [], zonas: [], movs: [] });
  let d = leer();

  function leer() {
    try {
      const x = JSON.parse(localStorage.getItem(CLAVE_DEMO) || "null");
      if (x && Array.isArray(x.catalogo) && Array.isArray(x.movs)) return { ...vacio(), ...x };
    } catch { /* sin almacenamiento: se trabaja en memoria */ }
    return vacio();
  }
  function guardar() {
    try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(d)); } catch { /* en memoria */ }
    avisar();
  }
  function avisar() {
    const movs = d.movs.slice().sort((a, b) => b.t - a.t);
    alCambiar({ ...d, movs, pendientes: movs.filter((m) => m.excel && m.excel.estado !== "ok"), listo: true, historialListo: true, hayMas: false, error: null });
  }
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const estado = (id) => d.estados.find((s) => s.id === id);

  window.addEventListener("storage", (ev) => { if (ev.key === CLAVE_DEMO) { d = leer(); avisar(); } });
  setTimeout(() => { alSesion(usuario); avisar(); }, 0);

  return {
    modo: "demo",
    usuario,
    entrar: async () => {},
    salir: async () => {},
    recuperar: async () => {},
    masHistorial() {},
    async registrar(simId, cambios, movimiento, requiereEstado) {
      let s = estado(simId);
      if (requiereEstado && ((s && s.estado) || "disponible") !== requiereEstado) throw new ErrorBitacora("estado-cambio");
      if (!s) { s = { id: simId }; d.estados.push(s); }
      Object.assign(s, cambios);
      const id = nuevoId();
      d.movs.push({ id, ...movimiento });
      guardar();
      return id;
    },
    async guardarEstado(id, cambios) {
      let s = estado(id);
      if (!s) { s = { id }; d.estados.push(s); }
      Object.assign(s, cambios);
      guardar();
    },
    async marcarExcel(movId, excel) { const m = d.movs.find((x) => x.id === movId); if (m) m.excel = excel; guardar(); },
    async tomarParaExcel(movId) {
      const m = d.movs.find((x) => x.id === movId);
      if (!m || (m.excel && m.excel.estado === "ok")) return null;
      return { ...(m.excel || {}), estado: "escribiendo", desde: Date.now() };
    },
    async guardarZona(cuarto, cambios) {
      let z = d.zonas.find((x) => x.id === cuarto);
      if (!z) { z = { id: cuarto }; d.zonas.push(z); }
      Object.assign(z, cambios, { id: cuarto });
      guardar();
    },
    async borrarZona(cuarto) { d.zonas = d.zonas.filter((z) => z.id !== cuarto); guardar(); },
    async ordenarZonas(cambios) {
      for (const c of cambios) {
        let z = d.zonas.find((x) => x.id === c.id);
        if (!z) { z = { id: c.id }; d.zonas.push(z); }
        z.orden = c.orden;
      }
      guardar();
    },
    async guardarCatalogo(items, leido, por) { Object.assign(d, { catalogo: items, catalogoLeido: leido, catalogoPor: por || null, catalogoEjemplo: false }); guardar(); },
    async cargarEjemplo() { Object.assign(d, { catalogo: ejemplo(), catalogoLeido: Date.now(), catalogoEjemplo: true }); guardar(); },
    async borrarEjemplo() {
      d.catalogo = d.catalogoEjemplo ? [] : d.catalogo;
      d.catalogoEjemplo = false;
      d.estados = d.estados.filter((s) => !/^EJ-/.test(s.id));
      guardar();
    },
  };
}

// ---------------------------------------------------------------- Inventario de ejemplo (IDs EJ-)

function ejemplo() {
  return [
    ["EJ-001", "Maniquí adulto de alta fidelidad", "Simulador de paciente (maniquí)", "Sala de simulación", "CJ-01"],
    ["EJ-002", "Maniquí pediátrico", "Simulador de paciente (maniquí)", "Sala de simulación", "CJ-02"],
    ["EJ-003", "Simulador de parto", "Simulador de paciente (maniquí)", "Sala de simulación", "CJ-03"],
    ["EJ-004", "Entrenador de vía aérea", "Simulador de tareas (brazo IV, intubación, etc.)", "Taller", "CJ-04"],
    ["EJ-005", "Torso de RCP adulto", "Simulador de RCP", "Taller", "CJ-05"],
    ["EJ-006", "Torso de RCP lactante", "Simulador de RCP", "Taller", "CJ-05"],
    ["EJ-007", "Brazo de venopunción", "Simulador de tareas (brazo IV, intubación, etc.)", "Taller", "CJ-06"],
    ["EJ-008", "Simulador de auscultación", "Simulador de tareas (brazo IV, intubación, etc.)", "Bodega", "CJ-07"],
    ["EJ-009", "Pad de sutura", "Simulador de tareas (brazo IV, intubación, etc.)", "Bodega", "CJ-08"],
    ["EJ-010", "Estetoscopio", "Equipo de diagnóstico manual", "Bodega", "CJ-09"],
  ].map(([id, nombre, categoria, cuarto, caja], i) => ({ id, nombre, categoria, marca: "", cuarto, caja, estadoGeneral: "Sin probar", tipo: "", notas: "", fila: i + 2, ejemplo: true }));
}
