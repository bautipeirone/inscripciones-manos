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
  await page.goto('/');
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Ingresar' }),
  ).toHaveCount(0);
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
