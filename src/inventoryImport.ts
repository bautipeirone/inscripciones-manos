import Papa from 'papaparse';
import {
  MAX_INVENTORY_ENTRIES,
  prepareInventory,
  type InventoryEntry,
} from './inventory';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export type ImportedInventory = {
  entries: InventoryEntry[];
  date?: string;
  label?: string;
};
const headers = [
  'nombre',
  'cantidad',
  'unidad',
  'comentarios',
  'fecha',
  'etiqueta',
];
const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const blank = (value: unknown) =>
  value == null || (typeof value === 'string' && !value.trim());

function parseRows(rows: unknown[][]): ImportedInventory {
  const columns = new Map<string, number>();
  (rows[0] ?? []).forEach((value, index) => {
    const name = normalizeHeader(value);
    if (!headers.includes(name)) return;
    if (columns.has(name))
      throw new Error(`La columna ${String(value)} está repetida.`);
    columns.set(name, index);
  });
  if (!columns.has('nombre') || !columns.has('cantidad'))
    throw new Error(
      'La primera fila debe incluir las columnas Nombre y Cantidad.',
    );
  const data = rows
    .slice(1)
    .map((row, index) => ({ row, number: index + 2 }))
    .filter(({ row }) =>
      [...columns.values()].some((index) => !blank(row[index])),
    );
  if (!data.length)
    throw new Error('El archivo no contiene elementos para importar.');
  if (data.length > MAX_INVENTORY_ENTRIES)
    throw new Error(
      `El archivo admite hasta ${MAX_INVENTORY_ENTRIES} elementos.`,
    );
  const get = (row: unknown[], name: string) =>
    columns.has(name) ? row[columns.get(name)!] : undefined;
  const text = (value: unknown) => (value == null ? '' : String(value).trim());
  const entries = data.map(({ row, number }) => {
    const amount = get(row, 'cantidad');
    const raw = text(amount);
    if (
      typeof amount !== 'number' &&
      (typeof amount !== 'string' ||
        !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(raw))
    )
      throw new Error(
        `Fila ${number}: la cantidad debe ser un número mayor o igual a cero, sin separadores de miles.`,
      );
    const entry: InventoryEntry = {
      name: text(get(row, 'nombre')),
      quantity:
        typeof amount === 'number' ? amount : Number(raw.replace(',', '.')),
      unit: text(get(row, 'unidad')),
      comments: text(get(row, 'comentarios')),
    };
    try {
      // Validate each source row with the same rules as a manually entered inventory.
      return prepareInventory({
        date: '2000-01-01',
        label: 'Importación',
        entries: [entry],
      }).entries[0];
    } catch (error) {
      throw new Error(`Fila ${number}: ${(error as Error).message}`);
    }
  });
  const metadata = (column: 'fecha' | 'etiqueta') => {
    const values = data.map(({ row }) => {
      const value = get(row, column);
      return column === 'fecha' &&
        value instanceof Date &&
        Number.isFinite(value.getTime())
        ? value.toISOString().slice(0, 10)
        : text(value);
    });
    if (values.every((value) => !value)) return undefined;
    if (new Set(values).size !== 1)
      throw new Error(
        `La columna ${column === 'fecha' ? 'Fecha' : 'Etiqueta'} debe tener el mismo valor en todas las filas. Importá un solo inventario por archivo.`,
      );
    return values[0];
  };
  const date = metadata('fecha');
  const label = metadata('etiqueta');
  prepareInventory({
    date: date ?? '2000-01-01',
    label: label ?? 'Importación',
    entries,
  });
  return { entries, ...(date ? { date } : {}), ...(label ? { label } : {}) };
}

export async function readInventoryFile(
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
): Promise<ImportedInventory> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['csv', 'xlsx', 'xls'].includes(extension))
    throw new Error('Elegí un archivo CSV (.csv) o Excel (.xlsx o .xls).');
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error('El archivo no puede superar los 5 MB.');
  const buffer = await file.arrayBuffer();
  if (extension === 'csv') {
    let source;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new Error(
        'Guardá el CSV con codificación UTF-8 e intentá de nuevo.',
      );
    }
    const delimiter =
      [',', ';'].find((candidate) => {
        const first =
          Papa.parse<string[]>(source, {
            delimiter: candidate,
            preview: 1,
          }).data[0]?.map(normalizeHeader) ?? [];
        return first.includes('nombre') && first.includes('cantidad');
      }) ?? ',';
    const result = Papa.parse<string[]>(source, {
      delimiter,
      skipEmptyLines: false,
    });
    if (result.errors.length) {
      const error = result.errors[0];
      throw new Error(
        `No pudimos leer el CSV${error.row !== undefined ? ` en la fila ${error.row + 1}` : ''}. Revisá el separador y las comillas.`,
      );
    }
    const width = result.data[0]?.length ?? 0;
    result.data.forEach((row, index) => {
      if (row.some((value) => !blank(value)) && row.length !== width)
        throw new Error(
          `Fila ${index + 1}: la cantidad de columnas no coincide con el encabezado. Usá comillas para textos que contengan el separador.`,
        );
    });
    return parseRows(result.data);
  }
  // Load the Excel reader only when an Excel file is selected.
  const { read, utils } = await import('xlsx');
  let workbook;
  try {
    workbook = read(buffer, {
      type: 'array',
      sheets: 0,
      sheetRows: MAX_INVENTORY_ENTRIES + 2,
      cellDates: true,
      UTC: true,
      cellFormula: true,
      cellHTML: false,
    });
  } catch {
    throw new Error(
      'No pudimos leer el archivo Excel. Revisá que no esté dañado ni protegido con contraseña.',
    );
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref'])
    throw new Error('La primera hoja del archivo Excel está vacía.');
  if (sheet['!merges']?.length)
    throw new Error(
      'La primera hoja no debe contener celdas combinadas. Separá las celdas e intentá de nuevo.',
    );
  const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
  if (range.e.r > MAX_INVENTORY_ENTRIES)
    throw new Error(
      `La primera hoja admite hasta ${MAX_INVENTORY_ENTRIES} filas después del encabezado. Quitá las filas sobrantes.`,
    );
  // Read only recognized columns, preserving their source row positions.
  const columns = Array.from({ length: range.e.c + 1 }, (_, c) => c).filter(
    (c) =>
      headers.includes(
        normalizeHeader(sheet[utils.encode_cell({ r: 0, c })]?.v),
      ),
  );
  const rows = Array.from({ length: range.e.r + 1 }, (_, r) =>
    columns.map((c) => {
      const cell = sheet[utils.encode_cell({ r, c })];
      if (cell?.f || cell?.t === 'e')
        throw new Error(
          `Fila ${r + 1}: usá valores, sin fórmulas ni errores de Excel.`,
        );
      return cell?.v ?? '';
    }),
  );
  return parseRows(rows);
}
