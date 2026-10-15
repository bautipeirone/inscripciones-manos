import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (typeof params.email !== 'string')
          throw new ConvexError('Ingresá tu email.');
        const email = params.email.trim().toLowerCase();
        if (!email) throw new ConvexError('Ingresá tu email.');
        const profile: { email: string; [key: string]: string } = { email };
        if (params.flow === 'signUp') {
          if (typeof params.name !== 'string' || params.name.trim().length < 2)
            throw new ConvexError('Ingresá tu nombre y apellido.');
          profile.name = params.name.trim();
        }
        return profile;
      },
    }),
  ],
  session: { totalDurationMs: 7 * 24 * 60 * 60 * 1000 },
});
