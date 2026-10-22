# Instructivo de instalación

Pasos para dejar el circuito funcionando desde cero. Antes de empezar, revisá que tengas
todo lo de [requerimientos.md](requerimientos.md): sin las credenciales de Graph y de FTP
no se puede avanzar más allá del paso 2.

Tiempo estimado: **45–60 minutos**, la mayor parte en conseguir los accesos.

---

## Paso 1 — Importar el workflow en n8n

1. Entrar a n8n.
2. **Workflows → Import from File**.
3. Elegir `src/n8n_webhook_fotos_usados.json`.

El workflow queda importado pero **todavía no funciona**: los nodos apuntan a credenciales
que no existen en tu instancia. Eso se resuelve en el paso siguiente.

No hace falta configurar variables de entorno ni instalar librerías: toda la configuración
está fija dentro del nodo **`Preparar`**, y los secretos viven en las credenciales de n8n.

---

## Paso 2 — Crear las tres credenciales

### 2.1 Header Auth (protege el webhook)

Esta es la que impide que cualquiera dispare el proceso.

```text
Tipo:          Header Auth
Name:          Header Auth Fotos Usados
Header Name:   x-api-token
Header Value:  <el token que generaste>
```

Asignarla al nodo **`Webhook`**. Guardá el token a mano: lo vas a necesitar de nuevo en el
paso 6. Cualquier llamada sin ese header recibe **403** y no entra al flujo.

### 2.2 Microsoft Graph OAuth2 (lee SharePoint)

```text
Tipo:          Microsoft OAuth2 API (predefined credential type)
Name:          OAuth2 Microsoft Graph (n8n-sharepoint-sync)
Client ID:     <de la app registrada en Entra ID>
Client Secret: <de la app registrada en Entra ID>
Tenant ID:     <el tenant de la organización>
```

Asignarla a los cuatro nodos de Graph:

- `GraphResolveSite`
- `GraphSearchPatente`
- `GraphListPatenteChildren`
- `GraphListWebKaiFiles`

En cada uno: **Authentication → Predefined Credential Type →** la credencial recién creada.

### 2.3 FTP (publica en el sitio)

```text
Tipo:      FTP
Name:      FTP Kansai fotos_usados
Host:      89.116.58.48        (o ftp.kansai.com.ar)
Port:      21
Username:  u917645178.n8nftpkansai
Password:  <la contraseña del FTP>
```

Asignarla a los cinco nodos de FTP:

- `ListarPrevio`
- `BorrarPrevio`
- `SubirFoto`
- `ListarEliminar`
- `BorrarEliminar`

> **Por qué FTP plano y no FTPS:** el nodo FTP nativo de n8n no soporta TLS explícito, y
> FTP plano en el puerto 21 es la configuración documentada de Hostinger para cuentas
> adicionales. Está probado contra el servidor: listar, borrar y subir funcionan.

> **Sin cambio de directorio:** la cuenta `u917645178.n8nftpkansai` es una cuenta FTP
> adicional restringida que cae directo en `fotos_usados`. Por eso el campo `ftpPath` del
> nodo `Preparar` es `/` y el flujo no hace ningún `cd`.

---

## Paso 3 — Ajustar las rutas de SharePoint

Abrir el nodo **`Preparar`** y revisar estos campos contra tu entorno:

| Campo | Valor actual | Qué es |
|---|---|---|
| `siteHost` | host de SharePoint | El dominio `*.sharepoint.com` |
| `sitePath` | `CentroDeDocumentacion` | El sitio donde viven las fotos |
| `basePath` | `Kansai/.../Fotos Usados` | La carpeta raíz desde donde se busca la patente |
| `webkaiName` | `WebKai` | La subcarpeta con las fotos preparadas para web |
| `ftpPath` | `/` | Carpeta destino en el FTP |

Si tu estructura de SharePoint es distinta, este es el único lugar donde se cambia.

---

## Paso 4 — Probar el workflow nodo por nodo

**No saltees este paso.** Es mucho más fácil encontrar un error de credenciales acá que
después, con el Apps Script en el medio.

1. Abrir el workflow y presionar **Execute Workflow**.
2. n8n queda esperando una llamada al webhook de prueba.
3. Desde una terminal, con una patente que sepas que tiene fotos cargadas:

```bash
curl -X POST https://nodes.kansai.com.ar/webhook-test/fotos-usados -H "Content-Type: application/json" -H "x-api-token: TU_TOKEN" -d '{"patente":"AD990UD","marca":"Toyota","accion":"subir"}'
```

Verificá que cada nodo se ponga en verde. Si alguno falla, el panel de n8n muestra en cuál
y por qué.

Una respuesta correcta se ve así:

