import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { query, internalMutation, type QueryCtx } from './_generated/server';
export async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (
    !userId ||
    !(await ctx.db
      .query('admins')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique())
  )
    throw new ConvexError('Acceso no autorizado.');
  return userId;
}
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const admin = await ctx.db
      .query('admins')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (!admin) return null;
    const user = await ctx.db.get(userId);
    return { email: user?.email ?? '', name: user?.name ?? 'Equipo Manos' };
  },
});
export const grant = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    if (
      !(await ctx.db
        .query('admins')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique())
    )
      await ctx.db.insert('admins', { userId });
  },
});
