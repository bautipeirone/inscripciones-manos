import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export const questionValidator = v.object({
  id: v.string(),
  label: v.string(),
  type: v.union(v.literal('text'), v.literal('textarea'), v.literal('select')),
  required: v.boolean(),
  options: v.array(v.string()),
});
export const eventFields = {
  title: v.string(),
  description: v.string(),
  kind: v.union(v.literal('monthly'), v.literal('main')),
  date: v.string(),
  startAt: v.optional(v.number()),
  endAt: v.optional(v.number()),
  instructions: v.optional(v.string()),
  location: v.string(),
  deadline: v.number(),
  visible: v.boolean(),
  accepting: v.boolean(),
  requireApproval: v.optional(v.boolean()),
  capacity: v.number(),
  questions: v.array(questionValidator),
};
export const registrationFields = {
  eventId: v.id('events'),
  name: v.string(),
  email: v.string(),
  phone: v.string(),
  answers: v.record(v.string(), v.string()),
  consent: v.boolean(),
  website: v.string(),
};
export const attachmentValidator = v.object({
  storageId: v.id('_storage'),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
});
export const inventoryFields = {
  date: v.string(),
  label: v.string(),
  entries: v.array(
    v.object({
      name: v.string(),
      quantity: v.number(),
      unit: v.optional(v.string()),
      comments: v.optional(v.string()),
    }),
  ),
};
export const profileFields = {
  name: v.string(),
  email: v.string(),
  phone: v.string(),
};
export const profileDetailFields = {
  career: v.optional(v.string()),
  graduated: v.optional(v.boolean()),
  emergencyContact: v.optional(
    v.object({ name: v.string(), relationship: v.string(), phone: v.string() }),
  ),
};
export const zoneStatus = v.union(
  v.literal('requested'),
  v.literal('confirmed'),
);
export default defineSchema({
  ...authTables,
  admins: defineTable({ userId: v.id('users') }).index('by_user', ['userId']),
  inventories: defineTable(inventoryFields).index('by_date', ['date']),
  // Personal details a participant saves to prefill inscription forms.
  profiles: defineTable({
    userId: v.id('users'),
    ...profileFields,
    ...profileDetailFields,
  }).index('by_user', ['userId']),
  // Editions (named after their January) that share a set of barrios.
  zoneCycles: defineTable({ startYear: v.number(), endYear: v.number() }).index(
    'by_start',
    ['startYear'],
  ),
  zones: defineTable({ cycleId: v.id('zoneCycles'), name: v.string() }).index(
    'by_cycle',
    ['cycleId'],
  ),
  // A person's barrio in a cycle from one edition on. Moving someone adds a
  // row from a later edition, so earlier editions keep their barrio.
  zoneAssignments: defineTable({
    userId: v.id('users'),
    cycleId: v.id('zoneCycles'),
    zoneId: v.id('zones'),
    fromEdition: v.number(),
    status: zoneStatus,
  })
    .index('by_user', ['userId', 'cycleId', 'fromEdition'])
    .index('by_cycle_status', ['cycleId', 'status'])
    .index('by_zone', ['zoneId']),
  // Editions before the platform, as reported by the participant.
  pastEditions: defineTable({
    userId: v.id('users'),
    edition: v.number(),
    zone: v.string(),
  }).index('by_user', ['userId', 'edition']),
  events: defineTable({ ...eventFields, registrationCount: v.number() }).index(
    'by_visible',
    ['visible'],
  ),
  registrations: defineTable({
    eventId: v.id('events'),
    ...profileFields,
    answers: v.record(v.string(), v.string()),
    consent: v.boolean(),
    attachments: v.optional(v.array(attachmentValidator)),
    status: v.optional(v.union(v.literal('pending'), v.literal('accepted'))),
    // Set only when submitted from a signed-in session; never inferred from
    // the email, which is not verified.
    userId: v.optional(v.id('users')),
  })
    .index('by_event', ['eventId'])
    .index('by_event_email', ['eventId', 'email'])
    .index('by_email', ['email'])
    .index('by_user_event', ['userId', 'eventId']),
});
