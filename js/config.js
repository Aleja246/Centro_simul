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
    horasAlerta: 4, // después de cuántas horas fuera un equipo se marca en rojo
    urlSitio: "https://aleja246.github.io/Centro_simul/", // va en el enlace que se graba en cada tarjeta NFC
    // Qué equipos se dibujan en el plano (los demás se encuentran con el buscador o al leer su tarjeta).
    // Si el Excel tiene la columna "Tipo (para QR)" se usa el tipo; si no, cómo empieza la Categoría.
    enPlano: { tipos: ["Simulador"], categoriasQueEmpiezanCon: ["Simulador"] },

    // Consola de Firebase → Configuración del proyecto → Tus apps → app web → firebaseConfig.
    // Mientras esté vacío, la bitácora funciona en MODO DEMOSTRACIÓN (los datos se quedan en ese navegador).
    firebase: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      appId: "",
    },

    // Microsoft Entra → Registros de aplicaciones → la app de la bitácora.
    // Mientras clientId esté vacío, la página no lee ni escribe el Excel.
    microsoft: {
      clientId: "",              // "Id. de aplicación (cliente)"
      tenant: "organizations",   // o el "Id. de directorio (inquilino)" del Tec
    },

    // Excel en OneDrive/SharePoint del Tec. "enlace": en Excel, Compartir → Copiar vínculo.
    // Las columnas se buscan por su encabezado (sin importar acentos ni mayúsculas), no por letra.
    excel: {
      inventario: {
        enlace: "",
        hoja: "Inventario", // también encuentra "1Inventario"
        columnas: {
          id: "ID equipo",
          nombre: "Nombre / descripción del equipo",
          categoria: "Categoría",
          marca: "Marca",
          cuarto: "Zona del cuarto donde estaba",
          estadoGeneral: "Estado general",
          piezasDanadas: "# piezas dañadas",
          caja: "Caja real",
          revisadoPor: "Revisado por",
          fechaRevision: "Fecha de revisión",
          notas: "Notas / enlace a foto",
          materialQueFalta: "Material que falta", // se llenan todas las columnas con este nombre
          tipo: "Tipo (para QR)",                 // opcional
        },
        estadosGenerales: ["Funciona", "Funciona con fallas", "No funciona", "Sin probar"],
        formatoFecha: "m/d/yyyy",
      },
      bitacora: {
        enlace: "",            // vacío = el mismo Excel del inventario
        hoja: "Movimientos",   // si no existe, la página la crea con estas columnas
        columnas: {
          fecha: "Fecha",
          hora: "Hora",
          id: "ID equipo",
          equipo: "Equipo",
          movimiento: "Movimiento",
          responsable: "Responsable",
          destino: "Destino / actividad",
          cuarto: "Cuarto",
          minutos: "Tiempo fuera (min)",
          notas: "Notas",
          registro: "Registró",
          folio: "Folio",
        },
        formatoFecha: "m/d/yyyy",
      },
      verificacion: {
        enlace: "",            // Excel "Verificación y Mantenimiento Simuladores"; vacío = no se llena
        hoja: "Verificación",  // también encuentra "2Verificación"
        columnas: { id: "ID", estadoFisico: "Estado físico", funciona: "Funciona", ajustes: "Ajustes", resultado: "Resultado", comentarios: "Comentarios" },
        encabezado: { fecha: "Fecha:", realizo: "Realizó:", hora: "Hora:" }, // el valor va a la derecha de cada etiqueta
        // POR CONFIRMAR: deben ser las mismas opciones que las listas desplegables del Excel.
        opciones: { estadoFisico: ["Bueno", "Regular", "Malo"], funciona: ["Sí", "No"], resultado: ["Pasa", "No pasa"] },
        // Lo que se propone al elegir el Estado general (se puede cambiar antes de guardar).
        sugerencias: {
          "Funciona": { funciona: "Sí", resultado: "Pasa" },
          "Funciona con fallas": { funciona: "Sí", resultado: "No pasa" },
          "No funciona": { funciona: "No", resultado: "No pasa" },
        },
        formatoFecha: "m/d/yyyy",
      },
    },
  },
};
