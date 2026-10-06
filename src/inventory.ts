export type InventoryEntry = {
  name: string;
  quantity: number;
  unit?: string;
  comments?: string;
};
export type InventoryInput = {
  date: string;
  label: string;
  entries: InventoryEntry[];
};
export type Inventory = InventoryInput & { _id: string };
export const MAX_INVENTORY_ENTRIES = 500;

// Shared by the server and the development demo.
export function prepareInventory(input: InventoryInput): InventoryInput {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !Number.isFinite(Date.parse(input.date)) ||
    new Date(input.date).toISOString().slice(0, 10) !== input.date
  )
    throw new Error('La fecha del inventario no es válida.');
  if (!input.label.trim() || input.label.length > 120)
    throw new Error('Escribí una etiqueta de hasta 120 caracteres.');
  if (input.entries.length < 1 || input.entries.length > MAX_INVENTORY_ENTRIES)
    throw new Error(`Agregá entre 1 y ${MAX_INVENTORY_ENTRIES} elementos.`);
  for (const entry of input.entries) {
    if (!entry.name.trim() || entry.name.length > 120)
      throw new Error(
        'Cada elemento necesita un nombre de hasta 120 caracteres.',
      );
    if (!Number.isFinite(entry.quantity) || entry.quantity < 0)
      throw new Error('La cantidad debe ser un número mayor o igual a cero.');
    if ((entry.unit?.length ?? 0) > 40)
      throw new Error(
        'La unidad de medida no puede superar los 40 caracteres.',
      );
    if ((entry.comments?.length ?? 0) > 2000)
      throw new Error('Los comentarios no pueden superar los 2000 caracteres.');
  }
  return {
    date: input.date,
    label: input.label.trim(),
    entries: input.entries.map((entry) => ({
      name: entry.name.trim(),
      quantity: entry.quantity,
      ...(entry.unit?.trim() ? { unit: entry.unit.trim() } : {}),
      ...(entry.comments?.trim() ? { comments: entry.comments.trim() } : {}),
    })),
  };
}
