import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import type { EventInput } from '../src/domain';
import { editionOf, eventEdition } from '../src/zones';
const modules = import.meta.glob('../convex/**/*.ts');
// October 2026 belongs to the edition of Manos a la Obra 2027.
const now = Date.parse('2026-10-01T12:00:00-03:00');
const event: EventInput = {
  title: 'Visita de octubre',
  description: 'Una jornada para compartir.',
  kind: 'monthly',
  date: '2026-10-24',
  startAt: Date.parse('2026-10-24T09:00:00-03:00'),
  endAt: Date.parse('2026-10-24T17:00:00-03:00'),
  instructions: 'Traer agua.',
  location: 'Plaza central',
  deadline: Date.parse('2026-10-23T23:59:00-03:00'),
  visible: true,
  accepting: true,
  capacity: 0,
  questions: [],
};
const contact = { name: 'Ana Pérez', email: 'ana@example.com', phone: '' };
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert('users', { email: 'admin@x.com' });
    await ctx.db.insert('admins', { userId: adminId });
    const anaId = await ctx.db.insert('users', {
      email: 'ana@example.com',
      name: 'Ana Pérez',
    });
    const brunoId = await ctx.db.insert('users', { email: 'bruno@x.com' });
    return { adminId, anaId, brunoId };
  });
  const as = (id: Id<'users'>) => t.withIdentity({ subject: `${id}|session` });
  const cycleId = await t.mutation(internal.zones.createCycle, {
    startYear: 2025,
    endYear: 2027,
    zones: ['Barrio Norte', 'Barrio Oeste', 'Barrio Sur'],
  });
  const zones = await t.run((ctx) =>
    ctx.db
      .query('zones')
      .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
      .collect(),
  );
  const zone = (name: string) => zones.find((z) => z.name === name)!._id;
  return {
    t,
    ...ids,
    admin: as(ids.adminId),
    ana: as(ids.anaId),
    bruno: as(ids.brunoId),
    zone,
  };
}
// Past editions cannot receive inscriptions now, so tests write them directly.
async function inscribe(
  t: TestConvex<typeof schema>,
  userId: Id<'users'>,
  input: Partial<EventInput>,
) {
  return await t.run(async (ctx) => {
    const eventId = await ctx.db.insert('events', {
      ...event,
      ...input,
      registrationCount: 1,
    });
    return await ctx.db.insert('registrations', {
      eventId,
      ...contact,
      answers: {},
      consent: true,
      userId,
      status: 'accepted',
    });
  });
}
const january = (year: number): Partial<EventInput> => ({
  kind: 'main',
  date: `${year}-01-10`,
  startAt: Date.parse(`${year}-01-10T08:00:00-03:00`),
  endAt: Date.parse(`${year}-01-14T18:00:00-03:00`),
  deadline: Date.parse(`${year - 1}-12-28T23:59:00-03:00`),
});
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('editions', () => {
  test.each([
    ['2027-01-10T08:00:00-03:00', 2027],
    ['2027-01-31T23:30:00-03:00', 2027],
    ['2027-02-01T00:30:00-03:00', 2028],
    ['2026-08-24T09:00:00-03:00', 2027],
    ['2026-12-31T23:30:00-03:00', 2027],
  ])('%s belongs to edition %i', (date, edition) => {
    expect(editionOf(Date.parse(date))).toBe(edition);
  });
  test('diagnostic visits belong to the next January', () => {
    expect(eventEdition({ date: '2026-10-24' })).toBe(2027);
    expect(eventEdition({ date: '2027-01-10' })).toBe(2027);
  });
});

