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
- Formularios con preguntas cortas, largas o de selección; campos obligatorios configurables.
- Un registro por email normalizado y evento. Una persona puede participar en varios eventos. Los reintentos no reemplazan respuestas anteriores.
- Visibilidad y recepción de inscripciones independientes. Los formularios ocultos no aparecen en las consultas públicas y rechazan nuevas inscripciones.
- Cierre automático por fecha o cupo, comprobado en el servidor en cada envío. No necesita un cron. Fechas de cierre en hora de Argentina (UTC−3).
- `/admin` con cuenta y contraseña. Sin enlace público al panel en producción; cada operación privada verifica además el rol en el servidor.
- Consulta y búsqueda de participantes, respuestas y exportación CSV protegida contra fórmulas de planillas.
- Preguntas bloqueadas al recibir la primera inscripción para conservar el significado de las respuestas. El resto del evento se puede editar.
- Pestaña privada **Inventarios**: registros por fecha y etiqueta, con nombre, cantidad (incluye decimales), unidad de medida y comentarios opcionales por elemento. Permite consultar, buscar, editar y eliminar con confirmación.
- Diseño adaptable, formularios etiquetados, ventanas con gestión del foco y cierre con Escape.

Los eventos de ejemplo **no se cargan en Convex**. La base real comienza vacía para que el equipo publique sus fechas, lugares y formularios definitivos.

## Compatibilidad con la versión anterior

Se reutiliza el frontend de `~/manos` sobre React/Vite y Convex. La página pública conserva la presentación institucional y muestra detalles en `/activities/:id`; desde allí se completa la inscripción sin una cuenta de participante. La administración sigue en `/admin`.

Las cuentas de participantes, la verificación por correo, las ediciones anuales y las invitaciones administrativas de la versión anterior quedan fuera de esta etapa. No se importan su backend de Supabase, sus credenciales ni sus datos. El proyecto original en `~/manos` se conserva intacto.

Los nuevos formularios requieren horarios de inicio/finalización e indicaciones. Las actividades existentes sin esos campos siguen disponibles y muestran **Horario a confirmar**. Al editarlas, el equipo debe completar esos datos. No se asignan horarios ficticios a las actividades guardadas ni se borran inscripciones de la demo.

Después de actualizar el código, ejecutá `npx convex dev` para desarrollo o `npx convex deploy` para producción antes de publicar el frontend, porque el esquema agrega `startAt`, `endAt` e `instructions` como campos opcionales para conservar registros anteriores.

La función de inventarios agrega la tabla `inventories` y las operaciones privadas `inventories:listAdmin`, `inventories:save` e `inventories:remove`. Desplegá también estos cambios de backend antes de publicar el frontend. No requiere migrar actividades ni inscripciones existentes. La demo conserva sus datos anteriores y empieza con una lista de inventarios vacía.

## Registrar inventarios

En `/admin`, elegí **Inventarios → Nuevo inventario**. Completá la fecha y una etiqueta (por ejemplo, «Depósito antes de la jornada») y agregá los elementos relevados. Cada elemento requiere nombre y cantidad; la cantidad admite cero y decimales. La unidad es libre, con sugerencias como unidades, litros o kg. Los comentarios permiten anotar el estado, la ubicación o detalles del material.

Cada inventario representa el relevamiento de una fecha; no calcula movimientos de stock entre registros. Podés guardar varias etiquetas en una misma fecha. La lista muestra primero los más recientes y permite buscar por etiqueta o fecha en formato `AAAA-MM-DD`. **Ver inventario** muestra sus elementos y ofrece **Exportar CSV**, que descarga fecha, etiqueta, nombre, cantidad, unidad y comentarios en un archivo `inventario-AAAA-MM-DD.csv`, con protección contra fórmulas de planillas. El botón de edición permite corregir los elementos, agregar o quitarlos. Eliminar requiere confirmación y borra el inventario completo. Solo los administradores pueden acceder a estas operaciones.

Se admiten hasta 500 elementos por inventario, etiquetas y nombres de hasta 120 caracteres, unidades de hasta 40 y comentarios de hasta 2000. Las reglas se validan tanto en Convex como en la demo.

## Conectar Convex

Necesitás una cuenta gratuita de Convex. Desde esta carpeta:

```bash
npx convex dev
```

Elegí o creá el proyecto. El asistente configura `.env.local`, despliega las funciones y genera los tipos en `convex/_generated/`. Mantené ese proceso abierto mientras desarrollás y ejecutá `npm run dev` en otra terminal.

