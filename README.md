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
- Diseño adaptable, formularios etiquetados, ventanas con gestión del foco y cierre con Escape.

Los eventos de ejemplo **no se cargan en Convex**. La base real comienza vacía para que el equipo publique sus fechas, lugares y formularios definitivos.

## Compatibilidad con la versión anterior

Se reutiliza el frontend de `~/manos` sobre React/Vite y Convex. La página pública conserva la presentación institucional y muestra detalles en `/activities/:id`; desde allí se completa la inscripción sin una cuenta de participante. La administración sigue en `/admin`.

Las cuentas de participantes, la verificación por correo, las ediciones anuales y las invitaciones administrativas de la versión anterior quedan fuera de esta etapa. No se importan su backend de Supabase, sus credenciales ni sus datos. El proyecto original en `~/manos` se conserva intacto.

Los nuevos formularios requieren horarios de inicio/finalización e indicaciones. Las actividades existentes sin esos campos siguen disponibles y muestran **Horario a confirmar**. Al editarlas, el equipo debe completar esos datos. No se asignan horarios ficticios a las actividades guardadas ni se borran inscripciones de la demo.

Después de actualizar el código, ejecutá `npx convex dev` para desarrollo o `npx convex deploy` para producción antes de publicar el frontend, porque el esquema agrega `startAt`, `endAt` e `instructions` como campos opcionales para conservar registros anteriores.

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

Las pruebas de backend usan `convex-test` y comprueban permisos, bloqueo del registro de cuentas, validación, duplicados, cupos, fechas, visibilidad y preservación de preguntas. Las pruebas de navegador cubren la demo en escritorio y celular: inscripción, reintento, respuestas, CSV, creación de formularios, publicación, cierre, persistencia, filtros y navegación por teclado.

Las pruebas de navegador requieren el modo demo (sin `VITE_CONVEX_URL`). Si hay un backend configurado, ejecutá Vite con `VITE_CONVEX_URL='' npm run dev -- --port 5173` antes de la prueba.

## Estructura

- `src/App.tsx`: listado público y detalle de actividades.
- `src/Layout.tsx`: encabezado, pie institucional y privacidad.
- `src/RegistrationForm.tsx`: formulario de inscripción sin cuenta.
- `src/Admin.tsx`: acceso privado, editor y consulta de participantes.
- `src/data.tsx`: conexión con Convex y demo local de desarrollo.
- `src/domain.ts`: reglas compartidas y normalización.
- `convex/`: esquema, permisos, autenticación y operaciones de base de datos.
- `tests/`: pruebas del backend y de navegador.

El logo se copia sin modificaciones de `~/manos/public/logo.svg`. La paleta utiliza `#f8c514`, `#fef5cd`, `#c69e10` y `#5c4a08`. Las tipografías Open Sans, Roboto Condensed y Kalam se cargan desde Google Fonts con fuentes de sistema como alternativa.
