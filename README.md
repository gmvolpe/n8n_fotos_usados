# Fotos de usados — publicación automática

Publica en el sitio web las fotos de los autos usados que están en SharePoint, y las
retira cuando el auto se reserva. Todo se gobierna desde la planilla de stock que
Comercial ya usa: no hay una herramienta nueva que aprender ni fotos que subir a mano.

![Circuito de publicación de fotos: de la planilla al sitio web](docs/circuito_fotos_usados.svg)

## Qué resuelve

Antes, publicar las fotos de una unidad era una tarea manual y repetitiva: entrar a
SharePoint, ubicar la carpeta del auto, descargar las fotos preparadas para web,
renombrarlas una por una siguiendo la convención del sitio y subirlas por FTP. Eso
traía tres problemas recurrentes:

- **Demora** entre el ingreso del auto y su aparición en la web.
- **Fotos de autos ya reservados** que seguían publicadas, porque darlas de baja era
  otra tarea manual que se postergaba.
- **Errores de nombrado** que hacían que una foto no se mostrara.

## Cómo funciona

El circuito corre solo, cada cierto tiempo, y se apoya en dos datos que Comercial ya
carga en la planilla: el **dominio** (patente) del auto y su **fecha de reserva**.

1. **Planilla de stock** — un Apps Script recorre las filas y decide qué hacer con cada auto.
2. **Webhook de n8n** — recibe el pedido (`patente`, `marca`, `accion`) y lo ejecuta.
3. **SharePoint** — se ubica la carpeta de la patente y se toman las fotos de la subcarpeta `WebKai`.
4. **Sitio web** — las fotos se suben por FTP, renombradas como `PATENTE_1.jpg`, `PATENTE_2.jpg`, …
5. **Vuelta a la planilla** — el listado de fotos publicadas queda asentado en la columna `FOTOS`.

Como el resultado queda registrado en la planilla, una unidad ya publicada **no se
vuelve a procesar** en las corridas siguientes.

## Las reglas

| Situación del auto en la planilla | Acción automática |
|---|---|
| Disponible y aún sin fotos publicadas | Publica las fotos y deja el listado registrado |
| Se le carga una fecha de reserva | Retira sus fotos del sitio |
| Ya tiene fotos publicadas y sigue disponible | No hace nada |
| Sin fotos cargadas en SharePoint | Deja el registro vacío, sin publicar nada |

Dos criterios de diseño que conviene conocer:

- **Solo se publican las fotos de la carpeta `WebKai`.** Son las que tienen el tamaño
  correcto para la web. Si esa carpeta no existe para una unidad, el proceso no publica
  nada en vez de tomar imágenes de otro lado.
- **El nombre de la marca tolera errores de tipeo.** Si en la planilla figura una
  variante mal escrita, el proceso igual encuentra la carpeta correcta.

## Estructura del repositorio

```
.
├── README.md                 Este archivo: explicación funcional
├── AGENTS.md                 Contexto del proyecto para agentes de IA
├── src/                      Código
│   ├── actualizarFotos.gs            Apps Script del libro STOCK FISICO
│   ├── sincronizarCatalogo.gs        Apps Script que arrastra la columna al catálogo
│   └── n8n_webhook_fotos_usados.json Workflow de n8n (importable)
└── docs/                     Documentación
    ├── instalacion.md                Instructivo de instalación paso a paso
    ├── requerimientos.md             Qué hace falta antes de instalar
    ├── referencia-tecnica.md         Detalle del workflow, nodos y credenciales
    ├── configuracion_cliente_ftp_hostinger.md  FTP/SFTP en Hostinger
    └── informe_gerencia.md           Informe de la implementación
```

## Puesta en marcha

Leé primero **[docs/requerimientos.md](docs/requerimientos.md)** y después seguí
**[docs/instalacion.md](docs/instalacion.md)**. El detalle técnico de cada nodo y de las
credenciales está en **[docs/referencia-tecnica.md](docs/referencia-tecnica.md)**.

## Estado

El circuito está construido y probado de punta a punta: se validó la búsqueda en
SharePoint, la publicación de fotos en el sitio, la baja de fotos y el registro en la
planilla.

Pendiente para dejarlo en régimen:

- [ ] Activar el disparador por tiempo en Apps Script, para que corra sin intervención
- [ ] **Rotar el token del webhook** (hoy está hardcodeado en el código y versionado en git)
- [ ] Validar la copia del listado de fotos al catálogo publicado

Dos límites a tener en cuenta para la operación:

- **Depende de que las fotos estén en SharePoint con la estructura de carpetas acordada.**
  Si una unidad no tiene su carpeta `WebKai`, no se publica. El proceso lo informa, pero
  cargar las fotos sigue siendo responsabilidad de quien las toma.
- **Las fotos se publican una sola vez por unidad.** Si después se agregan o cambian fotos
  en SharePoint, hay que pedir explícitamente la actualización de esa unidad (vaciar la
  celda `FOTOS` de esa fila).
