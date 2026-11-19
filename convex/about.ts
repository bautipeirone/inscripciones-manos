import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireAdmin } from './admin';
import { aboutFields, donorFields, donorKind } from './schema';
import { planDonorBatch, prepareAbout, prepareDonor } from '../src/about';

// Runs shared validation and reports its message to the admin.
function checked<T>(prepare: () => T): T {
  try {
    return prepare();
  } catch (error) {
    throw new ConvexError((error as Error).message);
  }
}

// The saved texts of the public «Nosotros» page; null until the team edits
// them, when the site shows its default texts.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const saved = await ctx.db.query('about').first();
    if (!saved) return null;
    const { _id, _creationTime, ...content } = saved;
    return content;
  },
});

export const save = mutation({
  args: { content: v.object(aboutFields) },
  handler: async (ctx, { content }) => {
    await requireAdmin(ctx);
    const value = checked(() => prepareAbout(content));
    const saved = await ctx.db.query('about').first();
    if (saved) await ctx.db.replace(saved._id, value);
    else await ctx.db.insert('about', value);
  },
});

// Donors are published on purpose: the list holds only what the team enters.
export const listDonors = query({
  args: {},
  handler: async (ctx) => await ctx.db.query('donors').collect(),
});

export const saveDonor = mutation({
  args: { id: v.optional(v.id('donors')), donor: v.object(donorFields) },
  handler: async (ctx, { id, donor }) => {
    await requireAdmin(ctx);
    if (id && !(await ctx.db.get(id)))
      throw new ConvexError('No encontramos al donante.');
    const value = checked(() => prepareDonor(donor));
    if (id) {
      await ctx.db.replace(id, value);
      return id;
    }
    return await ctx.db.insert('donors', value);
  },
});

export const addDonors = mutation({
  args: { names: v.array(v.string()), kind: donorKind, year: v.number() },
  handler: async (ctx, input) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query('donors').collect();
    const plan = checked(() => planDonorBatch(existing, input));
    for (const donor of plan.inserts) await ctx.db.insert('donors', donor);
    for (const { _id, years } of plan.updates) {
      const id = ctx.db.normalizeId('donors', _id);
      if (id) await ctx.db.patch(id, { years });
    }
    return {
      added: plan.inserts.length,
      updated: plan.updates.length,
      unchanged: plan.unchanged,
    };
  },
});

export const removeDonor = mutation({
  args: { id: v.id('donors') },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
