import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useConvex, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { validateAttachments, validateAttachmentContent } from './attachments';
import {
  saveDemoDocuments,
  readDemoDocument,
  removeDemoDocuments,
} from './demoDocuments';
import {
  prepareInventory,
  type Inventory,
  type InventoryInput,
} from './inventory';
import {
  assignTarget,
  assignmentAt,
  cycleFor,
  editionOf,
  eventEdition,
  requestTarget,
  validatePastEdition,
  zoneOverview,
  type PastEdition,
  type Zone,
  type ZoneAssignment,
  type ZoneCycle,
  type ZoneOverview,
} from './zones';
import {
  eventSummary,
  normalizeEmail,
  normalizeProfileDetails,
  validateEvent,
  validatePassword,
  validateProfile,
  validateProfileDetails,
  validateRegistration,
  type Account,
  type Event,
  type EventInput,
  type HistoryEntry,
  type PersonInfo,
  type ProfileDetails,
  type Registration,
  type RegistrationInput,
  type RegistrationResult,
} from './domain';

type Data = {
  demo: boolean;
  loading: boolean;
  events: Event[];
  admin: { name: string; email: string } | null;
  // The signed-in participant; admins also have one in the live app.
  account: Account | null;
  // The account's own inscriptions; undefined while loading.
  history: HistoryEntry[] | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  participantSignIn: (email: string, password: string) => Promise<void>;
  participantSignUp: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (profile: ProfileDetails) => Promise<void>;
  // The participant's barrio for the current cycle and their history.
  zone: ZoneOverview | null | undefined;
  requestZone: (zoneId: string) => Promise<void>;
  withdrawZoneRequest: () => Promise<void>;
  addPastEdition: (input: { edition: number; zone: string }) => Promise<void>;
  removePastEdition: (id: string) => Promise<void>;
  saveEvent: (event: EventInput, id?: string) => Promise<void>;
  availability: (
    event: Event,
    visible: boolean,
    accepting: boolean,
  ) => Promise<void>;
  register: (
    input: RegistrationInput & { saveProfile?: boolean },
    files?: File[],
  ) => Promise<RegistrationResult>;
  downloadAttachment: (
    registration: Registration,
    index: number,
  ) => Promise<void>;
  registrations: (eventId: string) => Promise<Registration[]>;
  person: (registrationId: string) => Promise<PersonInfo | null>;
  assignZone: (input: {
    userId: string;
    zoneId: string;
    edition: number;
  }) => Promise<void>;
  removeRegistration: (id: string) => Promise<void>;
  acceptRegistration: (id: string) => Promise<void>;
  inventories: Inventory[] | undefined;
  saveInventory: (inventory: InventoryInput, id?: string) => Promise<void>;
  removeInventory: (id: string) => Promise<void>;
};
const Context = createContext<Data | null>(null);
export function useData() {
  const data = useContext(Context);
  if (!data) throw new Error('Missing data provider');
  return data;
}
export function LiveData({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.admin.viewer, isAuthenticated ? {} : 'skip');
  const account = useQuery(
    api.participants.viewer,
    isAuthenticated ? {} : 'skip',
  );
  const history = useQuery(
    api.participants.history,
    isAuthenticated ? {} : 'skip',
  );
  const zone = useQuery(api.zones.mine, isAuthenticated ? {} : 'skip');
  const publicEvents = useQuery(api.events.listPublic);
  const adminEvents = useQuery(api.events.listAdmin, viewer ? {} : 'skip');
  const inventories = useQuery(api.inventories.listAdmin, viewer ? {} : 'skip');
  const auth = useAuthActions();
  const token = useAuthToken();
  const save = useMutation(api.events.save);
  const update = useMutation(api.events.setAvailability);
  const submit = useMutation(api.registrations.submit);
  const saveProfile = useMutation(api.participants.saveProfile);
  const requestZone = useMutation(api.zones.request);
  const withdrawZoneRequest = useMutation(api.zones.withdraw);
  const addPastEdition = useMutation(api.zones.addPastEdition);
  const removePastEdition = useMutation(api.zones.removePastEdition);
  const assignZone = useMutation(api.zones.assign);
  const remove = useMutation(api.registrations.remove);
  const accept = useMutation(api.registrations.accept);
  const saveInventory = useMutation(api.inventories.save);
  const removeInventory = useMutation(api.inventories.remove);
  const convex = useConvex();
  // Admins and participants share the password provider; roles live in Convex.
  const signIn = async (email: string, password: string) => {
    await auth.signIn('password', { email, password, flow: 'signIn' });
  };
  return (
    <Context.Provider
      value={{
        demo: false,
        loading:
          isLoading ||
          publicEvents === undefined ||
          (isAuthenticated && (viewer === undefined || account === undefined)),
        events: adminEvents ?? publicEvents ?? [],
        admin: viewer ?? null,
        account: account ?? null,
        history: isAuthenticated ? history : [],
        inventories,
        saveInventory: async (inventory, id) => {
          await saveInventory({
            inventory,
            ...(id ? { id: id as Id<'inventories'> } : {}),
          });
        },
        removeInventory: async (id) => {
          await removeInventory({ id: id as Id<'inventories'> });
        },
        signIn,
        participantSignIn: signIn,
        participantSignUp: async ({ name, email, password }) => {
          await auth.signIn('password', {
            name,
            email,
            password,
            flow: 'signUp',
          });
        },
        signOut: auth.signOut,
        saveProfile: async (profile) => {
          await saveProfile(profile);
        },
        zone: isAuthenticated ? zone : null,
        requestZone: async (zoneId) => {
          await requestZone({ zoneId: zoneId as Id<'zones'> });
        },
        withdrawZoneRequest: async () => {
          await withdrawZoneRequest({});
        },
        addPastEdition: async (input) => {
          await addPastEdition(input);
        },
        removePastEdition: async (id) => {
          await removePastEdition({ id: id as Id<'pastEditions'> });
        },
        saveEvent: async (event, id) => {
          await save({ event, ...(id ? { id: id as Id<'events'> } : {}) });
        },
        availability: async (event, visible, accepting) => {
          await update({ id: event._id as Id<'events'>, visible, accepting });
        },
        register: async ({ saveProfile, ...input }, files = []) => {
          if (files.length) {
            const form = new FormData();
            form.set('registration', JSON.stringify(input));
            if (saveProfile) form.set('saveProfile', 'true');
            for (const file of files) form.append('attachments', file);
            let response: Response;
            try {
              // The session links the inscription to the signed-in account.
              response = await fetch(httpUrl('/inscriptions'), {
                method: 'POST',
                body: form,
                ...(token
                  ? { headers: { Authorization: `Bearer ${token}` } }
                  : {}),
              });
            } catch {
              throw new Error(
                'No pudimos enviar la inscripción y los documentos. Revisá tu conexión y volvé a intentar.',
              );
            }
            const result = await response.json().catch(() => null);
            if (
              !response.ok ||
              result?.received !== true ||
              typeof result?.approvalRequired !== 'boolean'
            )
              throw new Error(
                (typeof result?.error === 'string' && result.error) ||
                  'No pudimos guardar los documentos. Volvé a intentar.',
              );
            return result as RegistrationResult;
          }
          return await submit({
            ...input,
            eventId: input.eventId as Id<'events'>,
            saveProfile,
          });
        },
        downloadAttachment: async (registration, index) => {
          if (!token) throw new Error('Acceso no autorizado.');
          const attachment = registration.attachments?.[index];
          if (!attachment) throw new Error('No encontramos el documento.');
          const url = httpUrl('/inscription-document');
          url.searchParams.set('id', registration._id);
          url.searchParams.set('index', String(index));
          try {
            const response = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Download failed');
            downloadBlob(await response.blob(), attachment.name);
          } catch {
            throw new Error(
              'No pudimos descargar el documento. Revisá tu sesión y volvé a intentar.',
            );
          }
        },
        removeRegistration: async (id) => {
          await remove({ id: id as Id<'registrations'> });
        },
        acceptRegistration: async (id) => {
          await accept({ id: id as Id<'registrations'> });
        },
        registrations: async (eventId) => {
          const rows: Registration[] = [];
          let cursor: string | null = null;
          for (;;) {
            const result: FunctionReturnType<typeof api.registrations.list> =
              await convex.query(api.registrations.list, {
                eventId: eventId as Id<'events'>,
                paginationOpts: { numItems: 100, cursor },
              });
            rows.push(...result.page.map((row) => ({ ...row, website: '' })));
            if (result.isDone) break;
            cursor = result.continueCursor;
          }
          return rows;
        },
        person: async (registrationId) =>
          await convex.query(api.registrations.person, {
            id: registrationId as Id<'registrations'>,
          }),
        assignZone: async ({ userId, zoneId, edition }) => {
          await assignZone({
            userId: userId as Id<'users'>,
            zoneId: zoneId as Id<'zones'>,
            edition,
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

function seedEvents(): Event[] {
  const today = new Date();
  const year =
    today.getMonth() < 1 ? today.getFullYear() - 1 : today.getFullYear();
  const monthly = [8, 9, 10, 11, 12].map((month, i): Event => {
    const date = `${year}-${String(month).padStart(2, '0')}-24`;
    return {
      _id: `demo-${month}`,
      title: `Visita diagnóstica #${i + 1}`,
      description:
        'Jornada de encuentro con los vecinos para construir vínculos y relevar las problemáticas y necesidades del barrio.',
      kind: 'monthly',
      date,
      startAt: Date.parse(`${date}T09:00:00-03:00`),
      endAt: Date.parse(`${date}T17:00:00-03:00`),
      instructions:
        'Traer ropa cómoda, una botella de agua y un cuaderno para tomar notas. El Equipo de Inscripciones compartirá los detalles del punto de encuentro.',
      location: 'Lugar a confirmar',
      deadline: Date.parse(
        `${year}-${String(month).padStart(2, '0')}-23T23:59:00-03:00`,
      ),
      visible: true,
      accepting: true,
      capacity: 0,
      registrationCount: 0,
      questions: [],
    };
  });
  return [
    ...monthly,
    {
      _id: 'demo-main',
      title: `Manos a la Obra ${year + 1}`,
      description:
        'Actividad de enero del Proyecto Manos a la Obra para compartir con la comunidad y llevar adelante el trabajo preparado durante las visitas diagnósticas.',
      kind: 'main',
      date: `${year + 1}-01-10`,
      startAt: Date.parse(`${year + 1}-01-10T08:00:00-03:00`),
      endAt: Date.parse(`${year + 1}-01-14T18:00:00-03:00`),
      instructions:
        'Reservá los cinco días de la actividad. El Equipo de Inscripciones compartirá el lugar, la lista de elementos necesarios y la información del traslado antes del encuentro.',

      location: 'Lugar a confirmar',
      deadline: Date.parse(`${year}-12-28T23:59:00-03:00`),
      visible: true,
      accepting: true,
      capacity: 0,
      registrationCount: 0,
      questions: [
        {
          id: 'experience',
          label: '¿Es tu primera experiencia de voluntariado?',
          type: 'select',
          required: true,
          options: ['Sí, es mi primera vez', 'Ya participé antes'],
        },
        {
          id: 'message',
          label: '¿Hay algo que quieras contarnos?',
          type: 'textarea',
          required: false,
          options: [],
        },
      ],
    },
  ];
}
// Demo cycles start in 2022, so an edition in 2027 falls in 2025–2027.
function seedZones(): Pick<DemoState, 'zoneCycles' | 'zones'> {
  const edition = editionOf(Date.now());
  const startYear = 2022 + 3 * Math.floor((edition - 2022) / 3);
  const cycle = {
    _id: `cycle-${startYear}`,
    startYear,
    endYear: startYear + 2,
  };
  return {
    zoneCycles: [cycle],
    zones: ['Norte', 'Oeste', 'Sur'].map((name) => ({
      _id: `${cycle._id}-${name.toLowerCase()}`,
      cycleId: cycle._id,
      name: `Barrio ${name}`,
    })),
  };
}
const STORAGE = 'manos-demo-v1';
type DemoRegistration = Omit<Registration, 'otherRegistrations'>;
type DemoAccount = Account & { _id: string };
type DemoState = {
  events: Event[];
  registrations: DemoRegistration[];
  inventories: Inventory[];
  accounts: DemoAccount[];
  // The signed-in participant account, kept across page loads.
  session: string | null;
  zoneCycles: ZoneCycle[];
  zones: Zone[];
  zoneAssignments: (ZoneAssignment & { userId: string })[];
  pastEditions: (PastEdition & { userId: string })[];
};
function readDemo(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.events) && Array.isArray(data.registrations))
        return {
          ...data,
          inventories: Array.isArray(data.inventories) ? data.inventories : [],
          accounts: Array.isArray(data.accounts) ? data.accounts : [],
          session: typeof data.session === 'string' ? data.session : null,
          ...(Array.isArray(data.zoneCycles) && Array.isArray(data.zones)
            ? { zoneCycles: data.zoneCycles, zones: data.zones }
            : seedZones()),
          zoneAssignments: Array.isArray(data.zoneAssignments)
            ? data.zoneAssignments
            : [],
          pastEditions: Array.isArray(data.pastEditions)
            ? data.pastEditions
            : [],
        };
    }
  } catch {
    /* Storage can be unavailable in private browsers. */
  }
  return {
    events: seedEvents(),
    registrations: [],
    inventories: [],
    accounts: [],
    session: null,
    ...seedZones(),
    zoneAssignments: [],
    pastEditions: [],
  };
}
// Mirrors the backend: the same account or, as a hint, the same email.
const othersFrom = (rows: DemoRegistration[], row: DemoRegistration) =>
  rows.filter(
    (r) =>
      r._id !== row._id &&
      (r.email === row.email || (!!row.userId && r.userId === row.userId)),
  );
// Used only in development. This is never authentication.
export function DemoData({ children }: { children: ReactNode }) {
  const [data, setData] = useState(readDemo);
  const [admin, setAdmin] = useState<Data['admin']>(null);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data));
    } catch {
      /* The in-memory demo remains usable. */
    }
  }, [data]);
  const account = data.accounts.find((a) => a._id === data.session) ?? null;
  const findEvent = (id: string) => data.events.find((e) => e._id === id);
  const inscribedEditions = (userId: string) =>
    data.registrations.flatMap((r) => {
      const activity = r.userId === userId && findEvent(r.eventId);
      return activity ? [eventEdition(activity)] : [];
    });
  const overview = (userId: string, edition: number) =>
    zoneOverview({
      edition,
      cycles: data.zoneCycles,
      zones: data.zones,
      assignments: data.zoneAssignments.filter((a) => a.userId === userId),
      pastEditions: data.pastEditions.filter((p) => p.userId === userId),
      inscribedEditions: inscribedEditions(userId),
    });
  const zoneWithCycle = (zoneId: string) => {
    const zone = data.zones.find((z) => z._id === zoneId);
    const cycle = data.zoneCycles.find((c) => c._id === zone?.cycleId);
    if (!zone || !cycle) throw new Error('No encontramos el barrio.');
    return { zone, cycle };
  };
  return (
    <Context.Provider
      value={{
        demo: true,
        loading: false,
        admin,
        account,
        history: account
          ? data.registrations.flatMap((r) => {
              const activity = findEvent(r.eventId);
              if (r.userId !== account._id || !activity) return [];
              return [
                {
                  _id: r._id,
                  _creationTime: r._creationTime,
                  event: eventSummary(activity),
                  status: r.status ?? 'accepted',
                  name: r.name,
                  email: r.email,
                  phone: r.phone,
                  answers: activity.questions
                    .filter((q) => r.answers[q.id])
                    .map((q) => ({ label: q.label, value: r.answers[q.id] })),
                  attachments: r.attachments ?? [],
                },
              ];
            })
          : [],
        events: data.events,
        inventories: admin ? data.inventories : undefined,
        saveInventory: async (inventory, id) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          if (id && !data.inventories.some((item) => item._id === id))
            throw new Error('No encontramos el inventario.');
          const value = prepareInventory(inventory);
          setData((old) => ({
            ...old,
            inventories: id
              ? old.inventories.map((item) =>
                  item._id === id ? { ...item, ...value } : item,
                )
              : [...old.inventories, { ...value, _id: crypto.randomUUID() }],
          }));
        },
        removeInventory: async (id) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          setData((old) => ({
            ...old,
            inventories: old.inventories.filter((item) => item._id !== id),
          }));
        },
        signIn: async () => {
          setAdmin({ name: 'Equipo Manos', email: 'demo@manos.local' });
        },
        participantSignIn: async (email) => {
          const found = data.accounts.find(
            (a) => a.accountEmail === normalizeEmail(email),
          );
          if (!found) throw new Error('Invalid credentials');
          setData((old) => ({ ...old, session: found._id }));
        },
        participantSignUp: async ({ name, email, password }) => {
          const accountEmail = normalizeEmail(email);
          validateProfile({ name, email: accountEmail, phone: '' });
          validatePassword(password);
          if (data.accounts.some((a) => a.accountEmail === accountEmail))
            throw new Error('Account already exists');
          const created = {
            _id: crypto.randomUUID(),
            accountEmail,
            name: name.trim(),
            email: accountEmail,
            phone: '',
          };
          setData((old) => ({
            ...old,
            accounts: [...old.accounts, created],
            session: created._id,
          }));
        },
        signOut: async () => {
          setAdmin(null);
          setData((old) => ({ ...old, session: null }));
        },
        saveProfile: async (input) => {
          if (!account) throw new Error('Ingresá a tu cuenta.');
          const profile = normalizeProfileDetails(input);
          validateProfileDetails(profile);
          setData((old) => ({
            ...old,
            accounts: old.accounts.map((a) =>
              a._id === account._id
                ? {
                    _id: a._id,
                    accountEmail: a.accountEmail,
                    ...profile,
                  }
                : a,
            ),
          }));
        },
        zone: account ? overview(account._id, editionOf(Date.now())) : null,
        requestZone: async (zoneId) => {
          if (!account) throw new Error('Ingresá a tu cuenta.');
          const { cycle } = zoneWithCycle(zoneId);
          const edition = editionOf(Date.now());
          if (edition < cycle.startYear || cycle.endYear < edition)
            throw new Error('Ese barrio no corresponde al ciclo actual.');
          const own = data.zoneAssignments.filter(
            (a) => a.userId === account._id,
          );
          const pending = requestTarget(own, cycle._id);
          setData((old) => ({
            ...old,
            zoneAssignments: pending
              ? old.zoneAssignments.map((a) =>
                  a._id === pending._id ? { ...a, zoneId } : a,
                )
              : [
                  ...old.zoneAssignments,
                  {
                    _id: crypto.randomUUID(),
                    userId: account._id,
                    cycleId: cycle._id,
                    zoneId,
                    fromEdition: edition,
                    status: 'requested',
                  },
                ],
          }));
        },
        withdrawZoneRequest: async () => {
          if (!account) throw new Error('Ingresá a tu cuenta.');
          const cycle = cycleFor(data.zoneCycles, editionOf(Date.now()));
          if (!cycle) return;
          const pending = requestTarget(
            data.zoneAssignments.filter((a) => a.userId === account._id),
            cycle._id,
          );
          if (!pending) return;
          setData((old) => ({
            ...old,
            zoneAssignments: old.zoneAssignments.filter(
              (a) => a._id !== pending._id,
            ),
          }));
        },
        addPastEdition: async (input) => {
          if (!account) throw new Error('Ingresá a tu cuenta.');
          validatePastEdition(input, editionOf(Date.now()), [
            ...data.pastEditions
              .filter((p) => p.userId === account._id)
              .map((p) => p.edition),
            ...inscribedEditions(account._id),
          ]);
          setData((old) => ({
            ...old,
            pastEditions: [
              ...old.pastEditions,
              {
                _id: crypto.randomUUID(),
                userId: account._id,
                edition: input.edition,
                zone: input.zone.trim(),
              },
            ],
          }));
        },
        removePastEdition: async (id) => {
          if (!account) throw new Error('Ingresá a tu cuenta.');
          setData((old) => ({
            ...old,
            pastEditions: old.pastEditions.filter(
              (p) => p._id !== id || p.userId !== account._id,
            ),
          }));
        },
        saveEvent: async (event, id) => {
          if (!admin) throw new Error('Ingresá a la administración.');
          const existing = data.events.find((e) => e._id === id);
          validateEvent(existing ? { ...existing, ...event } : event, !id);
          if (
            existing &&
            existing.registrationCount > 0 &&
            JSON.stringify(existing.questions) !==
              JSON.stringify(event.questions)
          )
            throw new Error(
              'Las preguntas no se pueden cambiar después de recibir inscripciones.',
            );
          setData((old) => ({
            ...old,
            events: id
              ? old.events.map((e) => (e._id === id ? { ...e, ...event } : e))
              : [
                  ...old.events,
                  { ...event, _id: crypto.randomUUID(), registrationCount: 0 },
                ],
          }));
        },
        availability: async (event, visible, accepting) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          setData((old) => ({
            ...old,
            events: old.events.map((e) =>
              e._id === event._id ? { ...e, visible, accepting } : e,
            ),
          }));
        },
        register: async ({ saveProfile, ...input }, files = []) => {
          const event = findEvent(input.eventId);
          if (!event) throw new Error('No encontramos el evento.');
          validateRegistration(event, input);
          const details = {
            name: input.name.trim(),
            email: normalizeEmail(input.email),
            phone: input.phone.trim(),
          };
          const attachments = files.map((file) => ({
            name: file.name,
            contentType: file.type,
            size: file.size,
          }));
          validateAttachments(attachments);
          for (const file of files) await validateAttachmentContent(file);
          const result = {
            received: true,
            approvalRequired: event.requireApproval === true,
          };
          const duplicate = (rows: DemoRegistration[]) =>
            rows.some(
              (r) =>
                r.eventId === input.eventId &&
                (r.email === details.email ||
                  (!!account && r.userId === account._id)),
            );
          const keepProfile = (accounts: DemoAccount[]) =>
            account && saveProfile
              ? accounts.map((a) =>
                  a._id === account._id ? { ...a, ...details } : a,
                )
              : accounts;
          if (duplicate(data.registrations)) {
            setData((old) => ({ ...old, accounts: keepProfile(old.accounts) }));
            return result;
          }
          const id = crypto.randomUUID();
          if (files.length) await saveDemoDocuments(id, files);
          setData((old) => {
            const accounts = keepProfile(old.accounts);
            if (duplicate(old.registrations)) return { ...old, accounts };
            return {
              ...old,
              accounts,
              events: old.events.map((e) =>
                e._id === input.eventId
                  ? { ...e, registrationCount: e.registrationCount + 1 }
                  : e,
              ),
              registrations: [
                ...old.registrations,
                {
                  ...input,
                  ...details,
                  _id: id,
                  attachments,
                  _creationTime: Date.now(),
                  status: event.requireApproval ? 'pending' : 'accepted',
                  ...(account ? { userId: account._id } : {}),
                },
              ],
            };
          });
          return result;
        },
        registrations: async (eventId) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          const activity = findEvent(eventId);
          const edition = activity ? eventEdition(activity) : 0;
          const cycle = cycleFor(data.zoneCycles, edition);
          const summary = (userId: string) => {
            const owner = data.accounts.find((a) => a._id === userId);
            const assignment =
              cycle &&
              assignmentAt(
                data.zoneAssignments.filter((a) => a.userId === userId),
                cycle._id,
                edition,
              );
            const zone = data.zones.find((z) => z._id === assignment?.zoneId);
            return {
              career: owner?.career,
              graduated: owner?.graduated,
              emergencyContact: owner?.emergencyContact,
              zone:
                assignment && zone
                  ? { name: zone.name, status: assignment.status }
                  : null,
            };
          };
          return data.registrations
            .filter((r) => r.eventId === eventId)
            .reverse()
            .map((r) => ({
              ...r,
              otherRegistrations: othersFrom(data.registrations, r).length,
              account: r.userId ? summary(r.userId) : null,
            }));
        },
        assignZone: async ({ userId, zoneId, edition }) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          const { cycle } = zoneWithCycle(zoneId);
          if (edition < cycle.startYear || cycle.endYear < edition)
            throw new Error('Ese barrio no corresponde a esta edición.');
          const existing = assignTarget(
            data.zoneAssignments.filter((a) => a.userId === userId),
            cycle._id,
            edition,
          );
          setData((old) => ({
            ...old,
            zoneAssignments: existing
              ? old.zoneAssignments.map((a) =>
                  a._id === existing._id
                    ? { ...a, zoneId, status: 'confirmed' }
                    : a,
                )
              : [
                  ...old.zoneAssignments,
                  {
                    _id: crypto.randomUUID(),
                    userId,
                    cycleId: cycle._id,
                    zoneId,
                    fromEdition: edition,
                    status: 'confirmed',
                  },
                ],
          }));
        },
        person: async (registrationId) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          const row = data.registrations.find((r) => r._id === registrationId);
          if (!row) return null;
          const activity = findEvent(row.eventId);
          const inscriptions = othersFrom(data.registrations, row)
            .flatMap((r) => {
              const activity = findEvent(r.eventId);
              if (!activity) return [];
              return [
                {
                  _id: r._id,
                  _creationTime: r._creationTime,
                  event: eventSummary(activity),
                  status: r.status ?? ('accepted' as const),
                  match:
                    row.userId && r.userId === row.userId
                      ? ('account' as const)
                      : ('email' as const),
                },
              ];
            })
            .sort((a, b) => b.event.date.localeCompare(a.event.date));
          return {
            inscriptions,
            zone:
              row.userId && activity
                ? overview(row.userId, eventEdition(activity))
                : null,
          };
        },
        acceptRegistration: async (id) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          if (!data.registrations.some((r) => r._id === id))
            throw new Error('No encontramos la inscripción.');
          setData((old) => ({
            ...old,
            registrations: old.registrations.map((r) =>
              r._id === id && r.status === 'pending'
                ? { ...r, status: 'accepted' }
                : r,
            ),
          }));
        },
        downloadAttachment: async (registration, index) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          const attachment = registration.attachments?.[index];
          if (!attachment) throw new Error('No encontramos el documento.');
          downloadBlob(
            await readDemoDocument(registration._id, index),
            attachment.name,
          );
        },
        removeRegistration: async (id) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          if (data.registrations.find((r) => r._id === id)?.attachments?.length)
            await removeDemoDocuments(id);
          setData((old) => {
            const row = old.registrations.find((r) => r._id === id);
            if (!row) return old;
            return {
              ...old,
              registrations: old.registrations.filter((r) => r._id !== id),
              events: old.events.map((e) =>
                e._id === row.eventId
                  ? {
                      ...e,
                      registrationCount: Math.max(0, e.registrationCount - 1),
                    }
                  : e,
              ),
            };
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

function httpUrl(path: string) {
  const base =
    import.meta.env.VITE_CONVEX_SITE_URL ||
    import.meta.env.VITE_CONVEX_URL?.replace(
      /\.convex\.cloud\/?$/,
      '.convex.site',
    );
  if (!base) throw new Error('El servicio de documentos no está configurado.');
  return new URL(path, base);
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
