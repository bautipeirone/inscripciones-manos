import { useState } from 'react';
import {
  ClipboardList,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useData } from './data';
import { csvCell, formatDate } from './domain';
import { MAX_INVENTORY_ENTRIES, type Inventory } from './inventory';
import { errorMessage, Modal } from './ui';

const quantityFormat = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 20,
});

export function Inventories() {
  const data = useData();
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Inventory | 'new' | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const view = data.inventories?.find((item) => item._id === viewId);
  const inventories = data.inventories
    ?.filter(
      (item) =>
        item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
        item.date.includes(search),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="section-heading inventory-heading">
        <div>
          <h2>Inventarios</h2>
          <p>
            Registrá las herramientas y los materiales disponibles en cada
            fecha.
          </p>
        </div>
        <button
          className="button"
          onClick={() => setEditor('new')}
          disabled={!data.inventories}
        >
          <Plus size={18} /> Nuevo inventario
        </button>
      </div>
      <div className="admin-list-heading">
        <p className="muted">
          {data.inventories?.length ?? 0} inventarios registrados
        </p>
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar inventarios"
            placeholder="Buscar por etiqueta o fecha…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {!inventories ? (
        <p role="status">Cargando inventarios…</p>
      ) : inventories.length === 0 ? (
        <div className="empty-state">
          <ClipboardList />
          <h3>
            {search
              ? 'No encontramos coincidencias.'
              : 'No hay inventarios registrados todavía.'}
          </h3>
          <p>
            {search
              ? 'Probá con otra etiqueta o una fecha (AAAA-MM-DD).'
              : 'Creá un inventario para registrar palas, herramientas, pintura y otros materiales.'}
          </p>
        </div>
      ) : (
        <div className="admin-event-list">
          {inventories.map((inventory) => (
            <article className="admin-event inventory-card" key={inventory._id}>
              <div className="admin-event-info">
                <h3>{inventory.label}</h3>
                <p>{formatDate(inventory.date)}</p>
                <small>
                  {inventory.entries.length}{' '}
                  {inventory.entries.length === 1 ? 'elemento' : 'elementos'}
                </small>
              </div>
              <button
                className="button button-outline button-small"
                onClick={() => setViewId(inventory._id)}
                aria-label={`Ver inventario ${inventory.label}`}
              >
                <ClipboardList size={16} /> Ver inventario
              </button>
              <button
                className="icon-button"
                onClick={() => setEditor(inventory)}
                aria-label={`Editar inventario ${inventory.label}`}
                title="Editar inventario"
              >
                <Pencil size={18} />
              </button>
            </article>
          ))}
        </div>
      )}
      {editor && (
        <InventoryEditor
          inventory={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {view && (
        <InventoryDetail inventory={view} onClose={() => setViewId(null)} />
      )}
    </>
  );
}

type DraftEntry = {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  comments: string;
};
const blankEntry = (): DraftEntry => ({
  key: crypto.randomUUID(),
  name: '',
  quantity: '',
  unit: '',
  comments: '',
});

function InventoryEditor({
  inventory,
  onClose,
}: {
  inventory: Inventory | null;
  onClose: () => void;
}) {
  const data = useData();
  const [entries, setEntries] = useState<DraftEntry[]>(
    () =>
      inventory?.entries.map((entry) => ({
        key: crypto.randomUUID(),
        name: entry.name,
        quantity: String(entry.quantity),
        unit: entry.unit ?? '',
        comments: entry.comments ?? '',
      })) ?? [blankEntry()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (
    key: string,
    field: keyof Omit<DraftEntry, 'key'>,
    value: string,
  ) =>
    setEntries((old) =>
      old.map((entry) =>
        entry.key === key ? { ...entry, [field]: value } : entry,
      ),
    );
  return (
    <Modal
      title={inventory ? 'Editar inventario' : 'Nuevo inventario'}
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
            await data.saveInventory(
              {
                label: String(form.get('label') ?? ''),
                date: String(form.get('date') ?? ''),
                entries: entries.map(({ name, quantity, unit, comments }) => ({
                  name,
                  quantity: Number(quantity),
                  unit,
                  comments,
                })),
              },
              inventory?._id,
            );
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Anotá qué hay disponible. Podés usar cantidades decimales y elegir una
          unidad para cada elemento.
        </p>
        <fieldset disabled={busy} className="inventory-fields">
          <div className="form-row">
            <label>
              Etiqueta *
              <input
                name="label"
                required
                maxLength={120}
                defaultValue={inventory?.label}
                placeholder="Ej. Depósito antes de la jornada"
              />
            </label>
            <label>
              Fecha del inventario *
              <input
                name="date"
                type="date"
                required
                defaultValue={
                  inventory?.date ??
                  new Date(Date.now() - 3 * 60 * 60 * 1000)
                    .toISOString()
                    .slice(0, 10)
                }
              />
            </label>
          </div>
          <h3 className="form-section-title">
            Elementos <span>({entries.length})</span>
          </h3>
          {entries.map((entry, index) => (
            <fieldset className="inventory-entry" key={entry.key}>
              <legend>Elemento {index + 1}</legend>
              <div className="inventory-entry-heading">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Quitar elemento ${index + 1}`}
                  title="Quitar elemento"
                  disabled={entries.length === 1}
                  onClick={() =>
                    setEntries((old) =>
                      old.filter((item) => item.key !== entry.key),
                    )
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <label>
                Nombre *
                <input
                  required
                  maxLength={120}
                  value={entry.name}
                  onChange={(e) => update(entry.key, 'name', e.target.value)}
                  placeholder="Ej. Pintura blanca, pala, taladro"
                />
              </label>
              <div className="form-row">
                <label>
                  Cantidad *
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={entry.quantity}
                    onChange={(e) =>
                      update(entry.key, 'quantity', e.target.value)
                    }
                    placeholder="Ej. 2,5"
                  />
                </label>
                <label>
                  Unidad de medida (opcional)
                  <input
                    maxLength={40}
                    list="inventory-units"
                    value={entry.unit}
                    onChange={(e) => update(entry.key, 'unit', e.target.value)}
                    placeholder="Ej. unidades, litros, kg"
                  />
                </label>
              </div>
              <label>
                Comentarios (opcional)
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={entry.comments}
                  onChange={(e) =>
                    update(entry.key, 'comments', e.target.value)
                  }
                  placeholder="Ej. Estado, ubicación o detalles del material"
                />
              </label>
            </fieldset>
          ))}
          <datalist id="inventory-units">
            {['unidades', 'litros', 'kg', 'metros', 'latas', 'cajas'].map(
              (unit) => (
                <option key={unit} value={unit} />
              ),
            )}
          </datalist>
          <button
            type="button"
            className="button button-outline"
            disabled={entries.length >= MAX_INVENTORY_ENTRIES}
            onClick={() => setEntries((old) => [...old, blankEntry()])}
          >
            <Plus size={16} /> Agregar elemento
          </button>
          {entries.length >= MAX_INVENTORY_ENTRIES && (
            <p className="muted">
              Máximo de {MAX_INVENTORY_ENTRIES} elementos por inventario.
            </p>
          )}
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
            {busy
              ? 'Guardando…'
              : inventory
                ? 'Guardar cambios'
                : 'Crear inventario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InventoryDetail({
  inventory,
  onClose,
}: {
  inventory: Inventory;
  onClose: () => void;
}) {
  const data = useData();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = () => {
    const lines = [
      ['Fecha', 'Etiqueta', 'Nombre', 'Cantidad', 'Unidad', 'Comentarios'],
      ...inventory.entries.map((entry) => [
        inventory.date,
        inventory.label,
        entry.name,
        String(entry.quantity),
        entry.unit ?? '',
        entry.comments ?? '',
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
    link.download = `inventario-${inventory.date}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal
      title={inventory.label}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="registrations-toolbar">
        <p className="muted">
          {formatDate(inventory.date)} · {inventory.entries.length}{' '}
          {inventory.entries.length === 1 ? 'elemento' : 'elementos'}
        </p>
        <button
          className="button button-outline button-small"
          disabled={busy}
          onClick={download}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>
      <div className="table-scroll">
        <table className="inventory-table">
          <caption className="sr-only">Elementos de {inventory.label}</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Unidad</th>
              <th scope="col">Comentarios</th>
            </tr>
          </thead>
          <tbody>
            {inventory.entries.map((entry, index) => (
              <tr key={index}>
                <td>{entry.name}</td>
                <td>{quantityFormat.format(entry.quantity)}</td>
                <td>{entry.unit || '—'}</td>
                <td className="preserve-lines">{entry.comments || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirm ? (
        <div className="notice" role="alert">
          <p>
            ¿Eliminar este inventario y todos sus elementos? Esta acción no se
            puede deshacer.
          </p>
          <div className="delete-actions">
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancelar
            </button>
            <button
              className="button button-danger"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError('');
                try {
                  await data.removeInventory(inventory._id);
                  onClose();
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      ) : (
        <button className="button delete-link" onClick={() => setConfirm(true)}>
          <Trash2 size={16} /> Eliminar inventario
        </button>
      )}
    </Modal>
  );
}
