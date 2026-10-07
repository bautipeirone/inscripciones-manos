import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useData } from './data';
import { MAX_INVENTORY_ENTRIES } from './inventory';
import type { ImportedInventory } from './inventoryImport';
import { errorMessage, Modal } from './ui';

const today = () =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const quantityFormat = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 20,
});

export function InventoryImport({ onClose }: { onClose: () => void }) {
  const data = useData();
  const [imported, setImported] = useState<ImportedInventory | null>(null);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(today);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  const selectFile = async (file?: File) => {
    const version = ++request.current;
    setImported(null);
    setError('');
    setLabel('');
    setDate(today());
    setReading(!!file);
    if (!file) return;
    try {
      const { readInventoryFile } = await import('./inventoryImport');
      const result = await readInventoryFile(file);
      if (request.current !== version) return;
      setImported(result);
      setLabel(result.label ?? '');
      setDate(result.date ?? today());
    } catch (err) {
      if (request.current === version) setError(errorMessage(err));
    } finally {
      if (request.current === version) setReading(false);
    }
  };

  return (
    <Modal
      title="Importar inventario"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <aside
        className="notice import-instructions"
        aria-labelledby="inventory-import-format"
      >
        <h3 id="inventory-import-format">Formato requerido</h3>
        <ul>
          <li>
            Usá un CSV en UTF-8 separado por coma o punto y coma, o un Excel
            (.xlsx o .xls). En Excel se lee la primera hoja.
          </li>
          <li>
            La primera fila debe tener los encabezados <strong>Nombre</strong> y{' '}
            <strong>Cantidad</strong>. Podés agregar <strong>Unidad</strong> y{' '}
            <strong>Comentarios</strong>; sus celdas pueden quedar vacías. El
            orden de las columnas y las mayúsculas no importan. Otras columnas
            se ignoran.
          </li>
          <li>
            Agregá un elemento por fila, con nombre y cantidad mayor o igual a
            cero. Los decimales admiten punto o coma, sin separadores de miles
            ni unidades dentro de la cantidad. En un CSV separado por coma,
            encerrá los decimales con coma y los textos con comas o saltos de
            línea entre comillas dobles.
          </li>
          <li>
            Las columnas <strong>Fecha</strong> y <strong>Etiqueta</strong> son
            opcionales. Si tienen datos, repetí el mismo valor en todas las
            filas. Usá fechas AAAA-MM-DD o celdas de fecha de Excel. También
            podés completar o corregir estos datos abajo.
          </li>
          <li>
            Importá un inventario por archivo, con hasta {MAX_INVENTORY_ENTRIES}{' '}
            filas después del encabezado y un tamaño máximo de 5 MB. En Excel
            usá valores, sin fórmulas ni celdas combinadas.
          </li>
        </ul>
        <p>Ejemplo de una tabla válida:</p>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Ejemplo de formato para importar
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Unidad</th>
                <th scope="col">Comentarios</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Palas</td>
                <td>3</td>
                <td>unidades</td>
                <td>En buen estado</td>
              </tr>
              <tr>
                <td>Pintura blanca</td>
                <td>2.5</td>
                <td>litros</td>
                <td>Lata abierta</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Podés importar un CSV descargado con «Exportar CSV». Revisá la vista
          previa y guardá para crear un inventario nuevo.
        </p>
      </aside>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || reading || !imported) return;
          setBusy(true);
          setError('');
          try {
            await data.saveInventory({
              label,
              date,
              entries: imported.entries,
            });
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="inventory-fields" disabled={busy || reading}>
          <label>
            Archivo CSV o Excel *
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              required
              onChange={(e) => void selectFile(e.currentTarget.files?.[0])}
            />
          </label>
          <div className="form-row">
            <label>
              Etiqueta *
              <input
                required
                maxLength={120}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ej. Depósito antes de la jornada"
              />
            </label>
            <label>
              Fecha del inventario *
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        {reading && (
          <p className="muted" role="status">
            Leyendo archivo…
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {imported && (
          <section aria-label="Vista previa del inventario">
            <h3>Vista previa</h3>
            <p className="muted" role="status">
              {imported.entries.length}{' '}
              {imported.entries.length === 1
                ? 'elemento listo'
                : 'elementos listos'}{' '}
              para importar.
            </p>
            <div className="table-scroll">
              <table className="inventory-table">
                <caption className="sr-only">
                  Elementos que se importarán
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">Comentarios</th>
                  </tr>
                </thead>
                <tbody>
                  {imported.entries.map((entry, index) => (
                    <tr key={index}>
                      <td>{entry.name}</td>
                      <td>{quantityFormat.format(entry.quantity)}</td>
                      <td>{entry.unit || '—'}</td>
                      <td className="preserve-lines">
                        {entry.comments || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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
          <button className="button" disabled={busy || reading || !imported}>
            <Upload size={16} />
            {busy ? 'Importando…' : 'Guardar inventario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
