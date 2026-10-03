import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useData } from './data';
import {
  formatSchedule,
  formatDeadline,
  status,
  statusLabels,
  type Event,
} from './domain';
import { Status } from './ui';
import { SiteHeader, SiteFooter } from './Layout';
import { RegistrationForm } from './RegistrationForm';
import { Admin } from './Admin';

const activityUrl = (event: Event) =>
  `/activities/${encodeURIComponent(event._id)}`;
const activityKind = (event: Event) =>
  event.kind === 'main'
    ? `Manos a la Obra ${event.date.slice(0, 4)}`
    : 'Visita diagnóstica';

export default function App() {
  const data = useData();
  const [path, setPath] = useState(window.location.pathname);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const pop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', pop);
    return () => {
      clearInterval(timer);
      window.removeEventListener('popstate', pop);
    };
  }, []);
  const navigate = (newPath: string) => {
    history.pushState({}, '', newPath);
    setPath(newPath);
    window.scrollTo(0, 0);
  };
  const route = path.replace(/\/$/, '') || '/';
  if (route === '/admin') return <Admin onHome={() => navigate('/')} />;
  const events = data.events
    .filter((e) => e.visible)
    .sort((a, b) => a.date.localeCompare(b.date));
  const match = route.match(/^\/activities\/([^/]+)$/);
  const event = match
    ? events.find((e) => encodeURIComponent(e._id) === match[1])
    : undefined;
  return (
    <div className="site-shell">
      {data.demo && (
        <div className="demo-bar">
          <span>
            Vista de prueba · Datos de ejemplo guardados solo en este navegador
          </span>
          <button onClick={() => navigate('/admin')}>
            Probar administración <ArrowRight size={13} />
          </button>
        </div>
      )}
      <SiteHeader />
      {route === '/' ? (
        <Home events={events} loading={data.loading} now={now} />
      ) : match && data.loading ? (
        <main className="container page-section" role="status">
          Cargando actividad…
        </main>
      ) : event ? (
        <ActivityDetail key={event._id} event={event} now={now} />
      ) : (
        <main className="container page-section">
          <a className="back-link" href="/">
            <ArrowLeft size={16} />
            Volver a inicio
          </a>
          <h1>Actividad no disponible</h1>
          <p className="page-description">
            El enlace no está disponible o la actividad ya no está publicada.
            Podés consultar las actividades desde el inicio.
          </p>
        </main>
      )}
      <SiteFooter />
    </div>
  );
}

