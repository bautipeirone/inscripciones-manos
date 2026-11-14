# Estructura

- `src/App.tsx`: listado público y detalle de actividades.
- `src/Layout.tsx`: encabezado, pie institucional y privacidad.
- `src/RegistrationForm.tsx`: formulario de inscripción, con datos precargados si hay una cuenta.
- `src/Account.tsx`: ingreso, registro y pestañas de inscripciones y datos de participantes, incluido el barrio.
- `src/zones.ts`: ediciones, ciclos y reglas de barrios compartidas por Convex y la demo.
- `src/Admin.tsx`: acceso privado, editor y consulta de participantes.
- `src/Inventories.tsx`: lista, editor y detalle de inventarios en el panel administrativo.
- `src/inventory.ts`: tipos y validación compartida de inventarios.
- `src/InventoryImport.tsx`: menú de importación con instrucciones, selección de archivo y vista previa.
- `src/inventoryImport.ts`: lectura y validación de CSV y Excel; el lector de Excel se carga al seleccionar ese formato.
- `src/data.tsx`: conexión con Convex y demo local de desarrollo.
- `src/domain.ts`: reglas compartidas y normalización.
- `convex/`: esquema, permisos, autenticación y operaciones de base de datos.
- `tests/`: pruebas del backend y de navegador.

El logo se copia sin modificaciones de `~/manos/public/logo.svg`. La paleta utiliza `#f8c514`, `#fef5cd`, `#c69e10` y `#5c4a08`. Las tipografías Open Sans, Roboto Condensed y Kalam se cargan desde Google Fonts con fuentes de sistema como alternativa.
