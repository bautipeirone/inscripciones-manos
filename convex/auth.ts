import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        // Admin accounts are provisioned only through the internal CLI action.
        if (params.flow !== 'signIn')
          throw new ConvexError('El registro de cuentas no está habilitado.');
        if (typeof params.email !== 'string')
          throw new ConvexError('Ingresá tu email.');
        return { email: params.email.trim().toLowerCase() };
      },
    }),
  ],
  session: { totalDurationMs: 7 * 24 * 60 * 60 * 1000 },
});
