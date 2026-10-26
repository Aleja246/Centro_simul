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
  urlFormatoDiseno: "formatos/diseno-de-actividades.pdf", // relativa a la raíz (el archivo subido es PDF)

  // Bitácora de simuladores (simuladores/). Ver README → "Bitácora de simuladores".
  bitacora: {
    horasAlerta: 4, // después de cuántas horas fuera un simulador se marca en rojo
    urlSitio: "https://aleja246.github.io/Centro_simul/", // va en el enlace que se graba en cada tarjeta NFC
    // Consola de Firebase → Configuración del proyecto → Tus apps → app web → firebaseConfig.
    // Mientras esté vacío, la bitácora funciona en MODO DEMOSTRACIÓN (los datos se quedan en ese navegador).
    firebase: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      appId: "",
    },
  },
};
