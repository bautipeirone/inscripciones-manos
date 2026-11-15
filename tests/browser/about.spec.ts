import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-26T12:00:00-03:00'));
});

test('the public Nosotros page shows the default texts and donors by year', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Nosotros', exact: true })
    .click();
  await expect(page).toHaveURL(/\/nosotros$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Universitarios que ponen manos a la obra',
  );
  await expect(
    page.getByRole('heading', { name: 'Qué hacemos', exact: true }),
  ).toBeVisible();
  const wall = page.getByRole('region', { name: 'Donaciones', exact: true });
  await expect(
    wall.getByRole('link', { name: 'morosario.com.ar' }),
  ).toHaveAttribute('href', 'https://www.morosario.com.ar');
  const year = wall.getByRole('region', { name: 'Donaron en 2026' });
  await expect(year.getByText('Ferretería El Galpón')).toBeVisible();
  await expect(year.getByText('Lucía Ferreyra')).toBeVisible();
  await expect(
    wall.getByRole('region', { name: 'Donaron en 2024' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('admins edit the texts and the donors, and the public page keeps the changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Explorar panel de prueba' }).click();
  await page.getByRole('tab', { name: 'Nosotros', exact: true }).click();
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Editar textos' }).click();
  await dialog.getByLabel('Título principal').fill('Quiénes somos');
  await dialog.getByRole('button', { name: 'Quitar sección 3' }).click();
  await dialog.getByRole('button', { name: 'Agregar sección' }).click();
  const added = dialog.getByRole('group', { name: 'Sección 3', exact: true });
  await added.getByLabel('Título *', { exact: true }).fill('Nuestra historia');
  await added
    .getByLabel('Texto *', { exact: true })
    .fill('Primer párrafo.\n\nEscribinos a equipo@example.com.');
  await dialog.getByRole('button', { name: 'Subir sección 3' }).click();
  await dialog.getByLabel('Cómo donar').fill('');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText(
      '3 secciones: Qué hacemos, Nuestra historia, Cómo nos organizamos',
    ),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo donante' }).click();
  await dialog.getByLabel('Nombre *', { exact: true }).fill('Aserradero Sur');
  await dialog.getByLabel('2025', { exact: true }).check();
  await dialog.getByLabel('Otro año').fill('2015');
  await dialog.getByRole('button', { name: 'Agregar año' }).click();
  await expect(dialog.getByLabel('2015', { exact: true })).toBeChecked();
  await dialog.getByLabel('Detalle').fill('Madera');
  await dialog.getByLabel('Sitio web').fill('https://example.com/aserradero');
  await dialog.getByRole('button', { name: 'Agregar donante' }).click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Aserradero Sur' });
  await expect(row.getByText('2026, 2025, 2015')).toBeVisible();

  await page.getByRole('button', { name: 'Agregar varios' }).click();
  await dialog.getByLabel('Año de la donación').fill('2026');
  await dialog.getByLabel('Nombres').fill('Julián Peralta\nNora Quiroga\n');
  await dialog.getByRole('button', { name: 'Agregar donantes' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText(
      'Agregamos 1 donante. Sumamos el año a 1 donante que ya estaba en la lista.',
    ),
  ).toBeVisible();

  await page.getByLabel('Buscar donantes').fill('villalba');
  await page
    .getByRole('button', { name: 'Editar donante Tomás Villalba' })
    .click();
  await dialog.getByRole('button', { name: 'Quitar donante' }).click();
  await dialog
    .getByRole('alert')
    .getByRole('button', { name: 'Quitar donante' })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('No encontramos coincidencias.')).toBeVisible();

  await page.goto('/nosotros#donaciones');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Quiénes somos',
  );
  await expect(
    page.getByRole('heading', { level: 2 }).allTextContents(),
  ).resolves.toEqual([
    'Qué hacemos',
    'Nuestra historia',
    'Cómo nos organizamos',
    'Donaciones',
  ]);
  await expect(
    page.getByRole('link', { name: 'equipo@example.com' }),
  ).toHaveAttribute('href', 'mailto:equipo@example.com');
  await expect(
    page.getByRole('heading', { name: 'Cómo donar' }),
  ).not.toBeVisible();
  const wall = page.getByRole('region', { name: 'Donaciones', exact: true });
  await expect(wall).toBeInViewport();
  const year = wall.getByRole('region', { name: 'Donaron en 2026' });
  await expect(
    year.getByRole('link', { name: 'Aserradero Sur' }),
  ).toHaveAttribute('href', 'https://example.com/aserradero');
  await expect(year.getByText('Madera')).toBeVisible();
  await expect(year.getByText('Julián Peralta')).toBeVisible();
  await expect(year.getByText('Nora Quiroga')).toBeVisible();
  await expect(
    wall.getByRole('region', { name: 'Donaron en 2015' }),
  ).toContainText('Aserradero Sur');
  await expect(wall.getByText('Tomás Villalba')).toHaveCount(0);
  expect(errors).toEqual([]);
});
