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
};
