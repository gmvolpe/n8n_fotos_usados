/**
 * actualizarFotos.gs  —  va en el libro ORIGEN (STOCK FISICO)
 *
 * Recorre el stock y mantiene la columna de fotos (markdown) llamando al
 * webhook de n8n. Pensado para correr con un disparador por tiempo.
 *
 * Reglas por fila:
 *   - Tiene DOMINIO + FECHA DE RESERVA vacía + FOTOS vacía  -> llama 'subir'
 *   - FECHA DE RESERVA con fecha + FOTOS con contenido      -> llama 'eliminar' y limpia FOTOS
 *   - FOTOS ya cargada (sin reserva)                        -> no hace nada (persistencia)
 *   - FECHA DE RESERVA con fecha + FOTOS ya vacía           -> no hace nada
 *
 * Si el webhook no encuentra fotos, deja la celda en blanco.
 */

// ==================== CONFIGURACIÓN ====================
const AF_CONFIG = {
  // Mismo libro que usa sincronizarCatalogo.gs como ORIGEN
  SPREADSHEET_ID: '1FRAwSArKSUB6roWJZHZ8mYr2e1rMm6An-MIW38HwlUs',
  HOJA: 'STOCK FISICO',

  FILA_ENCABEZADOS: 3,   // los encabezados están en la fila 3
  FILA_INICIO: 4,        // los datos arrancan en la fila 4
  FILA_FIN: 500,         // última fila a revisar

  // Las columnas se buscan por el TEXTO del encabezado (no por letra),
  // así no se rompe si se mueven de lugar.
  ENC_DOMINIO: 'DOMINIO',               // patente
  ENC_MARCA: 'MARCA',
  ENC_FECHA_RESERVA: 'FECHA DE RESERVA',
  ENC_FOTOS: 'FOTOS',                   // si no existe ese encabezado, usa COL_FOTOS_FALLBACK
  COL_FOTOS_FALLBACK: 25,               // columna Y (25) si no hay encabezado "FOTOS"

  // Webhook n8n
  WEBHOOK_URL: 'https://nodes.kansai.com.ar/webhook/fotos-usados',
  WEBHOOK_TOKEN: 'CARGAR_TOKEN',        // debe coincidir con WEBHOOK_TOKEN en n8n
};
// =======================================================

