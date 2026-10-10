import { ConvexError, v, type Infer } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from './_generated/server';
import { requireAdmin } from './admin';
import { registrationFields, attachmentValidator } from './schema';
import { normalizeEmail, validateRegistration } from '../src/domain';
import { validateAttachments } from '../src/attachments';
const inputValidator = v.object(registrationFields);
type Submission = Infer<typeof inputValidator>;
type StoredAttachment = Infer<typeof attachmentValidator>;
async function validatedEvent(ctx: QueryCtx, input: Submission) {
  const event = await ctx.db.get(input.eventId);
  if (!event) throw new ConvexError('No encontramos el evento.');
  try {
    validateRegistration(event, input);
  } catch (e) {
    throw new ConvexError((e as Error).message);
  }
  return event;
}
async function record(
  ctx: MutationCtx,
  input: Submission,
  attachments: StoredAttachment[] = [],
) {
  const event = await validatedEvent(ctx, input);
  const email = normalizeEmail(input.email);
  const existing = await ctx.db
    .query('registrations')
    .withIndex('by_event_email', (q) =>
      q.eq('eventId', input.eventId).eq('email', email),
    )
    .unique();
  // Report the current activity policy, not a previous participant's status.
  const result = {
    received: true,
    approvalRequired: event.requireApproval === true,
  };
  if (existing) {
    // A retry preserves the original answers, documents and approval status.
    for (const file of attachments) await ctx.storage.delete(file.storageId);
    return result;
  }
  const { website: _website, ...registration } = input;
  await ctx.db.insert('registrations', {
    ...registration,
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    status: event.requireApproval ? 'pending' : 'accepted',
    ...(attachments.length ? { attachments } : {}),
  });
  // The lookup, insert, and capacity update share one serializable transaction.
  await ctx.db.patch(event._id, {
    registrationCount: event.registrationCount + 1,
  });
  return result;
}
export const submit = mutation({
  args: registrationFields,
  handler: (ctx, args) => record(ctx, args),
});
// Used only by the HTTP upload endpoint. Public callers cannot attach storage IDs.
export const validateSubmission = internalQuery({
  args: { input: inputValidator },
  handler: async (ctx, { input }) => {
    await validatedEvent(ctx, input);
  },
});
export const submitWithAttachments = internalMutation({
  args: { input: inputValidator, attachments: v.array(attachmentValidator) },
  handler: async (ctx, { input, attachments }) => {
    try {
      validateAttachments(attachments);
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
    for (const file of attachments) {
      const metadata = await ctx.db.system.get(file.storageId);
      if (
        !metadata ||
        metadata.size !== file.size ||
        (metadata.contentType !== undefined &&
          metadata.contentType !== file.contentType)
      )
        throw new ConvexError('No pudimos verificar el documento adjunto.');
    }
    return await record(ctx, input, attachments);
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
        attachments: (row.attachments ?? []).map(
          ({ storageId: _storageId, ...metadata }) => metadata,
        ),
      })),
    };
  },
});
export const attachmentForAdmin = internalQuery({
  args: { id: v.id('registrations'), index: v.number() },
  handler: async (ctx, { id, index }) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(id);
    const file =
      Number.isInteger(index) && index >= 0
        ? registration?.attachments?.[index]
        : undefined;
    if (!file) throw new ConvexError('No encontramos el documento.');
    return file;
  },
});
export const remove = mutation({
  args: { id: v.id('registrations') },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(id);
    if (!registration) return;
    for (const file of registration.attachments ?? [])
      await ctx.storage.delete(file.storageId);
    const event = await ctx.db.get(registration.eventId);
    await ctx.db.delete(id);
    if (event)
      await ctx.db.patch(event._id, {
        registrationCount: Math.max(0, event.registrationCount - 1),
      });
  },
});
