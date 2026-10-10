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
export default defineSchema({
  ...authTables,
  admins: defineTable({ userId: v.id('users') }).index('by_user', ['userId']),
  inventories: defineTable(inventoryFields).index('by_date', ['date']),
  events: defineTable({ ...eventFields, registrationCount: v.number() }).index(
    'by_visible',
    ['visible'],
  ),
  registrations: defineTable({
    eventId: v.id('events'),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    answers: v.record(v.string(), v.string()),
    consent: v.boolean(),
    attachments: v.optional(v.array(attachmentValidator)),
    status: v.optional(v.union(v.literal('pending'), v.literal('accepted'))),
  })
    .index('by_event', ['eventId'])
    .index('by_event_email', ['eventId', 'email']),
});
