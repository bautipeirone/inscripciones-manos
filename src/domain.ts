import type { Attachment } from './attachments';
export type Question = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options: string[];
};
export type EventInput = {
  title: string;
  description: string;
  kind: 'monthly' | 'main';
  date: string;
  // Optional for compatibility with activities created before schedules existed.
  startAt?: number;
  endAt?: number;
  instructions?: string;
  location: string;
  deadline: number;
  visible: boolean;
  accepting: boolean;
  requireApproval?: boolean;
  capacity: number;
  questions: Question[];
};
export type Event = EventInput & { _id: string; registrationCount: number };
export type RegistrationInput = {
  eventId: string;
  name: string;
  email: string;
  phone: string;
  answers: Record<string, string>;
  consent: boolean;
  website: string;
};
export type Registration = RegistrationInput & {
  _id: string;
  _creationTime: number;
  status?: 'pending' | 'accepted';
  attachments?: Attachment[];
};
export type RegistrationResult = {
  received: boolean;
  approvalRequired: boolean;
};
export const registrationStatusLabels = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
};
export function status(event: Event, now = Date.now()) {
  if (!event.visible) return 'hidden';
  if (!event.accepting || event.deadline <= now) return 'closed';
  if (event.capacity > 0 && event.registrationCount >= event.capacity)
    return 'full';
  return 'open';
}
export const statusLabels = {
  hidden: 'Oculto',
  closed: 'Inscripción cerrada',
  full: 'Cupos completos',
  open: 'Inscripción abierta',
};
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function validateEvent(event: EventInput, requireSchedule = false) {
  if (!event.title.trim() || event.title.length > 120)
    throw new Error('Escribí un título de hasta 120 caracteres.');
  if (!event.description.trim() || event.description.length > 3000)
    throw new Error('Escribí una descripción de hasta 3000 caracteres.');
  if (!event.location.trim() || event.location.length > 200)
    throw new Error('Indicá el lugar del encuentro.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
    !Number.isFinite(Date.parse(event.date)) ||
    new Date(event.date).toISOString().slice(0, 10) !== event.date
  )
    throw new Error('La fecha no es válida.');
  const month = Number(event.date.slice(5, 7));
  if (
    (event.kind === 'main' && month !== 1) ||
    (event.kind === 'monthly' && (month < 8 || month > 12))
  )
    throw new Error(
      'Las jornadas mensuales son de agosto a diciembre y el encuentro principal es en enero.',
    );
  if (
    !Number.isFinite(event.deadline) ||
    event.deadline > Date.parse(event.date + 'T23:59:59-03:00')
  )
    throw new Error('El cierre debe ser anterior al final del evento.');
  if (
    requireSchedule &&
    (event.startAt === undefined || event.endAt === undefined)
  )
    throw new Error('Completá la fecha y hora de inicio y de finalización.');
  if (event.startAt !== undefined || event.endAt !== undefined) {
    if (
      event.startAt === undefined ||
      event.endAt === undefined ||
      !Number.isFinite(event.startAt) ||
      !Number.isFinite(event.endAt) ||
      event.endAt <= event.startAt
    )
      throw new Error(
        'La fecha y hora de finalización debe ser posterior al inicio.',
      );
    const startDate = new Date(event.startAt - 3 * 60 * 60 * 1000);
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(new Date(event.endAt).getTime()) ||
      startDate.toISOString().slice(0, 10) !== event.date
    )
      throw new Error(
        'La fecha de la actividad debe coincidir con el inicio en hora de Argentina.',
      );
    if (event.deadline > event.startAt)
      throw new Error(
        'El cierre de inscripciones debe ser anterior o igual al inicio de la actividad.',
      );
    if (!event.instructions?.trim())
      throw new Error('Agregá las indicaciones para los participantes.');
  }
  if (event.instructions !== undefined && event.instructions.length > 5000)
    throw new Error('Las indicaciones no pueden superar los 5000 caracteres.');
  if (
    !Number.isInteger(event.capacity) ||
    event.capacity < 0 ||
    event.capacity > 10000
  )
    throw new Error('El cupo debe estar entre 0 y 10000.');
  if (
    event.questions.length > 20 ||
    new Set(event.questions.map((q) => q.id)).size !== event.questions.length
  )
    throw new Error('Revisá las preguntas del formulario.');
  for (const q of event.questions) {
    if (
      !/^[a-zA-Z0-9_-]{1,60}$/.test(q.id) ||
      !q.label.trim() ||
      q.label.length > 200
    )
      throw new Error(
        'Cada pregunta necesita un título de hasta 200 caracteres.',
      );
    if (
      q.type === 'select' &&
      (q.options.length < 2 ||
        q.options.length > 30 ||
        q.options.some((o) => !o.trim() || o.length > 200) ||
        new Set(q.options).size !== q.options.length)
    )
      throw new Error('Agregá entre 2 y 30 opciones distintas por pregunta.');
  }
}
export function validateRegistration(
  event: Event,
  input: RegistrationInput,
  now = Date.now(),
) {
  if (status(event, now) !== 'open')
    throw new Error('La inscripción para esta jornada no está disponible.');
  if (input.website) throw new Error('No pudimos procesar la inscripción.');
  if (input.name.trim().length < 2 || input.name.length > 120)
    throw new Error('Ingresá tu nombre completo.');
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(input.email)) ||
    input.email.length > 254
  )
    throw new Error('Ingresá un email válido.');
  if (input.phone.length > 40) throw new Error('Revisá el número de teléfono.');
  if (!input.consent)
    throw new Error('Necesitamos tu autorización para guardar la inscripción.');
  if (
    Object.keys(input.answers).some(
      (id) => !event.questions.some((q) => q.id === id),
    )
  )
    throw new Error('El formulario cambió. Volvé a abrirlo.');
  for (const q of event.questions) {
    const answer = (input.answers[q.id] ?? '').trim();
    if (q.required && !answer) throw new Error(`Completá: ${q.label}`);
    if (
      answer.length > 2000 ||
      (answer && q.type === 'select' && !q.options.includes(answer))
    )
      throw new Error(`Revisá: ${q.label}`);
  }
}
export function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(date + 'T12:00:00-03:00'));
}
export function formatDeadline(date: number) {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}
export function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function formatSchedule(event: EventInput) {
  if (event.startAt === undefined || event.endAt === undefined)
    return `${formatDate(event.date)} · Horario a confirmar`;
  const time = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const dateInArgentina = (value: number) =>
    new Date(value - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = dateInArgentina(event.endAt);
  if (event.date === endDate)
    return `${formatDate(event.date)}, de ${time.format(event.startAt)} a ${time.format(event.endAt)} hs`;
  return `${formatDate(event.date)}, ${time.format(event.startAt)} hs – ${formatDate(endDate)}, ${time.format(event.endAt)} hs`;
}
