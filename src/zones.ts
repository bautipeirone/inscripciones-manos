// Barrios ("zones") are chosen for a cycle of consecutive editions, usually
// three. Within a cycle a person keeps the same barrio unless the team moves
// them, so an assignment applies from one edition until a later one replaces it.
export type ZoneStatus = 'requested' | 'confirmed';
export type ZoneCycle = { _id: string; startYear: number; endYear: number };
export type Zone = { _id: string; cycleId: string; name: string };
export type ZoneAssignment = {
  _id: string;
  cycleId: string;
  zoneId: string;
  fromEdition: number;
  status: ZoneStatus;
};
// An edition from before the platform, as reported by the participant.
export type PastEdition = { _id: string; edition: number; zone: string };
export type ZonePlacement = {
  zoneId: string;
  zoneName: string;
  status: ZoneStatus;
  fromEdition: number;
};
export type ZoneHistoryEntry = {
  edition: number;
  zone: string | null;
  source: 'platform' | 'declared';
  status?: ZoneStatus;
  pastEditionId?: string;
};
export type ZoneOverview = {
  edition: number;
  cycle: (ZoneCycle & { label: string }) | null;
  zones: { _id: string; name: string }[];
  placement: ZonePlacement | null;
  history: ZoneHistoryEntry[];
};

// Editions are named after their January Manos a la Obra. August–December
// diagnostic visits prepare the next January, so they belong to the next one.
export function editionOf(time: number) {
  const date = new Date(time - 3 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  return date.getUTCMonth() === 0 ? year : year + 1;
}
export const eventEdition = (event: { date: string }) =>
  editionOf(Date.parse(event.date + 'T12:00:00-03:00'));
export const cycleLabel = (cycle: { startYear: number; endYear: number }) =>
  cycle.startYear === cycle.endYear
    ? String(cycle.startYear)
    : `${cycle.startYear}–${cycle.endYear}`;
export const cycleFor = <T extends Omit<ZoneCycle, '_id'>>(
  cycles: T[],
  edition: number,
) => cycles.find((c) => c.startYear <= edition && edition <= c.endYear);

// The assignment in effect for an edition: the latest one that already started.
export function assignmentAt<T extends Omit<ZoneAssignment, '_id'>>(
  assignments: T[],
  cycleId: string,
  edition: number,
) {
  return assignments
    .filter((a) => a.cycleId === cycleId && a.fromEdition <= edition)
    .sort((a, b) => b.fromEdition - a.fromEdition)[0];
}
// A participant may only choose while the team has not decided yet.
export function requestTarget<T extends Omit<ZoneAssignment, '_id'>>(
  assignments: T[],
  cycleId: string,
) {
  const latest = assignments
    .filter((a) => a.cycleId === cycleId)
    .sort((a, b) => b.fromEdition - a.fromEdition)[0];
  if (latest?.status === 'confirmed')
    throw new Error(
      'El equipo ya confirmó tu barrio para este ciclo. Si necesitás cambiarlo, hablá con el equipo.',
    );
  return latest;
}
// The team edits the decision for an edition, or starts a new one from it,
// so earlier editions keep the barrio where the person actually went.
export const assignTarget = <T extends Omit<ZoneAssignment, '_id'>>(
  assignments: T[],
  cycleId: string,
  edition: number,
) =>
  assignments.find((a) => a.cycleId === cycleId && a.fromEdition === edition);

export function zoneOverview({
  edition,
  cycles,
  zones,
  assignments,
  pastEditions,
  inscribedEditions,
}: {
  edition: number;
  cycles: ZoneCycle[];
  zones: Zone[];
  assignments: ZoneAssignment[];
  pastEditions: PastEdition[];
  inscribedEditions: number[];
}): ZoneOverview {
  const placementAt = (at: number): ZonePlacement | null => {
    const cycle = cycleFor(cycles, at);
    const assignment = cycle && assignmentAt(assignments, cycle._id, at);
    if (!assignment) return null;
    return {
      zoneId: assignment.zoneId,
      zoneName: zones.find((z) => z._id === assignment.zoneId)?.name ?? '',
      status: assignment.status,
      fromEdition: assignment.fromEdition,
    };
  };
  const cycle = cycleFor(cycles, edition);
  // A skipped edition has no inscriptions, so it does not appear.
  const platform = [...new Set(inscribedEditions)].map(
    (at): ZoneHistoryEntry => {
      const placement = placementAt(at);
      return {
        edition: at,
        zone: placement?.zoneName ?? null,
        source: 'platform',
        ...(placement ? { status: placement.status } : {}),
      };
    },
  );
  const declared = pastEditions.map((past): ZoneHistoryEntry => ({
    edition: past.edition,
    zone: past.zone,
    source: 'declared',
    pastEditionId: past._id,
  }));
  return {
    edition,
    cycle: cycle
      ? {
          _id: cycle._id,
          startYear: cycle.startYear,
          endYear: cycle.endYear,
          label: cycleLabel(cycle),
        }
      : null,
    zones: cycle
      ? zones
          .filter((z) => z.cycleId === cycle._id)
          .map(({ _id, name }) => ({ _id, name }))
      : [],
    placement: placementAt(edition),
    history: [...platform, ...declared].sort((a, b) => b.edition - a.edition),
  };
}

export const FIRST_EDITION = 2000;
export function validatePastEdition(
  input: { edition: number; zone: string },
  currentEdition: number,
  takenEditions: number[],
) {
  if (
    !Number.isInteger(input.edition) ||
    input.edition < FIRST_EDITION ||
    input.edition >= currentEdition
  )
    throw new Error('Elegí una edición anterior a la actual.');
  if (!input.zone.trim() || input.zone.length > 120)
    throw new Error('Escribí el nombre del barrio, de hasta 120 caracteres.');
  if (takenEditions.includes(input.edition))
    throw new Error('Esa edición ya figura en tu historial.');
}
export function validateCycle(
  input: { startYear: number; endYear: number; zones: string[] },
  cycles: Omit<ZoneCycle, '_id'>[],
) {
  if (
    !Number.isInteger(input.startYear) ||
    !Number.isInteger(input.endYear) ||
    input.startYear < FIRST_EDITION ||
    input.endYear < input.startYear ||
    input.endYear - input.startYear > 9
  )
    throw new Error('Revisá los años del ciclo.');
  if (
    cycles.some(
      (c) => c.startYear <= input.endYear && input.startYear <= c.endYear,
    )
  )
    throw new Error('El ciclo se superpone con otro ya cargado.');
  const names = input.zones.map((z) => z.trim().toLocaleLowerCase());
  if (
    !names.length ||
    names.length > 20 ||
    names.some((z) => !z || z.length > 120) ||
    new Set(names).size !== names.length
  )
    throw new Error('Cargá entre 1 y 20 barrios con nombres distintos.');
}
