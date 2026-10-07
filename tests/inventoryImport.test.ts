import { describe, expect, test } from 'vitest';
import { utils, write, type WorkSheet } from 'xlsx';
import { csvCell } from '../src/domain';
import { MAX_INVENTORY_ENTRIES } from '../src/inventory';
import { MAX_IMPORT_BYTES, readInventoryFile } from '../src/inventoryImport';

function file(
  source: string | ArrayBuffer | Uint8Array,
  name = 'inventario.csv',
) {
  const bytes =
    typeof source === 'string'
      ? new TextEncoder().encode(source)
      : new Uint8Array(source);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer,
  };
}
function excel(
  sheet: WorkSheet,
  bookType: 'xlsx' | 'xls' = 'xlsx',
  extraSheet?: WorkSheet,
) {
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, 'Inventario');
  if (extraSheet) utils.book_append_sheet(book, extraSheet, 'Otra hoja');
  return file(
    write(book, { bookType, type: 'array' }),
    `inventario.${bookType}`,
  );
}

describe('inventory file import', () => {
  test('reads exported CSV including BOM, metadata, decimals, empty optionals, quotes and newlines', async () => {
    const rows = [
      ['Fecha', 'Etiqueta', 'Nombre', 'Cantidad', 'Unidad', 'Comentarios'],
      ['2026-07-12', 'Depósito', 'Palas', '0', '', ''],
      [
        '2026-07-12',
        'Depósito',
        'Pintura, blanca',
        '2.5',
        'litros',
        'Lata "abierta"\nEn el estante',
      ],
      ['2026-07-12', 'Depósito', 'Polvo', '1e-7', 'kg', ''],
    ];
    expect(
      await readInventoryFile(
        file(
          '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
        ),
      ),
    ).toEqual({
      date: '2026-07-12',
      label: 'Depósito',
      entries: [
        { name: 'Palas', quantity: 0 },
        {
          name: 'Pintura, blanca',
          quantity: 2.5,
          unit: 'litros',
          comments: 'Lata "abierta"\nEn el estante',
        },
        { name: 'Polvo', quantity: 1e-7, unit: 'kg' },
      ],
    });
  });
  test('accepts semicolon CSV, decimal comma, reordered headers and empty rows', async () => {
    expect(
      await readInventoryFile(
        file(
          ' CANTIDAD ;Nómbre;Otros datos;unidad;comentarios\n2,5; Pintura ;ignorado; litros ; Lata abierta \n;;;;\n0;Palas;;;\n',
        ),
      ),
    ).toEqual({
      entries: [
        {
          name: 'Pintura',
          quantity: 2.5,
          unit: 'litros',
          comments: 'Lata abierta',
        },
        { name: 'Palas', quantity: 0 },
      ],
    });
    expect(
      (await readInventoryFile(file('Nombre,Cantidad\nPintura,"2,5"')))
        .entries[0].quantity,
    ).toBe(2.5);
  });
  test.each(['xlsx', 'xls'] as const)(
    'reads real %s workbooks with typed dates and quantities, using only the first sheet',
    async (bookType) => {
      const sheet = utils.aoa_to_sheet(
        [
          ['Etiqueta', 'Cantidad', 'Fecha', 'Nombre', 'Unidad', 'Comentarios'],
          [
            'Depósito',
            2.5,
            new Date('2026-07-12T00:00:00Z'),
            'Pintura blanca',
            'litros',
            'En el estante',
          ],
          ['Depósito', 0, new Date('2026-07-12T00:00:00Z'), 'Palas'],
        ],
        { cellDates: true, UTC: true },
      );
      expect(
        await readInventoryFile(
          excel(sheet, bookType, utils.aoa_to_sheet([['Wrong headers']])),
        ),
      ).toEqual({
        date: '2026-07-12',
        label: 'Depósito',
        entries: [
          {
            name: 'Pintura blanca',
            quantity: 2.5,
            unit: 'litros',
            comments: 'En el estante',
          },
          { name: 'Palas', quantity: 0 },
        ],
      });
    },
  );
  test.each([
    ['Herramienta,Cantidad\nPalas,3', 'Nombre y Cantidad'],
    ['Nombre,Cantidad,nombre\nPalas,3,Pintura', 'repetida'],
    ['Nombre,Cantidad\n', 'no contiene elementos'],
    ['Nombre,Cantidad\nPalas,', 'Fila 2'],
    ['Nombre,Cantidad\nPalas,-1', 'Fila 2'],
    ['Nombre,Cantidad\nPalas,3 litros', 'Fila 2'],
    ['Nombre,Cantidad\nPalas,"1.234,5"', 'Fila 2'],
    ['Nombre,Cantidad\n,2', 'Fila 2'],
    ['Nombre,Cantidad\nPalas,Infinity', 'Fila 2'],
    ['Nombre,Cantidad\nPalas,1e999', 'Fila 2'],
    ['Nombre,Cantidad\nPalas,2,ignorado', 'columnas'],
    ['Nombre,Cantidad\n"Palas,2', 'comillas'],
    ['Nombre,Cantidad,Fecha\nPalas,1,2026-02-30', 'fecha'],
    [
      'Nombre,Cantidad,Fecha\nPalas,1,2026-07-12\nPintura,2,2026-07-13',
      'mismo valor',
    ],
    ['Nombre,Cantidad,Etiqueta\nPalas,1,Depósito\nPintura,2,', 'mismo valor'],
    [`Nombre,Cantidad\n${'a'.repeat(121)},2`, 'Fila 2'],
    [`Nombre,Cantidad,Unidad\nPalas,2,${'a'.repeat(41)}`, 'Fila 2'],
    [`Nombre,Cantidad,Comentarios\nPalas,2,${'a'.repeat(2001)}`, 'Fila 2'],
  ])(
    'rejects invalid CSV without silently dropping rows: %s',
    async (source, message) => {
      await expect(readInventoryFile(file(source))).rejects.toThrow(message);
    },
  );
  test('rejects Excel formulas, error cells and merged cells', async () => {
    const sheet = utils.aoa_to_sheet([
      ['Nombre', 'Cantidad'],
      ['Palas', 3],
    ]);
    sheet.B2 = { t: 'n', v: 3, f: '1+2' };
    await expect(readInventoryFile(excel(sheet))).rejects.toThrow('Fila 2');
    sheet.B2 = { t: 'e', v: 7 };
    await expect(readInventoryFile(excel(sheet))).rejects.toThrow(
      'errores de Excel',
    );
    sheet.B2 = { t: 'n', v: 3 };
    sheet['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }];
    await expect(readInventoryFile(excel(sheet))).rejects.toThrow(
      'celdas combinadas',
    );
  });
  test('rejects an empty first Excel sheet even when a later sheet contains data', async () => {
    await expect(
      readInventoryFile(
        excel(
          {},
          'xlsx',
          utils.aoa_to_sheet([
            ['Nombre', 'Cantidad'],
            ['Palas', 3],
          ]),
        ),
      ),
    ).rejects.toThrow('primera hoja');
  });
  test('accepts 500 entries and rejects overflow in CSV and Excel without truncating', async () => {
    const rows = [
      ['Nombre', 'Cantidad'],
      ...Array.from({ length: MAX_INVENTORY_ENTRIES }, (_, i) => [
        `Pala ${i}`,
        '1',
      ]),
    ];
    expect(
      (
        await readInventoryFile(
          file(rows.map((row) => row.join(',')).join('\n')),
        )
      ).entries,
    ).toHaveLength(MAX_INVENTORY_ENTRIES);
    expect(
      (await readInventoryFile(excel(utils.aoa_to_sheet(rows)))).entries,
    ).toHaveLength(MAX_INVENTORY_ENTRIES);
    rows.push(['Pintura', '2']);
    await expect(
      readInventoryFile(file(rows.map((row) => row.join(',')).join('\n'))),
    ).rejects.toThrow('500');
    await expect(
      readInventoryFile(excel(utils.aoa_to_sheet(rows))),
    ).rejects.toThrow('500');
  });
  test('rejects unsupported formats, oversized files and invalid UTF-8', async () => {
    await expect(
      readInventoryFile(file('hello', 'inventory.pdf')),
    ).rejects.toThrow('CSV');
    const oversized = {
      ...file('Nombre,Cantidad\nPalas,1'),
      size: MAX_IMPORT_BYTES + 1,
    };
    await expect(readInventoryFile(oversized)).rejects.toThrow('5 MB');
    await expect(
      readInventoryFile(file(new Uint8Array([0xff, 0xff]))),
    ).rejects.toThrow('UTF-8');
  });
});
