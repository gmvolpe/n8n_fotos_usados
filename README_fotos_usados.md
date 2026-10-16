# Sincronización de fotos de usados (SharePoint → FTP)

Automatiza la publicación de las fotos de autos usados en el sitio web, tomándolas
de SharePoint y subiéndolas al FTP, controlado desde la planilla de stock.

## Arquitectura

```
STOCK FISICO (Google Sheet)
  └── actualizarFotos.gs ── POST ──► n8n webhook (nodes.kansai.com.ar)
                                       ├─ subir:    SharePoint (Graph) → descarga → FTP (FTPS)
                                       └─ eliminar: borra en FTP
  └── sincronizarCatalogo.gs ──► copia la columna FOTOS (Y) al catálogo destino (col. M)
```

- Las fotos quedan **persistidas en la columna Y** del libro origen, así no se re-sube
  nada al FTP en cada corrida.
- `sincronizarCatalogo.gs` solo **arrastra** esa columna al destino.

---

## 1. Workflow n8n

Archivo: `n8n_webhook_fotos_usados.json` — importar en n8n (**Import from File**).

### Webhook
- Método **POST**, path `fotos-usados` → URL final: `https://nodes.kansai.com.ar/webhook/fotos-usados`
  (en pruebas, n8n expone además `/webhook-test/fotos-usados`).
- Body JSON esperado:
  ```json
  { "patente": "AD990UD", "marca": "Toyota", "accion": "subir" }
  ```
  `marca` es opcional. `accion` = `subir` | `eliminar`.
- Header de seguridad: `x-api-token: <WEBHOOK_TOKEN>`.

### Credencial de SharePoint
Los nodos **GraphResolveSite, GraphSearchPatente, GraphListPatenteChildren,
GraphListWebKaiFiles** usan Microsoft Graph. Al importar, en cada uno:
- Authentication → **Predefined Credential Type**
- Elegir la credencial **OAuth2 Microsoft Graph (n8n-sharepoint-sync)**.

> Si esa credencial no aparece bajo "Microsoft OAuth2 API", volvé a seleccionarla
> con el tipo correcto en los 4 nodos. La credencial debe tener permiso de lectura
> sobre el sitio (p. ej. `Sites.Read.All`).

### Variables de entorno (en el server de n8n)
Los secretos **no** van en el JSON. Definí en el entorno de n8n:

| Variable | Valor |
|---|---|
| `WEBHOOK_TOKEN` | token compartido con el `.gs` (inventá uno) |
| `FTP_HOST` | `ftp.kansai.com.ar` |
| `FTP_PORT` | `21` |
| `FTP_USER` | `u917645178.n8nftpkansai` |
| `FTP_PASSWORD` | (la contraseña del FTP) |
| `FTP_DIR` | `/home/u917645178/domains/kansai.com.ar/public_html/fotos_usados` |
| `PUBLIC_BASE_URL` | `http://www.kansai.com.ar/fotos_usados/` |

### Habilitar la librería FTP en los nodos Code
Los nodos **FtpSubir** y **FtpEliminar** usan `basic-ftp` (ya viene con n8n) y `stream`.
En el entorno de n8n hay que permitir su `require`:

```
NODE_FUNCTION_ALLOW_EXTERNAL=basic-ftp
NODE_FUNCTION_ALLOW_BUILTIN=stream
```

