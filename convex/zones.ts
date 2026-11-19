import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin } from './admin';
import {
  assignTarget,
  cycleFor,
  editionOf,
  eventEdition,
  requestTarget,
  validateCycle,
  validatePastEdition,
  zoneOverview,
} from '../src/zones';

// Shared rules throw plain errors; callers need their message.
function attempt<T>(run: () => T) {
  try {
    return run();
  } catch (e) {
    throw new ConvexError((e as Error).message);
  }
}
async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError('Ingresá a tu cuenta.');
  return userId;
}
const assignmentsOf = (ctx: QueryCtx, userId: Id<'users'>) =>
  ctx.db
    .query('zoneAssignments')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
async function inscribedEditions(ctx: QueryCtx, userId: Id<'users'>) {
  const rows = await ctx.db
    .query('registrations')
    .withIndex('by_user_event', (q) => q.eq('userId', userId))
    .collect();
  const events = await Promise.all(rows.map((r) => ctx.db.get(r.eventId)));
  return events.filter((e) => e !== null).map(eventEdition);
}
// Cycles and barrios are a handful of rows per three years.
export async function overviewFor(
  ctx: QueryCtx,
  userId: Id<'users'>,
  edition: number,
) {
  const [cycles, zones, assignments, pastEditions, editions] =
    await Promise.all([
      ctx.db.query('zoneCycles').collect(),
      ctx.db.query('zones').collect(),
      assignmentsOf(ctx, userId),
      ctx.db
        .query('pastEditions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
      inscribedEditions(ctx, userId),
    ]);
  return zoneOverview({
    edition,
    cycles,
    zones,
    assignments,
    pastEditions,
    inscribedEditions: editions,
  });
}
// The barrio in effect for an edition, for admin lists and exports.
export async function placementFor(
  ctx: QueryCtx,
  userId: Id<'users'>,
  cycle: Doc<'zoneCycles'> | undefined,
  edition: number,
) {
  if (!cycle) return null;
  const assignment = await ctx.db
    .query('zoneAssignments')
    .withIndex('by_user', (q) =>
      q
        .eq('userId', userId)
        .eq('cycleId', cycle._id)
        .lte('fromEdition', edition),
    )
    .order('desc')
    .first();
  const zone = assignment && (await ctx.db.get(assignment.zoneId));
  return zone ? { name: zone.name, status: assignment.status } : null;
}
export const cycleOf = async (ctx: QueryCtx, edition: number) =>
  cycleFor(await ctx.db.query('zoneCycles').collect(), edition);

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await overviewFor(ctx, userId, editionOf(Date.now()));
  },
});
async function zoneInCycle(ctx: MutationCtx, zoneId: Id<'zones'>) {
  const zone = await ctx.db.get(zoneId);
  const cycle = zone && (await ctx.db.get(zone.cycleId));
  if (!zone || !cycle) throw new ConvexError('No encontramos el barrio.');
  return { zone, cycle };
}
// Participants choose only in the current cycle; the team confirms.
export const request = mutation({
  args: { zoneId: v.id('zones') },
  handler: async (ctx, { zoneId }) => {
    const userId = await requireUser(ctx);
    const { cycle } = await zoneInCycle(ctx, zoneId);
    const edition = editionOf(Date.now());
    if (edition < cycle.startYear || cycle.endYear < edition)
      throw new ConvexError('Ese barrio no corresponde al ciclo actual.');
    const assignments = await assignmentsOf(ctx, userId);
    const pending = attempt(() => requestTarget(assignments, cycle._id));
    if (pending) await ctx.db.patch(pending._id, { zoneId });
    else
      await ctx.db.insert('zoneAssignments', {
        userId,
        cycleId: cycle._id,
        zoneId,
        fromEdition: edition,
        status: 'requested',
      });
  },
});
export const withdraw = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const cycle = await cycleOf(ctx, editionOf(Date.now()));
    if (!cycle) return;
    const assignments = await assignmentsOf(ctx, userId);
    const pending = attempt(() => requestTarget(assignments, cycle._id));
    if (pending) await ctx.db.delete(pending._id);
  },
});
export const addPastEdition = mutation({
  args: { edition: v.number(), zone: v.string() },
  handler: async (ctx, input) => {
    const userId = await requireUser(ctx);
    const declared = await ctx.db
      .query('pastEditions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const taken = [
      ...declared.map((p) => p.edition),
      ...(await inscribedEditions(ctx, userId)),
    ];
    attempt(() => validatePastEdition(input, editionOf(Date.now()), taken));
    await ctx.db.insert('pastEditions', {
      userId,
      edition: input.edition,
      zone: input.zone.trim(),
    });
  },
});
export const removePastEdition = mutation({
  args: { id: v.id('pastEditions') },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const past = await ctx.db.get(id);
    if (past?.userId === userId) await ctx.db.delete(id);
  },
});
// Confirms a request, assigns someone without one, or moves them from an
// edition on. Earlier editions keep the barrio where the person went.
export const assign = mutation({
  args: {
    userId: v.id('users'),
    zoneId: v.id('zones'),
    edition: v.number(),
  },
  handler: async (ctx, { userId, zoneId, edition }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(userId)))
      throw new ConvexError('No encontramos la cuenta.');
    const { cycle } = await zoneInCycle(ctx, zoneId);
    if (edition < cycle.startYear || cycle.endYear < edition)
      throw new ConvexError('Ese barrio no corresponde a esta edición.');
    const assignments = await assignmentsOf(ctx, userId);
    const existing = assignTarget(assignments, cycle._id, edition);
    if (existing)
      await ctx.db.patch(existing._id, { zoneId, status: 'confirmed' });
    else
      await ctx.db.insert('zoneAssignments', {
        userId,
        cycleId: cycle._id,
        zoneId,
        fromEdition: edition,
        status: 'confirmed',
      });
  },
});
// Until the admin panel exists: npx convex run zones:createCycle
// '{"startYear":2025,"endYear":2027,"zones":["Barrio A","Barrio B","Barrio C"]}'
export const createCycle = internalMutation({
  args: {
    startYear: v.number(),
    endYear: v.number(),
    zones: v.array(v.string()),
  },
  handler: async (ctx, input) => {
    const cycles = await ctx.db.query('zoneCycles').collect();
    attempt(() => validateCycle(input, cycles));
    const cycleId = await ctx.db.insert('zoneCycles', {
      startYear: input.startYear,
      endYear: input.endYear,
    });
    for (const name of input.zones)
      await ctx.db.insert('zones', { cycleId, name: name.trim() });
    return cycleId;
  },
});
