/**
 * Sincroniza datos desde "Stock Usados" hacia la hoja destino.
 * Mantiene intacta la fila 1 (encabezados manuales) y actualiza desde la fila 2.
 */
function sincronizarCatalogo() {
  //const ORIGEN_SPREADSHEET_ID = '1zloyOlh1dKQq7VtKW2GT7Sas1ThQVZGo';
  const ORIGEN_SPREADSHEET_ID = '1FRAwSArKSUB6roWJZHZ8mYr2e1rMm6An-MIW38HwlUs';
  const ORIGEN_HOJA_NOMBRE = 'STOCK FISICO';
  const DESTINO_HOJA_NOMBRE = 'Sheet1'; // Cambia por el nombre de tu pestaña si es diferente 

  try {
    // 1. Abrir libro y hoja de origen
    const origenSS = SpreadsheetApp.openById(ORIGEN_SPREADSHEET_ID);
    const origenHoja = origenSS.getSheetByName(ORIGEN_HOJA_NOMBRE);

    if (!origenHoja) {
      throw new Error(`No se encontró la pestaña "${ORIGEN_HOJA_NOMBRE}" en el archivo origen.`);
    }

    // 2. Extraer datos a partir de la primera fila de registros (fila 4) hasta la 500
    // Columnas C a Y (23 columnas): Col 1 = C, Col 14 = P, Col 15 = Q, Col 23 = Y (FOTOS)
    const startRow = 4;
    const startCol = 3;
    const numCols = 23; // ampliado de 19 a 23 para incluir la columna Y (fotos)
    const numRows = 497; // de la fila 4 a la 500

    // Índice (0-based) de la columna de fotos dentro del rango leído.
    // Columna Y = 25; rango arranca en C = 3  ->  índice 25 - 3 = 22
    const IDX_FOTOS = 22;

    const datosOrigen = origenHoja.getRange(startRow, startCol, numRows, numCols).getValues();

    // 3. Filtrar registros: Col14 NOT NULL y Col15 IS NULL
    const filasFiltradas = [];

    for (let i = 0; i < datosOrigen.length; i++) {
      const fila = datosOrigen[i];
      const col14 = fila[13];
      const col15 = fila[14];

      const col14TieneDato = col14 !== '' && col14 !== null && col14 !== undefined;
      const col15EstaVacio = col15 === '' || col15 === null || col15 === undefined;

      if (col14TieneDato && col15EstaVacio) {
        // Col1 a Col12 (índices 0 a 11) + la columna de fotos (Y) como 13ª columna (destino M)
        const registro = fila.slice(0, 12);
        registro.push(fila[IDX_FOTOS]); // FOTOS -> columna M del destino
        filasFiltradas.push(registro);
      }
    }

    // 4. Escribir en la hoja destino
    const destinoSS = SpreadsheetApp.getActiveSpreadsheet();
    let destinoHoja = destinoSS.getSheetByName(DESTINO_HOJA_NOMBRE);
    if (!destinoHoja) {
      destinoHoja = destinoSS.getSheets()[0];
    }

    // Ahora se escriben 13 columnas: A..L (datos) + M (FOTOS)
    const TOTAL_COLS = 13;

    // Limpiar solo los datos anteriores a partir de la fila 2 (la fila 1 no se borra)
    const ultimaFila = destinoHoja.getLastRow();
    const maxColumnas = Math.max(destinoHoja.getLastColumn(), TOTAL_COLS);
    if (ultimaFila >= 2) {
      destinoHoja.getRange(2, 1, ultimaFila - 1, maxColumnas).clearContent();
    }

    // Pegar los registros filtrados desde A2 (incluye FOTOS en la columna M)
    if (filasFiltradas.length > 0) {
      destinoHoja.getRange(2, 1, filasFiltradas.length, TOTAL_COLS).setValues(filasFiltradas);
    }

    Logger.log(`Sincronización completada. Se actualizaron ${filasFiltradas.length} filas.`);
  } catch (error) {
    Logger.log('Error en sincronización: ' + error.message);
    throw error;
  }
}