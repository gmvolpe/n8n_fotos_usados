/**
 * actualizarFotos.gs  —  va en el libro ORIGEN (STOCK FISICO)
 *
 * Recorre el stock y mantiene la columna de fotos (markdown) llamando al
 * webhook de n8n. Pensado para correr con un disparador por tiempo, y también
 * a mano desde el menú "Fotos usados" de la planilla (ver más abajo).
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
  //WEBHOOK_URL: 'https://nodes.kansai.com.ar/webhook-test/fotos-usados',
  WEBHOOK_TOKEN: '3240c2c23c004e30b5aa18b1d781e382a6c6d17d75ed4efd869c73fca103e24c',        // debe coincidir con WEBHOOK_TOKEN en n8n
};
// =======================================================

const AF_AYUDA_ERRORES = 'Hubo errores de comunicación con n8n. Revisá que el workflow esté ACTIVE ' +
  '(la URL /webhook/ solo responde si lo está) y que el token coincida.';

function actualizarFotos() {
  const cfg = AF_CONFIG;
  const ctx = afContexto();
  const hoja = ctx.hoja;
  const cols = ctx.cols;

  // Evita dejar toda la columna en blanco por una config incompleta.
  afVerificarToken();

  Logger.log('Columnas -> DOMINIO:' + cols.dominio + ' MARCA:' + cols.marca +
             ' RESERVA:' + cols.reserva + ' FOTOS:' + cols.fotos);

  // Leer el bloque de datos, acotado a las filas realmente usadas.
  // FILA_FIN actúa solo como tope de seguridad: si la hoja tiene menos filas,
  // manda getLastRow() (y así getRange nunca se pasa de la grilla).
  const filaFin = Math.min(cfg.FILA_FIN, hoja.getLastRow());
  if (filaFin < cfg.FILA_INICIO) {
    Logger.log('No hay filas de datos a partir de la fila ' + cfg.FILA_INICIO + '. Nada que hacer.');
    return { conDominio: 0, subidos: 0, sinFotos: 0, eliminados: 0, errores: 0 };
  }

  const numFilas = filaFin - cfg.FILA_INICIO + 1;
  const anchoLectura = Math.max(cols.dominio, cols.marca, cols.reserva, cols.fotos);
  const datos = hoja.getRange(cfg.FILA_INICIO, 1, numFilas, anchoLectura).getValues();

  Logger.log('Revisando filas ' + cfg.FILA_INICIO + ' a ' + filaFin + ' (' + numFilas + ' filas).');

  let subidos = 0, eliminados = 0, sinFotos = 0, errores = 0, conDominio = 0;

  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i];
    const filaReal = cfg.FILA_INICIO + i;

    const dominio = (fila[cols.dominio - 1] || '').toString().trim();
    if (!dominio) continue;   // fila en blanco: se ignora
    conDominio++;

    const marca = cols.marca ? (fila[cols.marca - 1] || '').toString().trim() : '';
    const reserva = fila[cols.reserva - 1];
    const fotos = (fila[cols.fotos - 1] || '').toString().trim();

    const tieneReserva = reserva !== '' && reserva !== null && reserva !== undefined;

    if (tieneReserva) {
      // Auto reservado/vendido -> limpiar FTP solo si tenía fotos
      if (fotos) {
        const res = afDarDeBajaFila(hoja, cols, filaReal, dominio);
        if (res.estado === 'error') errores++;   // la celda queda como estaba: se reintenta
        else eliminados++;
      }
    } else {
      // Auto disponible y sin fotos cargadas -> subir
      if (!fotos) {
        const res = afPublicarFila(hoja, cols, filaReal, dominio, marca);
        if (res.estado === 'error') errores++;
        else if (res.estado === 'ok') subidos++;
        else sinFotos++;
      }
    }
  }

  Logger.log('actualizarFotos: ' + conDominio + ' filas con DOMINIO | ' + subidos + ' subidas, ' +
             sinFotos + ' sin fotos, ' + eliminados + ' eliminaciones, ' + errores + ' errores.');
  if (errores) {
    Logger.log(AF_AYUDA_ERRORES);
  }

  return {
    conDominio: conDominio,
    subidos: subidos,
    sinFotos: sinFotos,
    eliminados: eliminados,
    errores: errores,
  };
}

// ==================== INTERFAZ EN LA PLANILLA ====================
// El menú solo aparece si el script está ENLAZADO al libro (Extensiones >
// Apps Script desde la propia planilla). Si el script es independiente, estas
// funciones no se usan: el circuito corre igual por disparador.

/**
 * Arma el menú al abrir la planilla. onOpen es un disparador simple y corre
 * sin permisos para salir a internet: por eso acá no se llama al webhook, solo
 * se dibuja el menú. El webhook lo llaman los ítems, que sí corren con permisos.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Fotos usados')
    .addItem('Actualizar todo el stock', 'uiActualizarTodo')
    .addSeparator()
    .addItem('Republicar las fotos de la fila seleccionada', 'uiRepublicarFila')
    .addItem('Dar de baja las fotos de la fila seleccionada', 'uiDarDeBajaFila')
    .addSeparator()
    .addItem('Probar la conexión con n8n', 'uiProbarConexion')
    .addToUi();
}

/** Recorre todo el stock, igual que el disparador, pero avisando por pantalla. */
function uiActualizarTodo() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert(
    'Actualizar todo el stock',
    'Se publican las fotos de las unidades disponibles que todavía no las tengan y se dan ' +
    'de baja las de las reservadas.\n\n' +
    'Los cambios van al sitio web de producción.\n\n' +
    'Si hay muchas unidades nuevas, Apps Script puede cortar la ejecución a los 6 minutos: ' +
    'no pasa nada, se vuelve a elegir la opción y sigue por donde quedó.\n\n¿Seguimos?',
    ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;

  afToast('Actualizando el stock, puede tardar unos minutos...');

  let r;
  try {
    r = actualizarFotos();
  } catch (e) {
    ui.alert('Fotos usados', 'No se pudo completar:\n\n' + e.message, ui.ButtonSet.OK);
    return;
  }

  let detalle =
    'Filas con DOMINIO: ' + r.conDominio + '\n' +
    'Publicadas: ' + r.subidos + '\n' +
    'Sin fotos en WebKai: ' + r.sinFotos + '\n' +
    'Dadas de baja: ' + r.eliminados + '\n' +
    'Con error: ' + r.errores;
  if (r.errores) detalle += '\n\n' + AF_AYUDA_ERRORES;

  afToast('Listo: ' + r.subidos + ' publicada(s), ' + r.eliminados + ' baja(s).');
  ui.alert('Fotos usados', detalle, ui.ButtonSet.OK);
}

