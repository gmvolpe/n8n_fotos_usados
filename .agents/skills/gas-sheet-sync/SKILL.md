---
name: gas-sheet-sync
description: >-
  Guía y procedimientos para desarrollar, desplegar, depurar y mantener scripts de
  Google Apps Script (GAS) encargados de la sincronización automatizada y programada
  entre Google Sheets, mapeo de datos y gestión de triggers time-driven.
---

# Google Apps Script - Sheet Synchronization Skill

Esta habilidad proporciona estándares, patrones y procedimientos para implementar sincronizaciones de datos confiables entre hojas de cálculo de Google (Google Sheets) utilizando Google Apps Script.

---

## 1. Principios de Diseño para Sincronización en Google Sheets

1. **Operaciones en Lote (Batch Operations)**:
   - NUNCA llamar a `getValue()` o `setValue()` dentro de bucles.
   - Leer todo el rango origen con `getValues()` o `getDisplayValues()` en una sola llamada.
   - Escribir todo el bloque destino con `setValues()` en una sola operación.

2. **Mapeo Dinámico de Columnas**:
   - No depender exclusivamente de índices fijos de columnas (A, B, C, etc.) si la estructura origen puede cambiar de orden o incorporar columnas intermedias.
   - Implementar un buscador de encabezados normalizado (insensible a mayúsculas, minúsculas, espacios y tildes).

3. **Filtrado Robusto de Filas**:
   - Omitir filas vacías, subtotales o encabezados intermedios.
   - Definir una columna clave de control (por ejemplo, `Modelo y Versión`) para determinar si una fila contiene un registro válido.

4. **Gestión de Triggers Temporales**:
   - Antes de crear un trigger con `everyHours(1)`, auditar y eliminar triggers previos con el mismo nombre para evitar ejecuciones duplicadas innecesarias.
   - Proporcionar funciones administrativas `setupTrigger()` y `removeTriggers()`.

---

## 2. Flujo de Sincronización Estándar

```
[Trigger (15 min) o Manual]
         │
         ▼
[Validación de Conexión] ──(SpreadsheetApp.openById)
         │
         ▼
[Lectura de Metadatos y Encabezados Origen]
         │
         ▼
[Extracción y Filtrado en Memoria] (Filtrar filas no vacías, mapear columnas)
         │
         ▼
[Preparación de Hoja Destino] (Limpiar datos antiguos respetando encabezados)
         │
         ▼
[Escritura en Lote] (setValues)
         │
         ▼
[Registro de Estado / Timestamps] (ScriptProperties / Logger)
```

---

## 3. Manejo de Cuotas y Límites de Google Apps Script

| Parámetro | Límite Estándar (Consumidor / Workspace) | Estrategia de Mitigación |
| :--- | :--- | :--- |
| Tiempo máximo de ejecución | 6 minutos / ejecución | Procesar todo en memoria y escribir con `setValues()` (tarda < 2 seg). |
| Frecuencia mínima de trigger por minuto | 1, 5, 10, 15, 30 minutos | Para sincronización periódica, 15 minutos cumple holgadamente. |
| Lecturas/escrituras diarias | 20,000 llamadas API/día | Al usar operaciones en lote (1 lectura + 1 escritura por ciclo), solo se consumen ~192 llamadas al día (96 ejecuciones x 2). |

---

## 4. Estructura de Proyecto Recomendada

```
.
├── src/
│   ├── Code.js              # Lógica principal de sincronización y triggers
│   └── appsscript.json      # Manifiesto de GAS con scopes OAuth
├── docs/                    # Archivos de referencia y especificaciones
├── AGENTS.md                # Especificaciones técnicas para agentes de IA
└── README.md                # Manual de usuario y configuración funcional
```

---

## 5. Procedimiento para Probar y Desplegar

1. Abrir la hoja destino en Google Sheets.
2. Ir a **Extensiones** > **Apps Script**.
3. Copiar el contenido de `src/Code.js` en el editor.
4. Actualizar las constantes de configuración (`SOURCE_SPREADSHEET_ID`, `DESTINATION_SPREADSHEET_ID`, nombres de hojas).
5. Ejecutar la función de prueba `syncPriceList()` manualmente y autorizar los permisos requeridos.
6. Ejecutar `setupTrigger()` para activar la ejecución automática cada 1 hora.
