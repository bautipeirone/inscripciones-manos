import { ConvexError, v, type Infer } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin } from './admin';
import { findProfile, saveProfileFor } from './participants';
import { cycleOf, overviewFor, placementFor } from './zones';
import { registrationFields, attachmentValidator } from './schema';
import {
  eventSummary,
  normalizeEmail,
  validateRegistration,
} from '../src/domain';
import { validateAttachments } from '../src/attachments';
import { eventEdition } from '../src/zones';
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
  // Signed-in participants can keep these details for future forms.
  saveProfile = false,
) {
  const event = await validatedEvent(ctx, input);
  // Both submission paths run with the caller's session, if any.
  const userId = await getAuthUserId(ctx);
  const details = {
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    phone: input.phone.trim(),
  };
  if (userId && saveProfile) await saveProfileFor(ctx, userId, details);
  const existing =
    (await ctx.db
      .query('registrations')
      .withIndex('by_event_email', (q) =>
        q.eq('eventId', input.eventId).eq('email', details.email),
      )
      .unique()) ??
    (userId &&
      (await ctx.db
        .query('registrations')
        .withIndex('by_user_event', (q) =>
          q.eq('userId', userId).eq('eventId', input.eventId),
        )
        .unique()));
  // Report the current activity policy, not a previous participant's status.
  const result = {
    received: true,
    approvalRequired: event.requireApproval === true,
  };
  if (existing) {
    // A retry preserves the original answers, documents and approval status.
    // An existing inscription is never linked to the account: emails are not verified.
    for (const file of attachments) await ctx.storage.delete(file.storageId);
    return result;
  }
  const { website: _website, ...registration } = input;
  await ctx.db.insert('registrations', {
    ...registration,
    ...details,
    status: event.requireApproval ? 'pending' : 'accepted',
    ...(attachments.length ? { attachments } : {}),
    ...(userId ? { userId } : {}),
  });
  // The lookup, insert, and capacity update share one serializable transaction.
  await ctx.db.patch(event._id, {
    registrationCount: event.registrationCount + 1,
  });
  return result;
}
export const submit = mutation({
  args: { ...registrationFields, saveProfile: v.optional(v.boolean()) },
  handler: (ctx, { saveProfile, ...input }) =>
    record(ctx, input, [], saveProfile),
});
// Used only by the HTTP upload endpoint. Public callers cannot attach storage IDs.
export const validateSubmission = internalQuery({
  args: { input: inputValidator },
  handler: async (ctx, { input }) => {
    await validatedEvent(ctx, input);
  },
});
export const submitWithAttachments = internalMutation({
  args: {
    input: inputValidator,
    attachments: v.array(attachmentValidator),
    saveProfile: v.optional(v.boolean()),
  },
  handler: async (ctx, { input, attachments, saveProfile }) => {
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
    return await record(ctx, input, attachments, saveProfile);
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
// Other inscriptions by the same account or, as a hint, the same email.
async function otherRegistrations(
  ctx: QueryCtx,
  registration: Doc<'registrations'>,
) {
  const byEmail = await ctx.db
    .query('registrations')
    .withIndex('by_email', (q) => q.eq('email', registration.email))
    .collect();
  const byAccount = registration.userId
    ? await ctx.db
        .query('registrations')
        .withIndex('by_user_event', (q) => q.eq('userId', registration.userId))
        .collect()
    : [];
  const rows = new Map([...byEmail, ...byAccount].map((r) => [r._id, r]));
  rows.delete(registration._id);
  return [...rows.values()];
}
// Account details the team uses to organize people for an activity.
async function accountSummary(
  ctx: QueryCtx,
  userId: Id<'users'>,
  cycle: Doc<'zoneCycles'> | undefined,
  edition: number,
) {
  const profile = await findProfile(ctx, userId);
  return {
    career: profile?.career,
    graduated: profile?.graduated,
    emergencyContact: profile?.emergencyContact,
    zone: await placementFor(ctx, userId, cycle, edition),
  };
}
export const list = query({
  args: { eventId: v.id('events'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { eventId, paginationOpts }) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(eventId);
    const edition = event ? eventEdition(event) : 0;
    const cycle = await cycleOf(ctx, edition);
    const result = await ctx.db
      .query('registrations')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .order('desc')
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (row) => ({
          ...row,
          status: row.status ?? ('accepted' as const),
          attachments: (row.attachments ?? []).map(
            ({ storageId: _storageId, ...metadata }) => metadata,
          ),
          otherRegistrations: (await otherRegistrations(ctx, row)).length,
          account: row.userId
            ? await accountSummary(ctx, row.userId, cycle, edition)
            : null,
        })),
      ),
    };
  },
});
// Everything the team knows about the person behind an inscription.
export const person = query({
  args: { id: v.id('registrations') },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(id);
    if (!registration) return null;
    const event = await ctx.db.get(registration.eventId);
    const inscriptions = await Promise.all(
      (await otherRegistrations(ctx, registration)).map(async (row) => {
        const event = await ctx.db.get(row.eventId);
        if (!event) return null;
        return {
          _id: row._id,
          _creationTime: row._creationTime,
          event: eventSummary(event),
          status: row.status ?? ('accepted' as const),
          match:
            registration.userId && row.userId === registration.userId
              ? ('account' as const)
              : ('email' as const),
        };
      }),
    );
    return {
      inscriptions: inscriptions
        .filter((entry) => entry !== null)
        .sort((a, b) => b.event.date.localeCompare(a.event.date)),
      zone:
        registration.userId && event
          ? await overviewFor(ctx, registration.userId, eventEdition(event))
          : null,
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
