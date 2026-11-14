import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  HeartHandshake,
  ListPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useData } from './data';
import {
  MAX_ABOUT_SECTIONS,
  MAX_DONOR_NAMES,
  MAX_DONOR_YEAR,
  MIN_DONOR_YEAR,
  donorBatchMessage,
  donorKindLabels,
  type AboutContent,
  type Donor,
  type DonorKind,
} from './about';
import { errorMessage, Modal } from './ui';

const thisYear = () =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCFullYear();

// Admin tab for the public «Nosotros» page: its texts and the donors list.
export function AboutAdmin() {
  const data = useData();
  const [editing, setEditing] = useState(false);
  const [donor, setDonor] = useState<Donor | 'new' | null>(null);
  const [batch, setBatch] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const about = data.about;
  const donors = data.donors
    ?.filter((item) =>
      `${item.name} ${item.years.join(' ')}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es'),
    );
  return (
    <>
      <div className="section-heading inventory-heading">
        <div>
          <h2>Página Nosotros</h2>
          <p>
            Editá los textos públicos y la lista de quienes donaron. Los cambios
            se publican al guardar.
          </p>
        </div>
        <a
          className="button button-outline"
          href="/nosotros"
          target="_blank"
          rel="noopener"
        >
          <ExternalLink size={18} /> Ver la página
        </a>
      </div>
      {!about ? (
        <p role="status">Cargando textos…</p>
      ) : (
        <article className="admin-event">
          <div className="admin-event-info">
            <h3>Textos de la página</h3>
            <p>{about.title}</p>
            <small>
              {about.sections.length}{' '}
              {about.sections.length === 1 ? 'sección' : 'secciones'}
              {about.sections.length > 0 &&
                `: ${about.sections.map((s) => s.title).join(', ')}`}
            </small>
          </div>
          <button
            className="button button-outline button-small"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} /> Editar textos
          </button>
        </article>
      )}
      <div className="section-heading inventory-heading donors-heading">
        <div>
          <h2>Donantes</h2>
          <p>
            Cada donante aparece en la página bajo los años en que donó. Publicá
            solo los nombres de quienes aceptaron figurar.
          </p>
        </div>
        <div className="inventory-heading-actions">
          <button
            className="button button-outline"
            disabled={!data.donors}
            onClick={() => setBatch(true)}
          >
            <ListPlus size={18} /> Agregar varios
          </button>
          <button
            className="button"
            disabled={!data.donors}
            onClick={() => setDonor('new')}
          >
            <Plus size={18} /> Nuevo donante
          </button>
        </div>
      </div>
      {notice && (
        <p className="saved-note donors-notice" role="status">
          {notice}
        </p>
      )}
      <div className="admin-list-heading">
        <p className="muted">
          {data.donors?.length ?? 0}{' '}
          {data.donors?.length === 1
            ? 'donante publicado'
            : 'donantes publicados'}
        </p>
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar donantes"
            placeholder="Nombre o año…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {!donors ? (
        <p role="status">Cargando donantes…</p>
      ) : donors.length === 0 ? (
        <div className="empty-state">
          <HeartHandshake />
          <h3>
            {search
              ? 'No encontramos coincidencias.'
              : 'Todavía no hay donantes publicados.'}
          </h3>
          <p>
            {search
              ? 'Probá con otro nombre o con un año.'
              : 'Usá «Agregar varios» para pegar una lista de nombres de un mismo año, o «Nuevo donante» para cargar uno con más detalle.'}
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="donors-table">
            <caption className="sr-only">Donantes publicados</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Tipo</th>
                <th scope="col">Años</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {donors.map((item) => (
                <tr key={item._id}>
                  <td>
                    <strong>{item.name}</strong>
                    {item.note && <small>{item.note}</small>}
                  </td>
                  <td>{donorKindLabels[item.kind]}</td>
                  <td>{item.years.join(', ')}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Editar donante ${item.name}`}
                      title="Editar donante"
                      onClick={() => setDonor(item)}
                    >
                      <Pencil size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && about && (
        <AboutEditor about={about} onClose={() => setEditing(false)} />
      )}
      {donor && (
        <DonorEditor
          donor={donor === 'new' ? null : donor}
          onClose={() => setDonor(null)}
        />
      )}
      {batch && (
        <DonorBatch
          onClose={() => setBatch(false)}
          onDone={(message) => {
            setNotice(message);
            setBatch(false);
          }}
        />
      )}
    </>
  );
}

type DraftSection = { key: string; title: string; body: string };

