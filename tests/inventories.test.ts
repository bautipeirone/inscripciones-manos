import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { MAX_INVENTORY_ENTRIES, type InventoryInput } from '../src/inventory';

const modules = import.meta.glob('../convex/**/*.ts');
const inventory: InventoryInput = {
  date: '2026-07-12',
  label: ' Depósito antes de la jornada ',
  entries: [
    { name: ' Palas ', quantity: 3 },
    {
      name: 'Pintura blanca',
      quantity: 2.5,
      unit: ' litros ',
      comments: ' Lata abierta\nEn el estante ',
    },
    { name: 'Taladro', quantity: 0, unit: '', comments: ' ' },
  ],
};
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { email: 'admin@example.com' });
    await ctx.db.insert('admins', { userId: id });
    return id;
  });
  return { t, admin: t.withIdentity({ subject: `${userId}|session` }) };
}

describe('private inventories', () => {
  test('anonymous callers and signed-in non-admins cannot read, create, update or delete inventories', async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.inventories.save, { inventory });
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'user@example.com' }),
    );
    for (const caller of [
      t,
      t.withIdentity({ subject: `${userId}|session` }),
    ]) {
      await expect(caller.query(api.inventories.listAdmin, {})).rejects.toThrow(
        'Acceso no autorizado',
      );
      await expect(
        caller.mutation(api.inventories.save, { inventory }),
      ).rejects.toThrow('Acceso no autorizado');
      await expect(
        caller.mutation(api.inventories.save, { id, inventory }),
      ).rejects.toThrow('Acceso no autorizado');
      await expect(
        caller.mutation(api.inventories.remove, { id }),
      ).rejects.toThrow('Acceso no autorizado');
    }
    expect(await admin.query(api.inventories.listAdmin, {})).toHaveLength(1);
    expect(await t.query(api.events.listPublic, {})).toEqual([]);
  });

  test('stores dated snapshots, normalizes optional fields, edits entries and deletes the whole inventory', async () => {
    const { admin } = await setup();
    const id = await admin.mutation(api.inventories.save, { inventory });
    // Inventory dates are independent of the activity calendar.
    const newer = await admin.mutation(api.inventories.save, {
      inventory: { ...inventory, date: '2026-08-01' },
    });
    let rows = await admin.query(api.inventories.listAdmin, {});
    expect(rows.map((item) => item._id)).toEqual([newer, id]);
    expect(rows[1]).toMatchObject({
      label: 'Depósito antes de la jornada',
      entries: [
        { name: 'Palas', quantity: 3 },
        {
          name: 'Pintura blanca',
          quantity: 2.5,
          unit: 'litros',
          comments: 'Lata abierta\nEn el estante',
        },
        { name: 'Taladro', quantity: 0 },
      ],
    });
    expect(rows[1].entries[2]).not.toHaveProperty('unit');
    expect(rows[1].entries[2]).not.toHaveProperty('comments');
    await admin.mutation(api.inventories.save, {
      id,
      inventory: {
        date: '2026-07-13',
        label: 'Depósito actualizado',
        entries: [{ name: 'Brochas', quantity: 6 }],
      },
    });
    rows = await admin.query(api.inventories.listAdmin, {});
    expect(rows[1]).toMatchObject({
      _id: id,
      date: '2026-07-13',
      label: 'Depósito actualizado',
      entries: [{ name: 'Brochas', quantity: 6 }],
    });
    expect(rows[0].entries).toHaveLength(3);
    await admin.mutation(api.inventories.remove, { id });
    await admin.mutation(api.inventories.remove, { id });
    expect(
      (await admin.query(api.inventories.listAdmin, {})).map(
        (item) => item._id,
      ),
    ).toEqual([newer]);
    await expect(
      admin.mutation(api.inventories.save, { id, inventory }),
    ).rejects.toThrow('No encontramos el inventario');
  });

  test.each<Partial<InventoryInput>>([
    { date: '2026-02-30' },
    { date: 'not-a-date' },
    { label: '   ' },
    { label: 'a'.repeat(121) },
    { entries: [] },
    {
      entries: Array.from({ length: MAX_INVENTORY_ENTRIES + 1 }, () => ({
        name: 'Pala',
        quantity: 1,
      })),
    },
    { entries: [{ name: ' ', quantity: 1 }] },
    { entries: [{ name: 'a'.repeat(121), quantity: 1 }] },
    { entries: [{ name: 'Pala', quantity: -1 }] },
    { entries: [{ name: 'Pala', quantity: Infinity }] },
    { entries: [{ name: 'Pala', quantity: NaN }] },
    { entries: [{ name: 'Pala', quantity: 1, unit: 'a'.repeat(41) }] },
    { entries: [{ name: 'Pala', quantity: 1, comments: 'a'.repeat(2001) }] },
  ])(
    'rejects invalid inventory data without changing a saved snapshot: %j',
    async (change) => {
      const { admin } = await setup();
      const id = await admin.mutation(api.inventories.save, { inventory });
      const before = await admin.query(api.inventories.listAdmin, {});
      await expect(
        admin.mutation(api.inventories.save, {
          inventory: { ...inventory, ...change },
        }),
      ).rejects.toThrow();
      await expect(
        admin.mutation(api.inventories.save, {
          id,
          inventory: { ...inventory, ...change },
        }),
      ).rejects.toThrow();
      expect(await admin.query(api.inventories.listAdmin, {})).toEqual(before);
    },
  );
});
