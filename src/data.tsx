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
  normalizeEmail,
  validateEvent,
  validateRegistration,
  type Event,
  type EventInput,
  type Registration,
  type RegistrationInput,
  type RegistrationResult,
} from './domain';

type Data = {
  demo: boolean;
  loading: boolean;
  events: Event[];
  admin: { name: string; email: string } | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveEvent: (event: EventInput, id?: string) => Promise<void>;
  availability: (
    event: Event,
    visible: boolean,
    accepting: boolean,
  ) => Promise<void>;
  register: (
    input: RegistrationInput,
    files?: File[],
  ) => Promise<RegistrationResult>;
  downloadAttachment: (
    registration: Registration,
    index: number,
  ) => Promise<void>;
  registrations: (eventId: string) => Promise<Registration[]>;
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
  const publicEvents = useQuery(api.events.listPublic);
  const adminEvents = useQuery(api.events.listAdmin, viewer ? {} : 'skip');
  const inventories = useQuery(api.inventories.listAdmin, viewer ? {} : 'skip');
  const auth = useAuthActions();
  const token = useAuthToken();
  const save = useMutation(api.events.save);
  const update = useMutation(api.events.setAvailability);
  const submit = useMutation(api.registrations.submit);
  const remove = useMutation(api.registrations.remove);
  const accept = useMutation(api.registrations.accept);
  const saveInventory = useMutation(api.inventories.save);
  const removeInventory = useMutation(api.inventories.remove);
  const convex = useConvex();
  return (
    <Context.Provider
      value={{
        demo: false,
        loading:
          isLoading ||
          publicEvents === undefined ||
          (isAuthenticated && viewer === undefined),
        events: adminEvents ?? publicEvents ?? [],
        admin: viewer ?? null,
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
        signIn: async (email, password) => {
          await auth.signIn('password', { email, password, flow: 'signIn' });
        },
        signOut: auth.signOut,
        saveEvent: async (event, id) => {
          await save({ event, ...(id ? { id: id as Id<'events'> } : {}) });
        },
        availability: async (event, visible, accepting) => {
          await update({ id: event._id as Id<'events'>, visible, accepting });
        },
        register: async (input, files = []) => {
          if (files.length) {
            const form = new FormData();
            form.set('registration', JSON.stringify(input));
            for (const file of files) form.append('attachments', file);
            let response: Response;
            try {
              response = await fetch(httpUrl('/inscriptions'), {
                method: 'POST',
                body: form,
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
const STORAGE = 'manos-demo-v1';
type DemoState = {
  events: Event[];
  registrations: Registration[];
  inventories: Inventory[];
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
        };
    }
  } catch {
    /* Storage can be unavailable in private browsers. */
  }
  return { events: seedEvents(), registrations: [], inventories: [] };
}
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
  return (
    <Context.Provider
      value={{
        demo: true,
        loading: false,
        admin,
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
        signOut: async () => {
          setAdmin(null);
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
        register: async (input, files = []) => {
          const event = data.events.find((e) => e._id === input.eventId);
          if (!event) throw new Error('No encontramos el evento.');
          validateRegistration(event, input);
          const email = normalizeEmail(input.email);
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
          if (
            data.registrations.some(
              (r) => r.eventId === input.eventId && r.email === email,
            )
          )
            return result;
          const id = crypto.randomUUID();
          if (files.length) await saveDemoDocuments(id, files);
          setData((old) => {
            if (
              old.registrations.some(
                (r) => r.eventId === input.eventId && r.email === email,
              )
            )
              return old;
            return {
              ...old,
              events: old.events.map((e) =>
                e._id === input.eventId
                  ? { ...e, registrationCount: e.registrationCount + 1 }
                  : e,
              ),
              registrations: [
                ...old.registrations,
                {
                  ...input,
                  email,
                  name: input.name.trim(),
                  _id: id,
                  attachments,
                  _creationTime: Date.now(),
                  status: event.requireApproval ? 'pending' : 'accepted',
                },
              ],
            };
          });
          return {
            received: true,
            approvalRequired: event.requireApproval === true,
          };
        },
        registrations: async (eventId) => {
          if (!admin) throw new Error('Acceso no autorizado.');
          return data.registrations
            .filter((r) => r.eventId === eventId)
            .reverse();
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