function AboutEditor({
  about,
  onClose,
}: {
  about: AboutContent;
  onClose: () => void;
}) {
  const data = useData();
  const [sections, setSections] = useState<DraftSection[]>(() =>
    about.sections.map((section) => ({
      key: crypto.randomUUID(),
      ...section,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key: string, field: 'title' | 'body', value: string) =>
    setSections((old) =>
      old.map((section) =>
        section.key === key ? { ...section, [field]: value } : section,
      ),
    );
  const move = (index: number, by: number) =>
    setSections((old) => {
      const next = [...old];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  return (
    <Modal
      title="Editar textos de Nosotros"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            await data.saveAbout({
              title: String(form.get('title') ?? ''),
              lead: String(form.get('lead') ?? ''),
              sections: sections.map(({ title, body }) => ({ title, body })),
              donationsIntro: String(form.get('donationsIntro') ?? ''),
              donationsHow: String(form.get('donationsHow') ?? ''),
            });
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Escribí texto simple. Dejá una línea en blanco para separar párrafos;
          las direcciones web y los emails se convierten en enlaces.
        </p>
        <fieldset disabled={busy} className="inventory-fields">
          <label>
            Título principal *
            <input
              name="title"
              required
              maxLength={120}
              defaultValue={about.title}
            />
          </label>
          <label>
            Presentación <span className="optional">(opcional)</span>
            <textarea
              name="lead"
              rows={3}
              maxLength={600}
              defaultValue={about.lead}
            />
            <small>Un párrafo corto debajo del título.</small>
          </label>
          <h3 className="form-section-title">
            Secciones <span>({sections.length})</span>
          </h3>
          {sections.map((section, index) => (
            <fieldset className="inventory-entry" key={section.key}>
              <legend>Sección {index + 1}</legend>
              <div className="inventory-entry-heading">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Subir sección ${index + 1}`}
                  title="Subir"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={18} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Bajar sección ${index + 1}`}
                  title="Bajar"
                  disabled={index === sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={18} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Quitar sección ${index + 1}`}
                  title="Quitar sección"
                  onClick={() =>
                    setSections((old) =>
                      old.filter((item) => item.key !== section.key),
                    )
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <label>
                Título *
                <input
                  required
                  maxLength={120}
                  value={section.title}
                  onChange={(e) => update(section.key, 'title', e.target.value)}
                  placeholder="Ej. Nuestra historia"
                />
              </label>
              <label>
                Texto *
                <textarea
                  required
                  rows={5}
                  maxLength={4000}
                  value={section.body}
                  onChange={(e) => update(section.key, 'body', e.target.value)}
                />
              </label>
            </fieldset>
          ))}
          <button
            type="button"
            className="button button-outline"
            disabled={sections.length >= MAX_ABOUT_SECTIONS}
            onClick={() =>
              setSections((old) => [
                ...old,
                { key: crypto.randomUUID(), title: '', body: '' },
              ])
            }
          >
            <Plus size={16} /> Agregar sección
          </button>
          <h3 className="form-section-title">Donaciones</h3>
          <label>
            Texto de la sección Donaciones{' '}
            <span className="optional">(opcional)</span>
            <textarea
              name="donationsIntro"
              rows={3}
              maxLength={1500}
              defaultValue={about.donationsIntro}
            />
          </label>
          <label>
            Cómo donar <span className="optional">(opcional)</span>
            <textarea
              name="donationsHow"
              rows={4}
              maxLength={1500}
              defaultValue={about.donationsHow}
            />
            <small>
              Contacto, alias o pasos para colaborar. Si lo dejás vacío, el
              recuadro no se muestra.
            </small>
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KindField({
  value,
  onChange,
}: {
  value: DonorKind;
  onChange: (kind: DonorKind) => void;
}) {
  return (
    <fieldset className="choice-field">
      <legend>Tipo de donante</legend>
      {(['organization', 'person'] as const).map((kind) => (
        <label className="checkbox-label" key={kind}>
          <input
            type="radio"
            name="kind"
            checked={value === kind}
            onChange={() => onChange(kind)}
          />
          {donorKindLabels[kind]}
        </label>
      ))}
    </fieldset>
  );
}

function DonorEditor({
  donor,
  onClose,
}: {
  donor: Donor | null;
  onClose: () => void;
}) {
  const data = useData();
  const [kind, setKind] = useState<DonorKind>(donor?.kind ?? 'organization');
  const [years, setYears] = useState<number[]>(
    () => donor?.years ?? [thisYear()],
  );
  // Recent years plus any older ones this donor already has.
  const [options, setOptions] = useState<number[]>(() =>
    [
      ...new Set([
        ...Array.from({ length: 8 }, (_, i) => thisYear() - i),
        ...(donor?.years ?? []),
      ]),
    ].sort((a, b) => b - a),
  );
  const [other, setOther] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addOther = () => {
    const year = Number(other);
    if (
      !Number.isInteger(year) ||
      year < MIN_DONOR_YEAR ||
      year > MAX_DONOR_YEAR
    )
      return setError(
        `Escribí un año entre ${MIN_DONOR_YEAR} y ${MAX_DONOR_YEAR}.`,
      );
    setError('');
    setOptions((old) => [...new Set([...old, year])].sort((a, b) => b - a));
    setYears((old) => [...new Set([...old, year])]);
    setOther('');
  };
  return (
    <Modal
      title={donor ? 'Editar donante' : 'Nuevo donante'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            await data.saveDonor(
              {
                name: String(form.get('name') ?? ''),
                kind,
                years,
                note: String(form.get('note') ?? ''),
                url: String(form.get('url') ?? ''),
              },
              donor?._id,
            );
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="inventory-fields">
          <label>
            Nombre *
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={donor?.name}
              placeholder="Como debe leerse en la página"
            />
          </label>
          <KindField value={kind} onChange={setKind} />
          <fieldset className="choice-field">
            <legend>Años en los que donó *</legend>
            <div className="year-options">
              {options.map((year) => (
                <label className="checkbox-label" key={year}>
                  <input
                    type="checkbox"
                    checked={years.includes(year)}
                    onChange={(e) =>
                      setYears((old) =>
                        e.target.checked
                          ? [...old, year]
                          : old.filter((y) => y !== year),
                      )
                    }
                  />
                  {year}
                </label>
              ))}
            </div>
            <div className="year-other">
              <label>
                Otro año
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_DONOR_YEAR}
                  max={MAX_DONOR_YEAR}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOther();
                    }
                  }}
                  placeholder="Ej. 2015"
                />
              </label>
              <button
                type="button"
                className="button button-outline"
                disabled={!other}
                onClick={addOther}
              >
                Agregar año
              </button>
            </div>
          </fieldset>
          <label>
            Detalle <span className="optional">(opcional)</span>
            <input
              name="note"
              maxLength={200}
              defaultValue={donor?.note}
              placeholder="Ej. Pintura y rodillos"
            />
            <small>Se muestra en letra chica junto al nombre.</small>
          </label>
          <label>
            Sitio web <span className="optional">(opcional)</span>
            <input
              name="url"
              type="url"
              maxLength={300}
              defaultValue={donor?.url}
              placeholder="https://"
            />
            <small>Si lo completás, el nombre enlaza a esta dirección.</small>
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {donor && confirm && (
          <div className="notice" role="alert">
            <p>
              ¿Quitar a {donor.name} de la página? Se borra de todos los años.
            </p>
            <div className="delete-actions">
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  setError('');
                  try {
                    await data.removeDonor(donor._id);
                    onClose();
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Quitando…' : 'Quitar donante'}
              </button>
            </div>
          </div>
        )}
        <div className="modal-actions">
          {donor && !confirm && (
            <button
              type="button"
              className="button delete-link modal-delete"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} /> Quitar donante
            </button>
          )}
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button" disabled={busy}>
            {busy
              ? 'Guardando…'
              : donor
                ? 'Guardar cambios'
                : 'Agregar donante'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DonorBatch({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const data = useData();
  const [kind, setKind] = useState<DonorKind>('person');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title="Agregar varios donantes"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const result = await data.addDonors({
              names: String(form.get('names') ?? '').split('\n'),
              kind,
              year: Number(form.get('year')),
            });
            onDone(donorBatchMessage(result));
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Pegá los nombres de un mismo año, uno por línea. A quienes ya están en
          la lista solo les sumamos el año, sin duplicarlos.
        </p>
        <fieldset disabled={busy} className="inventory-fields">
          <label>
            Año de la donación *
            <input
              name="year"
              type="number"
              inputMode="numeric"
              required
              min={MIN_DONOR_YEAR}
              max={MAX_DONOR_YEAR}
              defaultValue={thisYear()}
            />
          </label>
          <KindField value={kind} onChange={setKind} />
          <label>
            Nombres *
            <textarea
              name="names"
              required
              rows={8}
              placeholder={'Un nombre por línea'}
            />
            <small>Hasta {MAX_DONOR_NAMES} nombres por vez.</small>
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Agregando…' : 'Agregar donantes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