// Uses the original home-page content and stacked activity-card layout.
function Home({
  events,
  loading,
  now,
}: {
  events: Event[];
  loading: boolean;
  now: number;
}) {
  const [filter, setFilter] = useState('all');
  const shown = events.filter(
    (e) =>
      filter === 'all' ||
      (filter === 'open' ? status(e, now) === 'open' : e.kind === filter),
  );
  return (
    <main className="container page-section">
      <h1>Plataforma de Inscripciones</h1>
      <p className="intro">
        Bienvenido a la plataforma de inscripciones del{' '}
        <strong>Proyecto Manos a la Obra</strong> de la Pastoral Universitaria
        de Rosario. Desde acá podés inscribirte a las próximas visitas
        diagnósticas y al Manos a la Obra.
      </p>
      <section
        className="activities-section"
        aria-labelledby="activities-heading"
      >
        <h2 id="activities-heading">Próximas actividades</h2>
        {events.length > 0 && (
          <div className="events-toolbar">
            <div
              className="filter-tabs"
              role="group"
              aria-label="Filtrar actividades"
            >
              {[
                ['all', 'Todas'],
                ['monthly', 'Visitas diagnósticas'],
                ['main', 'Manos a la Obra'],
                ['open', 'Inscripción abierta'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  className={filter === id ? 'active' : ''}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <div className="empty-state" role="status">
            Cargando actividades…
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <p>
              {events.length
                ? 'No hay actividades que coincidan con este filtro.'
                : 'No hay actividades publicadas en este momento.'}
            </p>
          </div>
        ) : (
          <div className="activity-list">
            {shown.map((event) => (
              <ActivityCard event={event} now={now} key={event._id} />
            ))}
          </div>
        )}
      </section>
      <p className="current-date">
        Fecha actual:{' '}
        <time dateTime={new Date(now).toISOString()}>
          {new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            dateStyle: 'short',
          }).format(now)}
        </time>
      </p>
    </main>
  );
}

function ActivityCard({ event, now }: { event: Event; now: number }) {
  return (
    <article className="event-card">
      <div className="activity-card-heading">
        <div>
          <Status event={event} now={now} />
          <h3>
            <a href={activityUrl(event)}>{event.title}</a>
          </h3>
        </div>
        <a className="button" href={activityUrl(event)}>
          Ver detalles
        </a>
      </div>
      <p className="activity-description">{event.description}</p>
      <div className="activity-card-meta">
        <p>
          <strong>Fecha y horario: </strong>
          {formatSchedule(event)}
        </p>
        <p>
          <strong>Lugar: </strong>
          {event.location}
        </p>
      </div>
    </article>
  );
}

function ActivityDetail({ event, now }: { event: Event; now: number }) {
  const [registering, setRegistering] = useState(false);
  const state = status(event, now);
  return (
    <main className="container page-section">
      <a className="back-link" href="/">
        <ArrowLeft size={16} />
        Volver a inicio
      </a>
      <div className="activity-title">
        <div className="activity-type">
          <span>{activityKind(event)}</span>
          <Status event={event} now={now} />
        </div>
        <h1>{event.title}</h1>
      </div>
      <div className="activity-detail-grid">
        <div className="activity-detail-content">
          <section className="panel">
            <h2>Descripción</h2>
            <p className="preserve-lines">{event.description}</p>
          </section>
          {event.instructions?.trim() && (
            <section className="panel">
              <h2>Indicaciones para la jornada</h2>
              <p className="preserve-lines">{event.instructions}</p>
            </section>
          )}
          <section className="panel">
            <h2>Inscripción</h2>
            <p>
              Completá el formulario con tus datos para inscribirte a esta
              actividad. No necesitás crear una cuenta.
            </p>
            <p>
              Usá siempre el mismo email: guardamos una sola inscripción por
              email y actividad. Si volvés a enviar el formulario con ese email,
              conservamos la inscripción original.
            </p>
          </section>
        </div>
        <aside className="activity-sidebar">
          <section className="panel panel-muted">
            <h2>Detalles de la actividad</h2>
            <dl>
              <dt>Fecha y horario</dt>
              <dd>{formatSchedule(event)}</dd>
              <dt>Lugar público de encuentro</dt>
              <dd>{event.location}</dd>
              <dt>Cierre de inscripciones</dt>
              <dd>
                {formatDeadline(event.deadline)}{' '}
                <span className="muted">(Argentina)</span>
              </dd>
              {event.capacity > 0 && (
                <>
                  <dt>Cupos disponibles</dt>
                  <dd>
                    {Math.max(0, event.capacity - event.registrationCount)} de{' '}
                    {event.capacity}
                  </dd>
                </>
              )}
            </dl>
            <div className="activity-signup">
              <button
                className="button full-width"
                disabled={state !== 'open'}
                onClick={() => setRegistering(true)}
              >
                {state === 'open' ? 'Inscribirme' : statusLabels[state]}
              </button>
              {state !== 'open' && (
                <p>
                  Las inscripciones para esta actividad no están disponibles.
                </p>
              )}
            </div>
          </section>
          <p className="institutional-link">
            Conocé más sobre el Proyecto en{' '}
            <a
              href="https://www.morosario.com.ar"
              target="_blank"
              rel="noopener noreferrer"
            >
              morosario.com.ar
            </a>
          </p>
        </aside>
      </div>
      {registering && (
        <RegistrationForm event={event} onClose={() => setRegistering(false)} />
      )}
    </main>
  );
}