/**
 * Vuelve a publicar la unidad de la fila donde está parado el cursor, tenga o
 * no fotos cargadas. Es el atajo para la trampa de siempre: la celda FOTOS es
 * la marca de "ya publicado", así que para republicar hay que vaciarla.
 */
function uiRepublicarFila() {
  const ui = SpreadsheetApp.getUi();
  const sel = afFilaSeleccionada(ui);
  if (!sel) return;

  const ok = ui.alert(
    'Republicar ' + sel.dominio,
    'Se borran del sitio las fotos actuales de ' + sel.dominio + ' y se suben de nuevo ' +
    'las que estén hoy en la carpeta WebKai.\n\n¿Seguimos?',
    ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;

  afToast('Publicando las fotos de ' + sel.dominio + '...');

  let res;
  try {
    res = afPublicarFila(sel.hoja, sel.cols, sel.fila, sel.dominio, sel.marca);
  } catch (e) {
    ui.alert('Fotos usados', 'No se pudo completar:\n\n' + e.message, ui.ButtonSet.OK);
    return;
  }

  if (res.estado === 'ok') {
    afToast(sel.dominio + ': ' + res.total + ' foto(s) publicada(s).');
    ui.alert('Fotos usados', sel.dominio + ': se publicaron ' + res.total + ' foto(s).', ui.ButtonSet.OK);
  } else if (res.estado === 'sinFotos') {
    ui.alert('Fotos usados',
      'No se publicó nada para ' + sel.dominio + '.\n\n' + res.mensaje +
      '\n\nLa celda FOTOS quedó vacía.', ui.ButtonSet.OK);
  } else {
    ui.alert('Fotos usados',
      'Falló la llamada a n8n para ' + sel.dominio + ': ' + res.mensaje +
      '\n\nLa celda FOTOS no se tocó.\n\n' + AF_AYUDA_ERRORES, ui.ButtonSet.OK);
  }
}

/** Borra del sitio las fotos de la unidad de la fila seleccionada y vacía la celda. */
function uiDarDeBajaFila() {
  const ui = SpreadsheetApp.getUi();
  const sel = afFilaSeleccionada(ui);
  if (!sel) return;

  const ok = ui.alert(
    'Dar de baja ' + sel.dominio,
    'Se borran del sitio todas las fotos de ' + sel.dominio + ' y la celda FOTOS queda vacía.\n\n' +
    'Ojo: si la unidad no tiene FECHA DE RESERVA, la próxima corrida la vuelve a publicar.\n\n' +
    '¿Seguimos?',
    ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;

  afToast('Dando de baja las fotos de ' + sel.dominio + '...');

  let res;
  try {
    res = afDarDeBajaFila(sel.hoja, sel.cols, sel.fila, sel.dominio);
  } catch (e) {
    ui.alert('Fotos usados', 'No se pudo completar:\n\n' + e.message, ui.ButtonSet.OK);
    return;
  }

  if (res.estado === 'error') {
    ui.alert('Fotos usados',
      'Falló la llamada a n8n para ' + sel.dominio + ': ' + res.mensaje + '\n\n' + AF_AYUDA_ERRORES,
      ui.ButtonSet.OK);
    return;
  }

  afToast(sel.dominio + ': ' + res.total + ' archivo(s) eliminado(s).');
  ui.alert('Fotos usados',
    sel.dominio + ': se eliminaron ' + res.total + ' archivo(s) del sitio.', ui.ButtonSet.OK);
}

/**
 * Prueba que el webhook conteste y que el token sirva, SIN publicar ni borrar
 * nada: manda una acción inválida a propósito, que el workflow rechaza en la
 * validación antes de tocar SharePoint o el FTP.
 */
function uiProbarConexion() {
  const ui = SpreadsheetApp.getUi();
  const cfg = AF_CONFIG;

  // muteHttpExceptions tapa los códigos HTTP, pero no los errores de red:
  // sin este try, el ítem se cae justo cuando el servidor no contesta, que es
  // el caso que esta opción existe para diagnosticar.
  let resp;
  try {
    resp = UrlFetchApp.fetch(cfg.WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-token': cfg.WEBHOOK_TOKEN },
      payload: JSON.stringify({ patente: 'PRUEBA', accion: 'probar-conexion' }),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('Probar conexión: ' + e);
    ui.alert('Fotos usados',
      'No se pudo contactar a n8n:\n\n' + e.message + '\n\nURL: ' + cfg.WEBHOOK_URL,
      ui.ButtonSet.OK);
    return;
  }

  const code = resp.getResponseCode();
  Logger.log('Probar conexión: HTTP ' + code + ' -> ' + resp.getContentText());

  let msg;
  if (code === 404) {
    msg = 'HTTP 404: el workflow no está ACTIVE en n8n, o el path del webhook no coincide.';
  } else if (code === 401 || code === 403) {
    msg = 'HTTP ' + code + ': el token no coincide con la credencial Header Auth de n8n.';
  } else if (code >= 200 && code < 300) {
    msg = 'Conexión OK: n8n respondió y aceptó el token.\n\n' +
          '(Se mandó una acción inválida a propósito, así que no se publicó ni borró nada.)';
  } else {
    msg = 'HTTP ' + code + ': respuesta inesperada de n8n.\n\n' + resp.getContentText();
  }

  ui.alert('Fotos usados', msg, ui.ButtonSet.OK);
}

/**
 * Datos de la fila donde está el cursor. Si algo no cierra, avisa por pantalla
 * y devuelve null para que el ítem del menú corte sin hacer nada.
 */
function afFilaSeleccionada(ui) {
  const cfg = AF_CONFIG;
  const libroActivo = SpreadsheetApp.getActiveSpreadsheet();
  const hojaActiva = SpreadsheetApp.getActiveSheet();

  // La fila sale del libro abierto y la escritura va al libro de AF_CONFIG:
  // si no son el mismo (una copia de la planilla, por ejemplo), el número de
  // fila apuntaría a otra unidad en producción.
  if (!libroActivo || libroActivo.getId() !== cfg.SPREADSHEET_ID) {
    ui.alert('Fotos usados',
      'Esta planilla no es la que tiene configurada el script (AF_CONFIG.SPREADSHEET_ID).\n\n' +
      'El menú solo puede trabajar sobre el libro original.', ui.ButtonSet.OK);
    return null;
  }

  if (!hojaActiva || hojaActiva.getName() !== cfg.HOJA) {
    ui.alert('Fotos usados', 'Pará en una fila de la hoja "' + cfg.HOJA + '".', ui.ButtonSet.OK);
    return null;
  }

  const fila = SpreadsheetApp.getActiveRange().getRow();
  if (fila < cfg.FILA_INICIO) {
    ui.alert('Fotos usados',
      'Esa es una fila de encabezados. Los datos arrancan en la fila ' + cfg.FILA_INICIO + '.',
      ui.ButtonSet.OK);
    return null;
  }

  let ctx;
  try {
    afVerificarToken();
    ctx = afContexto();
  } catch (e) {
    ui.alert('Fotos usados', e.message, ui.ButtonSet.OK);
    return null;
  }

  const cols = ctx.cols;
  const valores = ctx.hoja.getRange(fila, 1, 1, Math.max(cols.dominio, cols.marca)).getValues()[0];
  const dominio = (valores[cols.dominio - 1] || '').toString().trim();

  if (!dominio) {
    ui.alert('Fotos usados', 'La fila ' + fila + ' no tiene DOMINIO cargado.', ui.ButtonSet.OK);
    return null;
  }

  return {
    hoja: ctx.hoja,
    cols: cols,
    fila: fila,
    dominio: dominio,
    marca: cols.marca ? (valores[cols.marca - 1] || '').toString().trim() : '',
  };
}

/** Mensaje flotante en la planilla. No existe si el script es independiente. */
function afToast(mensaje) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) ss.toast(mensaje, 'Fotos usados', 10);
  } catch (e) {
    // Sin planilla activa (disparador por tiempo): el registro alcanza.
  }
}

