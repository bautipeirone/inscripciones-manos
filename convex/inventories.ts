import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireAdmin } from './admin';
import { inventoryFields } from './schema';
import { prepareInventory } from '../src/inventory';

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query('inventories')
      .withIndex('by_date')
      .order('desc')
      .collect();
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id('inventories')),
    inventory: v.object(inventoryFields),
  },
  handler: async (ctx, { id, inventory }) => {
    await requireAdmin(ctx);
    if (id && !(await ctx.db.get(id)))
      throw new ConvexError('No encontramos el inventario.');
    let value;
    try {
      value = prepareInventory(inventory);
    } catch (error) {
      throw new ConvexError((error as Error).message);
    }
    if (id) {
      await ctx.db.patch(id, value);
      return id;
    }
    return await ctx.db.insert('inventories', value);
  },
});

export const remove = mutation({
  args: { id: v.id('inventories') },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
