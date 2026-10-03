import {
  createAccount,
  modifyAccountCredentials,
  invalidateSessions,
} from '@convex-dev/auth/server';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
export const provision = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || password.length < 12)
      throw new Error(
        'Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in Convex first.',
      );
    const { user } = await createAccount(ctx, {
      provider: 'password',
      account: { id: email, secret: password },
      profile: { email, name: 'Equipo Manos' },
    });
    await ctx.runMutation(internal.admin.grant, { userId: user._id });
    return 'Admin created. Remove ADMIN_PASSWORD from the deployment environment.';
  },
});
export const resetPassword = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || password.length < 12)
      throw new Error(
        'Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).',
      );
    // Validate the identity before changing credentials or revoking sessions.
    const account = await ctx.runQuery(internal.accounts.accountForReset, {
      userId,
    });
    if (account !== email)
      throw new Error('ADMIN_EMAIL does not match the selected admin.');
    await modifyAccountCredentials(ctx, {
      provider: 'password',
      account: { id: email, secret: password },
    });
    await invalidateSessions(ctx, { userId });
    return 'Password reset. Remove ADMIN_PASSWORD from the deployment environment.';
  },
});
export const accountForReset = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const admin = await ctx.db
      .query('admins')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (!admin) throw new Error('Admin not found.');
    return (await ctx.db.get(userId))?.email;
  },
});
