import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { normalizeEmail } from '../src/domain';

const profileValidator = v.object({
  name: v.string(),
  email: v.string(),
  phone: v.string(),
});

export const profile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const saved = await ctx.db
      .query('participantProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (saved) return saved;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      userId,
      name: user.name ?? '',
      email: user.email ?? '',
      phone: '',
    };
  },
});

export const saveProfile = mutation({
  args: profileValidator,
  handler: async (ctx, input) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Iniciá sesión para guardar tus datos.');
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    const phone = input.phone.trim();
    if (name.length < 2 || name.length > 120)
      throw new ConvexError('Escribí un nombre de hasta 120 caracteres.');
    const [localPart, domain, ...extraParts] = email.split('@');
    const dotIndex = domain?.indexOf('.') ?? -1;
    if (
      !localPart ||
      !domain ||
      extraParts.length > 0 ||
      /\s/.test(email) ||
      dotIndex <= 0 ||
      dotIndex === domain.length - 1 ||
      email.length > 254
    )
      throw new ConvexError('Escribí un email válido.');
    if (phone.length > 40)
      throw new ConvexError('El teléfono no puede superar los 40 caracteres.');
    const existing = await ctx.db
      .query('participantProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const profile = { userId, name, email, phone };
    if (existing) await ctx.db.patch(existing._id, profile);
    else await ctx.db.insert('participantProfiles', profile);
    return profile;
  },
});
