import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
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
beforeAll(async () => {
  // Convex Auth signs session tokens; tests use a throwaway key.
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const key = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', privateKey),
  );
  process.env.JWT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...key))}\n-----END PRIVATE KEY-----`;
  process.env.CONVEX_SITE_URL = 'https://test.convex.site';
});
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(date);
});
const password = 'una-clave-segura';
async function signUp(
  t: TestConvex<typeof schema>,
  email: string,
  name = 'Participante de prueba',
) {
  await t.action(api.auth.signIn, {
    provider: 'password',
    params: { email, password, name, flow: 'signUp' },
  });
  const userId = await t.run(
    async (ctx) =>
      (await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', email.trim().toLowerCase()))
        .unique())!._id,
  );
  return t.withIdentity({ subject: `${userId}|session` });
}
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
  test('participant sign-up never grants admin access', async () => {
    const { t, eventId } = await setup();
    const participant = await signUp(t, 'participante@example.com');
    expect(await participant.query(api.admin.viewer, {})).toBeNull();
    await expect(
      participant.mutation(api.events.save, { event }),
    ).rejects.toThrow('Acceso no autorizado');
    await expect(participant.query(api.events.listAdmin, {})).rejects.toThrow(
      'Acceso no autorizado',
    );
    await expect(
      participant.query(api.registrations.list, {
        eventId,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow('Acceso no autorizado');
    await t.mutation(api.registrations.submit, { eventId, ...details });
    const id = await t.run(
      async (ctx) => (await ctx.db.query('registrations').first())!._id,
    );
    await expect(
      participant.query(api.registrations.history, { id }),
    ).rejects.toThrow('Acceso no autorizado');
    await expect(
      participant.mutation(api.registrations.remove, { id }),
    ).rejects.toThrow('Acceso no autorizado');
  });
});
describe('participant accounts', () => {
  test('sign up, sign in, and reject wrong or duplicate credentials', async () => {
    const { t } = await setup();
    await signUp(t, '  Ana@Example.com ', 'Ana Pérez');
    const user = await t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', 'ana@example.com'))
        .unique(),
    );
    expect(user?.name).toBe('Ana Pérez');
    expect(
      await t.action(api.auth.signIn, {
        provider: 'password',
        params: { email: 'ANA@example.com', password, flow: 'signIn' },
      }),
    ).toHaveProperty('tokens');
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: {
          email: 'ana@example.com',
          password: 'otra-clave-123',
          flow: 'signIn',
        },
      }),
    ).rejects.toThrow();
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: {
          email: 'ana@example.com',
          password: 'otra-clave-123',
          name: 'Otra persona',
          flow: 'signUp',
        },
      }),
    ).rejects.toThrow();
  });
  test.each([
    [{ password: 'corta' }, 'La contraseña'],
    [{ name: '' }, 'Ingresá tu nombre completo'],
    [{ email: 'no-es-un-email' }, 'Ingresá un email válido'],
  ])('validates sign-up details: %j', async (change, message) => {
    const { t } = await setup();
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: {
          email: 'nueva@example.com',
          password,
          name: 'Persona nueva',
          flow: 'signUp',
          ...change,
        },
      }),
    ).rejects.toThrow(message);
  });
  test('profiles prefill from sign-up and only their owner can change them', async () => {
    const { t } = await setup();
    const ana = await signUp(t, 'ana@example.com', 'Ana Pérez');
    const bruno = await signUp(t, 'bruno@example.com', 'Bruno Díaz');
    expect(await t.query(api.participants.viewer, {})).toBeNull();
    expect(await ana.query(api.participants.viewer, {})).toEqual({
      accountEmail: 'ana@example.com',
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '',
    });
    await expect(
      t.mutation(api.participants.saveProfile, {
        name: 'Nadie',
        email: 'nadie@example.com',
        phone: '',
      }),
    ).rejects.toThrow('Ingresá a tu cuenta');
    await expect(
      ana.mutation(api.participants.saveProfile, {
        name: 'Ana Pérez',
        email: 'no-es-un-email',
        phone: '',
      }),
    ).rejects.toThrow('Ingresá un email válido');
    await ana.mutation(api.participants.saveProfile, {
      name: ' Ana María Pérez ',
      email: 'Contacto.Ana@Example.com',
      phone: ' 341 555-0000 ',
    });
    expect(await ana.query(api.participants.viewer, {})).toEqual({
      accountEmail: 'ana@example.com',
      name: 'Ana María Pérez',
      email: 'contacto.ana@example.com',
      phone: '341 555-0000',
    });
    expect((await bruno.query(api.participants.viewer, {}))?.name).toBe(
      'Bruno Díaz',
    );
  });
  test('signed-in inscriptions are linked to the account and listed only in its history', async () => {
    const { t, admin, eventId } = await setup();
    const ana = await signUp(t, 'ana@example.com', 'Ana Pérez');
    await ana.mutation(api.registrations.submit, {
      eventId,
      ...details,
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '341 555-0000',
      saveProfile: true,
    });
    const [entry] = await ana.query(api.participants.history, {});
    expect(entry.event).toMatchObject({ _id: eventId, title: event.title });
    expect(entry.answers).toEqual([
      { label: 'Experiencia', value: 'Primera vez' },
    ]);
    expect(entry.phone).toBe('341 555-0000');
    expect((await ana.query(api.participants.viewer, {}))?.phone).toBe(
      '341 555-0000',
    );
    // Retrying with another email is still one inscription for the account.
    await ana.mutation(api.registrations.submit, {
      eventId,
      ...details,
      email: 'ana.otra@example.com',
      phone: '',
    });
    expect(await ana.query(api.participants.history, {})).toHaveLength(1);
    expect((await ana.query(api.participants.viewer, {}))?.phone).toBe(
      '341 555-0000',
    );
    const rows = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(rows.page).toHaveLength(1);
    expect(rows.page[0].userId).toBeDefined();
    expect(await t.query(api.participants.history, {})).toEqual([]);
  });
  test('an account with an unverified email cannot claim inscriptions made without it', async () => {
    const { t, eventId } = await setup();
    await t.mutation(api.registrations.submit, {
      eventId,
      ...details,
      phone: '341 555-0000',
    });
    const impostor = await signUp(t, details.email);
    expect(await impostor.query(api.participants.history, {})).toEqual([]);
    await impostor.mutation(api.registrations.submit, { eventId, ...details });
    expect(await impostor.query(api.participants.history, {})).toEqual([]);
    const rows = await t.run((ctx) => ctx.db.query('registrations').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeUndefined();
  });
  test('admins see other inscriptions by the same account or email', async () => {
    const { t, admin, eventId } = await setup();
    const [second, third] = await Promise.all(
      ['Segunda jornada', 'Tercera jornada'].map((title) =>
        admin.mutation(api.events.save, { event: { ...event, title } }),
      ),
    );
    const ana = await signUp(t, 'ana@example.com');
    await ana.mutation(api.registrations.submit, {
      eventId,
      ...details,
      email: 'ana@example.com',
    });
    await ana.mutation(api.registrations.submit, {
      eventId: second,
      ...details,
      email: 'ana.trabajo@example.com',
    });
    await t.mutation(api.registrations.submit, {
      eventId: third,
      ...details,
      email: 'ANA@example.com',
    });
    await t.mutation(api.registrations.submit, {
      eventId: third,
      ...details,
      email: 'otra@example.com',
    });
    const rows = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(rows.page[0].otherRegistrations).toBe(2);
    const history = await admin.query(api.registrations.history, {
      id: rows.page[0]._id,
    });
    expect(history.map((h) => [h.event.title, h.match]).sort()).toEqual([
      ['Segunda jornada', 'account'],
      ['Tercera jornada', 'email'],
    ]);
    const others = await admin.query(api.registrations.list, {
      eventId: third,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(
      others.page.find((r) => r.email === 'otra@example.com')
        ?.otherRegistrations,
    ).toBe(0);
  });
});
describe('participant accounts with manual approval', () => {
  test('both histories show the approval status of each inscription', async () => {
    const { t, admin, eventId } = await setup({ requireApproval: true });
    const open = await admin.mutation(api.events.save, {
      event: { ...event, title: 'Jornada abierta' },
    });
    const ana = await signUp(t, 'ana@example.com');
    for (const id of [eventId, open])
      await ana.mutation(api.registrations.submit, {
        eventId: id,
        ...details,
        email: 'ana@example.com',
      });
    const statuses = async () =>
      Object.fromEntries(
        (await ana.query(api.participants.history, {})).map((h) => [
          h.event.title,
          h.status,
        ]),
      );
    expect(await statuses()).toEqual({
      [event.title]: 'pending',
      'Jornada abierta': 'accepted',
    });
    const [pending] = (
      await admin.query(api.registrations.list, {
        eventId,
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page;
    const [accepted] = (
      await admin.query(api.registrations.list, {
        eventId: open,
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page;
    expect(
      await admin.query(api.registrations.history, { id: accepted._id }),
    ).toMatchObject([
      { event: { title: event.title }, status: 'pending', match: 'account' },
    ]);
    await admin.mutation(api.registrations.accept, { id: pending._id });
    expect((await statuses())[event.title]).toBe('accepted');
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

describe('manual inscription approval', () => {
  test('legacy inscriptions are accepted when read through the admin API', async () => {
    const { t, admin, eventId } = await setup();
    await t.run(async (ctx) => {
      const { website: _website, ...registration } = details;
      await ctx.db.insert('registrations', { eventId, ...registration });
      await ctx.db.patch(eventId, { registrationCount: 1 });
    });
    const rows = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(rows.page[0].status).toBe('accepted');
  });
  test('pending inscriptions reserve capacity and only admins can accept without consuming another place', async () => {
    const { t, admin, eventId } = await setup({
      requireApproval: true,
      capacity: 1,
    });
    expect(
      await t.mutation(api.registrations.submit, { eventId, ...details }),
    ).toEqual({ received: true, approvalRequired: true });
    const rows = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const registration = rows.page[0];
    expect(registration.status).toBe('pending');
    await expect(
      t.mutation(api.registrations.submit, {
        eventId,
        ...details,
        email: 'second@example.com',
      }),
    ).rejects.toThrow('no está disponible');
    await expect(
      t.mutation(api.registrations.accept, { id: registration._id }),
    ).rejects.toThrow('Acceso no autorizado');
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'user@example.com' }),
    );
    const user = t.withIdentity({ subject: `${userId}|session` });
    await expect(
      user.mutation(api.registrations.accept, { id: registration._id }),
    ).rejects.toThrow('Acceso no autorizado');
    await expect(
      user.mutation(api.events.save, {
        id: eventId,
        event: { ...event, requireApproval: false },
      }),
    ).rejects.toThrow('Acceso no autorizado');
    await admin.mutation(api.registrations.accept, { id: registration._id });
    await admin.mutation(api.registrations.accept, { id: registration._id });
    expect(
      (
        await admin.query(api.registrations.list, {
          eventId,
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page[0].status,
    ).toBe('accepted');
    expect(
      (await t.query(api.events.listPublic, {}))[0].registrationCount,
    ).toBe(1);
    await admin.mutation(api.registrations.remove, { id: registration._id });
    expect(
      (await t.query(api.events.listPublic, {}))[0].registrationCount,
    ).toBe(0);
  });
  test('changing the policy affects only new inscriptions and duplicate requests preserve the original', async () => {
    const { t, admin, eventId } = await setup({ requireApproval: true });
    await t.mutation(api.registrations.submit, { eventId, ...details });
    await admin.mutation(api.events.save, {
      id: eventId,
      event: { ...event, requireApproval: false },
    });
    expect(
      await t.mutation(api.registrations.submit, {
        eventId,
        ...details,
        name: 'Duplicate',
      }),
    ).toEqual({ received: true, approvalRequired: false });
    await t.mutation(api.registrations.submit, {
      eventId,
      ...details,
      email: 'second@example.com',
    });
    await admin.mutation(api.events.save, {
      id: eventId,
      event: { ...event, requireApproval: true },
    });
    await t.mutation(api.registrations.submit, {
      eventId,
      ...details,
      email: 'third@example.com',
    });
    const rows = (
      await admin.query(api.registrations.list, {
        eventId,
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.email === details.email)).toMatchObject({
      name: details.name,
      status: 'pending',
    });
    expect(rows.find((r) => r.email === 'second@example.com')?.status).toBe(
      'accepted',
    );
    expect(rows.find((r) => r.email === 'third@example.com')?.status).toBe(
      'pending',
    );
  });
  test('activities without manual approval still accept inscriptions immediately', async () => {
    const { t, admin, eventId } = await setup();
    expect(
      await t.mutation(api.registrations.submit, { eventId, ...details }),
    ).toEqual({ received: true, approvalRequired: false });
    const rows = await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(rows.page[0].status).toBe('accepted');
  });
});
