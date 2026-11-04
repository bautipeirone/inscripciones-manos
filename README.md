# Proyecto Manos a la Obra · Plataforma de Inscripciones

Sitio en español para **visitas diagnósticas de agosto a diciembre** y el **Manos a la Obra de enero**. El frontend adapta la identidad y las páginas de la versión anterior en `~/manos`: logo, paleta amarilla, tipografías, encabezado institucional, lista de actividades y página de detalle. React + TypeScript + Vite, con base de datos y autenticación en Convex. Preparado para alojar el frontend estático en Cloudflare Pages.

## Probar ahora

```bash
npm ci
npm run dev
```

Abrí `http://localhost:5173`. Sin `VITE_CONVEX_URL`, el servidor de desarrollo ofrece una **demostración local** con eventos ficticios y un panel de prueba en `/admin`. Los datos de prueba se guardan en el navegador; no ingreses datos personales reales. Para reiniciarla, borrá la clave `manos-demo-v1` de localStorage.

En una compilación de producción **no existe el acceso de prueba**. Sin Convex configurado, se muestra una página de espera y no se reciben inscripciones.

## Qué incluye

- Fechas y horas de inicio y finalización, actividades de varios días e indicaciones para participantes. Se guardan en Convex y se muestran en hora de Argentina.
- Inscripción sin cuenta, con nombre, email, teléfono opcional y consentimiento.
- Documentos opcionales en las inscripciones: hasta tres comprobantes PDF, JPEG o PNG de 5 MB cada uno, con descarga privada para administradores y eliminación junto con la inscripción.
- Aprobación manual opcional por actividad: las nuevas solicitudes quedan pendientes y el administrador puede aceptarlas desde el detalle, filtrarlas por estado y exportar su estado a CSV.
- Cuentas opcionales de participantes en `/account`: registro, ingreso y cierre de sesión desde el sitio público. La página tiene dos pestañas:
  - **Mis inscripciones**: inscripciones próximas y anteriores, con su estado de aprobación, los datos y respuestas enviados y los nombres de los documentos adjuntos.
  - **Mis datos** (`/account#datos`): nombre, email de contacto y teléfono, que completan los formularios y se pueden cambiar antes de cada envío; carrera opcional y si ya se recibió o sigue estudiando; contacto de emergencia (nombre, vínculo y teléfono); y el barrio del ciclo actual con el historial de barrios por edición (ver [Barrios](docs/funcionalidades.md#barrios)).
- En `/admin`, cada inscripción indica si se hizo con cuenta, cuántas otras inscripciones tiene la misma persona (por cuenta o por email) y su barrio para la edición de la actividad. El detalle muestra estudios, contacto de emergencia, esas otras actividades y los barrios por edición, y permite confirmar, asignar o cambiar el barrio. El CSV incluye todos esos datos.
- Formularios con preguntas cortas, largas o de selección; campos obligatorios configurables.
- Un registro por email normalizado y evento. Una persona puede participar en varios eventos. Los reintentos no reemplazan respuestas anteriores.
- Visibilidad y recepción de inscripciones independientes. Los formularios ocultos no aparecen en las consultas públicas y rechazan nuevas inscripciones.
- Cierre automático por fecha o cupo, comprobado en el servidor en cada envío. No necesita un cron. Fechas de cierre en hora de Argentina (UTC−3).
- `/admin` con cuenta y contraseña. Sin enlace público al panel en producción; cada operación privada verifica además el rol en el servidor.
- Consulta y búsqueda de participantes, respuestas y exportación CSV protegida contra fórmulas de planillas.
- Preguntas bloqueadas al recibir la primera inscripción para conservar el significado de las respuestas. El resto del evento se puede editar.
- Pestaña privada **Inventarios**: registros por fecha y etiqueta, con nombre, cantidad (incluye decimales), unidad de medida y comentarios opcionales por elemento. Permite consultar, buscar, editar, exportar CSV, importar CSV o Excel y eliminar con confirmación.
- Diseño adaptable, formularios etiquetados, ventanas con gestión del foco y cierre con Escape.

Los eventos de ejemplo **no se cargan en Convex**. La base real comienza vacía para que el equipo publique sus fechas, lugares y formularios definitivos.

## Verificación

```bash
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Las pruebas de backend usan `convex-test` y comprueban permisos, cuentas de participantes sin acceso administrativo, aislamiento del historial y los perfiles, historial para administradores, datos de estudios y contacto de emergencia, ediciones, elección y confirmación de barrios, continuidad dentro del ciclo, años salteados, cambios de barrio, ediciones informadas, validación, duplicados, cupos, fechas, visibilidad, preservación de preguntas y el ciclo de creación, edición y eliminación de inventarios. Las pruebas de navegador cubren la demo en escritorio y celular: inscripción con y sin cuenta, datos precargados, historial personal, pestañas de la cuenta, datos personales, elección y confirmación de barrios, reintento, respuestas, CSV, creación de formularios, publicación, cierre, persistencia, filtros, navegación por teclado e inventarios con cantidades decimales, unidades opcionales e importación de CSV y archivos Excel reales. Las pruebas del lector también cubren fechas, comillas, saltos de línea, límites y rechazo de archivos inválidos.

Las pruebas de navegador requieren el modo demo (sin `VITE_CONVEX_URL`). Si hay un backend configurado, ejecutá Vite con `VITE_CONVEX_URL='' npm run dev -- --port 5173` antes de la prueba.


## Documentación

- [Funcionalidades](docs/funcionalidades.md): barrios, aprobación de inscripciones, documentos adjuntos e inventarios.
- [CI/CD con GitHub Actions](docs/ci-cd.md): comprobaciones y despliegue automático.
- [Estructura](docs/estructura.md): organización del código y recursos de marca.
