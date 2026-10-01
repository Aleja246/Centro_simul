// Datos válidos de ejemplo para las pruebas. No es una prueba (no termina en .test.js).
export const HOY = "2026-09-30";
export const AHORA = "2026-09-30T14:32";

export const profEvento = (c = {}) => ({
  tipoReserva: "evento",
  nombre: "Juan Pérez Ruiz",
  correo: "juan.perez@tec.mx",
  actividad: "Taller de sutura",
  fecha: "2026-10-15",
  horaInicio: "09:00",
  horaFin: "11:00",
  casillaFormato: true,
  casillaOutlook: true,
  ...c,
});

export const profBloque = (c = {}) =>
  profEvento({
    tipoReserva: "bloque",
    fecha: undefined,
    periodo: "semestral",
    fechaInicio: "2026-10-12",
    fechaFin: "2026-12-04",
    dias: [1, 3],
    ...c,
  });

export const alumEspacio = (c = {}) => ({
  nombre: "Ana López García",
  correo: "A01234567@tec.mx",
  profNombre: "Juan Pérez Ruiz",
  profCorreo: "juan.perez@tec.mx",
  actividad: "Práctica de signos vitales",
  fecha: "2026-10-15",
  horaInicio: "09:00",
  horaFin: "11:00",
  casillaFormato: true,
  ...c,
});

export const alumMaterial = (c = {}) => ({
  nombre: "Ana López García",
  correo: "A01234567@tec.mx",
  hayProfesor: true,
  profNombre: "Juan Pérez Ruiz",
  profCorreo: "juan.perez@tec.mx",
  tipoActividad: "brigada",
  actividad: "Brigada de salud comunitaria",
  lugar: "Col. Independencia, Monterrey",
  fecha: "2026-10-15",
  horaInicio: "09:00",
  horaFin: "14:00",
  material: [
    { material: "Simulador RCP adulto", cantidad: "2" },
    { material: "Baumanómetro", cantidad: "4" },
  ],
  recogidaFecha: "2026-10-15",
  recogidaHora: "08:00",
  devolucionFecha: "2026-10-15",
  devolucionHora: "15:30",
  casillaInsumos: true,
  casillaSalida: true,
  ...c,
});
