import { Resend, type EmailId, type EmailStatus } from '@convex-dev/resend';
import { ConvexError, v } from 'convex/values';
import { components, internal } from './_generated/api';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin } from './admin';
import { confirmationTemplate } from './emailTemplate';

// Read configuration per invocation so fixing deployment variables also fixes retries.
export function resendClient() {
  return new Resend(components.resend, {
    testMode: process.env.EMAIL_TEST_MODE !== 'false',
  });
}

async function findConfirmation(
  ctx: QueryCtx,
  registrationId: Id<'registrations'>,
) {
  return await ctx.db
    .query('confirmationEmails')
    .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
    .unique();
}

export async function queueConfirmation(
  ctx: MutationCtx,
  event: Doc<'events'>,
  registration: Doc<'registrations'>,
) {
  const id = await ctx.db.insert('confirmationEmails', {
    registrationId: registration._id,
    to: registration.email,
    ...confirmationTemplate(event, registration),
    state: 'pending',
    attempts: 0,
  });
  // The durable intent and scheduler entry commit with the inscription. Provider
  // configuration and network failures occur in a separate transaction.
  await ctx.scheduler.runAfter(0, internal.emails.enqueue, { id });
}

export const enqueue = internalMutation({
  args: { id: v.id('confirmationEmails') },
  handler: async (ctx, { id }): Promise<void> => {
    const email = await ctx.db.get(id);
    if (!email || email.state !== 'pending' || email.componentEmailId) return;
    if (!(await ctx.db.get(email.registrationId))) return;
    const attempts = email.attempts + 1;
    try {
      const from = process.env.EMAIL_FROM?.trim();
      if (!from || !process.env.RESEND_API_KEY?.trim())
        throw new Error('Configurá EMAIL_FROM y RESEND_API_KEY en Convex.');
      const replyTo = process.env.EMAIL_REPLY_TO?.trim();
      const componentEmailId = await resendClient().sendEmail(ctx, {
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(replyTo ? { replyTo: [replyTo] } : {}),
        idempotencyKey: `registration-confirmation:${id}:${attempts}`,
      });
      await ctx.db.patch(id, {
        state: 'queued',
        attempts,
        componentEmailId,
        error: undefined,
      });
    } catch (error) {
      await ctx.db.patch(id, {
        state: 'failed',
        attempts,
        error:
          error instanceof Error
            ? error.message
            : 'No pudimos encolar el correo.',
      });
    }
  },
});

function safeToRetry(status: EmailStatus) {
  if (status.status !== 'failed' || status.complained || status.bounced)
    return false;
  // A provider failure webhook or an explicit API rejection confirms non-delivery.
  // Exhausted network retries can have an uncertain outcome: do not enqueue a
  // second email with a new provider key in that case.
  return (
    status.failed ||
    /^Resend API error: (400|401|403|404|422)\b/.test(status.errorMessage ?? '')
  );
}

export const status = query({
  args: { registrationId: v.id('registrations') },
  handler: async (ctx, { registrationId }) => {
    await requireAdmin(ctx);
    const email = await findConfirmation(ctx, registrationId);
    if (!email) return null; // Legacy inscriptions were never queued.
    const delivery = email.componentEmailId
      ? await resendClient().status(ctx, email.componentEmailId as EmailId)
      : null;
    return {
      state:
        delivery?.status ??
        (email.componentEmailId ? ('unknown' as const) : email.state),
      error: delivery?.errorMessage ?? email.error ?? null,
      attempts: email.attempts,
      canRetry: email.componentEmailId
        ? delivery !== null && safeToRetry(delivery)
        : email.state === 'failed',
      complained: delivery?.complained ?? false,
    };
  },
});

export const retry = mutation({
  args: { registrationId: v.id('registrations') },
  handler: async (ctx, { registrationId }): Promise<void> => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(registrationId)))
      throw new ConvexError('No encontramos la inscripción.');
    const email = await findConfirmation(ctx, registrationId);
    if (!email)
      throw new ConvexError('Esta inscripción no tiene un correo pendiente.');
    if (email.componentEmailId) {
      const delivery = await resendClient().status(
        ctx,
        email.componentEmailId as EmailId,
      );
      if (!delivery || !safeToRetry(delivery))
        throw new ConvexError(
          'No se puede reintentar este correo sin riesgo de duplicar el envío.',
        );
    } else if (email.state !== 'failed') {
      return; // Concurrent retry requests collapse to the already scheduled work.
    }
    await ctx.db.patch(email._id, {
      state: 'pending',
      componentEmailId: undefined,
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.emails.enqueue, { id: email._id });
  },
});

export async function removeConfirmation(
  ctx: MutationCtx,
  registrationId: Id<'registrations'>,
) {
  const email = await findConfirmation(ctx, registrationId);
  if (!email) return;
  if (email.componentEmailId) {
    const delivery = await resendClient().status(
      ctx,
      email.componentEmailId as EmailId,
    );
    if (delivery?.status === 'waiting' || delivery?.status === 'queued')
      await resendClient().cancelEmail(ctx, email.componentEmailId as EmailId);
  }
  await ctx.db.delete(email._id);
}
