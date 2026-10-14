import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import resendTest from '@convex-dev/resend/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import workpoolTest from '@convex-dev/workpool/test';
import { Webhook } from 'svix';
import schema from '../convex/schema';
import { api, components, internal } from '../convex/_generated/api';
import { confirmationTemplate } from '../convex/emailTemplate';
import type { EventInput } from '../src/domain';

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
      type: 'text',
      required: true,
      options: [],
    },
  ],
};
const details = {
  name: 'Persona de prueba',
  email: 'persona@example.com',
  phone: '351 1234567',
  answers: { experience: 'Primera vez' },
  consent: true,
  website: '',
};

async function setup(change: Partial<EventInput> = {}) {
  const t = convexTest(schema, modules);
  resendTest.register(t);
  rateLimiterTest.register(t, 'resend/rateLimiter');
  workpoolTest.register(t, 'resend/emailWorkpool');
  workpoolTest.register(t, 'resend/callbackWorkpool');
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'admin@example.com' });
    await ctx.db.insert('admins', { userId });
    return userId;
  });
  const admin = t.withIdentity({ subject: `${userId}|session` });
  const eventId = await admin.mutation(api.events.save, {
    event: { ...event, ...change },
  });
  const submit = () =>
    t.mutation(api.registrations.submit, { eventId, ...details });
  const outbox = () =>
    t.run((ctx) => ctx.db.query('confirmationEmails').collect());
  return { t, admin, eventId, submit, outbox };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(date);
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_FROM', 'Manos <inscripciones@example.com>');
  vi.stubEnv('EMAIL_REPLY_TO', 'equipo@example.com');
  vi.stubEnv('EMAIL_TEST_MODE', 'false');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ data: [{ id: 'resend-test-id' }] })),
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('inscription confirmation emails', () => {
  test('anonymous inscriptions and duplicate submissions produce one durable job and one send', async () => {
    const { t, admin, eventId, submit, outbox } = await setup();
    await submit();
    await t.mutation(api.registrations.submit, {
      eventId,
      ...details,
      email: '  PERSONA@EXAMPLE.COM ',
      name: 'Retry must not overwrite',
    });
    const [email] = await outbox();
    expect(await outbox()).toHaveLength(1);
    expect(email).toMatchObject({
      to: details.email,
      state: 'pending',
      attempts: 0,
    });
    expect(email.text).toContain(event.title);
    expect(email.text).toContain('24 de octubre de 2026, de 09:00 a 17:00 hs');
    expect(email.text).toContain(event.location);
    expect(email.text).toContain(event.instructions);
    expect(email.text).toContain('Experiencia: Primera vez');
    expect(email.text).toContain(email.registrationId);
    expect(email.text).toContain('registrada y aceptada');
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails/batch');
    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject([
      {
        from: 'Manos <inscripciones@example.com>',
        to: [details.email],
        reply_to: ['equipo@example.com'],
        subject: `Inscripción confirmada · ${event.title}`,
      },
    ]);
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBeTruthy();
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({ state: 'sent', attempts: 1, canRetry: false });
    await t.mutation(internal.emails.enqueue, { id: email._id });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      admin.mutation(api.emails.retry, {
        registrationId: email.registrationId,
      }),
    ).rejects.toThrow('riesgo de duplicar');
  });

  test('pending wording and event details are captured before subsequent edits or approval', async () => {
    const { t, admin, eventId, submit, outbox } = await setup({
      requireApproval: true,
    });
    await submit();
    const [email] = await outbox();
    expect(email.subject).toContain('Inscripción recibida');
    expect(email.text).toContain('pendiente de aprobación');
    expect(email.text).toContain('todavía no está confirmada');
    await admin.mutation(api.events.save, {
      id: eventId,
      event: { ...event, title: 'Nuevo título', location: 'Otro lugar' },
    });
    await admin.mutation(api.registrations.accept, {
      id: email.registrationId,
    });
    expect(await outbox()).toEqual([email]);
    await t.mutation(internal.emails.enqueue, { id: email._id });
    const queued = await t.query(components.resend.lib.get, {
      emailId: (await outbox())[0].componentEmailId!,
    });
    expect(queued?.text).toBe(email.text);
    expect(await outbox()).toHaveLength(1);
  });

  test.each([{ visible: false }, { accepting: false }, { deadline: date }])(
    'unavailable events do not queue emails: %j',
    async (change) => {
      const { submit, outbox } = await setup(change);
      await expect(submit()).rejects.toThrow();
      expect(await outbox()).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test('invalid submissions and exhausted capacity do not queue emails', async () => {
    const { t, eventId, submit, outbox } = await setup({ capacity: 1 });
    await expect(
      t.mutation(api.registrations.submit, {
        eventId,
        ...details,
        consent: false,
      }),
    ).rejects.toThrow();
    expect(await outbox()).toEqual([]);
    await submit();
    await expect(
      t.mutation(api.registrations.submit, {
        eventId,
        ...details,
        email: 'other@example.com',
      }),
    ).rejects.toThrow();
    expect(await outbox()).toHaveLength(1);
  });

  test('HTTP inscriptions with documents use the same queue and deduplication', async () => {
    const { t, eventId, outbox } = await setup({ requireApproval: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = new FormData();
      body.set('registration', JSON.stringify({ eventId, ...details }));
      body.append(
        'attachments',
        new File(['%PDF-1.4\nreceipt\n%%EOF'], 'comprobante.pdf', {
          type: 'application/pdf',
        }),
      );
      const response = await t.fetch('/inscriptions', { method: 'POST', body });
      expect(response.status).toBe(200);
    }
    expect(await outbox()).toHaveLength(1);
    expect((await outbox())[0].text).toContain(
      'Documentos recibidos: comprobante.pdf',
    );
    expect((await outbox())[0].text).not.toContain('storageId');
  });

  test('missing configuration preserves the inscription and concurrent admin retries send once', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const { t, admin, submit, outbox } = await setup();
    await submit();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [email] = await outbox();
    expect(email).toMatchObject({ state: 'failed', attempts: 1 });
    expect(
      await t.run((ctx) => ctx.db.get(email.registrationId)),
    ).not.toBeNull();
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({
      state: 'failed',
      canRetry: true,
      error: expect.stringContaining('RESEND_API_KEY'),
    });
    vi.stubEnv('RESEND_API_KEY', 're_fixed');
    await Promise.all([
      admin.mutation(api.emails.retry, {
        registrationId: email.registrationId,
      }),
      admin.mutation(api.emails.retry, {
        registrationId: email.registrationId,
      }),
    ]);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await outbox()).toHaveLength(1);
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({ state: 'sent', attempts: 2, canRetry: false });
  });

  test('test mode refuses participant addresses without losing the inscription', async () => {
    vi.stubEnv('EMAIL_TEST_MODE', 'true');
    const { t, admin, submit, outbox } = await setup();
    await submit();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [email] = await outbox();
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({
      state: 'failed',
      canRetry: true,
      error: expect.stringContaining('Test mode'),
    });
    expect(
      await t.run((ctx) => ctx.db.get(email.registrationId)),
    ).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('transient provider errors are retried automatically with the same idempotency key', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network timeout'));
    const { t, admin, submit, outbox } = await setup();
    await submit();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [email] = await outbox();
    expect(fetch).toHaveBeenCalledTimes(2);
    const keys = vi
      .mocked(fetch)
      .mock.calls.map(([, options]) =>
        new Headers(options?.headers).get('Idempotency-Key'),
      );
    expect(keys[0]).toBe(keys[1]);
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({ state: 'sent', canRetry: false });
  });

  test('a definitive provider rejection is diagnosed and retried after configuration is fixed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Invalid API key', { status: 401 }),
    );
    const { t, admin, submit, outbox } = await setup();
    await submit();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [email] = await outbox();
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({
      state: 'failed',
      canRetry: true,
      error: expect.stringContaining('401'),
    });
    expect(
      await t.run((ctx) => ctx.db.get(email.registrationId)),
    ).not.toBeNull();
    await admin.mutation(api.emails.retry, {
      registrationId: email.registrationId,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await outbox())[0].componentEmailId).not.toBe(
      email.componentEmailId,
    );
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({ state: 'sent', canRetry: false });
  });

  test('uncertain outcomes cannot be retried with a new key after automatic retries are exhausted', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network timeout'));
    const { t, admin, submit, outbox } = await setup();
    await submit();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [email] = await outbox();
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({ state: 'failed', canRetry: false });
    await expect(
      admin.mutation(api.emails.retry, {
        registrationId: email.registrationId,
      }),
    ).rejects.toThrow('riesgo de duplicar');
  });

  test('email diagnostics and retries require an administrator', async () => {
    const { t, submit, outbox } = await setup();
    await submit();
    const [email] = await outbox();
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'user@example.com' }),
    );
    for (const caller of [
      t,
      t.withIdentity({ subject: `${userId}|session` }),
    ]) {
      await expect(
        caller.query(api.emails.status, {
          registrationId: email.registrationId,
        }),
      ).rejects.toThrow('Acceso no autorizado');
      await expect(
        caller.mutation(api.emails.retry, {
          registrationId: email.registrationId,
        }),
      ).rejects.toThrow('Acceso no autorizado');
    }
  });

  test('deletion cancels queued confirmation emails and later scheduler runs do nothing', async () => {
    const { t, admin, submit, outbox } = await setup();
    await submit();
    const [email] = await outbox();
    await t.mutation(internal.emails.enqueue, { id: email._id });
    const componentEmailId = (await outbox())[0].componentEmailId!;
    await admin.mutation(api.registrations.remove, {
      id: email.registrationId,
    });
    expect(await outbox()).toEqual([]);
    expect(
      await t.query(components.resend.lib.getStatus, {
        emailId: componentEmailId,
      }),
    ).toMatchObject({ status: 'cancelled' });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetch).not.toHaveBeenCalled();
  });

  test('already sent emails do not prevent deletion of an inscription', async () => {
    const { t, admin, submit, outbox } = await setup();
    await submit();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [email] = await outbox();
    await admin.mutation(api.registrations.remove, {
      id: email.registrationId,
    });
    expect(await outbox()).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(email.registrationId))).toBeNull();
  });

  test('legacy inscriptions are not backfilled or sent on a duplicate submission', async () => {
    const { t, admin, eventId, submit, outbox } = await setup();
    const registrationId = await t.run((ctx) => {
      const { website: _website, ...registration } = details;
      return ctx.db.insert('registrations', { eventId, ...registration });
    });
    await submit();
    expect(await outbox()).toEqual([]);
    expect(await admin.query(api.emails.status, { registrationId })).toBeNull();
  });

  test('only signed webhooks can update delivery status and duplicates are harmless', async () => {
    const secret = 'whsec_dGVzdC13ZWJob29rLXNlY3JldA==';
    vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);
    const { t, admin, submit, outbox } = await setup();
    await submit();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [email] = await outbox();
    const body = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        created_at: new Date().toISOString(),
        email_id: 'resend-test-id',
        from: 'inscripciones@example.com',
        to: [details.email],
        subject: email.subject,
      },
    });
    expect(
      (await t.fetch('/resend-webhook', { method: 'POST', body })).status,
    ).toBe(400);
    const timestamp = new Date();
    const headers = {
      'svix-id': 'webhook-test-id',
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': new Webhook(secret).sign(
        'webhook-test-id',
        timestamp,
        body,
      ),
    };
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (await t.fetch('/resend-webhook', { method: 'POST', headers, body }))
          .status,
      ).toBe(201);
    expect(
      await admin.query(api.emails.status, {
        registrationId: email.registrationId,
      }),
    ).toMatchObject({ state: 'delivered', canRetry: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

test('email templates escape untrusted values and preserve multi-day and legacy schedules', () => {
  const participant = {
    _id: 'registration-id',
    ...details,
    name: '<img src=x onerror=alert(1)>',
    answers: { experience: '<script>alert(1)</script>' },
    status: 'accepted' as const,
  };
  const template = confirmationTemplate(
    {
      ...event,
      title: 'Actividad\r\nBcc: injected@example.com',
      endAt: Date.parse('2026-10-25T17:00:00-03:00'),
      location: '<b>Plaza</b>',
    },
    participant,
  );
  expect(template.html).not.toContain('<script>');
  expect(template.html).not.toContain('<img');
  expect(template.html).toContain('&lt;script&gt;');
  expect(template.html).toContain('&lt;b&gt;Plaza&lt;/b&gt;');
  expect(template.subject).not.toMatch(/[\r\n]/);
  expect(template.text).toContain('25 de octubre de 2026');
  expect(
    confirmationTemplate(
      { ...event, startAt: undefined, endAt: undefined },
      participant,
    ).text,
  ).toContain('Horario a confirmar');
});
