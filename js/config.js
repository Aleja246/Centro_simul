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

  // ---------- Inventario y etiquetas QR (equipo/ y etiquetas/) ----------
  inventario: {
    urlDatos: "datos/inventario.json", // relativa a la raíz; la genera scripts/excel_a_json.py
    // Cómo se muestra cada cuarto (izquierda: tal cual está en el Excel). POR DEFINIR nombres oficiales.
    nombresCuartos: {
      "Taller de mantenimiento y consumibles": "Taller de mantenimiento y consumibles",
      CuartodelaTortura: "Cuarto de la tortura",
      ClosetFinal: "Closet final",
    },
    carpetaFotos: "fotos/", // opcional: fotos/EQ-347.jpg se muestra en la ficha
  },
  // Tamaños de etiqueta para etiquetas/ (mm). POR DEFINIR cuando se compren las hojas de etiquetas.
  etiquetas: [
    { id: "avery5160", nombre: "Carta · 66.7 × 25.4 mm · 30 por hoja (Avery 5160)", pagina: [215.9, 279.4], ancho: 66.7, alto: 25.4, columnas: 3, filas: 10, margenSup: 12.7, margenIzq: 4.8, separacion: 3.2 },
    { id: "avery5163", nombre: "Carta · 101.6 × 50.8 mm · 10 por hoja (Avery 5163, para cajas)", pagina: [215.9, 279.4], ancho: 101.6, alto: 50.8, columnas: 2, filas: 5, margenSup: 12.7, margenIzq: 4, separacion: 4.8 },
    { id: "rollo50x25", nombre: "Rollo · 50 × 25 mm (impresora de etiquetas)", pagina: [50, 25], ancho: 50, alto: 25, columnas: 1, filas: 1, margenSup: 0, margenIzq: 0, separacion: 0 },
  ],
};
