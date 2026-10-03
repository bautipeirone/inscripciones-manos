import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Download,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useData } from './data';
import {
  csvCell,
  formatDate,
  formatSchedule,
  formatDeadline,
  status,
  type Event,
  type EventInput,
  type Question,
  type Registration,
} from './domain';
import { Modal, Status, errorMessage } from './ui';
import { SiteHeader, SiteFooter } from './Layout';

export function Admin({ onHome }: { onHome: () => void }) {
  const data = useData();
  const [editor, setEditor] = useState<Event | 'new' | null>(null);
  const [view, setView] = useState<Event | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  if (data.loading)
    return (
      <main className="setup-page" role="status">
        Cargando administración…
      </main>
    );
  if (!data.admin) return <Login />;
  const events = data.events
    .filter((e) =>
      e.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const change = async (event: Event, visible: boolean, accepting: boolean) => {
    setBusy(event._id);
    setError('');
    try {
      await data.availability(event, visible, accepting);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="admin-page">
      {data.demo && (
        <div className="demo-bar">
          <span>
            Administración de prueba · Los cambios solo se guardan en este
            navegador
          </span>
        </div>
      )}
      <SiteHeader>
        <button className="nav-link" onClick={onHome}>
          Ver sitio
        </button>
        <button
          className="nav-link"
          onClick={() =>
            void data.signOut().catch((err) => setError(errorMessage(err)))
          }
        >
          Cerrar sesión
        </button>
      </SiteHeader>
      <main className="container admin-main">
        <div className="section-heading">
          <div>
            <h1>Administración</h1>
            <p>
              Sesión iniciada como <strong>{data.admin.email}</strong>.
            </p>
          </div>
          <button className="button" onClick={() => setEditor('new')}>
            <Plus size={18} /> Nueva actividad
          </button>
        </div>
        <div className="stats-grid">
          <div>
            <span>
              <FileText /> Actividades
            </span>
            <strong>{data.events.length}</strong>
            <small>Visitas diagnósticas y Manos a la Obra</small>
          </div>
          <div>
            <span>
              <CalendarDays /> Inscripciones abiertas
            </span>
            <strong>
              {data.events.filter((e) => status(e, now) === 'open').length}
            </strong>
            <small>Actividades que reciben inscripciones</small>
          </div>
          <div>
            <span>
              <Users /> Inscripciones recibidas
            </span>
            <strong>
              {data.events.reduce((sum, e) => sum + e.registrationCount, 0)}
            </strong>
            <small>Entre todas las actividades</small>
          </div>
        </div>
        <div className="admin-list-heading">
          <h2>Actividades</h2>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar actividades"
              placeholder="Buscar una actividad…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-event-list">
          {events.length === 0 ? (
            <div className="empty-state">
              <FileText />
              <h3>
                {search
                  ? 'No encontramos coincidencias.'
                  : 'No hay actividades creadas todavía.'}
              </h3>
              <p>
                {search
                  ? 'Probá con otro nombre.'
                  : 'Creá una actividad y prepará su formulario de inscripción.'}
              </p>
            </div>
          ) : (
            events.map((event) => (
              <article key={event._id} className="admin-event">
                <div className="admin-event-icon">
                  <CalendarDays />
                </div>
                <div className="admin-event-info">
                  <div className="admin-event-title">
                    <h3>{event.title}</h3>
                    <Status event={event} now={now} />
                  </div>
                  <p>
                    {formatSchedule(event)} <span>·</span>{' '}
                    {event.kind === 'main'
                      ? `Manos a la Obra ${event.date.slice(0, 4)}`
                      : 'Visita diagnóstica'}
                  </p>
                  <small>
                    Cierre: {formatDeadline(event.deadline)} (Argentina){' '}
                    {event.visible
                      ? '· Visible en el sitio'
                      : '· Oculto del sitio'}
                  </small>
                </div>
                <button
                  className="registration-count"
                  onClick={() => setView(event)}
                >
                  <Users size={17} />
                  <strong>{event.registrationCount}</strong>
                  <span>Ver inscripciones</span>
                </button>
                <div className="admin-event-actions">
                  <button
                    className="icon-button"
                    aria-label={`Editar ${event.title}`}
                    title="Editar formulario"
                    onClick={() => setEditor(event)}
                  >
                    <Settings2 size={18} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy === event._id}
                    title={
                      event.visible
                        ? 'Ocultar formulario'
                        : 'Mostrar formulario'
                    }
                    aria-label={`${event.visible ? 'Ocultar' : 'Mostrar'} ${event.title}`}
                    onClick={() =>
                      void change(event, !event.visible, event.accepting)
                    }
                  >
                    {event.visible ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                  <button
                    className="icon-button"
                    disabled={
                      busy === event._id ||
                      (!event.accepting && event.deadline <= now)
                    }
                    title={
                      event.accepting
                        ? 'Cerrar inscripción'
                        : event.deadline <= now
                          ? 'Editá la fecha de cierre para reabrir'
                          : 'Abrir inscripción'
                    }
                    aria-label={`${event.accepting ? 'Cerrar inscripción' : 'Abrir inscripción'} ${event.title}`}
                    onClick={() =>
                      void change(event, event.visible, !event.accepting)
                    }
                  >
                    {event.accepting ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="admin-tip">
          <LockKeyhole size={18} />
          <p>
            Las inscripciones se cierran automáticamente al llegar a la fecha
            límite. Ocultar un formulario también impide recibir nuevas
            inscripciones.
          </p>
        </div>
      </main>
      <SiteFooter />
      {editor && (
        <EventEditor
          event={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {view && <RegistrationList event={view} onClose={() => setView(null)} />}
    </div>
  );
}
function Login() {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="login-page">
        <div className="login-card">
          <h1>Ingresar</h1>
          <p>Acceso exclusivo para el Equipo de Inscripciones.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const form = new FormData(e.currentTarget);
              try {
                await data.signIn(
                  String(form.get('email') ?? ''),
                  String(form.get('password') ?? ''),
                );
              } catch {
                setError(
                  'No pudimos iniciar sesión. Revisá el email, la contraseña y tu conexión.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {data.demo ? (
              <p className="notice">
                Esta es una demostración local del panel. No se necesita
                contraseña y no se accede a datos reales.
              </p>
            ) : (
              <>
                <label>
                  Correo electrónico
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button full-width" disabled={busy}>
              {busy
                ? 'Ingresando…'
                : data.demo
                  ? 'Explorar panel de prueba'
                  : 'Ingresar'}
              <ArrowRight size={18} />
            </button>
          </form>
          <small>
            Acceso exclusivo para administradores.
            <br />
            {!data.demo &&
              'Si olvidaste tu contraseña, contactá a quien administra la plataforma.'}
          </small>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
const inputDate = (time: number) =>
  new Date(time - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
function EventEditor({
  event,
  onClose,
}: {
  event: Event | null;
  onClose: () => void;
}) {
  const data = useData();
  const [questions, setQuestions] = useState<Question[]>(
    event?.questions ?? [],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = (event?.registrationCount ?? 0) > 0;
  const updateQuestion = (id: string, update: Partial<Question>) =>
    setQuestions((old) =>
      old.map((q) => (q.id === id ? { ...q, ...update } : q)),
    );
  return (
    <Modal
      title={event ? 'Editar actividad' : 'Nueva actividad'}
      onClose={onClose}
      wide
    >
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          const form = new FormData(e.currentTarget);
          const value: EventInput = {
            title: String(form.get('title')).trim(),
            description: String(form.get('description')).trim(),
            kind: form.get('kind') as EventInput['kind'],
            date: String(form.get('startAt')).slice(0, 10),
            startAt: Date.parse(String(form.get('startAt')) + ':00-03:00'),
            endAt: Date.parse(String(form.get('endAt')) + ':00-03:00'),
            instructions: String(form.get('instructions')).trim(),
            location: String(form.get('location')).trim(),
            deadline: Date.parse(String(form.get('deadline')) + ':00-03:00'),
            capacity: Number(form.get('capacity')),
            visible: form.get('visible') === 'on',
            accepting: form.get('accepting') === 'on',
            questions,
          };
          try {
            await data.saveEvent(value, event?._id);
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Prepará la información de la actividad y elegí qué necesitás
          preguntar.
        </p>
        <h3 className="form-section-title">
          <span>01</span> Datos de la actividad
        </h3>
        <label>
          Nombre de la actividad *
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={event?.title}
            placeholder="Ej. Visita diagnóstica de octubre"
          />
        </label>
        <label>
          Tipo de actividad
          <select name="kind" defaultValue={event?.kind ?? 'monthly'}>
            <option value="monthly">
              Visita diagnóstica · agosto a diciembre
            </option>
            <option value="main">Manos a la Obra · enero</option>
          </select>
        </label>
        {event && event.startAt === undefined && (
          <p className="notice">
            Esta actividad tiene guardada la fecha {formatDate(event.date)}.
            Completá los horarios y las indicaciones para actualizarla.
          </p>
        )}
        <div className="form-row">
          <label>
            Fecha y hora de inicio *
            <input
              type="datetime-local"
              name="startAt"
              required
              defaultValue={
                event?.startAt !== undefined
                  ? inputDate(event.startAt)
                  : undefined
              }
            />
            <small>Hora de Argentina (UTC−3).</small>
          </label>
          <label>
            Fecha y hora de finalización *
            <input
              type="datetime-local"
              name="endAt"
              required
              defaultValue={
                event?.endAt !== undefined ? inputDate(event.endAt) : undefined
              }
            />
            <small>Puede ser otro día, como en el Manos a la Obra.</small>
          </label>
        </div>
        <label>
          Descripción *
          <textarea
            rows={3}
            name="description"
            required
            maxLength={3000}
            defaultValue={event?.description}
            placeholder="Contá qué van a hacer y qué necesita saber quien se suma."
          />
        </label>
        <label>
          Indicaciones para los participantes *
          <textarea
            name="instructions"
            required
            rows={3}
            maxLength={5000}
            defaultValue={event?.instructions}
            placeholder="Qué llevar, cómo llegar y qué necesitan saber antes de participar."
          />
        </label>
        <label>
          Lugar público de encuentro *
          <input
            name="location"
            required
            maxLength={200}
            defaultValue={event?.location}
            placeholder="Dirección o punto de encuentro"
          />
        </label>
        <div className="form-row">
          <label>
            Cierre de inscripciones *
            <input
              type="datetime-local"
              name="deadline"
              required
              defaultValue={event ? inputDate(event.deadline) : undefined}
            />
            <small>Hora de Argentina (UTC−3).</small>
          </label>
          <label>
            Cupo máximo
            <input
              type="number"
              name="capacity"
              min={0}
              max={10000}
              step={1}
              defaultValue={event?.capacity ?? 0}
              required
            />
            <small>0 = sin límite de participantes.</small>
          </label>
        </div>
        <h3 className="form-section-title">
          <span>02</span> El formulario
        </h3>
        <div className="built-in-fields">
          <span>Nombre y apellido *</span>
          <span>Email *</span>
          <span>Teléfono (opcional)</span>
        </div>
        <p className="muted small">
          Estos campos siempre están incluidos, junto con la autorización para
          guardar los datos.
        </p>
        {locked && (
          <p className="notice">
            Este formulario ya recibió inscripciones. Las preguntas quedan fijas
            para conservar el significado de las respuestas.
          </p>
        )}
        <fieldset disabled={locked} className="questions-fieldset">
          {questions.map((q, index) => (
            <div className="question-editor" key={q.id}>
              <div className="question-header">
                <strong>Pregunta {index + 1}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Eliminar pregunta ${index + 1}`}
                  onClick={() =>
                    setQuestions((old) =>
                      old.filter((item) => item.id !== q.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <label>
                Pregunta *
                <input
                  required
                  maxLength={200}
                  value={q.label}
                  onChange={(e) =>
                    updateQuestion(q.id, { label: e.target.value })
                  }
                  placeholder="¿Qué te gustaría saber?"
                />
              </label>
              <div className="form-row">
                <label>
                  Tipo de respuesta
                  <select
                    value={q.type}
                    onChange={(e) =>
                      updateQuestion(q.id, {
                        type: e.target.value as Question['type'],
                      })
                    }
                  >
                    <option value="text">Respuesta corta</option>
                    <option value="textarea">Respuesta larga</option>
                    <option value="select">Elegir una opción</option>
                  </select>
                </label>
                <label className="checkbox-label question-required">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      updateQuestion(q.id, { required: e.target.checked })
                    }
                  />{' '}
                  Obligatoria
                </label>
              </div>
              {q.type === 'select' && (
                <label>
                  Opciones (una por línea) *
                  <textarea
                    rows={3}
                    required
                    value={q.options.join('\n')}
                    onChange={(e) =>
                      updateQuestion(q.id, {
                        options: e.target.value.split('\n'),
                      })
                    }
                    placeholder={'Primera opción\nSegunda opción'}
                  />
                </label>
              )}
            </div>
          ))}
          <button
            type="button"
            className="button button-outline full-width"
            disabled={questions.length >= 20}
            onClick={() =>
              setQuestions((old) => [
                ...old,
                {
                  id: crypto.randomUUID(),
                  label: '',
                  type: 'text',
                  required: false,
                  options: [],
                },
              ])
            }
          >
            <Plus size={17} />
            Agregar pregunta
          </button>
        </fieldset>
        <h3 className="form-section-title">
          <span>03</span> Publicación
        </h3>
        <label className="setting-row">
          <span>
            <strong>Mostrar en el sitio</strong>
            <small>Las personas podrán encontrar esta actividad.</small>
          </span>
          <input
            type="checkbox"
            name="visible"
            defaultChecked={event?.visible ?? false}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Recibir inscripciones</strong>
            <small>
              Se cerrarán al llegar a la fecha límite o completar el cupo.
            </small>
          </span>
          <input
            type="checkbox"
            name="accepting"
            defaultChecked={event?.accepting ?? true}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button" disabled={busy}>
            {busy
              ? 'Guardando…'
              : event
                ? 'Guardar cambios'
                : 'Crear actividad'}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RegistrationList({
  event,
  onClose,
}: {
  event: Event;
  onClose: () => void;
}) {
  const data = useData();
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Registration | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let active = true;
    data
      .registrations(event._id)
      .then((result) => {
        if (active) setRows(result);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [event._id]);
  const filtered = rows.filter((r) =>
    `${r.name} ${r.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  const download = () => {
    const lines = [
      [
        'Nombre',
        'Email',
        'Teléfono',
        'Fecha de inscripción (UTC)',
        'Consentimiento',
        ...event.questions.map((q) => q.label),
      ],
      ...rows.map((r) => [
        r.name,
        r.email,
        r.phone,
        new Date(r._creationTime).toISOString(),
        r.consent ? 'Sí' : 'No',
        ...event.questions.map((q) => r.answers[q.id] ?? ''),
      ]),
    ];
    const blob = new Blob(
      [
        '\uFEFF' +
          lines.map((line) => line.map(csvCell).join(',')).join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8;' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inscripciones-${event.date}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal title="Inscripciones" onClose={onClose} wide>
      <p className="muted">
        {event.title} · {formatSchedule(event)}
      </p>
      <div className="registrations-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar participantes"
            placeholder="Buscar nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="button button-outline button-small"
          disabled={loading || !rows.length}
          onClick={download}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando inscripciones…</p>
      ) : !rows.length ? (
        <div className="empty-state">
          <Users />
          <h3>Todavía no hay inscripciones.</h3>
          <p>Cuando alguien se sume, vas a encontrar sus datos acá.</p>
        </div>
      ) : (
        <>
          <p className="muted small">
            {filtered.length} de {rows.length} inscripciones · Usá la flecha
            para ver las respuestas.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Fecha</th>
                  <th>
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r._id}>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      {new Date(r._creationTime).toLocaleDateString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                      })}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Ver respuestas de ${r.name}`}
                        onClick={() => {
                          setDetail(r);
                          setConfirmDelete(false);
                        }}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="empty-state">
              No encontramos participantes con ese nombre o email.
            </p>
          )}
        </>
      )}
      {detail && (
        <section className="response-detail">
          <div className="question-header">
            <h3>{detail.name}</h3>
            <button
              className="icon-button"
              aria-label="Cerrar detalle"
              onClick={() => setDetail(null)}
            >
              <X size={17} />
            </button>
          </div>
          <dl>
            <dt>Email</dt>
            <dd>{detail.email}</dd>
            <dt>Teléfono</dt>
            <dd>{detail.phone || 'No informado'}</dd>
            {event.questions.map((q) => (
              <div key={q.id}>
                <dt>{q.label}</dt>
                <dd>{detail.answers[q.id] || 'Sin respuesta'}</dd>
              </div>
            ))}
          </dl>
          {confirmDelete ? (
            <div className="notice">
              <p>
                ¿Eliminar esta inscripción y sus respuestas? Se liberará el
                lugar y esta acción no se puede deshacer.
              </p>
              <div className="delete-actions">
                <button
                  className="button button-ghost button-small"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancelar
                </button>
                <button
                  className="button button-danger button-small"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    setError('');
                    try {
                      await data.removeRegistration(detail._id);
                      setRows((old) => old.filter((r) => r._id !== detail._id));
                      setDetail(null);
                      setConfirmDelete(false);
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button button-ghost button-small delete-link"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} />
              Eliminar inscripción
            </button>
          )}
        </section>
      )}
    </Modal>
  );
}