function actualizarFotos() {
  const cfg = AF_CONFIG;
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const hoja = ss.getSheetByName(cfg.HOJA);
  if (!hoja) throw new Error('No se encontró la hoja "' + cfg.HOJA + '"');

  // 1. Ubicar columnas por encabezado
  const ultCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(cfg.FILA_ENCABEZADOS, 1, 1, ultCol)
    .getValues()[0]
    .map(function (h) { return h.toString().trim().toUpperCase(); });

  function colPorNombre(nombre) {
    return encabezados.indexOf(nombre.toUpperCase()) + 1; // 0 si no existe
  }

  const colDominio = colPorNombre(cfg.ENC_DOMINIO);
  const colMarca = colPorNombre(cfg.ENC_MARCA);
  const colReserva = colPorNombre(cfg.ENC_FECHA_RESERVA);
  let colFotos = colPorNombre(cfg.ENC_FOTOS);
  if (!colFotos) colFotos = cfg.COL_FOTOS_FALLBACK;

  if (!colDominio) throw new Error('No se encontró el encabezado "' + cfg.ENC_DOMINIO + '" en la fila ' + cfg.FILA_ENCABEZADOS);
  if (!colReserva) throw new Error('No se encontró el encabezado "' + cfg.ENC_FECHA_RESERVA + '"');

  // Evita dejar toda la columna en blanco por una config incompleta.
  if (!cfg.WEBHOOK_TOKEN || cfg.WEBHOOK_TOKEN === 'CARGAR_TOKEN') {
    throw new Error('Falta cargar AF_CONFIG.WEBHOOK_TOKEN con el valor de la credencial Header Auth de n8n.');
  }

  Logger.log('Columnas -> DOMINIO:' + colDominio + ' MARCA:' + colMarca + ' RESERVA:' + colReserva + ' FOTOS:' + colFotos);

  // 2. Leer el bloque de datos
  const numFilas = cfg.FILA_FIN - cfg.FILA_INICIO + 1;
  const anchoLectura = Math.max(colDominio, colMarca, colReserva, colFotos);
  const datos = hoja.getRange(cfg.FILA_INICIO, 1, numFilas, anchoLectura).getValues();

  let subidos = 0, eliminados = 0, sinFotos = 0, errores = 0;

  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i];
    const filaReal = cfg.FILA_INICIO + i;

    const dominio = (fila[colDominio - 1] || '').toString().trim();
    if (!dominio) continue;

    const marca = colMarca ? (fila[colMarca - 1] || '').toString().trim() : '';
    const reserva = fila[colReserva - 1];
    const fotos = (fila[colFotos - 1] || '').toString().trim();

    const tieneReserva = reserva !== '' && reserva !== null && reserva !== undefined;

    if (tieneReserva) {
      // Auto reservado/vendido -> limpiar FTP solo si tenía fotos
      if (fotos) {
        llamarWebhook({ patente: dominio, accion: 'eliminar' });
        hoja.getRange(filaReal, colFotos).setValue('');
        eliminados++;
      }
    } else {
      // Auto disponible y sin fotos cargadas -> subir
      if (!fotos) {
        const r = llamarWebhook({ patente: dominio, marca: marca, accion: 'subir' });
        if (r && r._error) {
          // Falla de red o del servidor: NO se toca la celda, se reintenta en la próxima corrida.
          Logger.log('ERROR  ' + dominio + ' (fila ' + filaReal + '): ' + r.mensaje);
          errores++;
        } else if (r && r.ok && r.markdown) {
          hoja.getRange(filaReal, colFotos).setValue(r.markdown);
          Logger.log('OK     ' + dominio + ': ' + (r.total || 0) + ' foto(s)');
          subidos++;
        } else {
          hoja.getRange(filaReal, colFotos).setValue(''); // sin fotos -> en blanco
          Logger.log('SIN FOTOS ' + dominio + ': ' + ((r && r.mensaje) || ''));
          sinFotos++;
        }
      }
    }
  }

  Logger.log('actualizarFotos: ' + subidos + ' subidas, ' + sinFotos + ' sin fotos, ' +
             eliminados + ' eliminaciones, ' + errores + ' errores.');
  if (errores) {
    Logger.log('Hubo errores de comunicación con n8n. Revisá que el workflow esté ACTIVE ' +
               '(la URL /webhook/ solo responde si lo está) y que el token coincida.');
  }
}

/**
 * Diagnóstico: llama al webhook para una patente y muestra la respuesta cruda.
 * Ejecutá esta función y mirá el registro (Ver > Registros) antes de correr actualizarFotos.
 */
function probarWebhook() {
  const cfg = AF_CONFIG;
  const PATENTE_DE_PRUEBA = 'OPE390';

  Logger.log('URL:   ' + cfg.WEBHOOK_URL);
  Logger.log('Token: ' + (cfg.WEBHOOK_TOKEN === 'CARGAR_TOKEN'
    ? '*** SIN CARGAR: hay que poner el valor real ***'
    : '(cargado, ' + cfg.WEBHOOK_TOKEN.length + ' caracteres)'));

  const resp = UrlFetchApp.fetch(cfg.WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-token': cfg.WEBHOOK_TOKEN },
    payload: JSON.stringify({ patente: PATENTE_DE_PRUEBA, accion: 'subir' }),
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  Logger.log('HTTP ' + code);
  Logger.log('Respuesta: ' + resp.getContentText());

  if (code === 404) Logger.log('>> 404: el workflow NO está Active en n8n (o el path no coincide).');
  if (code === 403) Logger.log('>> 403: el token no coincide con la credencial Header Auth de n8n.');
}

/**
 * Llama al webhook de n8n y devuelve el JSON parseado.
 */
function llamarWebhook(payload) {
  const cfg = AF_CONFIG;
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-token': cfg.WEBHOOK_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  try {
    const resp = UrlFetchApp.fetch(cfg.WEBHOOK_URL, options);
    const code = resp.getResponseCode();
    const txt = resp.getContentText();
    if (code >= 200 && code < 300) {
      try { return JSON.parse(txt); }
      catch (e) { Logger.log('Respuesta no JSON: ' + txt); return { ok: false, _error: true, mensaje: 'Respuesta no JSON' }; }
    }
    Logger.log('Webhook HTTP ' + code + ' (' + JSON.stringify(payload) + '): ' + txt);
    return { ok: false, _error: true, mensaje: 'HTTP ' + code };
  } catch (e) {
    Logger.log('Error llamando webhook: ' + e);
    return { ok: false, _error: true, mensaje: String(e) };
  }
}
