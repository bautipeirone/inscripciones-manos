import { formatSchedule, type EventInput } from '../src/domain';

type Participant = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  answers: Record<string, string>;
  status?: 'pending' | 'accepted';
  attachments?: { name: string }[];
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

export function confirmationTemplate(
  event: EventInput,
  participant: Participant,
) {
  const pending = participant.status === 'pending';
  const heading = pending ? 'Inscripción recibida' : 'Inscripción confirmada';
  const message = pending
    ? 'Recibimos tu solicitud. Tu inscripción está pendiente de aprobación por el equipo de Manos a la Obra. Este correo confirma la recepción de la solicitud; tu participación todavía no está confirmada.'
    : 'Tu inscripción fue registrada y aceptada. ¡Te esperamos!';
  const details: [string, string][] = [
    ['Actividad', event.title],
    ['Fecha y horario (Argentina, UTC−3)', formatSchedule(event)],
    ['Lugar', event.location],
    ['Estado al inscribirte', pending ? 'Pendiente de aprobación' : 'Aceptada'],
    ['Número de inscripción', participant._id],
    ['Nombre', participant.name],
    ['Email', participant.email],
    ['Teléfono', participant.phone || 'No informado'],
    ...event.questions.map((question): [string, string] => [
      question.label,
      participant.answers[question.id] || 'Sin respuesta',
    ]),
  ];
  if (event.instructions?.trim())
    details.push(['Indicaciones para participantes', event.instructions]);
  if (participant.attachments?.length)
    details.push([
      'Documentos recibidos',
      participant.attachments.map((file) => file.name).join(', '),
    ]);
  const footer = 'Proyecto Manos a la Obra';
  return {
    subject: `${heading} · ${event.title.replace(/[\r\n]/g, ' ')}`,
    text: [
      `Hola, ${participant.name}.`,
      message,
      ...details.map(([label, value]) => `${label}: ${value}`),
      footer,
    ].join('\n\n'),
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f5ef;color:#272723;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:28px;background:#ffffff;border-top:6px solid #f4c542"><h1 style="font-size:24px">${heading}</h1><p>Hola, ${escapeHtml(participant.name)}.</p><p>${message}</p><dl>${details.map(([label, value]) => `<dt style="font-weight:bold;margin-top:16px">${escapeHtml(label)}</dt><dd style="margin:4px 0 0;white-space:pre-wrap">${escapeHtml(value)}</dd>`).join('')}</dl><p style="margin-top:28px;color:#666">${footer}</p></main></body></html>`,
  };
}
