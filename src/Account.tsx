import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, MapPin } from 'lucide-react';
import { ConvexError } from 'convex/values';
import { useData } from './data';
import {
  activityEnd,
  activityKind,
  activityUrl,
  formatSchedule,
  validatePassword,
  validateProfile,
  type HistoryEntry,
} from './domain';
import { errorMessage } from './ui';

// Only activity pages are valid destinations after signing in.
export const safeNext = (next: string | null) =>
  next && /^\/activities\/[^/?#]+$/.test(next) ? next : null;
export const signInUrl = (next: string) =>
  `/account?next=${encodeURIComponent(next)}`;

export function AccountPage({
  next,
  now,
  onSignedIn,
}: {
  next: string | null;
  now: number;
  onSignedIn: (path: string) => void;
}) {
  const data = useData();
  if (data.loading)
    return (
      <main className="container page-section" role="status">
        Cargando tu cuenta…
      </main>
    );
  return data.account ? (
    <AccountHome now={now} />
  ) : (
    <AccountAccess next={next} onSignedIn={onSignedIn} />
  );
}

function AccountAccess({
  next,
  onSignedIn,
}: {
  next: string | null;
  onSignedIn: (path: string) => void;
}) {
  const data = useData();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signUp = mode === 'signUp';
  return (
    <main className="login-page">
      <div className="login-card">
        <h1>{signUp ? 'Crear una cuenta' : 'Ingresar a tu cuenta'}</h1>
        <p>
          Guardá tus datos para completar las inscripciones más rápido y
          consultá las actividades a las que te anotaste.
        </p>
        <div
          className="filter-tabs account-tabs"
          role="group"
          aria-label="Elegí cómo continuar"
        >
          {(
            [
              ['signIn', 'Ya tengo cuenta'],
              ['signUp', 'Crear cuenta'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              className={mode === id ? 'active' : ''}
              onClick={() => {
                setMode(id);
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {data.demo && (
          <p className="notice">
            Demostración: las cuentas se guardan solo en este navegador y la
            contraseña no se verifica. Usá datos ficticios.
          </p>
        )}
        <form
          key={mode}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setError('');
            const form = new FormData(e.currentTarget);
            const name = String(form.get('name') ?? '');
            const email = String(form.get('email') ?? '');
            const password = String(form.get('password') ?? '');
            if (signUp) {
              try {
                validateProfile({ name, email, phone: '' });
                validatePassword(password);
              } catch (err) {
                setError((err as Error).message);
                return;
              }
            }
            setBusy(true);
            try {
              if (signUp)
                await data.participantSignUp({ name, email, password });
              else await data.participantSignIn(email, password);
              if (next) onSignedIn(next);
            } catch (err) {
              // Auth errors are deliberately vague; show validation details only.
              setError(
                err instanceof ConvexError && typeof err.data === 'string'
                  ? err.data
                  : signUp
                    ? 'No pudimos crear la cuenta. Si ya tenés una cuenta con ese email, ingresá con tu contraseña.'
                    : 'No pudimos iniciar sesión. Revisá el email, la contraseña y tu conexión.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {signUp && (
            <label>
              Nombre y apellido
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete={signUp ? 'email' : 'username'}
              required
              maxLength={254}
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete={signUp ? 'new-password' : 'current-password'}
              required
              minLength={signUp ? 8 : undefined}
              maxLength={128}
            />
            {signUp && <small>Al menos 8 caracteres.</small>}
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button full-width" disabled={busy}>
            {busy
              ? signUp
                ? 'Creando tu cuenta…'
                : 'Ingresando…'
              : signUp
                ? 'Crear mi cuenta'
                : 'Ingresar'}
            <ArrowRight size={18} />
          </button>
        </form>
        <small>
          La cuenta es opcional: también podés inscribirte sin crearla.
          <br />
          No hay recuperación automática de contraseñas. Si olvidaste la tuya,
          podés seguir inscribiéndote sin cuenta.
        </small>
      </div>
    </main>
  );
}

function AccountHome({ now }: { now: number }) {
  const data = useData();
  const account = data.account!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const history = data.history;
  const start = (entry: HistoryEntry) =>
    entry.event.startAt ?? Date.parse(entry.event.date);
  const upcoming = (history ?? [])
    .filter((entry) => activityEnd(entry.event) >= now)
    .sort((a, b) => start(a) - start(b));
  const past = (history ?? [])
    .filter((entry) => activityEnd(entry.event) < now)
    .sort((a, b) => start(b) - start(a));
  return (
    <main className="container page-section">
      <h1>Mi cuenta</h1>
      <p className="page-description">
        Ingresaste con <strong>{account.accountEmail}</strong>.
      </p>
      <div className="activity-detail-grid account-grid">
        <section className="panel" aria-labelledby="history-heading">
          <h2 id="history-heading">Mis inscripciones</h2>
          {history === undefined ? (
            <p role="status">Cargando inscripciones…</p>
          ) : history.length === 0 ? (
            <div className="empty-state">
              <p>Todavía no te inscribiste a actividades con esta cuenta.</p>
              <p>
                <a className="text-link" href="/">
                  Ver las próximas actividades
                </a>
              </p>
            </div>
          ) : (
            <>
              <HistoryList title="Próximas" entries={upcoming} />
              <HistoryList title="Anteriores" entries={past} />
            </>
          )}
        </section>
        <section className="panel" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Mis datos</h2>
          <p className="muted small profile-help">
            Completamos los formularios de inscripción con estos datos. Podés
            revisarlos y cambiarlos antes de cada envío.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              setSaved(false);
              const form = new FormData(e.currentTarget);
              try {
                await data.saveProfile({
                  name: String(form.get('name')),
                  email: String(form.get('email')),
                  phone: String(form.get('phone')),
                });
                setSaved(true);
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nombre y apellido *
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={account.name}
              />
            </label>
            <label>
              Email de contacto *
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                defaultValue={account.email}
              />
            </label>
            <label>
              Teléfono <span className="optional">(opcional)</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                defaultValue={account.phone}
                placeholder="Código de área + número"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button full-width" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar mis datos'}
            </button>
            <p className="saved-note" role="status">
              {saved && (
                <>
                  <Check size={16} /> Datos guardados.
                </>
              )}
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

function HistoryList({
  title,
  entries,
}: {
  title: string;
  entries: HistoryEntry[];
}) {
  if (!entries.length) return null;
  return (
    <div className="history-group">
      <h3>{title}</h3>
      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry._id} className="history-item">
            <div className="history-meta">
              <span className="history-kind">{activityKind(entry.event)}</span>
              <span
                className={`status ${entry.status === 'accepted' ? 'status-open' : 'status-closed'}`}
              >
                {entry.status === 'accepted'
                  ? 'Aceptada'
                  : 'Pendiente de aprobación'}
              </span>
            </div>
            <h4>
              {entry.event.visible ? (
                <a href={activityUrl(entry.event)}>{entry.event.title}</a>
              ) : (
                entry.event.title
              )}
            </h4>
            <p>
              <CalendarDays size={15} aria-hidden="true" />
              {formatSchedule(entry.event)}
            </p>
            <p>
              <MapPin size={15} aria-hidden="true" />
              {entry.event.location}
            </p>
            <details>
              <summary>
                Datos enviados el{' '}
                {new Date(entry._creationTime).toLocaleDateString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                })}
              </summary>
              <dl>
                <dt>Nombre</dt>
                <dd>{entry.name}</dd>
                <dt>Email</dt>
                <dd>{entry.email}</dd>
                <dt>Teléfono</dt>
                <dd>{entry.phone || 'No informado'}</dd>
                {entry.answers.map((answer, index) => (
                  <div key={index}>
                    <dt>{answer.label}</dt>
                    <dd>{answer.value}</dd>
                  </div>
                ))}
                {entry.attachments.length > 0 && (
                  <>
                    <dt>Documentos adjuntos</dt>
                    <dd>
                      {entry.attachments.map((file) => file.name).join(', ')}
                    </dd>
                  </>
                )}
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
