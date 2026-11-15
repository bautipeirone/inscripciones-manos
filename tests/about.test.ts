import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import {
  MAX_ABOUT_SECTIONS,
  MAX_DONOR_NAMES,
  defaultAbout,
  donorBatchMessage,
  donorsByYear,
  type AboutContent,
  type DonorInput,
} from '../src/about';

const modules = import.meta.glob('../convex/**/*.ts');
const content: AboutContent = {
  title: ' Quiénes somos ',
  lead: ' Un proyecto de la Pastoral Universitaria. ',
  sections: [{ title: ' Historia ', body: ' Primer párrafo.\n\nSegundo. ' }],
  donationsIntro: ' Gracias. ',
  donationsHow: ' Escribinos a equipo@example.com ',
};
const donor: DonorInput = {
  name: ' Ferretería El Galpón ',
  kind: 'organization',
  years: [2024, 2026, 2024],
  note: ' Herramientas ',
  url: ' https://example.com/galpon ',
};
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { email: 'admin@example.com' });
    await ctx.db.insert('admins', { userId: id });
    return id;
  });
  return { t, admin: t.withIdentity({ subject: `${userId}|session` }) };
}

describe('Nosotros page', () => {
  test('anyone can read the page and its donors, but only admins can change them', async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.about.saveDonor, { donor });
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'user@example.com' }),
    );
    for (const caller of [
      t,
      t.withIdentity({ subject: `${userId}|session` }),
    ]) {
      await expect(
        caller.mutation(api.about.save, { content }),
      ).rejects.toThrow('Acceso no autorizado');
      await expect(
        caller.mutation(api.about.saveDonor, { donor }),
      ).rejects.toThrow('Acceso no autorizado');
      await expect(
        caller.mutation(api.about.saveDonor, { id, donor }),
      ).rejects.toThrow('Acceso no autorizado');
      await expect(
        caller.mutation(api.about.addDonors, {
          names: ['Ana'],
          kind: 'person',
          year: 2026,
        }),
      ).rejects.toThrow('Acceso no autorizado');
      await expect(
        caller.mutation(api.about.removeDonor, { id }),
      ).rejects.toThrow('Acceso no autorizado');
      expect(await caller.query(api.about.get, {})).toBeNull();
      expect(await caller.query(api.about.listDonors, {})).toHaveLength(1);
    }
  });

  test('texts start unset, are trimmed when saved and are replaced as a whole', async () => {
    const { t, admin } = await setup();
    expect(await t.query(api.about.get, {})).toBeNull();
    await admin.mutation(api.about.save, { content });
    expect(await t.query(api.about.get, {})).toEqual({
      title: 'Quiénes somos',
      lead: 'Un proyecto de la Pastoral Universitaria.',
      sections: [{ title: 'Historia', body: 'Primer párrafo.\n\nSegundo.' }],
      donationsIntro: 'Gracias.',
      donationsHow: 'Escribinos a equipo@example.com',
    });
    await admin.mutation(api.about.save, {
      content: { ...defaultAbout, sections: [], lead: '', donationsHow: '' },
    });
    expect(await t.query(api.about.get, {})).toMatchObject({
      title: defaultAbout.title,
      sections: [],
      lead: '',
      donationsHow: '',
    });
    expect(await t.run((ctx) => ctx.db.query('about').collect())).toHaveLength(
      1,
    );
  });

  test.each<Partial<AboutContent>>([
    { title: '  ' },
    { title: 'a'.repeat(121) },
    { lead: 'a'.repeat(601) },
    { sections: [{ title: ' ', body: 'Texto' }] },
    { sections: [{ title: 'Título', body: ' ' }] },
    { sections: [{ title: 'Título', body: 'a'.repeat(4001) }] },
    {
      sections: Array.from({ length: MAX_ABOUT_SECTIONS + 1 }, () => ({
        title: 'Título',
        body: 'Texto',
      })),
    },
    { donationsIntro: 'a'.repeat(1501) },
    { donationsHow: 'a'.repeat(1501) },
  ])('rejects invalid texts and keeps the saved ones: %j', async (change) => {
    const { t, admin } = await setup();
    await admin.mutation(api.about.save, { content });
    const before = await t.query(api.about.get, {});
    await expect(
      admin.mutation(api.about.save, { content: { ...content, ...change } }),
    ).rejects.toThrow();
    expect(await t.query(api.about.get, {})).toEqual(before);
  });
});

