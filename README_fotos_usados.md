# Sincronización de fotos de usados (SharePoint → FTP)

Automatiza la publicación de las fotos de autos usados en el sitio web, tomándolas
de SharePoint y subiéndolas al FTP, controlado desde la planilla de stock.

## Arquitectura

```
STOCK FISICO (Google Sheet)
  └── actualizarFotos.gs ── POST ──► n8n webhook (nodes.kansai.com.ar)
                                       ├─ subir:    SharePoint (Graph) → descarga → FTP
                                       └─ eliminar: borra en FTP
  └── sincronizarCatalogo.gs ──► copia la columna FOTOS (Y) al catálogo destino (col. M)
```

Las fotos quedan **persistidas en la columna Y** del libro origen, así no se re-sube
nada al FTP en cada corrida. `sincronizarCatalogo.gs` solo **arrastra** esa columna.

---

## 1. Workflow n8n

Archivo: `n8n_webhook_fotos_usados.json` — importar en n8n (**Import from File**).

**Sin variables de entorno y sin librerías externas.** Toda la configuración está
fija dentro del nodo **`Preparar`**, y los secretos viven en **credenciales de n8n**
que administrás desde la UI.

### Webhook
- Método **POST**, path `fotos-usados` → `https://nodes.kansai.com.ar/webhook/fotos-usados`
  (en pruebas, n8n expone además `/webhook-test/fotos-usados`).
- Body JSON:
  ```json
  { "patente": "AD990UD", "marca": "Toyota", "accion": "subir" }
  ```
  `marca` es opcional. `accion` = `subir` | `eliminar`.

### Las 3 credenciales a configurar

Al importar, los nodos quedan apuntando a credenciales inexistentes. Creá estas tres
y seleccionálas en los nodos correspondientes:

**1. Header Auth** (autenticación del webhook) — nodo **Webhook**
```
Tipo:          Header Auth
Name:          Header Auth Fotos Usados
Header Name:   x-api-token
Header Value:  <un secreto que inventes>
```
El mismo secreto va en `actualizarFotos.gs` → `AF_CONFIG.WEBHOOK_TOKEN`. Cualquier
llamada sin ese header recibe **403** y no entra al flujo.

**2. Microsoft Graph OAuth2** — nodos `GraphResolveSite`, `GraphSearchPatente`,
`GraphListPatenteChildren`, `GraphListWebKaiFiles`
- Authentication → **Predefined Credential Type** → la credencial
  **OAuth2 Microsoft Graph (n8n-sharepoint-sync)**. Necesita lectura del sitio
  (p. ej. `Sites.Read.All`).

**3. FTP** — nodos `ListarPrevio`, `BorrarPrevio`, `SubirFoto`, `ListarEliminar`, `BorrarEliminar`
```
Tipo:      FTP
Name:      FTP Kansai fotos_usados
Host:      89.116.58.48      (o ftp.kansai.com.ar)
Port:      21
Username:  u917645178.n8nftpkansai
Password:  <la contraseña del FTP>
```

> **Protocolo:** los nodos usan **FTP plano (puerto 21)**, que es la configuración
> documentada de Hostinger (ver `configuracion_cliente_ftp_hostinger.md`). El nodo FTP
> nativo de n8n **no soporta FTPS** (TLS explícito); por eso se usa FTP plano, que es
> lo que habilita usar una credencial administrable por el usuario.
> **Probado y funcionando** contra el servidor (listar, borrar y subir).

### Sin directorio
La cuenta `u917645178.n8nftpkansai` es una **cuenta FTP adicional restringida**, así que
cae directo en `fotos_usados`. Por eso el campo `ftpPath` del nodo `Preparar` es `/`
y **no se hace ningún `cd`**.

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

### Qué hace cada rama

**subir:** resuelve el sitio → busca la carpeta de la patente bajo *Fotos Usados*
(fuzzy de marca, primera coincidencia) → ubica `WebKai` → arma los nombres
`patente_N.ext` ordenados por nombre → **lista y borra en el FTP lo que empiece con la
patente** → descarga cada foto y la sube → devuelve el markdown.

**eliminar:** lista el FTP, filtra lo que empieza con la patente, borra y confirma.

> Las fotos se toman **exclusivamente** de `WebKai` (son las de tamaño adecuado). Si esa
> carpeta no existe, responde `ok:false` y no sube nada.

### Nota de mantenimiento: paired item

El **nodo FTP no propaga la metadata de *paired item***, así que cualquier referencia
`$('Nodo').item` ubicada **después** de un nodo FTP falla con
*"Paired item data for item from node X is unavailable"*.

Por eso los Code nodes usan **`$('Nodo').first().json`** para los nodos de un solo ítem
(`Preparar`, las respuestas de Graph). La única excepción es el campo *Path* de
**`SubirFoto`**, que usa `$('RetomarArchivos').item.json.rutaDestino` porque **necesita**
la correspondencia uno a uno entre cada foto descargada y su nombre destino.

---

## 2. Apps Script

### `actualizarFotos.gs` (en el libro ORIGEN "STOCK FISICO")
Completá en `AF_CONFIG`:
- `WEBHOOK_TOKEN` = el mismo secreto de la credencial **Header Auth**.
- El resto ya viene con los valores detectados: hoja `STOCK FISICO`, encabezados en
  la fila 3, columnas por nombre `DOMINIO` / `MARCA` / `FECHA DE RESERVA`, fotos en `Y`.

Reglas por fila:

| Condición | Acción |
|---|---|
| Tiene DOMINIO · FECHA DE RESERVA vacía · FOTOS vacía | `subir` → markdown en Y (o blanco si no hay fotos) |
| FECHA DE RESERVA con fecha · FOTOS con contenido | `eliminar` → limpia Y |
| FOTOS ya cargada (sin reserva) | nada (persistencia) |
| FECHA DE RESERVA con fecha · FOTOS ya vacía | nada |

Creá un **disparador por tiempo** (Triggers → Add Trigger → `actualizarFotos`).

### `sincronizarCatalogo.gs` (en el libro DESTINO del catálogo)
Idéntico al original salvo que ahora copia la columna de fotos (Y del origen) al
destino en la **columna M**.

---

## 3. Supuestos a verificar

| Dónde | Supuesto | Dónde cambiarlo |
|---|---|---|
| Destino catálogo | FOTOS va en la columna **M** | `sincronizarCatalogo.gs` → `TOTAL_COLS` |
| FTP | FTP plano, puerto 21, raíz = `fotos_usados` | credencial FTP + `ftpPath` en `Preparar` |
| SharePoint | Sitio `CentroDeDocumentacion`, biblioteca por defecto | nodo `Preparar` → `siteHost` / `sitePath` |
| SharePoint | Ruta base `Kansai/.../Fotos Usados` | nodo `Preparar` → `basePath` |
| SharePoint | Carpeta de fotos se llama `WebKai` | nodo `Preparar` → `webkaiName` |

> La carpeta de la patente se ubica con la búsqueda de Graph (`search`) bajo *Fotos Usados*.
> Si la indexación de SharePoint estuviera demorada para una carpeta recién creada, puede
> no encontrarla hasta que indexe.

---

## 4. Prueba rápida

```bash
curl -X POST https://nodes.kansai.com.ar/webhook/fotos-usados \
  -H "Content-Type: application/json" \
  -H "x-api-token: TU_TOKEN" \
  -d '{"patente":"AD990UD","marca":"Toyota","accion":"subir"}'
```

Conviene ejecutar el workflow **nodo por nodo** la primera vez (botón *Execute Workflow*)
para validar las tres credenciales.
