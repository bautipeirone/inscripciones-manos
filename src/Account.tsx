import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, MapPin, Trash2 } from 'lucide-react';
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
import { FIRST_EDITION, type ZoneOverview } from './zones';

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
              // New accounts start by completing their details. The hash is
              // set first: the account page may render before sign-up returns.
              if (signUp && !next)
                window.history.replaceState(null, '', '#datos');
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

type Tab = 'inscripciones' | 'datos';
const tabs: [Tab, string][] = [
  ['inscripciones', 'Mis inscripciones'],
  ['datos', 'Mis datos'],
];
// The hash lets other pages link straight to a tab.
const tabFromHash = (): Tab =>
  window.location.hash === '#datos' ? 'datos' : 'inscripciones';

function AccountHome({ now }: { now: number }) {
  const data = useData();
  const [tab, setTab] = useState(tabFromHash);
  const select = (next: Tab, focus = false) => {
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
    if (focus) document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <main className="container page-section">
      <h1>Mi cuenta</h1>
      <p className="page-description">
        Ingresaste con <strong>{data.account!.accountEmail}</strong>.
      </p>
      <div
        className="tab-list"
        role="tablist"
        aria-label="Secciones de tu cuenta"
      >
        {tabs.map(([id, label], index) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => select(id)}
            onKeyDown={(e) => {
              const moves: Record<string, number> = {
                ArrowRight: index + 1,
                ArrowLeft: index - 1,
                Home: 0,
                End: tabs.length - 1,
              };
              if (!(e.key in moves)) return;
              e.preventDefault();
              const next = (moves[e.key] + tabs.length) % tabs.length;
              select(tabs[next][0], true);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="tab-panel"
      >
        {tab === 'inscripciones' ? (
          <InscriptionsTab now={now} />
        ) : (
          <>
            <ProfileForm />
            <ZonePanel />
          </>
        )}
      </div>
    </main>
  );
}

function InscriptionsTab({ now }: { now: number }) {
  const { history } = useData();
  const start = (entry: HistoryEntry) =>
    entry.event.startAt ?? Date.parse(entry.event.date);
  const upcoming = (history ?? [])
    .filter((entry) => activityEnd(entry.event) >= now)
    .sort((a, b) => start(a) - start(b));
  const past = (history ?? [])
    .filter((entry) => activityEnd(entry.event) < now)
    .sort((a, b) => start(b) - start(a));
  if (history === undefined)
    return <p role="status">Cargando inscripciones…</p>;
  if (history.length === 0)
    return (
      <div className="empty-state">
        <p>Todavía no te inscribiste a actividades con esta cuenta.</p>
        <p>
          <a className="text-link" href="/">
            Ver las próximas actividades
          </a>
        </p>
      </div>
    );
  return (
    <section className="panel" aria-label="Mis inscripciones">
      <HistoryList title="Próximas" entries={upcoming} />
      <HistoryList title="Anteriores" entries={past} />
    </section>
  );
}

const relationships = [
  'Madre',
  'Padre',
  'Hermana',
  'Hermano',
  'Pareja',
  'Amiga',
  'Amigo',
  'Tutor o tutora',
];
function ProfileForm() {
  const data = useData();
  const account = data.account!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasCareer, setHasCareer] = useState(!!account.career);
  const contact = account.emergencyContact;
  return (
    <section className="panel" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Datos personales</h2>
      <p className="profile-help">
        Completamos los formularios de inscripción con tu nombre, email y
        teléfono. Solo vos y el Equipo de Inscripciones pueden ver estos datos.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          setSaved(false);
          const form = new FormData(e.currentTarget);
          const text = (name: string) => String(form.get(name) ?? '');
          try {
            await data.saveProfile({
              name: text('name'),
              email: text('email'),
              phone: text('phone'),
              career: text('career'),
              graduated: form.get('graduated') === 'on',
              emergencyContact: {
                name: text('emergencyName'),
                relationship: text('emergencyRelationship'),
                phone: text('emergencyPhone'),
              },
            });
            setSaved(true);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="form-group">
          <legend>Contacto</legend>
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
          <div className="form-row">
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
          </div>
        </fieldset>
        <fieldset className="form-group">
          <legend>Estudios</legend>
          <label>
            Carrera <span className="optional">(opcional)</span>
            <input
              name="career"
              maxLength={120}
              defaultValue={account.career}
              placeholder="Ej. Arquitectura"
              onChange={(e) => setHasCareer(!!e.target.value.trim())}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="graduated"
              defaultChecked={account.graduated}
              disabled={!hasCareer}
            />
            <span>
              Ya me recibí. Dejalo sin marcar si todavía estás estudiando.
            </span>
          </label>
        </fieldset>
        <fieldset className="form-group">
          <legend>
            Contacto de emergencia <span className="optional">(opcional)</span>
          </legend>
          <p className="muted small">
            Si lo completás, indicá nombre, vínculo y teléfono. El equipo lo usa
            solo ante una emergencia durante las actividades.
          </p>
          <label>
            Nombre del contacto
            <input
              name="emergencyName"
              autoComplete="off"
              maxLength={120}
              defaultValue={contact?.name}
            />
          </label>
          <div className="form-row">
            <label>
              Vínculo
              <input
                name="emergencyRelationship"
                list="relationships"
                autoComplete="off"
                maxLength={60}
                defaultValue={contact?.relationship}
                placeholder="Ej. madre, hermano, pareja"
              />
            </label>
            <label>
              Teléfono del contacto
              <input
                name="emergencyPhone"
                type="tel"
                autoComplete="off"
                maxLength={40}
                defaultValue={contact?.phone}
              />
            </label>
          </div>
          <datalist id="relationships">
            {relationships.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
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
  );
}

function ZonePanel() {
  const { zone } = useData();
  return (
    <section className="panel" aria-labelledby="zone-heading">
      <h2 id="zone-heading">Barrio</h2>
      <p className="profile-help">
        Cada ciclo de ediciones trabaja en un grupo de barrios. Si ya fuiste a
        uno en este ciclo, seguís en el mismo hasta que cambien los barrios. El
        equipo organiza los grupos según las necesidades de cada barrio.
      </p>
      {zone === undefined ? (
        <p role="status">Cargando…</p>
      ) : zone ? (
        <>
          <CurrentZone overview={zone} />
          <ZoneHistory overview={zone} />
        </>
      ) : null}
    </section>
  );
}

function CurrentZone({ overview }: { overview: ZoneOverview }) {
  const data = useData();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { cycle, zones, placement, edition } = overview;
  if (!cycle || !zones.length)
    return (
      <p className="notice">
        Los barrios de la edición {edition} todavía no están cargados. El equipo
        los publicará antes de las actividades.
      </p>
    );
  const heading = (
    <p className="zone-cycle">
      Edición {edition} · Ciclo {cycle.label}
    </p>
  );
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const failure = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );
  if (placement?.status === 'confirmed')
    return (
      <div className="zone-card">
        {heading}
        <p>
          Tu barrio: <strong>{placement.zoneName}</strong>{' '}
          <span className="status status-open">Confirmado</span>
        </p>
        <p className="muted small">
          Seguís en este barrio durante el ciclo. Si necesitás cambiarlo, hablá
          con el Equipo de Inscripciones.
        </p>
      </div>
    );
  if (placement && !editing)
    return (
      <div className="zone-card">
        {heading}
        <p>
          Elegiste <strong>{placement.zoneName}</strong>{' '}
          <span className="status status-closed">
            Pendiente de confirmación
          </span>
        </p>
        <p className="muted small">
          El equipo confirmará tu barrio o te propondrá otro según las
          necesidades de cada barrio.
        </p>
        {failure}
        <div className="zone-actions">
          <button
            type="button"
            className="button button-outline button-small"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Cambiar mi elección
          </button>
          <button
            type="button"
            className="button button-ghost button-small"
            disabled={busy}
            onClick={() => void run(data.withdrawZoneRequest)}
          >
            Prefiero que me asigne el equipo
          </button>
        </div>
      </div>
    );
  // A barrio from an earlier edition of this cycle is the natural choice.
  const names = new Map(zones.map((z) => [z.name.toLocaleLowerCase(), z]));
  const previous = overview.history.find(
    (h) =>
      h.zone &&
      cycle.startYear <= h.edition &&
      names.has(h.zone.toLocaleLowerCase()),
  );
  const suggested =
    placement?.zoneId ??
    (previous && names.get(previous.zone!.toLocaleLowerCase())!._id);
  return (
    <form
      // Remounts so a newly reported edition can preselect its barrio.
      key={suggested ?? 'none'}
      className="zone-card"
      onSubmit={(e) => {
        e.preventDefault();
        const zoneId = String(new FormData(e.currentTarget).get('zone') ?? '');
        if (zoneId) void run(() => data.requestZone(zoneId));
      }}
    >
      {heading}
      <fieldset className="zone-options">
        <legend>
          Elegí el barrio al que te gustaría ir. Si no elegís, el equipo te
          asigna uno.
        </legend>
        {previous && !placement && (
          <p className="muted small">
            En {previous.edition} fuiste a {previous.zone}: elegilo para seguir
            en el mismo barrio.
          </p>
        )}
        {zones.map((z) => (
          <label key={z._id} className="checkbox-label">
            <input
              type="radio"
              name="zone"
              value={z._id}
              required
              defaultChecked={z._id === suggested}
            />
            <span>{z.name}</span>
          </label>
        ))}
      </fieldset>
      {failure}
      <div className="zone-actions">
        <button className="button button-small" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar mi elección'}
        </button>
        {editing && (
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function ZoneHistory({ overview }: { overview: ZoneOverview }) {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const taken = new Set(overview.history.map((h) => h.edition));
  const years = Array.from(
    { length: overview.edition - FIRST_EDITION },
    (_, i) => overview.edition - 1 - i,
  ).filter((year) => !taken.has(year));
  return (
    <div className="zone-history">
      <h3>Mis barrios por edición</h3>
      {overview.history.length === 0 ? (
        <p className="muted small">
          Todavía no hay ediciones registradas. Se suman al inscribirte con tu
          cuenta, y podés agregar las ediciones anteriores en las que
          participaste.
        </p>
      ) : (
        <ul>
          {overview.history.map((entry) => (
            <li key={`${entry.source}-${entry.edition}`}>
              <strong>{entry.edition}</strong>
              <span>{entry.zone ?? 'Sin barrio asignado'}</span>
              <small>
                {entry.source === 'declared'
                  ? 'Informada por vos'
                  : entry.status === 'requested'
                    ? 'Pendiente de confirmación'
                    : entry.status === 'confirmed'
                      ? 'Confirmado por el equipo'
                      : 'Inscripción con tu cuenta'}
              </small>
              {entry.pastEditionId && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Quitar la edición ${entry.edition}`}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await data.removePastEdition(entry.pastEditionId!);
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="add-past-edition">
        <summary>Agregar una edición anterior</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = e.currentTarget;
            const values = new FormData(form);
            setBusy(true);
            setError('');
            try {
              await data.addPastEdition({
                edition: Number(values.get('edition')),
                zone: String(values.get('zone') ?? ''),
              });
              form.reset();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="muted small">
            Para ediciones anteriores a esta plataforma. El equipo verá que la
            informaste vos.
          </p>
          <div className="form-row">
            <label>
              Edición
              <select name="edition" required>
                {years.map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </select>
            </label>
            <label>
              Barrio
              <input name="zone" required maxLength={120} />
            </label>
          </div>
          <button
            className="button button-outline button-small"
            disabled={busy}
          >
            Agregar edición
          </button>
        </form>
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
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