// ==================== OPERACIONES ====================

/** Abre la hoja de trabajo y ubica las columnas. */
function afContexto() {
  const cfg = AF_CONFIG;
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const hoja = ss.getSheetByName(cfg.HOJA);
  if (!hoja) throw new Error('No se encontró la hoja "' + cfg.HOJA + '"');
  return { ss: ss, hoja: hoja, cols: afUbicarColumnas(hoja) };
}

/** Ubica las columnas por el TEXTO del encabezado, no por letra. */
function afUbicarColumnas(hoja) {
  const cfg = AF_CONFIG;
  const ultCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(cfg.FILA_ENCABEZADOS, 1, 1, ultCol)
    .getValues()[0]
    .map(function (h) { return h.toString().trim().toUpperCase(); });

  function colPorNombre(nombre) {
    return encabezados.indexOf(nombre.toUpperCase()) + 1; // 0 si no existe
  }

  const cols = {
    dominio: colPorNombre(cfg.ENC_DOMINIO),
    marca: colPorNombre(cfg.ENC_MARCA),
    reserva: colPorNombre(cfg.ENC_FECHA_RESERVA),
    fotos: colPorNombre(cfg.ENC_FOTOS) || cfg.COL_FOTOS_FALLBACK,
  };

  if (!cols.dominio) {
    throw new Error('No se encontró el encabezado "' + cfg.ENC_DOMINIO + '" en la fila ' + cfg.FILA_ENCABEZADOS);
  }
  if (!cols.reserva) {
    throw new Error('No se encontró el encabezado "' + cfg.ENC_FECHA_RESERVA + '"');
  }
  return cols;
}

