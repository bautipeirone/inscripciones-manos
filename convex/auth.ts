import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import {
  normalizeEmail,
  validatePassword,
  validateProfile,
} from '../src/domain';
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params): Record<string, string> & { email: string } {
        if (typeof params.email !== 'string')
          throw new ConvexError('Ingresá tu email.');
        const email = normalizeEmail(params.email);
        if (params.flow !== 'signUp') return { email };
        // Public sign-up creates participant accounts only. Admin access is
        // granted separately, through the internal provisioning action.
        const name = typeof params.name === 'string' ? params.name.trim() : '';
        try {
          validateProfile({ name, email, phone: '' });
        } catch (e) {
          throw new ConvexError((e as Error).message);
        }
        return { email, name };
      },
      validatePasswordRequirements(password) {
        try {
          validatePassword(password);
        } catch (e) {
          throw new ConvexError((e as Error).message);
        }
      },
    }),
  ],
  session: { totalDurationMs: 7 * 24 * 60 * 60 * 1000 },
});
