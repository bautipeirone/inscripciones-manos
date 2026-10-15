import { useState, type ReactNode } from 'react';
import { useData } from './data';
import { Brand, Modal, errorMessage } from './ui';

// Branding and shell adapted from ~/manos/src/components/{header,footer}.tsx.
export function SiteHeader({ children }: { children?: ReactNode }) {
  const data = useData();
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <nav aria-label="Navegación principal">
            {children ?? <a href="/">Inicio</a>}
            {data.participant ? (
              <>
                <button
                  className="nav-link"
                  onClick={() => setAccountOpen(true)}
                >
                  Mi cuenta
                </button>
                <button
                  className="nav-link"
                  onClick={() => void data.signOut()}
                >
                  Cerrar sesión
                </button>
              </>
            ) : (
              <button className="nav-link" onClick={() => setAccountOpen(true)}>
                Ingresar
              </button>
            )}
          </nav>
        </div>
      </header>
      <div className="container site-branding">
        <Brand />
      </div>
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </>
  );
}

function AccountModal({ onClose }: { onClose: () => void }) {
  const data = useData();
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'profile'>(
    data.participant ? 'profile' : 'signIn',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title =
    mode === 'signIn'
      ? 'Ingresar'
      : mode === 'signUp'
        ? 'Crear cuenta'
        : 'Mis datos';
  return (
    <Modal title={title} onClose={onClose}>
      {mode !== 'profile' && (
        <form
          className="registration-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            const form = new FormData(event.currentTarget);
            try {
              if (mode === 'signIn')
                await data.signIn(
                  String(form.get('email')),
                  String(form.get('password')),
                );
              else
                await data.signUp(
                  String(form.get('name')),
                  String(form.get('email')),
                  String(form.get('password')),
                );
              onClose();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === 'signUp' && (
            <label>
              Nombre y apellido *
              <input name="name" autoComplete="name" required minLength={2} />
            </label>
          )}
          <label>
            Email *
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Contraseña *
            <input
              name="password"
              type="password"
              autoComplete={
                mode === 'signIn' ? 'current-password' : 'new-password'
              }
              required
              minLength={8}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button full-width" disabled={busy}>
            {busy
              ? 'Guardando…'
              : mode === 'signIn'
                ? 'Ingresar'
                : 'Crear cuenta'}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          >
            {mode === 'signIn'
              ? '¿Todavía no tenés cuenta? Creala'
              : 'Ya tengo una cuenta'}
          </button>
        </form>
      )}
      {mode === 'profile' && data.participant && (
        <form
          className="registration-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            const form = new FormData(event.currentTarget);
            try {
              await data.saveParticipant({
                name: String(form.get('name')),
                email: String(form.get('email')),
                phone: String(form.get('phone')),
              });
              onClose();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="muted small">
            Estos datos se completan automáticamente en tus inscripciones.
          </p>
          <label>
            Nombre y apellido *
            <input name="name" defaultValue={data.participant.name} required />
          </label>
          <label>
            Email *
            <input
              name="email"
              type="email"
              defaultValue={data.participant.email}
              required
            />
          </label>
          <label>
            Teléfono <span className="optional">(opcional)</span>
            <input
              name="phone"
              type="tel"
              defaultValue={data.participant.phone}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button full-width" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar datos'}
          </button>
        </form>
      )}
    </Modal>
  );
}

export function SiteFooter() {
  const { demo } = useData();
  const [privacy, setPrivacy] = useState(false);
  return (
    <>
      <footer className="site-footer">
        <div className="container footer-inner">
          <p>
            © {new Date().getFullYear()} Proyecto Manos a la Obra – Pastoral
            Universitaria de Rosario
          </p>
          <div className="footer-links">
            <a
              href="https://www.morosario.com.ar"
              target="_blank"
              rel="noopener noreferrer"
            >
              morosario.com.ar
            </a>
            <button onClick={() => setPrivacy(true)}>
              Privacidad de tus datos
            </button>
          </div>
        </div>
      </footer>
      {privacy && (
        <Modal
          title="Privacidad de tus datos"
          onClose={() => setPrivacy(false)}
        >
          <div className="prose">
            <p>
              Guardamos tu nombre, email, teléfono (si lo compartís) y las
              respuestas que enviás para organizar la actividad a la que te
              inscribís.
            </p>
            <p>
              También guardamos los documentos que adjuntás, como comprobantes
              de pago o transferencia. Solo el equipo puede descargarlos y se
              eliminan junto con la inscripción.
            </p>
            <p>
              Solo el Equipo de Inscripciones puede consultar las inscripciones.
              Usamos tu email para evitar registros duplicados en una misma
              actividad. No mostramos públicamente tus datos.
            </p>
            <p>
              Si necesitás corregir o eliminar una inscripción, contactá al
              Equipo de Inscripciones por el canal que te compartió este
              formulario.
            </p>
            {demo && (
              <p>
                <strong>Esta es una demostración:</strong> los datos se guardan
                solo en este navegador. Usá datos ficticios.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