describe('profile details', () => {
  test('studies and emergency contact are saved, validated and can be cleared', async () => {
    const { ana } = await setup();
    const details = {
      ...contact,
      career: ' Arquitectura ',
      graduated: true,
      emergencyContact: {
        name: 'Marta Pérez',
        relationship: 'Madre',
        phone: '341 555-0000',
      },
    };
    await ana.mutation(api.participants.saveProfile, details);
    expect(await ana.query(api.participants.viewer, {})).toMatchObject({
      career: 'Arquitectura',
      graduated: true,
      emergencyContact: details.emergencyContact,
    });
    await expect(
      ana.mutation(api.participants.saveProfile, {
        ...details,
        emergencyContact: { name: 'Marta', relationship: '', phone: '341' },
      }),
    ).rejects.toThrow('vínculo');
    // Empty fields remove optional details.
    await ana.mutation(api.participants.saveProfile, {
      ...contact,
      career: '',
      graduated: true,
      emergencyContact: { name: '', relationship: '', phone: '' },
    });
    const viewer = await ana.query(api.participants.viewer, {});
    expect(viewer?.career).toBeUndefined();
    expect(viewer?.graduated).toBeUndefined();
    expect(viewer?.emergencyContact).toBeUndefined();
  });
  test('saving contact details from an inscription keeps the other details', async () => {
    const { t, admin, ana } = await setup();
    await ana.mutation(api.participants.saveProfile, {
      ...contact,
      career: 'Medicina',
    });
    const eventId = await admin.mutation(api.events.save, { event });
    await ana.mutation(api.registrations.submit, {
      eventId,
      ...contact,
      phone: '341 555-1111',
      answers: {},
      consent: true,
      website: '',
      saveProfile: true,
    });
    expect(await ana.query(api.participants.viewer, {})).toMatchObject({
      phone: '341 555-1111',
      career: 'Medicina',
    });
    const rows = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(rows.page[0].account).toEqual({
      career: 'Medicina',
      graduated: false,
      emergencyContact: undefined,
      zone: null,
    });
    expect(await t.query(api.participants.viewer, {})).toBeNull();
  });
});

describe('barrio choice', () => {
  test('a participant chooses, changes or withdraws until the team confirms', async () => {
    const { t, admin, ana, anaId, zone } = await setup();
    expect(await t.query(api.zones.mine, {})).toBeNull();
    const initial = await ana.query(api.zones.mine, {});
    expect(initial).toMatchObject({
      edition: 2027,
      cycle: { label: '2025–2027' },
      placement: null,
    });
    expect(initial!.zones.map((z) => z.name)).toEqual([
      'Barrio Norte',
      'Barrio Oeste',
      'Barrio Sur',
    ]);
    await ana.mutation(api.zones.request, { zoneId: zone('Barrio Norte') });
    await ana.mutation(api.zones.request, { zoneId: zone('Barrio Sur') });
    expect((await ana.query(api.zones.mine, {}))!.placement).toMatchObject({
      zoneName: 'Barrio Sur',
      status: 'requested',
      fromEdition: 2027,
    });
    await ana.mutation(api.zones.withdraw, {});
    expect((await ana.query(api.zones.mine, {}))!.placement).toBeNull();
    await ana.mutation(api.zones.request, { zoneId: zone('Barrio Sur') });
    // The team can confirm the choice or place the person elsewhere.
    await admin.mutation(api.zones.assign, {
      userId: anaId,
      zoneId: zone('Barrio Oeste'),
      edition: 2027,
    });
    expect((await ana.query(api.zones.mine, {}))!.placement).toMatchObject({
      zoneName: 'Barrio Oeste',
      status: 'confirmed',
    });
    await expect(
      ana.mutation(api.zones.request, { zoneId: zone('Barrio Norte') }),
    ).rejects.toThrow('ya confirmó');
    await expect(ana.mutation(api.zones.withdraw, {})).rejects.toThrow(
      'ya confirmó',
    );
    expect(
      await t.run((ctx) => ctx.db.query('zoneAssignments').collect()),
    ).toHaveLength(1);
  });
  test('only the current cycle can be chosen and only admins assign', async () => {
    const { t, ana, anaId, bruno, zone } = await setup();
    const next = await t.mutation(internal.zones.createCycle, {
      startYear: 2028,
      endYear: 2030,
      zones: ['Barrio Este'],
    });
    const later = await t.run(
      async (ctx) =>
        (await ctx.db
          .query('zones')
          .withIndex('by_cycle', (q) => q.eq('cycleId', next))
          .first())!._id,
    );
    await expect(
      ana.mutation(api.zones.request, { zoneId: later }),
    ).rejects.toThrow('ciclo actual');
    for (const caller of [t, ana, bruno])
      await expect(
        caller.mutation(api.zones.assign, {
          userId: anaId,
          zoneId: zone('Barrio Norte'),
          edition: 2027,
        }),
      ).rejects.toThrow();
  });
  test('cycles cannot overlap and need distinct barrios', async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.zones.createCycle, {
        startYear: 2027,
        endYear: 2029,
        zones: ['Barrio Este'],
      }),
    ).rejects.toThrow('superpone');
    await expect(
      t.mutation(internal.zones.createCycle, {
        startYear: 2028,
        endYear: 2030,
        zones: ['Barrio Este', ' barrio este '],
      }),
    ).rejects.toThrow('distintos');
  });
});

