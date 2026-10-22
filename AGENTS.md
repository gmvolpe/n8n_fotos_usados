# AGENTS.md

Contexto para agentes de IA que trabajen en este repositorio. Si vas a tocar el workflow
de n8n o los Apps Script, leé primero la sección **Trampas conocidas**: casi todas se
descubrieron depurando en producción y es fácil volver a caer en ellas.

## Qué es este proyecto

Automatiza la publicación de las fotos de autos usados de Kansai en el sitio web.
No es una aplicación: son **tres piezas de configuración** que se instalan en servicios
de terceros.

```
Google Sheet (STOCK FISICO)
  └── actualizarFotos.gs ──POST──► n8n webhook (nodes.kansai.com.ar)
                                     ├─ subir:    SharePoint (Graph) → descarga → FTP
                                     └─ eliminar: borra en FTP
  └── sincronizarCatalogo.gs ──► copia la columna FOTOS (Y) al catálogo destino (col. M)
```

No hay build, no hay tests automatizados, no hay dependencias que instalar. Los cambios se
verifican **ejecutando el workflow en n8n** o la función desde el editor de Apps Script.

## Estructura

| Ruta | Qué contiene |
|---|---|
| `README.md` | Explicación funcional del proyecto |
| `src/actualizarFotos.gs` | Apps Script del libro STOCK FISICO. Decide qué publicar y qué dar de baja |
| `src/sincronizarCatalogo.gs` | Apps Script que arrastra la columna de fotos al catálogo |
| `src/n8n_webhook_fotos_usados.json` | Workflow de n8n completo, importable |
| `docs/instalacion.md` | Instructivo de instalación paso a paso |
| `docs/requerimientos.md` | Qué hace falta antes de instalar |
| `docs/referencia-tecnica.md` | Detalle de nodos, credenciales y respuestas del webhook |
| `docs/configuracion_cliente_ftp_hostinger.md` | FTP/SFTP en Hostinger |
| `docs/informe_gerencia.md` | Informe de la implementación, para gerencia |

El `.json` del workflow es un **export de n8n**: se edita en la UI de n8n y se re-exporta,
no se edita a mano salvo para cambios triviales.

## Trampas conocidas

### 1. El nodo FTP rompe la metadata de *paired item*

La más importante. El nodo FTP de n8n **no propaga el paired item**, así que cualquier
referencia `$('Nodo').item` ubicada **después** de un nodo FTP falla con:

```
Paired item data for item from node X is unavailable
```

Por eso los Code nodes usan **`$('Nodo').first().json`** para los nodos de un solo ítem
(`Preparar`, las respuestas de Graph).

**La única excepción** es el campo *Path* de `SubirFoto`, que usa
`$('RetomarArchivos').item.json.rutaDestino` porque **necesita** la correspondencia uno a
uno entre cada foto descargada y su nombre destino.

Si agregás un Code node después de un nodo FTP, usá `.first().json`.

### 2. FTP plano, no FTPS

El nodo FTP nativo de n8n **no soporta FTPS** (TLS explícito). Se usa FTP plano en el
puerto 21, que además es la configuración documentada de Hostinger para cuentas
adicionales. No es un descuido: está probado contra el servidor y funciona.

### 3. Las fotos salen solo de `WebKai`

Es deliberado: son las del tamaño correcto para la web. Si la carpeta no existe, el flujo
responde `ok:false` y **no publica nada**. No agregues un fallback a otra carpeta: subiría
fotos con el tamaño equivocado.

### 4. La columna FOTOS es el estado, no un reporte

El flujo no re-sube nada en cada corrida: si la celda `FOTOS` tiene contenido y el auto no
está reservado, no hace nada. Esa celda **es** la marca de "ya publicado".

Consecuencia: para forzar la republicación de una unidad hay que **vaciar la celda**.

### 5. La baja borra por prefijo de patente

`eliminar` lista el FTP y borra todo lo que empiece con la patente. Si alguna vez se cambia
el criterio de nombrado de los archivos (por ejemplo, nombrarlos por modelo en vez de por
patente), **hay que cambiar también esta lógica** o las bajas dejan de funcionar.

### 6. El markdown de la columna FOTOS es markdown, nada más

El texto alternativo de `![alt](url)` es cosmético. No cambia el nombre del archivo en el
servidor ni cómo lo muestra WhatsApp, que **no interpreta markdown**. Si se quisiera que el
archivo se llame distinto, hay que renombrarlo en el FTP (ver trampa 5).

### 7. Las columnas se buscan por encabezado, no por letra

`actualizarFotos.gs` ubica `DOMINIO`, `MARCA`, `FECHA DE RESERVA` y `FOTOS` por el **texto
del encabezado** en la fila 3. Se pueden mover de lugar sin romper nada. Solo hay un
fallback por letra: columna `Y` si no existe un encabezado `FOTOS`.

### 8. El recorrido está acotado por `FILA_FIN`

El script recorre hasta `AF_CONFIG.FILA_FIN` (500). Si el stock crece más allá, hay que
subirlo. Está acotado a propósito: recorrer la hoja entera hacía que la ejecución tardara
de más.

## Deuda conocida

- **El token del webhook está hardcodeado en `src/actualizarFotos.gs` y versionado en git.**
  Está en el historial, así que borrarlo del archivo no lo des-expone: hay que **rotarlo**
  en la credencial *Header Auth* de n8n y en el script. Es la razón por la que figura como
  pendiente en el README.
- No hay disparador por tiempo activo todavía: el circuito corre cuando alguien lo dispara.
- La copia del listado al catálogo publicado no está validada de punta a punta.

## Convenciones

- **Todo en español** (Argentina): código, comentarios, documentación y mensajes de commit.
- **Mensajes de commit sin tildes**, en infinitivo y en una línea de asunto corta
  ("Acotar el recorrido a las filas realmente usadas de la hoja"), con el cuerpo explicando
  el porqué.
- Los nombres de nodos de n8n se citan tal cual aparecen en la UI (`Preparar`, `SubirFoto`,
  `RetomarArchivos`), sin traducir.
- El diagrama del circuito vive en `docs/circuito_fotos_usados.svg` con colores literales,
  para que se vea fuera del documento compartido donde se diseñó.

## Cómo verificar un cambio

No hay suite de tests. Para validar:

1. **Workflow de n8n:** *Execute Workflow* y un `curl` a `/webhook-test/fotos-usados` con
   una patente que tenga fotos. Revisar nodo por nodo.
2. **Apps Script:** ejecutar `probarWebhook` desde el editor y mirar el registro.
3. **Punta a punta:** los tres pasos de la sección *Verificación final* de
   [docs/instalacion.md](docs/instalacion.md).

Cuidado al probar: una ejecución real **sube o borra archivos en el sitio web de
producción**. No hay entorno de staging.
