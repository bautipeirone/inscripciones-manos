import { beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import {
  csvCell,
  formatSchedule,
  type EventInput,
  type RegistrationInput,
} from '../src/domain';
const modules = import.meta.glob('../convex/**/*.ts');
const date = Date.parse('2026-10-01T12:00:00-03:00');
const event: EventInput = {
  title: 'Jornada de octubre',
  description: 'Una jornada para compartir.',
  kind: 'monthly',
  date: '2026-10-24',
  startAt: Date.parse('2026-10-24T09:00:00-03:00'),
  endAt: Date.parse('2026-10-24T17:00:00-03:00'),
  instructions: 'Traer agua y ropa cómoda.',
  location: 'Plaza del encuentro',
  deadline: Date.parse('2026-10-23T23:59:00-03:00'),
  visible: true,
  accepting: true,
  capacity: 0,
  questions: [
    {
      id: 'experience',
      label: 'Experiencia',
      type: 'select',
      options: ['Primera vez', 'Ya participé'],
      required: true,
    },
  ],
};
const details = {
  name: 'Persona de prueba',
  email: 'persona@example.com',
  phone: '',
  answers: { experience: 'Primera vez' },
  consent: true,
  website: '',
};
async function setup(input: Partial<EventInput> = {}) {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'admin@example.com' });
    await ctx.db.insert('admins', { userId });
    return userId;
  });
  const admin = t.withIdentity({ subject: `${userId}|session` });
  const eventId = await admin.mutation(api.events.save, {
    event: { ...event, ...input },
  });
  return { t, admin, eventId };
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(date);
});
describe('admin boundary', () => {
  test('anonymous callers cannot create, edit, change visibility or read participants', async () => {
    const { t, eventId } = await setup();
    await expect(t.mutation(api.events.save, { event })).rejects.toThrow(
      'Acceso no autorizado',
    );
    await expect(
      t.mutation(api.events.save, { id: eventId, event }),
    ).rejects.toThrow('Acceso no autorizado');
    await expect(
      t.mutation(api.events.setAvailability, {
        id: eventId,
        visible: false,
        accepting: false,
      }),
    ).rejects.toThrow('Acceso no autorizado');
    await expect(t.query(api.events.listAdmin, {})).rejects.toThrow(
      'Acceso no autorizado',
    );
    await expect(
      t.query(api.registrations.list, {
        eventId,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow('Acceso no autorizado');
  });
  test('a logged-in user without an admin grant still cannot administer', async () => {
    const { t } = await setup();
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'not-admin@example.com' }),
    );
    const user = t.withIdentity({ subject: `${userId}|session` });
    expect(await user.query(api.admin.viewer, {})).toBeNull();
    await expect(user.mutation(api.events.save, { event })).rejects.toThrow(
      'Acceso no autorizado',
    );
  });
  test('public account creation is disabled', async () => {
    const { t } = await setup();
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: {
          email: 'attacker@example.com',
          password: 'a-strong-password',
          flow: 'signUp',
        },
      }),
    ).rejects.toThrow('El registro de cuentas no está habilitado');
  });
});
describe('public registration', () => {
  test('stores one normalized entry, without exposing participant data publicly', async () => {
    const { t, admin, eventId } = await setup();
    await t.mutation(api.registrations.submit, {
      eventId,
      ...details,
      email: '  PERSONA@Example.com  ',
    });
    await t.mutation(api.registrations.submit, { eventId, ...details });
    const result = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(result.page).toHaveLength(1);
    expect(result.page[0].email).toBe('persona@example.com');
    const publicEvents = await t.query(api.events.listPublic, {});
    expect(publicEvents[0].registrationCount).toBe(1);
    expect(JSON.stringify(publicEvents)).not.toContain('persona@example.com');
  });
  test('the same email can sign up for another event', async () => {
    const { t, admin, eventId } = await setup();
    const another = await admin.mutation(api.events.save, {
      event: { ...event, title: 'Otra jornada' },
    });
    await t.mutation(api.registrations.submit, { eventId, ...details });
    await t.mutation(api.registrations.submit, {
      eventId: another,
      ...details,
    });
    expect(
      (await t.query(api.events.listPublic, {})).map(
        (e) => e.registrationCount,
      ),
    ).toEqual([1, 1]);
  });
  test('only admins can remove a registration and its capacity is released exactly once', async () => {
    const { t, admin, eventId } = await setup({ capacity: 1 });
    await t.mutation(api.registrations.submit, { eventId, ...details });
    const result = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const id = result.page[0]._id;
    await expect(t.mutation(api.registrations.remove, { id })).rejects.toThrow(
      'Acceso no autorizado',
    );
    await admin.mutation(api.registrations.remove, { id });
    await admin.mutation(api.registrations.remove, { id });
    expect(
      (await t.query(api.events.listPublic, {}))[0].registrationCount,
    ).toBe(0);
    await t.mutation(api.registrations.submit, { eventId, ...details });
    expect(
      (await t.query(api.events.listPublic, {}))[0].registrationCount,
    ).toBe(1);
  });
  test.each([
    { visible: false },
    { accepting: false },
    { deadline: date },
    { deadline: date - 1 },
  ])('rejects unavailable events: %j', async (change) => {
    const { t, eventId } = await setup(change);
    await expect(
      t.mutation(api.registrations.submit, { eventId, ...details }),
    ).rejects.toThrow('no está disponible');
  });
  test('enforces capacity and never overwrites the existing participant', async () => {
    const { t, admin, eventId } = await setup({ capacity: 1 });
    await t.mutation(api.registrations.submit, { eventId, ...details });
    await expect(
      t.mutation(api.registrations.submit, {
        eventId,
        ...details,
        email: 'second@example.com',
      }),
    ).rejects.toThrow('no está disponible');
    const rows = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(rows.page).toHaveLength(1);
    expect(rows.page[0].email).toBe(details.email);
  });
  test.each<Partial<Omit<RegistrationInput, 'eventId'>>>([
    { answers: {} },
    { answers: { experience: 'invalid' } },
    { consent: false },
    { website: 'bot.example.com' },
    { email: 'not-an-email' },
    { answers: { experience: 'Primera vez', unknown: 'injected' } },
  ])('validates untrusted submissions: %j', async (change) => {
    const { t, eventId } = await setup();
    await expect(
      t.mutation(api.registrations.submit, { eventId, ...details, ...change }),
    ).rejects.toThrow();
    expect(
      (await t.query(api.events.listPublic, {}))[0].registrationCount,
    ).toBe(0);
  });
});
describe('event lifecycle', () => {
  test('hidden events disappear from public queries and can be shown again', async () => {
    const { t, admin, eventId } = await setup();
    await admin.mutation(api.events.setAvailability, {
      id: eventId,
      visible: false,
      accepting: true,
    });
    expect(await t.query(api.events.listPublic, {})).toHaveLength(0);
    expect(await admin.query(api.events.listAdmin, {})).toHaveLength(1);
    await admin.mutation(api.events.setAvailability, {
      id: eventId,
      visible: true,
      accepting: true,
    });
    expect(await t.query(api.events.listPublic, {})).toHaveLength(1);
  });
  test('a stale form cannot submit after an admin closes it', async () => {
    const { t, admin, eventId } = await setup();
    await admin.mutation(api.events.setAvailability, {
      id: eventId,
      visible: true,
      accepting: false,
    });
    await expect(
      t.mutation(api.registrations.submit, { eventId, ...details }),
    ).rejects.toThrow('no está disponible');
  });
  test('question definitions are preserved once answers exist', async () => {
    const { t, admin, eventId } = await setup();
    await t.mutation(api.registrations.submit, { eventId, ...details });
    await expect(
      admin.mutation(api.events.save, {
        id: eventId,
        event: { ...event, questions: [] },
      }),
    ).rejects.toThrow('Las preguntas no se pueden cambiar');
    await admin.mutation(api.events.save, {
      id: eventId,
      event: { ...event, title: 'Nuevo título' },
    });
    expect((await t.query(api.events.listPublic, {}))[0].title).toBe(
      'Nuevo título',
    );
  });
  test('rejects deadlines after the event and event dates outside the season', async () => {
    const { admin } = await setup();
    await expect(
      admin.mutation(api.events.save, {
        event: { ...event, deadline: Date.parse('2026-11-01') },
      }),
    ).rejects.toThrow('cierre');
    await expect(
      admin.mutation(api.events.save, { event: { ...event, kind: 'main' } }),
    ).rejects.toThrow('enero');
  });
  test('CSV escapes quotes and protects spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("url")')).toBe('"\'=HYPERLINK(""url"")"');
    expect(csvCell('  +123')).toBe('"\'  +123"');
    expect(csvCell('María, Ana')).toBe('"María, Ana"');
  });
});

