import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import {
  query,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Id } from './_generated/dataModel';
import { profileFields } from './schema';
import {
  eventSummary,
  normalizeEmail,
  validateProfile,
  type Profile,
} from '../src/domain';

// Every function here reads the user from the session, never from arguments,
// so a participant can only reach their own profile and inscriptions.
const findProfile = (ctx: QueryCtx, userId: Id<'users'>) =>
  ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
export async function saveProfileFor(
  ctx: MutationCtx,
  userId: Id<'users'>,
  input: Profile,
) {
  const profile = {
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    phone: input.phone.trim(),
  };
  const existing = await findProfile(ctx, userId);
  if (existing) await ctx.db.patch(existing._id, profile);
  else await ctx.db.insert('profiles', { userId, ...profile });
}
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    // Until the participant saves a profile, prefill from the sign-up data.
    const profile = await findProfile(ctx, userId);
    return {
      accountEmail: user.email ?? '',
      name: profile?.name ?? user.name ?? '',
      email: profile?.email ?? user.email ?? '',
      phone: profile?.phone ?? '',
    };
  },
});
export const saveProfile = mutation({
  args: profileFields,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Ingresá a tu cuenta.');
    try {
      validateProfile(args);
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
    await saveProfileFor(ctx, userId, args);
  },
});
export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query('registrations')
      .withIndex('by_user_event', (q) => q.eq('userId', userId))
      .collect();
    const entries = await Promise.all(
      rows.map(async (row) => {
        const event = await ctx.db.get(row.eventId);
        if (!event) return null;
        return {
          _id: row._id,
          _creationTime: row._creationTime,
          event: eventSummary(event),
          status: row.status ?? ('accepted' as const),
          name: row.name,
          email: row.email,
          phone: row.phone,
          answers: event.questions
            .filter((q) => row.answers[q.id])
            .map((q) => ({ label: q.label, value: row.answers[q.id] })),
          // Names only: documents are downloadable by the team, not here.
          attachments: (row.attachments ?? []).map(
            ({ storageId: _storageId, ...metadata }) => metadata,
          ),
        };
      }),
    );
    return entries.filter((entry) => entry !== null);
  },
});