Configurá las claves de autenticación siguiendo el asistente oficial:

```bash
npx @convex-dev/auth --skip-git-check --web-server-url http://localhost:5173
```

Esto configura `SITE_URL`, `JWT_PRIVATE_KEY` y `JWKS` en el servidor. Los archivos de autenticación ya están implementados: **conservá el proveedor Password y la restricción de registro existentes**, no los reemplaces por el ejemplo vacío del asistente. Si muestra los archivos existentes, confirmá que ya contienen la configuración.

Referencia: [configuración de Convex Auth](https://labs.convex.dev/auth/setup).

### Crear el administrador

El registro público de cuentas está deshabilitado. Las cuentas se crean mediante una acción **interna**, accesible solo con acceso de desarrollador al proyecto.

1. En **Settings → Environment Variables** del dashboard de Convex, agregá `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Usá una contraseña única de al menos 12 caracteres. Estas variables pertenecen al backend: nunca uses el prefijo `VITE_` para secretos.
2. Ejecutá:

   ```bash
   npx convex run accounts:provision '{}'
   ```

3. Eliminá `ADMIN_PASSWORD` de las variables del servidor:

   ```bash
   npx convex env remove ADMIN_PASSWORD
   ```

4. Ingresá con esa cuenta en `/admin`. Para otro administrador, repetí el procedimiento con otro email.

Para recuperar una contraseña, configurá nuevamente `ADMIN_EMAIL` y `ADMIN_PASSWORD`, obtené el ID del usuario en la tabla `users` del dashboard y ejecutá:

```bash
npx convex run accounts:resetPassword '{"userId":"ID_DEL_USUARIO"}'
npx convex env remove ADMIN_PASSWORD
```

La acción verifica que el ID corresponda al email y a un administrador, y revoca sus sesiones. No requiere un proveedor de email de pago.

## Publicar sin costo inicial

**Convex Free + Cloudflare Pages Free**, usando el subdominio gratuito `*.pages.dev`:

1. Desplegá el backend con `npx convex deploy` y elegí la instancia de producción.
2. Subí este proyecto a un repositorio de GitHub o GitLab y conectalo a Cloudflare Pages.
3. Configurá el comando de compilación `npm run build`, la carpeta de salida `dist` y Node.js 22 o posterior.
4. En las variables de compilación de Pages, configurá `VITE_CONVEX_URL` con la URL **de producción** de Convex (termina en `.convex.cloud`, no `.convex.site`).
5. Generá las claves de autenticación de producción con `npx @convex-dev/auth --prod --skip-git-check --web-server-url https://TU-SITIO.pages.dev`. Conservá los archivos de autenticación existentes.
6. Creá el administrador en la instancia de producción: configurá allí `ADMIN_EMAIL` y `ADMIN_PASSWORD`, ejecutá `npx convex run --prod accounts:provision '{}'`, y eliminá `ADMIN_PASSWORD` con `npx convex env remove --prod ADMIN_PASSWORD`.
7. Entrá a `https://TU-SITIO.pages.dev/admin`, creá un formulario, indicá el cierre y activá **Mostrar en el sitio** y **Recibir inscripciones**. Probá una inscripción antes de compartir el enlace.

Cloudflare Pages resuelve las rutas de esta SPA, incluido `/admin`, hacia `index.html` mientras no se agregue un `404.html` personalizado. `public/_headers` aplica encabezados de seguridad básicos.

Las cuentas de desarrollo y producción son separadas. No copies datos ficticios a producción. Los cambios posteriores en `convex/` se publican con `npx convex deploy`; los del frontend, mediante Pages.

## CI/CD con GitHub Actions

El workflow [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) comprueba tipos, compila el frontend y ejecuta las pruebas de backend y navegador. Las acciones están fijadas a commits concretos.

| Disparador                        | Comportamiento                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Pull request hacia `main` o `dev` | Ejecuta `Checks`, sin desplegar ni utilizar secretos.                                                       |
| Push o merge a `dev`              | Ejecuta `Checks` y, si pasa, despliega a Convex desarrollo y a `https://dev.inscripciones-manos.pages.dev`. |
| Push o merge a `main`             | Ejecuta `Checks` y, si pasa, despliega a Convex producción y a `https://inscripciones-manos.pages.dev`.     |
| Merge queue                       | Ejecuta `Checks` sobre el grupo de cambios, sin desplegar.                                                  |

Los despliegues de una misma rama se serializan. Los PR nuevos cancelan las comprobaciones anteriores de ese PR. No hay filtros por archivos que dejen pendiente el check obligatorio.

### Configuración inicial

1. En **Settings → Actions → General**, habilitá GitHub Actions. Permití las acciones de GitHub (`actions/*`) y `cloudflare/wrangler-action`. El workflow necesita solo permiso de lectura del repositorio; no necesita permiso para crear PRs.
2. En **Settings → Environments**, creá `production` y `development`. En **Deployment branches and tags**, elegí **Selected branches and tags**: permití la rama `main` en `production` y la rama `dev` en `development`. No agregues revisores obligatorios ni temporizadores si querés despliegues automáticos.
3. En cada environment, agregá un secreto llamado **`CONVEX_DEPLOY_KEY`**, con una clave distinta:

   | Environment de GitHub | Deployment de Convex   | Prefijo esperado             |
   | --------------------- | ---------------------- | ---------------------------- |
   | `production`          | `oceanic-crab-449`     | `prod:oceanic-crab-449\|`    |
   | `development`         | `animated-lemming-207` | `dev:animated-lemming-207\|` |

   En el dashboard de Convex, seleccioná el deployment correspondiente y entrá a **Settings → Deploy keys → Generate a deploy key**. Usá nombres como `github-production` y `github-development`, y habilitá `deployment:deploy`. Las claves deben pertenecer al deployment indicado; el workflow rechaza claves intercambiadas, claves de preview y tokens generales del proyecto. Referencia: [deploy keys de Convex](https://docs.convex.dev/cli/deploy-key-types).

4. En Cloudflare, creá un API token con **Account → Cloudflare Pages → Edit**, limitado a la cuenta que contiene el proyecto `inscripciones-manos`. En GitHub **Settings → Secrets and variables → Actions → Secrets**, agregá **`CLOUDFLARE_API_TOKEN`** con ese token. En **Variables**, agregá **`CLOUDFLARE_ACCOUNT_ID`** con el ID de esa cuenta. No hace falta una clave global de Cloudflare ni conectar Pages directamente a GitHub. Referencia: [Direct Upload con CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
5. Guardá los archivos del workflow, la configuración de Playwright y este README en Git. Incluí también los cambios de frontend y branding que quieras publicar; los cambios sin commit no se despliegan. No subas `.env.local`, `.env.production.local` ni archivos temporales del editor.

   ```bash
   git add .github/workflows/ci-cd.yml playwright.config.ts README.md
   # Agregá también los archivos de frontend/logo que quieras incluir.
   git commit -m "ci: automate checks and branch deployments"
   git push -u origin main
   git branch dev
   git push -u origin dev
   ```

   Si `dev` ya existe, omití `git branch dev`. Configurá los secretos **antes** del primer push: el workflow también publica ese primer push si pasan las pruebas. No vuelvas a generar las claves de autenticación de producción ni el administrador como parte de cada release.

6. Después del primer check, creá reglas para `main` y `dev` en **Settings → Branches → Add classic branch protection rule**. Activá **Require a pull request before merging**, **Require status checks to pass before merging** y seleccioná **`Checks`** (GitHub Actions). Activá **Require branches to be up to date before merging** y bloqueá force pushes y eliminación de ramas. Si trabajás solo, no exijas aprobaciones de otra persona. No hagas obligatorio el check `Deploy`: no corre en los PRs. Estas reglas hacen que los pushes directos no sean el camino habitual de publicación. Referencia: [protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule).

El repositorio es público, por lo que GitHub Free admite estas protecciones y environments. Si cambia a privado, revisá la disponibilidad de esas funciones en el plan de GitHub antes de cambiar la configuración.

### Uso cotidiano y límites

Trabajá en una rama de tarea, abrí un PR hacia `dev`, esperá a que `Checks` pase y hacé merge. Probá el sitio de desarrollo y después abrí un PR de `dev` hacia `main`. Al hacer merge se publica producción. Seguí la ejecución desde la pestaña **Actions**; los informes de Playwright se conservan siete días y contienen solo datos ficticios de la demo.

Los tests de navegador levantan un servidor demo propio en CI. Para ejecutarlos localmente sin reutilizar un Vite abierto en el puerto habitual:

```bash
CI=true PLAYWRIGHT_PORT=5174 npm run test:e2e
```

El backend `animated-lemming-207` es también tu deployment personal de desarrollo: `npx convex dev` puede modificar el backend que usa el sitio alojado de dev antes de hacer merge. Para un staging que cambie solo mediante CI, usá un deployment/proyecto separado y actualizá su URL y prefijo de clave en el workflow. Desarrollo necesita sus propias claves de autenticación y administrador; CI no los crea ni copia datos desde producción.

Backend y frontend se publican en pasos separados. Si falla Cloudflare después de publicar Convex, el backend nuevo ya está activo: corregí el problema y usá **Re-run failed jobs**. Mantené los cambios de API y esquema compatibles con el frontend anterior durante el despliegue. Un rollback de Pages solo revierte el frontend, no el esquema ni los datos de Convex.

### Costos y límites

Verificado el 26 de septiembre de 2026: [Convex ofrece un plan Free con recursos limitados](https://www.convex.dev/pricing); su plan **Starter es de pago por uso** por encima de los recursos incluidos. Elegí **Free** para un presupuesto sin cargos por excedentes. [Cloudflare Pages Free admite hasta 500 compilaciones por mes](https://developers.cloudflare.com/pages/platform/limits/).

No se necesita dominio propio, servicio de email, almacenamiento de archivos ni servidor pago. La capacidad gratuita depende del tráfico y del uso: controlá el consumo en Convex. No es una garantía de alojamiento gratis a cualquier escala; si se agota la cuota gratuita, puede limitarse el servicio. Referencia: [límites de Convex](https://docs.convex.dev/production/state/limits).

## Operación y límites del alcance

- El email evita duplicados por evento, pero no prueba la identidad de una persona: alguien puede usar otro email. No hay verificación por correo ni correo de confirmación automático.
- Los formularios incluyen un campo trampa para bots y validación en el servidor. No hay CAPTCHA ni protección avanzada contra envíos automatizados; incorporá Turnstile con verificación en el servidor si aparece abuso.
- Solo los administradores pueden leer participantes. Las exportaciones contienen datos personales; compartilas solo con el equipo correspondiente.
- El texto de privacidad indica el uso concreto de los datos. Antes de publicar, adaptá el nombre del proyecto y agregá el canal de contacto real del equipo organizador. No se inventó un email o dirección de contacto.
- No hay edición pública ni cancelación automática. El administrador puede eliminar una inscripción desde su detalle, con confirmación explícita; se borra junto con sus respuestas y se libera el cupo en la misma transacción. Conservá solo los datos necesarios para organizar los encuentros.
- Convex Auth está antes de la versión 1.0. Se incluye `package-lock.json` para instalaciones reproducibles; probá los flujos de acceso al actualizar dependencias.

## Verificación

```bash
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Las pruebas de backend usan `convex-test` y comprueban permisos, bloqueo del registro de cuentas, validación, duplicados, cupos, fechas, visibilidad, preservación de preguntas y el ciclo de creación, edición y eliminación de inventarios. Las pruebas de navegador cubren la demo en escritorio y celular: inscripción, reintento, respuestas, CSV, creación de formularios, publicación, cierre, persistencia, filtros, navegación por teclado e inventarios con cantidades decimales y unidades opcionales.

Las pruebas de navegador requieren el modo demo (sin `VITE_CONVEX_URL`). Si hay un backend configurado, ejecutá Vite con `VITE_CONVEX_URL='' npm run dev -- --port 5173` antes de la prueba.

## Estructura

- `src/App.tsx`: listado público y detalle de actividades.
- `src/Layout.tsx`: encabezado, pie institucional y privacidad.
- `src/RegistrationForm.tsx`: formulario de inscripción sin cuenta.
- `src/Admin.tsx`: acceso privado, editor y consulta de participantes.
- `src/Inventories.tsx`: lista, editor y detalle de inventarios en el panel administrativo.
- `src/inventory.ts`: tipos y validación compartida de inventarios.
- `src/data.tsx`: conexión con Convex y demo local de desarrollo.
- `src/domain.ts`: reglas compartidas y normalización.
- `convex/`: esquema, permisos, autenticación y operaciones de base de datos.
- `tests/`: pruebas del backend y de navegador.

El logo se copia sin modificaciones de `~/manos/public/logo.svg`. La paleta utiliza `#f8c514`, `#fef5cd`, `#c69e10` y `#5c4a08`. Las tipografías Open Sans, Roboto Condensed y Kalam se cargan desde Google Fonts con fuentes de sistema como alternativa.
