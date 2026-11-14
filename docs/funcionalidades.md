# Funcionalidades

## Barrios

Cada ciclo de ediciones (por ejemplo, 2025–2027) trabaja en un grupo de barrios. La plataforma lo modela así:

- **Edición**: lleva el año del Manos a la Obra de enero. Las visitas diagnósticas de agosto a diciembre preparan el enero siguiente, así que pertenecen a la edición siguiente (las visitas de octubre de 2026 son de la edición 2027). La regla está en `editionOf` (`src/zones.ts`).
- **Ciclo**: un rango de ediciones con su propio grupo de barrios. No está fijo en tres años ni en tres barrios.
- **Asignación**: el barrio de una persona en un ciclo, desde una edición en adelante. La persona puede elegir un barrio la primera vez en el ciclo; queda **pendiente** hasta que el equipo la confirma o asigna otro. Si no elige, el equipo le asigna uno. Después de la confirmación sigue en el mismo barrio durante todo el ciclo, aunque no participe un año.
- **Cambios**: el equipo puede mover a alguien desde una edición; las ediciones anteriores conservan el barrio al que fue.
- **Historial por edición**: se arma con las ediciones en las que la cuenta tiene inscripciones y el barrio vigente en cada una. Un año sin inscripciones no aparece. Para ediciones anteriores a la plataforma, cada persona puede agregar el año y el barrio; el equipo los ve como «informados por la persona».

El equipo confirma, asigna o cambia barrios desde el detalle de cada inscripción en `/admin`. Todavía no hay un panel para cargar ciclos ni para repartir a muchas personas a la vez; se usarán las mismas tablas y la misma acción `zones:assign`. Mientras tanto, cargá cada ciclo con acceso de desarrollador:

```bash
npx convex run zones:createCycle '{"startYear":2025,"endYear":2027,"zones":["Barrio A","Barrio B","Barrio C"]}'
```

Usá `--prod` para producción y reemplazá los nombres por los barrios reales. Los ciclos no pueden superponerse. Sin un ciclo cargado para la edición actual, la cuenta indica que los barrios todavía no están disponibles.

La función de inventarios agrega la tabla `inventories` y las operaciones privadas `inventories:listAdmin`, `inventories:save` e `inventories:remove`. Desplegá también estos cambios de backend antes de publicar el frontend. No requiere migrar actividades ni inscripciones existentes. La demo conserva sus datos anteriores y empieza con una lista de inventarios vacía.

## Aprobar inscripciones

Al crear o editar una actividad, activá **Requerir aprobación manual** para que las nuevas solicitudes queden pendientes. Tanto las pendientes como las aceptadas reservan cupo; aceptar una solicitud no consume un segundo lugar. Eliminar una inscripción libera su lugar. Cambiar la opción afecta solo a las nuevas solicitudes: las pendientes anteriores necesitan aceptación manual y las aceptadas conservan su estado. Las inscripciones anteriores a esta función se consideran aceptadas.

En **Ver inscripciones**, usá **Estado de inscripción** para filtrar pendientes o aceptadas. Abrí el detalle de una pendiente y elegí **Aceptar inscripción**. La operación está protegida en el servidor y se puede repetir sin afectar el cupo. La confirmación pública explica cuándo se necesita aprobación y conserva el mensaje de que un reintento no reemplaza la inscripción original. Por privacidad, los reintentos informan la política actual de la actividad y no revelan el estado de una inscripción previa para ese email.

Desplegá el backend antes del frontend. Los campos nuevos de configuración y estado son opcionales para conservar actividades e inscripciones existentes; no requieren migración.

## Adjuntar documentos

El formulario de inscripción permite adjuntar documentos **opcionales en todas las actividades**; no hay requisitos de documentación configurables por actividad. Se aceptan hasta **3 archivos PDF, JPEG o PNG**, de **5 MB por archivo**. Los límites, las extensiones, el tipo declarado y la firma del formato se validan en el servidor. Si falla el envío, el formulario conserva los datos y los archivos para volver a intentar. Un reintento con el mismo email conserva los documentos de la inscripción original.

