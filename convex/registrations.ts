import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query, mutation } from './_generated/server';
import { requireAdmin } from './admin';
import { normalizeEmail, validateRegistration } from '../src/domain';
export const submit = mutation({
  args: {
    eventId: v.id('events'),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    answers: v.record(v.string(), v.string()),
    consent: v.boolean(),
    website: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError('No encontramos el evento.');
    try {
      validateRegistration(event, args);
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
    const email = normalizeEmail(args.email);
    const existing = await ctx.db
      .query('registrations')
      .withIndex('by_event_email', (q) =>
        q.eq('eventId', args.eventId).eq('email', email),
      )
      .unique();
    // Idempotent success avoids exposing whether a particular email is registered.
    // Report the current activity policy, not a previous participant's status.
    const result = {
      received: true,
      approvalRequired: event.requireApproval === true,
    };
    if (existing) return result;
    const { website: _website, ...registration } = args;
    await ctx.db.insert('registrations', {
      ...registration,
      name: args.name.trim(),
      email,
      phone: args.phone.trim(),
      status: event.requireApproval ? 'pending' : 'accepted',
    });
    // The lookup, insert, and capacity update share one serializable transaction.
    await ctx.db.patch(event._id, {
      registrationCount: event.registrationCount + 1,
    });
    return result;
  },
});
export const accept = mutation({
  args: { id: v.id('registrations') },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(id);
    if (!registration) throw new ConvexError('No encontramos la inscripción.');
    if (registration.status === 'pending')
      await ctx.db.patch(id, { status: 'accepted' });
  },
});
export const list = query({
  args: { eventId: v.id('events'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { eventId, paginationOpts }) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query('registrations')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .order('desc')
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((row) => ({
        ...row,
        status: row.status ?? ('accepted' as const),
      })),
    };
  },
});
export const remove = mutation({
  args: { id: v.id('registrations') },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(id);
    if (!registration) return;
    const event = await ctx.db.get(registration.eventId);
    await ctx.db.delete(id);
    if (event)
      await ctx.db.patch(event._id, {
        registrationCount: Math.max(0, event.registrationCount - 1),
      });
  },
});