describe('donors', () => {
  test('saves, edits and removes a donor with normalized years and optional fields', async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.about.saveDonor, { donor });
    let rows = await t.query(api.about.listDonors, {});
    expect(rows[0]).toMatchObject({
      name: 'Ferretería El Galpón',
      kind: 'organization',
      years: [2026, 2024],
      note: 'Herramientas',
      url: 'https://example.com/galpon',
    });
    await admin.mutation(api.about.saveDonor, {
      id,
      donor: { name: 'El Galpón', kind: 'organization', years: [2025] },
    });
    rows = await t.query(api.about.listDonors, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'El Galpón', years: [2025] });
    expect(rows[0]).not.toHaveProperty('note');
    expect(rows[0]).not.toHaveProperty('url');
    await admin.mutation(api.about.removeDonor, { id });
    await admin.mutation(api.about.removeDonor, { id });
    expect(await t.query(api.about.listDonors, {})).toEqual([]);
    await expect(
      admin.mutation(api.about.saveDonor, { id, donor }),
    ).rejects.toThrow('No encontramos al donante');
  });

  test.each<Partial<DonorInput>>([
    { name: ' ' },
    { name: 'a'.repeat(121) },
    { years: [] },
    { years: [1800] },
    { years: [2025.5] },
    { note: 'a'.repeat(201) },
    { url: 'javascript:alert(1)' },
    { url: 'ejemplo.com' },
    { url: `https://example.com/${'a'.repeat(300)}` },
  ])('rejects invalid donors: %j', async (change) => {
    const { t, admin } = await setup();
    await expect(
      admin.mutation(api.about.saveDonor, { donor: { ...donor, ...change } }),
    ).rejects.toThrow();
    expect(await t.query(api.about.listDonors, {})).toEqual([]);
  });

  test('a pasted list adds new names and only adds the year to known ones', async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.about.saveDonor, {
      donor: { name: 'Ana Pérez', kind: 'person', years: [2025] },
    });
    // The same name as a company is a different donor.
    await admin.mutation(api.about.saveDonor, {
      donor: { name: 'Luis Gómez', kind: 'organization', years: [2025] },
    });
    const first = await admin.mutation(api.about.addDonors, {
      names: ['  ana   pérez ', '', 'Luis Gómez', 'Luis Gómez', ' Marta Ruiz'],
      kind: 'person',
      year: 2026,
    });
    expect(first).toEqual({ added: 2, updated: 1, unchanged: 0 });
    expect(donorBatchMessage(first)).toBe(
      'Agregamos 2 donantes. Sumamos el año a 1 donante que ya estaba en la lista.',
    );
    const again = await admin.mutation(api.about.addDonors, {
      names: ['Ana Pérez', 'Marta Ruiz'],
      kind: 'person',
      year: 2026,
    });
    expect(again).toEqual({ added: 0, updated: 0, unchanged: 2 });
    const rows = await t.query(api.about.listDonors, {});
    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row.name === 'Ana Pérez')?.years).toEqual([
      2026, 2025,
    ]);
    expect(
      donorsByYear(rows.map((row) => ({ ...row, _id: String(row._id) }))).map(
        (group) => [
          group.year,
          group.organizations.map((d) => d.name),
          group.people.map((d) => d.name),
        ],
      ),
    ).toEqual([
      [2026, [], ['Ana Pérez', 'Luis Gómez', 'Marta Ruiz']],
      [2025, ['Luis Gómez'], ['Ana Pérez']],
    ]);
  });

  test.each([
    { names: [' ', ''], year: 2026 },
    { names: ['Ana'], year: 1800 },
    { names: ['a'.repeat(121)], year: 2026 },
    {
      names: Array.from({ length: MAX_DONOR_NAMES + 1 }, (_, i) => `Ana ${i}`),
      year: 2026,
    },
  ])('rejects an invalid list without adding anyone', async (input) => {
    const { t, admin } = await setup();
    await expect(
      admin.mutation(api.about.addDonors, { ...input, kind: 'person' }),
    ).rejects.toThrow();
    expect(await t.query(api.about.listDonors, {})).toEqual([]);
  });
});
