export type AboutSection = { title: string; body: string };
export type AboutContent = {
  title: string;
  lead: string;
  sections: AboutSection[];
  donationsIntro: string;
  donationsHow: string;
};
export type DonorKind = 'person' | 'organization';
export type DonorInput = {
  name: string;
  kind: DonorKind;
  years: number[];
  note?: string;
  url?: string;
};
export type Donor = DonorInput & { _id: string };

export const MAX_ABOUT_SECTIONS = 12;
export const MAX_DONOR_NAMES = 200;
export const MIN_DONOR_YEAR = 1950;
export const MAX_DONOR_YEAR = 2100;
export const donorKindLabels: Record<DonorKind, string> = {
  organization: 'Empresa u organización',
  person: 'Persona',
};

// Shown until the team saves its own texts from the admin panel.
export const defaultAbout: AboutContent = {
  title: 'Universitarios que ponen manos a la obra junto a los vecinos',
  lead: 'El Proyecto Manos a la Obra es una iniciativa de la Pastoral Universitaria de Rosario. Cada año, estudiantes y graduados visitamos barrios, conocemos a sus vecinos y trabajamos con ellos en lo que el barrio necesita.',
  sections: [
    {
      title: 'Qué hacemos',
      body: 'De agosto a diciembre hacemos visitas diagnósticas: jornadas de encuentro con los vecinos para construir vínculos y relevar las problemáticas y necesidades de cada barrio.\n\nEn enero llega el Manos a la Obra: varios días de trabajo compartido con la comunidad para llevar adelante lo que preparamos durante las visitas.',
    },
    {
      title: 'Cómo nos organizamos',
      body: 'Trabajamos en los mismos barrios durante varios años seguidos. Cada voluntario acompaña a un barrio a lo largo de todo ese ciclo, para que el vínculo con los vecinos crezca de una edición a la otra.',
    },
    {
      title: 'Cómo sumarte',
      body: 'Las inscripciones a cada actividad se abren en esta plataforma. Mirá las próximas actividades en la página de inicio y anotate; no necesitás crear una cuenta.',
    },
  ],
  donationsIntro:
    'El proyecto se sostiene con el aporte de personas, empresas e instituciones que donan materiales, herramientas o dinero. Gracias a cada una.',
  donationsHow:
    'Si querés colaborar con materiales, herramientas o un aporte económico, escribinos desde https://www.morosario.com.ar y coordinamos.',
};

const limited = (value: string, max: number, message: string) => {
  const text = value.trim();
  if (text.length > max) throw new Error(message);
  return text;
};
const required = (value: string, max: number, message: string) => {
  const text = limited(value, max, message);
  if (!text) throw new Error(message);
  return text;
};

// Shared by the server and the development demo.
export function prepareAbout(input: AboutContent): AboutContent {
  if (input.sections.length > MAX_ABOUT_SECTIONS)
    throw new Error(`La página admite hasta ${MAX_ABOUT_SECTIONS} secciones.`);
  return {
    title: required(
      input.title,
      120,
      'Escribí un título de hasta 120 caracteres.',
    ),
    lead: limited(
      input.lead,
      600,
      'La presentación no puede superar los 600 caracteres.',
    ),
    sections: input.sections.map((section) => ({
      title: required(
        section.title,
        120,
        'Cada sección necesita un título de hasta 120 caracteres.',
      ),
      body: required(
        section.body,
        4000,
        'Cada sección necesita un texto de hasta 4000 caracteres.',
      ),
    })),
    donationsIntro: limited(
      input.donationsIntro,
      1500,
      'El texto de donaciones no puede superar los 1500 caracteres.',
    ),
    donationsHow: limited(
      input.donationsHow,
      1500,
      'El texto de «Cómo donar» no puede superar los 1500 caracteres.',
    ),
  };
}

const validYear = (year: number) =>
  Number.isInteger(year) && year >= MIN_DONOR_YEAR && year <= MAX_DONOR_YEAR;
