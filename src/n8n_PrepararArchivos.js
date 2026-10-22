// Code node "PrepararArchivos" del workflow de n8n (Mode: Run Once for All Items).
// Este archivo es la copia legible del codigo que vive dentro de
// src/n8n_webhook_fotos_usados.json, para poder pegarlo en el nodo sin
// re-importar el workflow completo.
//
// PrepararArchivos: ordena las fotos de WebKai y arma el nombre destino.
//
// MODO_NOMBRE elige con cual de las dos secciones de nombrado se trabaja:
//   'SECUENCIAL' -> patente_1.jpg, patente_2.jpg, ...   (el de siempre)
//   'ORIGINAL'   -> patente_NombreOriginal.jpg          (conserva el nombre de WebKai)
//
// En los dos casos el nombre arranca con la patente, asi que la baja por
// prefijo (nodos FiltrarEliminar) sigue funcionando sin tocar nada.
//
// Va con 'let' a proposito: con 'const' el editor de n8n le asigna el tipo
// literal 'SECUENCIAL' y marca la comparacion de mas abajo como imposible.
let MODO_NOMBRE = 'SECUENCIAL';

const P = $('Preparar').first().json;
const all = ($('GraphListWebKaiFiles').first().json.value) || [];

const files = all
  .filter(f => f.file)
  .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }));

if (!files.length) {
  return [{ json: { hayFotos: false, ok: false, accion: 'subir', patente: P.patente, marca: P.marca, total: 0, archivos: [], markdown: '', mensaje: 'La carpeta WebKai no tiene fotos' } }];
}

const base = P.ftpPath.endsWith('/') ? P.ftpPath : P.ftpPath + '/';

// Nombres ya asignados, para no pisar un archivo con otro.
const usados = new Set();

// ---- Seccion 1: nombrado secuencial (el historico) ----
function nombreSecuencial(f, idx, ext) {
  return P.patente + '_' + (idx + 1) + '.' + ext;
}

// ---- Seccion 2: nombrado con el nombre original ----
// Deja el texto apto para el FTP y para una URL publica: sin tildes, sin
// espacios y sin caracteres que haya que escapar.
function limpiar(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nombreOriginal(f, idx, ext) {
  let limpio = limpiar(f.name.replace(/\.[^.]+$/, ''));
  // Si el archivo ya venia nombrado con la patente adelante, no la repetimos.
  if (limpio.toUpperCase().startsWith(P.patente)) {
    limpio = limpiar(limpio.slice(P.patente.length));
  }
  // Si del nombre original no queda nada util, caemos al indice.
  const raiz = P.patente + '_' + (limpio || (idx + 1));
  let candidato = raiz + '.' + ext;
  let n = 2;
  while (usados.has(candidato.toLowerCase())) {
    candidato = raiz + '-' + n + '.' + ext;
    n++;
  }
  return candidato;
}

return files.map((f, idx) => {
  const ext = (f.name.includes('.') ? f.name.split('.').pop() : 'jpg').toLowerCase();
  const destName = MODO_NOMBRE === 'ORIGINAL'
    ? nombreOriginal(f, idx, ext)
    : nombreSecuencial(f, idx, ext);
  usados.add(destName.toLowerCase());
  return {
    json: {
      hayFotos: true,
      indice: idx + 1,
      origen: f.name,
      destName,
      rutaDestino: base + destName,
      downloadUrl: f['@microsoft.graph.downloadUrl'] || f['@content.downloadUrl'] || '',
    },
  };
});
