import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import type { EventInput } from '../src/domain';
const modules = import.meta.glob('../convex/**/*.ts');
const event: EventInput = {
  title: 'Jornada con comprobantes',
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
const details = {
  name: 'Persona de prueba',
  email: 'persona@example.com',
  phone: '',
  answers: {},
  consent: true,
  website: '',
};
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'admin@example.com' });
    await ctx.db.insert('admins', { userId });
    return userId;
  });
  const admin = t.withIdentity({ subject: `${userId}|session` });
  const eventId = await admin.mutation(api.events.save, { event });
  return { t, admin, eventId };
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(
    Date.parse('2026-10-01T12:00:00-03:00'),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});
test('a participant can submit a receipt with an inscription and admins can see its metadata', async () => {
  const { t, admin, eventId } = await setup();
  const body = new FormData();
  body.set('registration', JSON.stringify({ eventId, ...details }));
  body.append(
    'attachments',
    new File(['%PDF-1.4\nreceipt\n%%EOF'], 'comprobante.pdf', {
      type: 'application/pdf',
    }),
  );
  const response = await t.fetch('/inscriptions', { method: 'POST', body });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toEqual({
    received: true,
    approvalRequired: false,
  });
  const rows = await admin.query(api.registrations.list, {
    eventId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(rows.page[0]).toMatchObject({
    name: details.name,
    attachments: [
      { name: 'comprobante.pdf', contentType: 'application/pdf', size: 22 },
    ],
  });
  expect(
    JSON.stringify(await t.query(api.events.listPublic, {})),
  ).not.toContain('comprobante.pdf');
});

test('documents can only be downloaded by administrators and deletion revokes access', async () => {
  const { t, admin, eventId } = await setup();
  const body = new FormData();
  body.set('registration', JSON.stringify({ eventId, ...details }));
  body.append(
    'attachments',
    new File(['%PDF-1.4\nreceipt\n%%EOF'], 'comprobante.pdf', {
      type: 'application/pdf',
    }),
  );
  expect(
    (await t.fetch('/inscriptions', { method: 'POST', body })).status,
  ).toBe(200);
  const rows = await admin.query(api.registrations.list, {
    eventId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  const path = `/inscription-document?id=${rows.page[0]._id}&index=0`;
  expect((await t.fetch(path)).status).toBe(403);
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'user@example.com' }),
  );
  expect(
    (await t.withIdentity({ subject: `${userId}|session` }).fetch(path)).status,
  ).toBe(403);
  const downloaded = await admin.fetch(path);
  expect(downloaded.status).toBe(200);
  expect(downloaded.headers.get('content-type')).toBe('application/pdf');
  expect(downloaded.headers.get('cache-control')).toBe('no-store');
  expect(downloaded.headers.get('content-disposition')).toContain(
    'comprobante.pdf',
  );
  expect(await downloaded.text()).toBe('%PDF-1.4\nreceipt\n%%EOF');
  await admin.mutation(api.registrations.remove, { id: rows.page[0]._id });
  expect((await admin.fetch(path)).status).toBe(403);
  expect((await t.query(api.events.listPublic, {}))[0].registrationCount).toBe(
    0,
  );
  // Storage is an external boundary: deletion must remove the actual bytes too.
  expect(
    await t.run((ctx) => ctx.db.system.query('_storage').collect()),
  ).toHaveLength(0);
});

test.each([
  {
    name: 'receipt.txt',
    type: 'text/plain',
    content: 'not a supported file',
    message: 'PDF',
  },
  {
    name: 'receipt.png',
    type: 'application/pdf',
    content: '%PDF-1.4',
    message: 'PDF',
  },
  {
    name: 'receipt.pdf',
    type: 'application/pdf',
    content: 'renamed HTML content',
    message: 'contenido',
  },
  {
    name: 'receipt.pdf',
    type: 'application/pdf',
    content: '',
    message: 'contenido',
  },
  {
    name: 'receipt.pdf',
    type: 'application/pdf',
    content: new Uint8Array(5 * 1024 * 1024 + 1),
    message: '5 MB',
  },
])(
  'rejects invalid documents on the server: $name / $message',
  async ({ name, type, content, message }) => {
    const { t, admin, eventId } = await setup();
    const body = new FormData();
    body.set('registration', JSON.stringify({ eventId, ...details }));
    body.append('attachments', new File([content], name, { type }));
    const response = await t.fetch('/inscriptions', { method: 'POST', body });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(message);
    expect(
      (
        await admin.query(api.registrations.list, {
          eventId,
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toHaveLength(0);
    expect(
      (await t.query(api.events.listPublic, {}))[0].registrationCount,
    ).toBe(0);
    expect(
      await t.run((ctx) => ctx.db.system.query('_storage').collect()),
    ).toHaveLength(0);
  },
);

test('enforces document count and rejects invalid inscription details before storing files', async () => {
  const { t, eventId } = await setup();
  const body = new FormData();
  body.set('registration', JSON.stringify({ eventId, ...details }));
  for (let index = 0; index < 4; index++)
    body.append(
      'attachments',
      new File(['%PDF-1.4'], `receipt-${index}.pdf`, {
        type: 'application/pdf',
      }),
    );
  const response = await t.fetch('/inscriptions', { method: 'POST', body });
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain('hasta 3 documentos');
  body.delete('attachments');
  body.append(
    'attachments',
    new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
  );
  body.set(
    'registration',
    JSON.stringify({ eventId, ...details, consent: false }),
  );
  expect(
    (await t.fetch('/inscriptions', { method: 'POST', body })).status,
  ).toBe(400);
  body.set('registration', '{');
  expect(
    (await t.fetch('/inscriptions', { method: 'POST', body })).status,
  ).toBe(400);
  body.set('registration', JSON.stringify({ eventId, email: details.email }));
  expect(
    (await t.fetch('/inscriptions', { method: 'POST', body })).status,
  ).toBe(400);
  expect(
    await t.run((ctx) => ctx.db.system.query('_storage').collect()),
  ).toHaveLength(0);
});

test('duplicate submissions retain the original receipt and remove the retry upload', async () => {
  const { t, admin, eventId } = await setup();
  const body = new FormData();
  body.set('registration', JSON.stringify({ eventId, ...details }));
  body.append(
    'attachments',
    new File(['%PDF-1.4\noriginal'], 'original.pdf', {
      type: 'application/pdf',
    }),
  );
  const first = await t.fetch('/inscriptions', { method: 'POST', body });
  body.set(
    'registration',
    JSON.stringify({
      eventId,
      ...details,
      name: 'Duplicate',
      email: ' PERSONA@EXAMPLE.COM ',
    }),
  );
  body.set(
    'attachments',
    new File(['%PDF-1.4\nretry'], 'retry.pdf', { type: 'application/pdf' }),
  );
  const retry = await t.fetch('/inscriptions', { method: 'POST', body });
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual(await first.json());
  const rows = (
    await admin.query(api.registrations.list, {
      eventId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  ).page;
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe(details.name);
  expect(rows[0].attachments[0].name).toBe('original.pdf');
  expect(rows[0].attachments[0]).not.toHaveProperty('storageId');
  expect(
    await t.run((ctx) => ctx.db.system.query('_storage').collect()),
  ).toHaveLength(1);
  expect(
    await (
      await admin.fetch(`/inscription-document?id=${rows[0]._id}&index=0`)
    ).text(),
  ).toBe('%PDF-1.4\noriginal');
});

test('PNG and JPEG documents can accompany a pending inscription, while capacity remains enforced', async () => {
  const { t, admin, eventId } = await setup();
  await admin.mutation(api.events.save, {
    id: eventId,
    event: { ...event, requireApproval: true, capacity: 1 },
  });
  const body = new FormData();
  body.set('registration', JSON.stringify({ eventId, ...details }));
  body.append(
    'attachments',
    new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'receipt.png',
      { type: 'image/png' },
    ),
  );
  body.append(
    'attachments',
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'transfer.jpg', {
      type: 'image/jpeg',
    }),
  );
  const response = await t.fetch('/inscriptions', { method: 'POST', body });
  expect(response.status).toBe(200);
  expect((await response.json()).approvalRequired).toBe(true);
  expect(
    (
      await admin.query(api.registrations.list, {
        eventId,
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page[0],
  ).toMatchObject({
    status: 'pending',
    attachments: [{ name: 'receipt.png' }, { name: 'transfer.jpg' }],
  });
  body.set(
    'registration',
    JSON.stringify({ eventId, ...details, email: 'second@example.com' }),
  );
  expect(
    (await t.fetch('/inscriptions', { method: 'POST', body })).status,
  ).toBe(400);
  expect(
    await t.run((ctx) => ctx.db.system.query('_storage').collect()),
  ).toHaveLength(2);
});

test('a partial storage failure rejects the inscription and removes files already uploaded', async () => {
  const { t, admin, eventId } = await setup();
  const body = new FormData();
  body.set('registration', JSON.stringify({ eventId, ...details }));
  for (const name of ['first.pdf', 'second.pdf'])
    body.append(
      'attachments',
      new File(['%PDF-1.4\nreceipt'], name, { type: 'application/pdf' }),
    );
  // Convex-test's external storage provider hashes blobs. Fail that system
  // boundary on the second file, after the first file has been stored.
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest')
    .mockImplementationOnce(digest)
    .mockRejectedValueOnce(new Error('Storage unavailable'));
  const response = await t.fetch('/inscriptions', { method: 'POST', body });
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain('volvé a intentar');
  expect(
    (
      await admin.query(api.registrations.list, {
        eventId,
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
  expect((await t.query(api.events.listPublic, {}))[0].registrationCount).toBe(
    0,
  );
  expect(
    await t.run((ctx) => ctx.db.system.query('_storage').collect()),
  ).toHaveLength(0);
});
