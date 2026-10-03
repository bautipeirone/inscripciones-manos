import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { requireAdmin } from './admin';
import { eventFields } from './schema';
import { validateEvent } from '../src/domain';
export const listPublic = query({
  args: {},
  handler: async (ctx) =>
    (
      await ctx.db
        .query('events')
        .withIndex('by_visible', (q) => q.eq('visible', true))
        .collect()
    ).sort((a, b) => a.date.localeCompare(b.date)),
});
export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return (await ctx.db.query('events').collect()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  },
});
export const save = mutation({
  args: { id: v.optional(v.id('events')), event: v.object(eventFields) },
  handler: async (ctx, { id, event }) => {
    await requireAdmin(ctx);
    const existing = id ? await ctx.db.get(id) : null;
    if (id && !existing) throw new ConvexError('No encontramos el evento.');
    try {
      validateEvent(existing ? { ...existing, ...event } : event, !id);
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
    if (id) {
      // Keep question IDs and definitions stable once answers exist.
      if (
        existing!.registrationCount > 0 &&
        JSON.stringify(existing!.questions) !== JSON.stringify(event.questions)
      )
        throw new ConvexError(
          'Las preguntas no se pueden cambiar después de recibir inscripciones. Creá otro formulario.',
        );
      await ctx.db.patch(id, event);
      return id;
    }
    return await ctx.db.insert('events', { ...event, registrationCount: 0 });
  },
});
export const setAvailability = mutation({
  args: { id: v.id('events'), visible: v.boolean(), accepting: v.boolean() },
  handler: async (ctx, { id, ...update }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(id)))
      throw new ConvexError('No encontramos el evento.');
    await ctx.db.patch(id, update);
  },
});