const yearError = `Usá años entre ${MIN_DONOR_YEAR} y ${MAX_DONOR_YEAR}.`;

export function prepareDonor(input: DonorInput): DonorInput {
  if (input.kind !== 'person' && input.kind !== 'organization')
    throw new Error('Elegí si es una persona o una empresa u organización.');
  const years = [...new Set(input.years)].sort((a, b) => b - a);
  if (years.length < 1) throw new Error('Marcá al menos un año de donación.');
  if (!years.every(validYear)) throw new Error(yearError);
  const note = limited(
    input.note ?? '',
    200,
    'El detalle no puede superar los 200 caracteres.',
  );
  const url = (input.url ?? '').trim();
  if (url) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      /* Reported below. */
    }
    if (
      !parsed ||
      !['http:', 'https:'].includes(parsed.protocol) ||
      url.length > 300
    )
      throw new Error(
        'El sitio web debe ser una dirección completa, como https://ejemplo.com.',
      );
  }
  return {
    name: required(
      input.name,
      120,
      'Escribí un nombre de hasta 120 caracteres.',
    ),
    kind: input.kind,
    years,
    ...(note ? { note } : {}),
    ...(url ? { url } : {}),
  };
}

const donorKey = (donor: { name: string; kind: DonorKind }) =>
  `${donor.kind}:${donor.name.trim().replace(/\s+/g, ' ').toLowerCase()}`;

// Plans a batch of names for one year: people already on the list only gain
// the year, so pasting last year's list again never duplicates anyone.
export function planDonorBatch(
  existing: Donor[],
  input: { names: string[]; kind: DonorKind; year: number },
) {
  if (!validYear(input.year)) throw new Error(yearError);
  const names = [
    ...new Map(
      input.names
        .map((name) => name.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .map((name) => [donorKey({ name, kind: input.kind }), name]),
    ).values(),
  ];
  if (names.length < 1) throw new Error('Escribí al menos un nombre.');
  if (names.length > MAX_DONOR_NAMES)
    throw new Error(`Agregá hasta ${MAX_DONOR_NAMES} nombres por vez.`);
  const byKey = new Map(existing.map((donor) => [donorKey(donor), donor]));
  const inserts: DonorInput[] = [];
  const updates: { _id: string; years: number[] }[] = [];
  let unchanged = 0;
  for (const name of names) {
    const found = byKey.get(donorKey({ name, kind: input.kind }));
    if (!found)
      inserts.push(
        prepareDonor({ name, kind: input.kind, years: [input.year] }),
      );
    else if (found.years.includes(input.year)) unchanged++;
    else
      updates.push({
        _id: found._id,
        years: [...found.years, input.year].sort((a, b) => b - a),
      });
  }
  return { inserts, updates, unchanged };
}
export type DonorBatchResult = {
  added: number;
  updated: number;
  unchanged: number;
};
export function donorBatchMessage(result: DonorBatchResult) {
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  return [
    result.added && `Agregamos ${count(result.added, 'donante', 'donantes')}.`,
    result.updated &&
      `Sumamos el año a ${count(result.updated, 'donante que ya estaba', 'donantes que ya estaban')} en la lista.`,
    result.unchanged &&
      `${count(result.unchanged, 'nombre ya figuraba', 'nombres ya figuraban')} en ese año.`,
  ]
    .filter(Boolean)
    .join(' ');
}

const byName = (a: Donor, b: Donor) => a.name.localeCompare(b.name, 'es');
// Newest year first; a donor appears under every year they gave.
export function donorsByYear(donors: Donor[]) {
  const years = [...new Set(donors.flatMap((donor) => donor.years))].sort(
    (a, b) => b - a,
  );
  return years.map((year) => {
    const group = donors.filter((donor) => donor.years.includes(year));
    return {
      year,
      organizations: group
        .filter((donor) => donor.kind === 'organization')
        .sort(byName),
      people: group.filter((donor) => donor.kind === 'person').sort(byName),
    };
  });
}
