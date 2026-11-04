# CI/CD con GitHub Actions

El workflow [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml) comprueba tipos, compila el frontend y ejecuta las pruebas de backend y navegador. Las acciones están fijadas a commits concretos.

| Disparador                        | Comportamiento                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Pull request hacia `main` o `dev` | Ejecuta `Checks`, sin desplegar ni utilizar secretos.                                                       |
| Push o merge a `dev`              | Ejecuta `Checks` y, si pasa, despliega a Convex desarrollo y a `https://dev.inscripciones-manos.pages.dev`. |
| Push o merge a `main`             | Ejecuta `Checks` y, si pasa, despliega a Convex producción y a `https://inscripciones-manos.pages.dev`.     |
| Merge queue                       | Ejecuta `Checks` sobre el grupo de cambios, sin desplegar.                                                  |

Los despliegues de una misma rama se serializan. Los PR nuevos cancelan las comprobaciones anteriores de ese PR. No hay filtros por archivos que dejen pendiente el check obligatorio.

## Configuración inicial

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

## Uso cotidiano y límites

Trabajá en una rama de tarea, abrí un PR hacia `dev`, esperá a que `Checks` pase y hacé merge. Probá el sitio de desarrollo y después abrí un PR de `dev` hacia `main`. Al hacer merge se publica producción. Seguí la ejecución desde la pestaña **Actions**; los informes de Playwright se conservan siete días y contienen solo datos ficticios de la demo.

Los tests de navegador levantan un servidor demo propio en CI. Para ejecutarlos localmente sin reutilizar un Vite abierto en el puerto habitual:

```bash
CI=true PLAYWRIGHT_PORT=5174 npm run test:e2e
```

El backend `animated-lemming-207` es también tu deployment personal de desarrollo: `npx convex dev` puede modificar el backend que usa el sitio alojado de dev antes de hacer merge. Para un staging que cambie solo mediante CI, usá un deployment/proyecto separado y actualizá su URL y prefijo de clave en el workflow. Desarrollo necesita sus propias claves de autenticación y administrador; CI no los crea ni copia datos desde producción.

Backend y frontend se publican en pasos separados. Si falla Cloudflare después de publicar Convex, el backend nuevo ya está activo: corregí el problema y usá **Re-run failed jobs**. Mantené los cambios de API y esquema compatibles con el frontend anterior durante el despliegue. Un rollback de Pages solo revierte el frontend, no el esquema ni los datos de Convex.

## Costos y límites

Verificado el 26 de septiembre de 2026: [Convex ofrece un plan Free con recursos limitados](https://www.convex.dev/pricing); su plan **Starter es de pago por uso** por encima de los recursos incluidos. Elegí **Free** para un presupuesto sin cargos por excedentes. [Cloudflare Pages Free admite hasta 500 compilaciones por mes](https://developers.cloudflare.com/pages/platform/limits/).

No se necesita dominio propio ni servicio de email. Los documentos adjuntos consumen almacenamiento de Convex. La capacidad gratuita depende del tráfico y del uso: controlá el consumo en Convex. No es una garantía de alojamiento gratis a cualquier escala; si se agota la cuota gratuita, puede limitarse el servicio. Referencia: [límites de Convex](https://docs.convex.dev/production/state/limits).
