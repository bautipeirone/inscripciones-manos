import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  // Stable clock for seed dates, deadline labels and deterministic forms.
  await page.clock.setFixedTime(new Date('2026-09-26T12:00:00-03:00'));
  await page.goto('/');
});
test('public site, custom questions, duplicate prevention, admin review and CSV', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Plataforma de Inscripciones',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre y apellido').fill('Voluntaria de prueba');
  await dialog.getByLabel('Email *').fill('VOLUNTARIA@example.com');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Sí, es mi primera vez');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await expect(dialog.getByText('Tu inscripción fue recibida.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  // Retry in the same browser with normalized casing: still only one record.
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  await dialog.getByLabel('Nombre y apellido').fill('Duplicate attempt');
  await dialog.getByLabel('Email *').fill('voluntaria@example.com');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Ya participé antes');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  await page.getByRole('button', { name: /Probar administración/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Ingresar', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  const mainEvent = page
    .locator('.admin-event')
    .filter({ hasText: 'Manos a la Obra 2027' });
  await mainEvent.getByRole('button', { name: '1 Ver inscripciones' }).click();
  await expect(
    dialog.getByRole('cell', { name: 'Voluntaria de prueba', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('cell', { name: 'Duplicate attempt' }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Ver respuestas de Voluntaria de prueba' })
    .click();
  await expect(
    dialog.getByText('Sí, es mi primera vez', { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('inscripciones-2027-01-10.csv');
  await dialog
    .getByRole('button', { name: 'Eliminar inscripción', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    dialog.getByRole('cell', { name: 'Voluntaria de prueba', exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Eliminar inscripción', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Eliminar definitivamente' })
    .click();
  await expect(dialog.getByText('Todavía no hay inscripciones.')).toBeVisible();
  expect(errors).toEqual([]);
});
test('create custom form, visibility, manual closure and persistence', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page
    .getByRole('button', { name: 'Nueva actividad', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de la actividad').fill('Jornada de prueba');
  await dialog.getByLabel('Fecha y hora de inicio').fill('2026-11-18T09:00');
  await dialog
    .getByLabel('Fecha y hora de finalización')
    .fill('2026-11-18T17:00');
  await dialog
    .getByLabel('Indicaciones para los participantes')
    .fill('Traer agua y ropa cómoda.');
  await dialog
    .getByLabel('Descripción')
    .fill('Un encuentro creado desde el panel.');
  await dialog.getByLabel('Lugar público de encuentro').fill('Plaza central');
  await dialog.getByLabel('Cierre de inscripciones').fill('2026-11-17T23:59');
  await dialog.getByRole('button', { name: 'Agregar pregunta' }).click();
  await dialog
    .getByLabel('Pregunta *', { exact: true })
    .fill('¿Qué te gustaría compartir?');
  await dialog.getByLabel('Obligatoria').check();
  await dialog
    .getByRole('button', { name: 'Crear actividad', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const row = page
    .locator('.admin-event')
    .filter({ hasText: 'Jornada de prueba' });
  await expect(row.getByText('Oculto', { exact: true })).toBeVisible();
  await row
    .getByRole('button', { name: 'Mostrar Jornada de prueba', exact: true })
    .click();
  await expect(row.getByText('Inscripción abierta')).toBeVisible();
  await row
    .getByRole('button', { name: 'Cerrar inscripción Jornada de prueba' })
    .click();
  await expect(row.getByText('Inscripción cerrada')).toBeVisible();
  await page.getByRole('button', { name: 'Ver sitio', exact: true }).click();
  await page.reload();
  const card = page
    .locator('.event-card')
    .filter({ hasText: 'Jornada de prueba' });
  await expect(card.getByRole('heading')).toBeVisible();
  await card.getByRole('link', { name: 'Ver detalles' }).click();
  await expect(
    page.getByRole('button', { name: 'Inscripción cerrada', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Traer agua y ropa cómoda.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('dd').filter({ hasText: 'de 09:00 a 17:00 hs' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test('filters, activity details and keyboard dismissal', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Visitas diagnósticas', exact: true })
    .click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await page
    .getByRole('button', { name: 'Manos a la Obra', exact: true })
    .click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Ver detalles' }).click();
  await expect(
    page.getByRole('heading', { name: 'Indicaciones para la jornada' }),
  ).toBeVisible();
  await expect(
    page.locator('dd').filter({ hasText: '14 de enero de 2027, 18:00 hs' }),
  ).toBeVisible();
  await expect(
    page.getByText('No necesitás crear una cuenta.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Privacidad de tus datos' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Manos a la Obra 2027', exact: true }),
  ).toBeVisible();
});

test('old activities keep their date and unavailable routes stay private', async ({
  page,
}) => {
  await page.evaluate(() => {
    const demo = JSON.parse(localStorage.getItem('manos-demo-v1')!);
    const activity = demo.events.find(
      (e: { _id: string }) => e._id === 'demo-10',
    );
    delete activity.startAt;
    delete activity.endAt;
    delete activity.instructions;
    localStorage.setItem('manos-demo-v1', JSON.stringify(demo));
  });
  await page.goto('/activities/demo-10');
  await expect(
    page.locator('dd').filter({ hasText: 'Horario a confirmar' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Inscribirme', exact: true }),
  ).toBeEnabled();
  for (const path of [
    '/activities/not-an-activity',
    '/register',
    '/participant',
    '/admin/invite',
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: 'Actividad no disponible' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Inscribirme', exact: true }),
    ).toHaveCount(0);
  }
  // Participants can sign in from the public site; the admin panel stays unlinked.
  await page.goto('/');
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Ingresar' }),
  ).toHaveAttribute('href', '/account');
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
});

test('participant accounts prefill inscriptions and keep a personal history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const nav = page.getByRole('navigation');
  await page.goto('/activities/demo-main');
  await page.getByRole('link', { name: 'Ingresá', exact: true }).click();
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByLabel('Nombre y apellido').fill('Participante Demo');
  await page.getByLabel('Email').fill('Participante@Example.com');
  await page.getByLabel('Contraseña').fill('una-clave-segura');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  // Signing in returns to the activity the participant was viewing.
  await expect(page).toHaveURL(/\/activities\/demo-main$/);
  await expect(nav.getByRole('link', { name: 'Mi cuenta' })).toBeVisible();
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Nombre y apellido')).toHaveValue(
    'Participante Demo',
  );
  await expect(dialog.getByLabel('Email *')).toHaveValue(
    'participante@example.com',
  );
  await dialog.getByRole('textbox', { name: 'Teléfono' }).fill('341 555-0000');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Sí, es mi primera vez');
  await expect(dialog.getByLabel('Guardar mi nombre')).toBeChecked();
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await expect(dialog.getByText('Tu inscripción fue recibida.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(
    page.getByText('Ya te inscribiste con tu cuenta.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ver mis inscripciones' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mi cuenta', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Mis inscripciones' }),
  ).toHaveAttribute('aria-selected', 'true');
  const entry = page.locator('.history-item');
  await expect(entry).toHaveCount(1);
  await expect(entry.getByRole('link')).toHaveText('Manos a la Obra 2027');
  await entry.getByText('Datos enviados el').click();
  await expect(entry.getByText('Sí, es mi primera vez')).toBeVisible();
  await page.getByRole('tab', { name: 'Mis datos' }).click();
  await expect(page).toHaveURL(/\/account#datos$/);
  await expect(
    page.getByRole('textbox', { name: 'Teléfono (opcional)' }),
  ).toHaveValue('341 555-0000');
  await page.getByLabel('Nombre y apellido').fill('Participante Actualizada');
  await page.getByRole('button', { name: 'Guardar mis datos' }).click();
  await expect(page.getByText('Datos guardados.')).toBeVisible();
  await nav.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ingresar a tu cuenta' }),
  ).toBeVisible();
  await page.getByLabel('Email').fill('participante@example.com');
  await page.getByLabel('Contraseña').fill('una-clave-segura');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByLabel('Nombre y apellido')).toHaveValue(
    'Participante Actualizada',
  );
  // A second activity uses the updated details.
  await page.goto('/activities/demo-10');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  await expect(dialog.getByLabel('Nombre y apellido')).toHaveValue(
    'Participante Actualizada',
  );
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  // Admins see the account and the person's other inscriptions.
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page
    .locator('.admin-event')
    .filter({ hasText: 'Manos a la Obra 2027' })
    .getByRole('button', { name: '1 Ver inscripciones' })
    .click();
  await expect(
    dialog.getByRole('row', { name: /Participante Demo/ }).getByRole('cell'),
  ).toContainText(['Participante Demo', 'participante@example.com', /./, '1']);
  await dialog
    .getByRole('button', { name: 'Ver respuestas de Participante Demo' })
    .click();
  await expect(dialog.getByText('Se inscribió con su cuenta')).toBeVisible();
  await expect(
    dialog.locator('.person-history li').filter({ hasText: 'Misma cuenta' }),
  ).toContainText('Visita diagnóstica #3');
  // Leaving the account restores the anonymous form.
  await page.goto('/');
  await nav.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.goto('/activities/demo-11');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  await expect(dialog.getByLabel('Nombre y apellido')).toHaveValue('');
  await expect(dialog.getByLabel('Guardar mi nombre')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('manual approval can be configured, requested, filtered and accepted with a reserved place', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  const activity = page
    .locator('.admin-event')
    .filter({ hasText: 'Manos a la Obra 2027' });
  await activity
    .getByRole('button', { name: 'Editar Manos a la Obra 2027', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Requerir aprobación manual').check();
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByRole('button', { name: 'Ver sitio', exact: true }).click();
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  await expect(
    dialog.getByText('Tu solicitud quedará pendiente'),
  ).toBeVisible();
  await dialog.getByLabel('Nombre y apellido').fill('Persona pendiente');
  await dialog.getByLabel('Email *').fill('pendiente@example.com');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Sí, es mi primera vez');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog.getByRole('button', { name: 'Enviar mi solicitud' }).click();
  await expect(
    dialog.getByText('Las nuevas inscripciones quedan pendientes'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await activity.getByRole('button', { name: '1 Ver inscripciones' }).click();
  await dialog.getByLabel('Estado de inscripción').selectOption('pending');
  await expect(
    dialog.getByRole('cell', { name: 'Pendiente', exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Ver respuestas de Persona pendiente' })
    .click();
  await dialog
    .getByRole('button', { name: 'Aceptar inscripción', exact: true })
    .click();
  await expect(
    dialog.locator('dd').filter({ hasText: 'Aceptada' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Aceptar inscripción', exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel('Estado de inscripción').selectOption('accepted');
  await expect(
    dialog.getByRole('cell', { name: 'Aceptada', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    activity.getByRole('button', { name: '1 Ver inscripciones' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await activity.getByRole('button', { name: '1 Ver inscripciones' }).click();
  await expect(
    dialog.getByRole('cell', { name: 'Aceptada', exact: true }),
  ).toBeVisible();
});

test('receipts can be attached, retained across reloads, downloaded by admins and deleted', async ({
  page,
}) => {
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre y apellido').fill('Persona con comprobante');
  await dialog.getByLabel('Email *').fill('comprobante@example.com');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Sí, es mi primera vez');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  const receipt = {
    name: 'comprobante.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nreceipt\n%%EOF'),
  };
  const transfer = {
    name: 'transferencia.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  };
  await dialog
    .getByLabel('Documentos (opcional)')
    .setInputFiles([receipt, transfer]);
  await expect(
    dialog.getByText('Hasta 3 archivos PDF', { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await expect(dialog.getByText('Tu inscripción fue recibida.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  await page.reload();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page
    .locator('.admin-event')
    .filter({ hasText: 'Manos a la Obra 2027' })
    .getByRole('button', { name: '1 Ver inscripciones' })
    .click();
  await dialog
    .getByRole('button', { name: 'Ver respuestas de Persona con comprobante' })
    .click();
  await expect(
    dialog.getByRole('heading', { name: 'Documentos adjuntos' }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog
    .getByRole('button', { name: 'Descargar comprobante.pdf', exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('comprobante.pdf');
  expect(await download.failure()).toBeNull();
  await expect(
    dialog.getByRole('button', {
      name: 'Descargar transferencia.png',
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Eliminar inscripción', exact: true })
    .click();
  await expect(
    dialog.getByText('sus respuestas y documentos', { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Eliminar definitivamente' })
    .click();
  await expect(dialog.getByText('Todavía no hay inscripciones.')).toBeVisible();
  // Verify the storage boundary too: deleting a demo inscription removes its bytes.
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open('manos-demo-documents', 1);
          request.onsuccess = () => {
            const db = request.result;
            const count = db
              .transaction('documents')
              .objectStore('documents')
              .count();
            count.onsuccess = () => {
              resolve(count.result);
              db.close();
            };
            count.onerror = () => reject(count.error);
          };
          request.onerror = () => reject(request.error);
        }),
    ),
  ).toBe(0);
});

test('document validation keeps the form usable for a corrected upload', async ({
  page,
}) => {
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre y apellido').fill('Persona que reintenta');
  await dialog.getByLabel('Email *').fill('reintento@example.com');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Sí, es mi primera vez');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  const fileInput = dialog.getByLabel('Documentos (opcional)');
  await fileInput.setInputFiles({
    name: 'receipt.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid'),
  });
  await expect(dialog.getByRole('alert')).toContainText('PDF');
  await fileInput.setInputFiles({
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(dialog.getByRole('alert')).toContainText('5 MB');
  const receipt = {
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nvalid'),
  };
  await fileInput.setInputFiles([receipt, receipt, receipt, receipt]);
  await expect(dialog.getByRole('alert')).toContainText('hasta 3 documentos');
  await fileInput.setInputFiles({
    ...receipt,
    buffer: Buffer.from('renamed content'),
  });
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('contenido');
  await expect(dialog.getByLabel('Nombre y apellido')).toHaveValue(
    'Persona que reintenta',
  );
  await fileInput.setInputFiles(receipt);
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await expect(dialog.getByText('Tu inscripción fue recibida.')).toBeVisible();
});

test('a failed document upload shows an error and can be retried with the same form and files', async ({
  page,
}) => {
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Nombre y apellido')
    .fill('Persona que conserva archivos');
  await dialog.getByLabel('Email *').fill('retry-upload@example.com');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Sí, es mi primera vez');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog.getByLabel('Documentos (opcional)').setInputFiles({
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nreceipt'),
  });
  // Simulate a failure at the browser storage boundary, then restore service.
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    let failures = 1;
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      if (failures-- > 0)
        throw new DOMException('Storage is unavailable', 'QuotaExceededError');
      return open(...args);
    };
  });
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('documentos de prueba');
  await expect(dialog.getByLabel('Nombre y apellido')).toHaveValue(
    'Persona que conserva archivos',
  );
  await expect(dialog.getByLabel('Documentos (opcional)')).toBeEnabled();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await expect(dialog.getByText('Tu inscripción fue recibida.')).toBeVisible();
});

test('studies, emergency contact and barrio choice reach the team, which confirms the barrio', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/account');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByLabel('Nombre y apellido').fill('Persona Barrio');
  await page.getByLabel('Email').fill('barrio@example.com');
  await page.getByLabel('Contraseña').fill('una-clave-segura');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  // New accounts open on their details; the tabs follow the arrow keys.
  const dataTab = page.getByRole('tab', { name: 'Mis datos' });
  const inscriptionsTab = page.getByRole('tab', { name: 'Mis inscripciones' });
  await expect(dataTab).toHaveAttribute('aria-selected', 'true');
  await dataTab.press('ArrowLeft');
  await expect(inscriptionsTab).toBeFocused();
  await expect(inscriptionsTab).toHaveAttribute('aria-selected', 'true');
  await inscriptionsTab.press('ArrowRight');
  await expect(dataTab).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Carrera').fill('Arquitectura');
  await page.getByLabel('Ya me recibí').check();
  await page.getByLabel('Nombre del contacto').fill('Marta Pérez');
  await page.getByRole('button', { name: 'Guardar mis datos' }).click();
  await expect(page.getByRole('alert')).toContainText('vínculo');
  await page.getByLabel('Vínculo').fill('Madre');
  await page.getByLabel('Teléfono del contacto').fill('341 555-0000');
  await page.getByRole('button', { name: 'Guardar mis datos' }).click();
  await expect(page.getByText('Datos guardados.')).toBeVisible();
  const barrio = page.getByRole('region', { name: 'Barrio' });
  await expect(barrio).toContainText('Edición 2027 · Ciclo 2025–2027');
  await barrio.getByLabel('Barrio Oeste').check();
  await barrio.getByRole('button', { name: 'Enviar mi elección' }).click();
  await expect(barrio).toContainText('Elegiste Barrio Oeste');
  await expect(barrio.getByText('Pendiente de confirmación')).toBeVisible();
  await barrio.getByText('Agregar una edición anterior').click();
  await barrio.getByLabel('Edición').selectOption('2019');
  await barrio
    .getByRole('textbox', { name: 'Barrio', exact: true })
    .fill('Barrio Las Flores');
  await barrio.getByRole('button', { name: 'Agregar edición' }).click();
  await expect(
    barrio.locator('.zone-history li').filter({ hasText: '2019' }),
  ).toContainText('Informada por vos');
  await page.reload();
  await expect(page.getByLabel('Carrera')).toHaveValue('Arquitectura');
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('El equipo también verá tus estudios');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Ya participé antes');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  // The team sees the details and confirms the barrio for this edition.
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page
    .locator('.admin-event')
    .filter({ hasText: 'Manos a la Obra 2027' })
    .getByRole('button', { name: '1 Ver inscripciones' })
    .click();
  await expect(
    dialog.getByRole('cell', { name: 'Barrio Oeste (elegido)' }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Ver respuestas de Persona Barrio' })
    .click();
  await expect(dialog).toContainText('Arquitectura · Ya se recibió');
  await expect(dialog).toContainText('Marta Pérez (Madre) · 341 555-0000');
  const zone = dialog.locator('.zone-admin');
  await expect(zone).toContainText('Eligió Barrio Oeste');
  await expect(zone).toContainText(
    '2019 · Barrio Las Flores (informado por la persona)',
  );
  await zone.getByRole('button', { name: 'Confirmar barrio' }).click();
  await expect(zone).toContainText('Barrio Oeste · confirmado');
  await expect(
    dialog.getByRole('cell', { name: 'Barrio Oeste', exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exportar CSV' }).click();
  const csv = await readFile(await (await downloadPromise).path(), 'utf8');
  expect(csv).toContain('"Contacto de emergencia"');
  expect(csv).toContain('"Marta Pérez","Madre","341 555-0000","Barrio Oeste"');
  await page.goto('/account#datos');
  await expect(page.getByRole('region', { name: 'Barrio' })).toContainText(
    'Tu barrio: Barrio Oeste Confirmado',
  );
  expect(errors).toEqual([]);
});
