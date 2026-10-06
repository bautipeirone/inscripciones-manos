import { expect, test } from '@playwright/test';

test('inventory creation, optional units, decimals, editing, search, persistence and confirmed deletion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-09-26T12:00:00-03:00'));
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page.getByRole('tab', { name: 'Actividades', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Inventarios', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText('No hay inventarios registrados todavía.'),
  ).toBeVisible();
  const newButton = page.getByRole('button', {
    name: 'Nuevo inventario',
    exact: true,
  });
  await newButton.click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Etiqueta *', { exact: true })
    .fill('Depósito de herramientas');
  await dialog.getByLabel('Fecha del inventario').fill('2026-07-12');
  const first = dialog.getByRole('group', { name: 'Elemento 1', exact: true });
  await first.getByLabel('Nombre *', { exact: true }).fill('Palas');
  await first.getByLabel('Cantidad *', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Agregar elemento' }).click();
  const second = dialog.getByRole('group', { name: 'Elemento 2', exact: true });
  await second.getByLabel('Nombre *', { exact: true }).fill('Pintura blanca');
  await second.getByLabel('Cantidad *', { exact: true }).fill('2.5');
  await second.getByLabel('Unidad de medida').fill('litros');
  await second
    .getByLabel('Comentarios')
    .fill('Lata "abierta", en uso\nEn el estante');
  await dialog
    .getByRole('button', { name: 'Crear inventario', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(newButton).toBeFocused();
  const row = page
    .locator('.inventory-card')
    .filter({ hasText: 'Depósito de herramientas' });
  await expect(row.getByText('2 elementos', { exact: true })).toBeVisible();
  await row
    .getByRole('button', { name: 'Ver inventario Depósito de herramientas' })
    .click();
  const paint = dialog.getByRole('row').filter({ hasText: 'Pintura blanca' });
  await expect(
    paint.getByRole('cell', { name: '2,5', exact: true }),
  ).toBeVisible();
  await expect(
    paint.getByRole('cell', { name: 'litros', exact: true }),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole('row')
      .filter({ hasText: 'Palas' })
      .getByRole('cell', { name: '—', exact: true }),
  ).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await dialog
    .getByRole('button', { name: 'Exportar CSV', exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('inventario-2026-07-12.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe(
    '\uFEFF"Fecha","Etiqueta","Nombre","Cantidad","Unidad","Comentarios"\r\n' +
      '"2026-07-12","Depósito de herramientas","Palas","3","",""\r\n' +
      '"2026-07-12","Depósito de herramientas","Pintura blanca","2.5","litros","Lata ""abierta"", en uso\nEn el estante"',
  );
  await page.keyboard.press('Escape');
  await row
    .getByRole('button', { name: 'Editar inventario Depósito de herramientas' })
    .click();
  await dialog
    .getByLabel('Etiqueta *', { exact: true })
    .fill('Depósito actualizado');
  await dialog.getByLabel('Fecha del inventario').fill('2026-07-13');
  await first.getByLabel('Cantidad *', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Quitar elemento 2' }).click();
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Buscar inventarios').fill('inexistente');
  await expect(page.getByText('No encontramos coincidencias.')).toBeVisible();
  await page.getByLabel('Buscar inventarios').fill('2026-07-13');
  const updated = page
    .locator('.inventory-card')
    .filter({ hasText: 'Depósito actualizado' });
  await expect(updated).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page.getByRole('tab', { name: 'Inventarios', exact: true }).click();
  await expect(updated.getByText('1 elemento', { exact: true })).toBeVisible();
  await updated
    .getByRole('button', { name: 'Ver inventario Depósito actualizado' })
    .click();
  await expect(
    dialog.getByRole('cell', { name: '0', exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Eliminar inventario', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    dialog.getByRole('cell', { name: 'Palas', exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Eliminar inventario', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Eliminar definitivamente' })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText('No hay inventarios registrados todavía.'),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page.getByRole('tab', { name: 'Inventarios', exact: true }).click();
  await expect(
    page.getByText('No hay inventarios registrados todavía.'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('old demo data is preserved and registration changes keep inventories', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-26T12:00:00-03:00'));
  await page.goto('/');
  await page.evaluate(() => {
    const demo = JSON.parse(localStorage.getItem('manos-demo-v1')!);
    delete demo.inventories;
    localStorage.setItem('manos-demo-v1', JSON.stringify(demo));
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await expect(page.locator('.admin-event')).toHaveCount(6);
  await page.getByRole('tab', { name: 'Inventarios', exact: true }).click();
  await page
    .getByRole('button', { name: 'Nuevo inventario', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Etiqueta *', { exact: true }).fill('Herramientas');
  await dialog.getByLabel('Nombre *', { exact: true }).fill('Taladro');
  await dialog.getByLabel('Cantidad *', { exact: true }).fill('1');
  await dialog.getByRole('button', { name: 'Crear inventario' }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto('/activities/demo-main');
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
  await dialog.getByLabel('Nombre y apellido').fill('Voluntaria de prueba');
  await dialog.getByLabel('Email *').fill('voluntaria@example.com');
  await dialog
    .getByLabel('¿Es tu primera experiencia')
    .selectOption('Sí, es mi primera vez');
  await dialog.getByLabel('Autorizo al Equipo de Inscripciones').check();
  await dialog
    .getByRole('button', { name: 'Confirmar mi inscripción' })
    .click();
  await dialog.getByRole('button', { name: 'Listo, nos vemos ahí' }).click();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page.getByRole('tab', { name: 'Inventarios', exact: true }).click();
  await expect(
    page
      .locator('.inventory-card')
      .getByRole('heading', { name: 'Herramientas' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Actividades', exact: true }).click();
  await page
    .locator('.admin-event')
    .filter({ hasText: 'Manos a la Obra 2027' })
    .getByRole('button', { name: '1 Ver inscripciones' })
    .click();
  await dialog
    .getByRole('button', { name: 'Ver respuestas de Voluntaria de prueba' })
    .click();
  await dialog
    .getByRole('button', { name: 'Eliminar inscripción', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Eliminar definitivamente' })
    .click();
  await expect(dialog.getByText('Todavía no hay inscripciones.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Inventarios', exact: true }).click();
  await expect(
    page
      .locator('.inventory-card')
      .getByRole('heading', { name: 'Herramientas' }),
  ).toBeVisible();
});