En **Ver inscripciones**, abrí el detalle y elegí **Descargar** junto a un documento. Cada descarga verifica la sesión y el rol administrativo; no se publican enlaces de almacenamiento ni identificadores de archivos en las consultas. Eliminar una inscripción borra también sus archivos. Los envíos rechazados y los reintentos duplicados limpian los archivos nuevos que llegaron a almacenarse.

Los archivos usan el almacenamiento de Convex. El frontend deriva la URL HTTP `https://<deployment>.convex.site` de `VITE_CONVEX_URL`; para un dominio o backend propio, configurá `VITE_CONVEX_SITE_URL` con la URL HTTP correspondiente. Las rutas `/inscriptions` y `/inscription-document` admiten CORS y descargas autenticadas mediante el token de la sesión. Desplegá el backend antes de publicar el frontend. Referencia: [archivos mediante acciones HTTP de Convex](https://docs.convex.dev/file-storage/serve-files).

En la demo, los documentos se guardan en IndexedDB y sobreviven a una recarga del navegador; las actividades e inscripciones siguen en localStorage. Para reiniciar también los archivos de prueba, eliminá la base IndexedDB `manos-demo-documents`. Usá documentos ficticios.

## Registrar inventarios

En `/admin`, elegí **Inventarios → Nuevo inventario**. Completá la fecha y una etiqueta (por ejemplo, «Depósito antes de la jornada») y agregá los elementos relevados. Cada elemento requiere nombre y cantidad; la cantidad admite cero y decimales. La unidad es libre, con sugerencias como unidades, litros o kg. Los comentarios permiten anotar el estado, la ubicación o detalles del material.

Cada inventario representa el relevamiento de una fecha; no calcula movimientos de stock entre registros. Podés guardar varias etiquetas en una misma fecha. La lista muestra primero los más recientes y permite buscar por etiqueta o fecha en formato `AAAA-MM-DD`. **Ver inventario** muestra sus elementos y ofrece **Exportar CSV**, que descarga fecha, etiqueta, nombre, cantidad, unidad y comentarios en un archivo `inventario-AAAA-MM-DD.csv`, con protección contra fórmulas de planillas. El botón de edición permite corregir los elementos, agregar o quitarlos. Eliminar requiere confirmación y borra el inventario completo. Solo los administradores pueden acceder a estas operaciones.

Se admiten hasta 500 elementos por inventario, etiquetas y nombres de hasta 120 caracteres, unidades de hasta 40 y comentarios de hasta 2000. Las reglas se validan tanto en Convex como en la demo.

### Importar un inventario

Elegí **Inventarios → Importar inventario**. El menú incluye instrucciones y una tabla de ejemplo. Se admiten archivos CSV en UTF-8 separados por coma o punto y coma, y Excel `.xlsx` o `.xls` (primera hoja). La primera fila debe contener **Nombre** y **Cantidad**; **Unidad** y **Comentarios** son opcionales. Se reconoce cualquier orden de columnas, sin distinguir mayúsculas o tildes. Otras columnas se ignoran.

Cada fila representa un elemento con nombre y cantidad mayor o igual a cero. Se aceptan decimales con punto o coma, sin separadores de miles. En un CSV separado por coma, los decimales con coma y los textos que incluyan comas o saltos de línea deben ir entre comillas dobles. En Excel se requieren valores, sin fórmulas, errores ni celdas combinadas. Los archivos pueden pesar hasta 5 MB; la tabla admite hasta 500 filas después del encabezado.

Podés incluir **Fecha** y **Etiqueta**, repitiendo el mismo valor para todos los elementos, o completar esos datos en el menú. Las fechas se leen como `AAAA-MM-DD` o como celdas de fecha de Excel. El CSV generado por **Exportar CSV** se puede volver a importar. El archivo se procesa en el navegador y se valida completo antes de habilitar el guardado. Revisá la vista previa y presioná **Guardar inventario** para crear un registro nuevo; los inventarios anteriores se conservan. Si una fila es inválida, se muestra un error y no se guarda ningún elemento del archivo.