function afVerificarToken() {
  const cfg = AF_CONFIG;
  if (!cfg.WEBHOOK_TOKEN || cfg.WEBHOOK_TOKEN === 'CARGAR_TOKEN') {
    throw new Error('Falta cargar AF_CONFIG.WEBHOOK_TOKEN con el valor de la credencial Header Auth de n8n.');
  }
}

/**
 * Publica las fotos de una unidad y deja el markdown en la celda FOTOS.
 * Devuelve { estado: 'ok' | 'sinFotos' | 'error', total, mensaje }.
 */
function afPublicarFila(hoja, cols, filaReal, dominio, marca) {
  const r = llamarWebhook({ patente: dominio, marca: marca, accion: 'subir' });

  if (r && r._error) {
    // Falla de red o del servidor: NO se toca la celda, se reintenta en la próxima corrida.
    Logger.log('ERROR  ' + dominio + ' (fila ' + filaReal + '): ' + r.mensaje);
    return { estado: 'error', total: 0, mensaje: r.mensaje };
  }

  if (r && r.ok && r.markdown) {
    hoja.getRange(filaReal, cols.fotos).setValue(r.markdown);
    Logger.log('OK     ' + dominio + ': ' + (r.total || 0) + ' foto(s)');
    return { estado: 'ok', total: r.total || 0, mensaje: '' };
  }

  hoja.getRange(filaReal, cols.fotos).setValue(''); // sin fotos -> en blanco
  const mensaje = (r && r.mensaje) || '';
  Logger.log('SIN FOTOS ' + dominio + ': ' + mensaje);
  return { estado: 'sinFotos', total: 0, mensaje: mensaje };
}

/**
 * Borra del FTP las fotos de una unidad y vacía la celda FOTOS.
 * Devuelve { estado: 'ok' | 'error', total, mensaje }.
 */
function afDarDeBajaFila(hoja, cols, filaReal, dominio) {
  const r = llamarWebhook({ patente: dominio, accion: 'eliminar' });

  if (r && r._error) {
    Logger.log('ERROR baja ' + dominio + ' (fila ' + filaReal + '): ' + r.mensaje);
    return { estado: 'error', total: 0, mensaje: r.mensaje };
  }

  hoja.getRange(filaReal, cols.fotos).setValue('');
  Logger.log('BAJA   ' + dominio + ': ' + ((r && r.total) || 0) + ' archivo(s)');
  return { estado: 'ok', total: (r && r.total) || 0, mensaje: (r && r.mensaje) || '' };
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
