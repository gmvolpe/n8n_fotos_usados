# Requerimientos

Lo que tiene que estar resuelto **antes** de seguir el [instructivo de instalación](instalacion.md).

## 1. Plataformas

| Plataforma | Para qué | Qué hace falta |
|---|---|---|
| **n8n** | Ejecuta el circuito | Una instancia accesible por HTTPS desde internet (hoy: `nodes.kansai.com.ar`). Puede ser self-hosted o n8n Cloud |
| **Microsoft 365 / SharePoint** | Origen de las fotos | Un sitio de SharePoint con las fotos y una app registrada en Entra ID para leerlo vía Microsoft Graph |
| **Hosting web (Hostinger)** | Destino de las fotos | Acceso FTP a la carpeta pública donde se sirven las fotos |
| **Google Workspace** | Planilla de stock y disparador | La planilla de stock y permisos para ejecutar Apps Script sobre ella |

> La instancia de n8n tiene que ser **alcanzable desde Google** (Apps Script la llama por
> HTTPS). Una instancia local sin exponer no sirve.

## 2. Accesos y credenciales

Hay que conseguir estos datos antes de empezar. Ninguno se inventa durante la instalación,
salvo el token del webhook.

### Microsoft Graph (SharePoint)

- Una **app registrada** en Entra ID (Azure AD) con:
  - `Client ID`, `Client Secret` y `Tenant ID`
  - Permiso de aplicación **`Sites.Read.All`**, con *admin consent* otorgado
- El **host** y la **ruta** del sitio de SharePoint (hoy: sitio `CentroDeDocumentacion`)

> El proceso **solo lee** de SharePoint: descarga las fotos pero nunca modifica ni borra
> nada allí.

### FTP del sitio web

- Host (IP o nombre), usuario y contraseña de una **cuenta FTP**
- Conviene que sea una **cuenta FTP adicional restringida** a la carpeta de fotos de
  usados, y no la cuenta principal del hosting. Así el proceso no puede escribir en el
  resto del sitio
- Cómo crearla está en [configuracion_cliente_ftp_hostinger.md](configuracion_cliente_ftp_hostinger.md)

> Se usa **FTP plano en el puerto 21**, que es lo documentado por Hostinger para cuentas
> adicionales. El nodo FTP de n8n no soporta FTPS (TLS explícito).

### Google

- Permiso de edición sobre la planilla de stock
- Permiso para crear y ejecutar un proyecto de Apps Script vinculado a esa planilla

### Token del webhook

- Un **secreto que inventás vos** (por ejemplo, 64 caracteres hexadecimales). Se usa en
  dos lugares que tienen que coincidir: la credencial *Header Auth* de n8n y la constante
  `WEBHOOK_TOKEN` del Apps Script

Para generar uno:

```bash
openssl rand -hex 32
```

## 3. Estructura esperada en SharePoint

El circuito busca las fotos siguiendo esta estructura. Si no se respeta, no encuentra nada.

```
Kansai/.../Fotos Usados/
└── <MARCA>/
    └── <PATENTE>/          ← se ubica por búsqueda de Graph
        └── WebKai/         ← SOLO de acá se toman las fotos
            ├── foto1.jpg
            ├── foto2.jpg
            └── ...
```

Dos detalles que importan:

- **La subcarpeta tiene que llamarse `WebKai`.** Son las fotos con el tamaño correcto para
  la web. Si no existe, el proceso responde que no hay fotos y no publica nada.
- **El orden de publicación es el orden alfabético de los nombres de archivo.** Las fotos
  se renombran a `PATENTE_1.ext`, `PATENTE_2.ext`, etc. siguiendo ese orden.

> SharePoint puede tardar en indexar una carpeta recién creada. Si una unidad nueva no
> aparece, puede ser indexación demorada y no un error de configuración.

## 4. Estructura esperada en la planilla de stock

En la hoja **`STOCK FISICO`**, con los encabezados en la **fila 3** y los datos desde la
**fila 4**:

| Encabezado | Uso |
|---|---|
| `DOMINIO` | La patente. Es la clave de todo el circuito |
| `MARCA` | Ayuda a ubicar la carpeta en SharePoint. Tolera errores de tipeo |
| `FECHA DE RESERVA` | Si tiene fecha, se dan de baja las fotos |
| `FOTOS` | Donde el proceso escribe el markdown de las fotos publicadas |

Las columnas se ubican **por el texto del encabezado**, no por su letra, así que se pueden
mover de lugar sin romper nada. Si no existe un encabezado `FOTOS`, se usa la columna `Y`
como respaldo.

## 5. Conocimientos para operar

No hace falta saber programar para usarlo, pero sí para instalarlo:

- Importar un workflow y crear credenciales en **n8n**
- Registrar una aplicación en **Entra ID** y otorgar permisos de Graph
- Pegar y configurar un script en **Google Apps Script**, y crear un disparador por tiempo