```json
{
  "ok": true,
  "accion": "subir",
  "patente": "AD990UD",
  "total": 3,
  "archivos": ["AD990UD_1.jpg", "AD990UD_2.jpg", "AD990UD_3.jpg"],
  "markdown": "..."
}
```

Si la unidad no tiene fotos, la respuesta es `{"ok": false, "mensaje": "..."}` y no se
sube nada. Eso **no es un error**: el Apps Script deja la celda en blanco.

---

## Paso 5 — Activar el workflow

Una vez que la prueba pasa, activar el workflow con el interruptor **Active**.

Recién ahí queda disponible la URL de producción:

```text
https://nodes.kansai.com.ar/webhook/fotos-usados
```

> Ojo con la diferencia: `/webhook-test/` solo responde mientras tenés el editor abierto
> en modo *Execute Workflow*. `/webhook/` es la de producción y requiere el workflow activo.

---

## Paso 6 — Instalar el Apps Script en la planilla de stock

1. Abrir la planilla **STOCK FISICO**.
2. **Extensiones → Apps Script**.
3. Pegar el contenido de `src/actualizarFotos.gs`.
4. En el bloque `AF_CONFIG`, completar:

```javascript
SPREADSHEET_ID: 'el ID de la planilla',
WEBHOOK_URL:    'https://nodes.kansai.com.ar/webhook/fotos-usados',
WEBHOOK_TOKEN:  'el mismo token del paso 2.1',
```

El resto de los valores ya vienen con la configuración detectada: hoja `STOCK FISICO`,
encabezados en la fila 3, columnas por nombre y fotos en la columna `Y` como respaldo.

5. Guardar y ejecutar la función **`probarWebhook`** una vez. Google va a pedir autorización
   la primera vez: hay que aceptarla.
6. Revisar el log (**Ver → Registro de ejecución**) para confirmar que la llamada responde.

---

## Paso 7 — Crear el disparador por tiempo

1. En el editor de Apps Script: **Disparadores (reloj) → Añadir disparador**.
2. Configurar:

```text
Función:            actualizarFotos
Implementación:     Head
Origen del evento:  Según tiempo
Tipo de activador:  Temporizador por horas / Cada hora
```

La frecuencia depende de con cuánta urgencia necesiten ver las altas publicadas. Cada hora
es un punto de partida razonable.

---

## Paso 8 — Instalar el script del catálogo

En el libro **destino** del catálogo:

1. **Extensiones → Apps Script**.
2. Pegar el contenido de `src/sincronizarCatalogo.gs`.
3. Verificar que la columna de fotos del destino sea la **M**. Si no, ajustar `TOTAL_COLS`.
4. Crear su propio disparador por tiempo, igual que en el paso 7.

Este script **no llama al webhook**: solo arrastra la columna de fotos del origen al
catálogo destino.

---

## Verificación final

Para confirmar que quedó todo andando, en la planilla de stock:

1. Buscá un auto **con fotos en SharePoint**, sin fecha de reserva y con la celda `FOTOS`
   vacía. Esperá una corrida: la celda debería llenarse con el markdown de las fotos.
2. Abrí una de las URLs del markdown en el navegador: la foto tiene que cargar.
3. Cargale una **fecha de reserva** a ese auto. En la corrida siguiente, la celda `FOTOS`
   debería quedar vacía y las URLs dejar de responder.

Si los tres pasos funcionan, el circuito está completo.

---

## Problemas frecuentes

| Síntoma | Causa probable | Dónde mirar |
|---|---|---|
| **403** al llamar al webhook | El token del header no coincide | Credencial *Header Auth* vs `WEBHOOK_TOKEN` |
| **404** al llamar al webhook | Workflow inactivo, o estás mezclando la URL de test con la de producción | Interruptor *Active* en n8n |
| `ok:false` con "La carpeta WebKai no tiene fotos" | La unidad no tiene subcarpeta `WebKai`, o está vacía | SharePoint |
| No encuentra una carpeta recién creada | Indexación de SharePoint demorada | Esperar y reintentar |
| `530 Login incorrect` en los nodos FTP | Usuario o contraseña FTP | [configuracion_cliente_ftp_hostinger.md](configuracion_cliente_ftp_hostinger.md) |
| "Paired item data is unavailable" | Se agregó una referencia `.item` después de un nodo FTP | Ver la nota de *paired item* en [referencia-tecnica.md](referencia-tecnica.md) |
| La columna `FOTOS` queda en blanco | La unidad no tiene fotos, o el webhook respondió `ok:false` | Log de ejecución de Apps Script |

El detalle de qué hace cada nodo está en [referencia-tecnica.md](referencia-tecnica.md).