describe('activity schedules', () => {
  test('stores a multi-day January activity and its participant instructions', async () => {
    const { admin, t } = await setup();
    const input: EventInput = {
      ...event,
      kind: 'main',
      date: '2027-01-10',
      startAt: Date.parse('2027-01-10T08:00:00-03:00'),
      endAt: Date.parse('2027-01-14T18:00:00-03:00'),
      deadline: Date.parse('2026-12-28T23:59:00-03:00'),
      instructions: 'Traer bolsa de dormir.\nReservar los cinco días.',
    };
    const id = await admin.mutation(api.events.save, { event: input });
    const saved = (await t.query(api.events.listPublic, {})).find(
      (e) => e._id === id,
    )!;
    expect(saved.instructions).toBe(input.instructions);
    expect(formatSchedule(saved)).toContain('10 de enero de 2027, 08:00 hs');
    expect(formatSchedule(saved)).toContain('14 de enero de 2027, 18:00 hs');
  });
  test.each<Partial<EventInput>>([
    { startAt: undefined, endAt: undefined },
    { endAt: undefined },
    { endAt: event.startAt },
    { endAt: event.startAt! - 1 },
    { date: '2026-10-25' },
    { deadline: event.startAt! + 1 },
    { instructions: '   ' },
  ])('rejects invalid schedule or instructions: %j', async (change) => {
    const { admin } = await setup();
    await expect(
      admin.mutation(api.events.save, { event: { ...event, ...change } }),
    ).rejects.toThrow();
  });
  test('uses the Argentine start date when UTC falls on the next day', async () => {
    const { admin, t } = await setup();
    const input = {
      ...event,
      startAt: Date.parse('2026-10-24T23:00:00-03:00'),
      endAt: Date.parse('2026-10-25T01:00:00-03:00'),
    };
    const id = await admin.mutation(api.events.save, { event: input });
    const saved = (await t.query(api.events.listPublic, {})).find(
      (e) => e._id === id,
    )!;
    expect(saved.date).toBe('2026-10-24');
    expect(formatSchedule(saved)).toContain('24 de octubre de 2026, 23:00 hs');
    expect(formatSchedule(saved)).toContain('25 de octubre de 2026, 01:00 hs');
  });
  test('legacy activities remain readable and can be updated with a schedule', async () => {
    const { admin, t } = await setup();
    const {
      startAt: _start,
      endAt: _end,
      instructions: _instructions,
      ...legacy
    } = event;
    const id = await t.run((ctx) =>
      ctx.db.insert('events', { ...legacy, registrationCount: 0 }),
    );
    const old = (await t.query(api.events.listPublic, {})).find(
      (e) => e._id === id,
    )!;
    expect(formatSchedule(old)).toContain('Horario a confirmar');
    await admin.mutation(api.events.save, {
      id,
      event: { ...legacy, title: 'Actividad anterior' },
    });
    await admin.mutation(api.events.save, { id, event });
    const saved = (await t.query(api.events.listPublic, {})).find(
      (e) => e._id === id,
    )!;
    expect(formatSchedule(saved)).toContain('de 09:00 a 17:00 hs');
    expect(saved.instructions).toBe(event.instructions);
  });
});