describe('barrio history', () => {
  test('the barrio carries over within a cycle, skipped editions do not appear, and moves keep the past', async () => {
    const { t, admin, ana, anaId, zone } = await setup();
    await inscribe(t, anaId, january(2025));
    await admin.mutation(api.zones.assign, {
      userId: anaId,
      zoneId: zone('Barrio Norte'),
      edition: 2025,
    });
    // Ana skips 2026 and returns for the 2027 visits.
    const registrationId = await inscribe(t, anaId, {});
    const history = async () =>
      (await ana.query(api.zones.mine, {}))!.history.map((h) => [
        h.edition,
        h.zone,
        h.status,
      ]);
    expect(await history()).toEqual([
      [2027, 'Barrio Norte', 'confirmed'],
      [2025, 'Barrio Norte', 'confirmed'],
    ]);
    const person = await admin.query(api.registrations.person, {
      id: registrationId,
    });
    expect(person!.zone).toMatchObject({
      edition: 2027,
      placement: { zoneName: 'Barrio Norte', fromEdition: 2025 },
    });
    await admin.mutation(api.zones.assign, {
      userId: anaId,
      zoneId: zone('Barrio Sur'),
      edition: 2027,
    });
    expect(await history()).toEqual([
      [2027, 'Barrio Sur', 'confirmed'],
      [2025, 'Barrio Norte', 'confirmed'],
    ]);
  });
  test('participants report earlier editions, which admins see as reported', async () => {
    const { t, admin, ana, anaId, bruno } = await setup();
    await inscribe(t, anaId, january(2025));
    await ana.mutation(api.zones.addPastEdition, {
      edition: 2019,
      zone: ' Barrio Las Flores ',
    });
    for (const [edition, message] of [
      [2027, 'anterior'],
      [1999, 'anterior'],
      [2019, 'ya figura'],
      [2025, 'ya figura'],
    ] as const)
      await expect(
        ana.mutation(api.zones.addPastEdition, { edition, zone: 'Barrio' }),
      ).rejects.toThrow(message);
    const [, declared] = (await ana.query(api.zones.mine, {}))!.history;
    expect(declared).toMatchObject({
      edition: 2019,
      zone: 'Barrio Las Flores',
      source: 'declared',
    });
    const registrationId = await inscribe(t, anaId, {});
    expect(
      (await admin.query(api.registrations.person, { id: registrationId }))!
        .zone!.history,
    ).toContainEqual(expect.objectContaining({ source: 'declared' }));
    // Nobody else can remove it.
    const id = declared.pastEditionId as Id<'pastEditions'>;
    await bruno.mutation(api.zones.removePastEdition, { id });
    await t.mutation(api.zones.removePastEdition, { id }).catch(() => {});
    expect((await ana.query(api.zones.mine, {}))!.history).toHaveLength(3);
    await ana.mutation(api.zones.removePastEdition, { id });
    expect((await ana.query(api.zones.mine, {}))!.history).toHaveLength(2);
  });
  test('admin lists show the barrio for the activity edition', async () => {
    const { admin, ana, anaId, zone } = await setup();
    const eventId = await admin.mutation(api.events.save, { event });
    await ana.mutation(api.registrations.submit, {
      eventId,
      ...contact,
      answers: {},
      consent: true,
      website: '',
    });
    const list = async () =>
      (
        await admin.query(api.registrations.list, {
          eventId,
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page[0].account?.zone;
    expect(await list()).toBeNull();
    await ana.mutation(api.zones.request, { zoneId: zone('Barrio Oeste') });
    expect(await list()).toEqual({ name: 'Barrio Oeste', status: 'requested' });
    await admin.mutation(api.zones.assign, {
      userId: anaId,
      zoneId: zone('Barrio Oeste'),
      edition: 2027,
    });
    expect(await list()).toEqual({ name: 'Barrio Oeste', status: 'confirmed' });
  });
});
