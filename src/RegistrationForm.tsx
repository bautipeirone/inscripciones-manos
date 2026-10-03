import { useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Check, Heart } from 'lucide-react';
import { useData } from './data';
import { formatSchedule, formatDeadline, status, type Event } from './domain';
import { Modal, errorMessage } from './ui';

export function RegistrationForm({
  event,
  onClose,
}: {
  event: Event;
  onClose: () => void;
}) {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title={
        done ? '¡Gracias por sumar tus manos!' : 'Inscripción a la actividad'
      }
      onClose={onClose}
    >
      {done ? (
        <div className="success-state">
          <span className="success-icon">
            <Check />
          </span>
          <h3>Tu inscripción fue recibida.</h3>
          <p>
            Si ya te habías anotado con este email, conservamos tu inscripción
            original.
          </p>
          <div className="registration-summary">
            <strong>{event.title}</strong>
            <span>
              <CalendarDays size={16} />
              {formatSchedule(event)}
            </span>
            <span>
              <MapPin size={16} />
              {event.location}
            </span>
          </div>
          <p className="muted">
            Guardá estos datos. El equipo podrá contactarte con más información.
          </p>
          {data.demo && (
            <p className="notice">
              Modo de prueba: esto no es una inscripción real.
            </p>
          )}
          <button className="button full-width" onClick={onClose}>
            Listo, nos vemos ahí <Heart size={18} />
          </button>
        </div>
      ) : (
        <form
          className="registration-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            const form = new FormData(e.currentTarget);
            try {
              await data.register({
                eventId: event._id,
                name: String(form.get('name')),
                email: String(form.get('email')),
                phone: String(form.get('phone')),
                answers: Object.fromEntries(
                  event.questions.map((q) => [
                    q.id,
                    String(form.get(`answer-${q.id}`) ?? ''),
                  ]),
                ),
                consent: form.get('consent') === 'on',
                website: String(form.get('website') ?? ''),
              });
              setDone(true);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="registration-summary">
            <strong>{event.title}</strong>
            <span>
              {formatSchedule(event)} · {event.location}
            </span>
            <small>
              Cierra el {formatDeadline(event.deadline)} (Argentina)
            </small>
          </div>
          {data.demo && (
            <p className="notice">
              Vista de prueba. Usá datos ficticios; no se envían al equipo.
            </p>
          )}
          <p className="muted small">
            Los campos con * son obligatorios. No necesitás crear una cuenta.
          </p>
          <label>
            Nombre y apellido *
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="Como te gusta que te llamen"
            />
          </label>
          <label>
            Email *
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="vos@ejemplo.com"
            />
            <small>
              Usá el mismo email para evitar inscripciones repetidas.
            </small>
          </label>
          <label>
            Teléfono <span className="optional">(opcional)</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              placeholder="Código de área + número"
            />
          </label>
          {event.questions.map((q) => (
            <label key={q.id}>
              {q.label}
              {q.required ? ' *' : ' (opcional)'}
              {q.type === 'textarea' ? (
                <textarea
                  name={`answer-${q.id}`}
                  required={q.required}
                  maxLength={2000}
                  rows={3}
                />
              ) : q.type === 'select' ? (
                <select
                  name={`answer-${q.id}`}
                  required={q.required}
                  defaultValue=""
                >
                  <option value="">Elegí una opción</option>
                  {q.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  name={`answer-${q.id}`}
                  required={q.required}
                  maxLength={2000}
                />
              )}
            </label>
          ))}
          <div className="honeypot" aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" name="consent" required />
            <span>
              Autorizo al Equipo de Inscripciones del Proyecto Manos a la Obra a
              guardar mis datos para organizar esta actividad y contactarme
              sobre mi participación. *
            </span>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="button full-width"
            disabled={busy || status(event) !== 'open'}
          >
            {busy ? 'Guardando inscripción…' : 'Confirmar mi inscripción'}
            <ArrowRight size={18} />
          </button>
        </form>
      )}
    </Modal>
  );
}