(Si ya tenés otros módulos permitidos, agregalos separados por coma, o usá `*`.)
También debe estar permitido el acceso a `$env` en nodos (por defecto lo está:
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`).

> **FTPS:** el workflow conecta con TLS explícito (`secure: true`) y
> `rejectUnauthorized: false` para tolerar certificados del hosting. Si Hostinger
> no acepta FTPS y sí FTP plano, cambiá `secure: true` a `false` en `init.js`
> (constante `cfg.ftp.secure`) y reimportá.

### Respuesta del webhook
```jsonc
// subir OK
{ "ok": true, "accion": "subir", "patente": "AD990UD", "total": 3,
  "archivos": ["AD990UD_1.jpg","AD990UD_2.jpg","AD990UD_3.jpg"],
  "markdown": "![AD990UD_1](http://www.kansai.com.ar/fotos_usados/AD990UD_1.jpg)\n..." }

// sin fotos / no encontrado  (el .gs deja la celda en blanco)
{ "ok": false, "mensaje": "La carpeta WebKai no tiene fotos" }

// eliminar
{ "ok": true, "accion": "eliminar", "patente": "AD990UD", "total": 2,
  "eliminados": ["AD990UD_1.jpg","AD990UD_2.jpg"], "mensaje": "Se eliminaron 2 archivo(s)..." }
```

---

## 2. Apps Script

### `actualizarFotos.gs` (en el libro ORIGEN "STOCK FISICO")
Completá en `AF_CONFIG`:
- `WEBHOOK_TOKEN` = el mismo valor que pusiste en n8n.
- El resto ya viene con los valores detectados: hoja `STOCK FISICO`, encabezados en
  la fila 3, columnas por nombre `DOMINIO` / `MARCA` / `FECHA DE RESERVA`, fotos en `Y`.

Creá un **disparador por tiempo** (Triggers → Add Trigger → `actualizarFotos`,
time-driven). Solo procesa filas nuevas (sin FOTOS) o bajas (con FECHA DE RESERVA),
así cada corrida es liviana.

### `sincronizarCatalogo.gs` (en el libro DESTINO del catálogo)
Ya modificado para copiar la columna de fotos (Y del origen) al **destino en la
columna M**. Si el catálogo necesita la columna en otro lugar, ajustá `TOTAL_COLS`
y el orden del `push`.

---

## 3. Supuestos a verificar (cambios de 1 línea si algo difiere)

| Dónde | Supuesto | Dónde cambiarlo |
|---|---|---|
| Destino catálogo | FOTOS va en la columna **M** | `sincronizarCatalogo.gs` → `TOTAL_COLS` |
| SharePoint | Sitio `CentroDeDocumentacion`, biblioteca por defecto | `init.js` → `cfg.siteHost/sitePath` |
| SharePoint | Ruta base `Kansai/.../Fotos Usados` | `init.js` → `cfg.basePath` |
| SharePoint | Carpeta de fotos se llama `WebKai` | `init.js` → `cfg.webkaiName` |
| FTP | FTPS en puerto 21 | `init.js` → `cfg.ftp.secure` / env `FTP_PORT` |

> Nota sobre la búsqueda: la carpeta de la patente se ubica con la búsqueda de Graph
> (`search`) bajo *Fotos Usados*. Si la indexación de SharePoint estuviera demorada
> para una carpeta recién creada, puede no encontrarla hasta que indexe.

---

## 4. Prueba rápida

```bash
curl -X POST https://nodes.kansai.com.ar/webhook/fotos-usados \
  -H "Content-Type: application/json" \
  -H "x-api-token: TU_TOKEN" \
  -d '{"patente":"AD990UD","marca":"Toyota","accion":"subir"}'
```

Conviene ejecutar el workflow **nodo por nodo** la primera vez (botón *Execute Workflow*)
para validar credencial de Graph y conexión FTPS.

---

## 5. Variante más nativa

`n8n_webhook_fotos_usados_nativo.json` — misma lógica, pero con la preparación de
datos, la validación y el ruteo hechos con **nodos nativos** en vez de un Code:

| Parte | Implementación |
|---|---|
| Entrada + config + normalización | **Set** (`Preparar`) con expresiones y `$env` |
| Validación de token/parámetros | **IF** (`$json.valido`) + **Switch** por acción |
| Descubrimiento en SharePoint | **HTTP Request** (ya era nativo) |
| Elegir carpeta de patente | **Code** — se mantiene por el *fuzzy* de marca mal escrita |
| Ubicar WebKai | **Code** — se mantiene por la respuesta limpia de "no encontrado" |
| Subir / eliminar en FTP | **Code** (`basic-ftp`) — se mantiene por **FTPS** (TLS explícito) |

Se conserva JavaScript **solo donde conviene**: coincidencia aproximada de marca,
detección de WebKai y el I/O de FTPS (el nodo FTP nativo no soporta TLS explícito).
La respuesta de validación (`Responder Validacion`) devuelve solo `{ ok, mensaje }`
para no exponer la config.

> Mismos requisitos que la versión original: credencial de Graph en los 4 nodos
> HTTP, env vars, y `NODE_FUNCTION_ALLOW_EXTERNAL=basic-ftp`. Si tu hosting
> ofreciera **SFTP**, los dos Code de FTP podrían reemplazarse por el **nodo FTP
> nativo en modo SFTP** y quedaría solo 1 Code (el fuzzy).

Las dos versiones son equivalentes en comportamiento; usá la que prefieras mantener.
