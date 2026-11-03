import { useState, type ReactNode } from 'react';
import { useData } from './data';
import { Brand, Modal } from './ui';

// Branding and shell adapted from ~/manos/src/components/{header,footer}.tsx.
// The public site links only to participant accounts, never to the admin area.
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <nav aria-label="Navegación principal">
            {children ?? <a href="/">Inicio</a>}
          </nav>
        </div>
      </header>
      <div className="container site-branding">
        <Brand />
      </div>
    </>
  );
}

export function AccountNav() {
  const data = useData();
  return (
    <>
      <a href="/">Inicio</a>
      {data.loading ? null : data.account ? (
        <>
          <a href="/account">Mi cuenta</a>
          <button className="nav-link" onClick={() => void data.signOut()}>
            Cerrar sesión
          </button>
        </>
      ) : (
        <a href="/account">Ingresar</a>
      )}
    </>
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
              La cuenta es opcional. Si creás una, guardamos tu email de acceso,
              tu contraseña cifrada y los datos que elijas completar: contacto,
              estudios, contacto de emergencia y los barrios a los que fuiste.
              Las inscripciones que hacés con tu cuenta forman tu historial, y
              el equipo usa estos datos para organizar los grupos de cada
              barrio.
            </p>
            <p>
              Solo el Equipo de Inscripciones puede consultar las inscripciones.
              Usamos tu email para evitar registros duplicados en una misma
              actividad. El equipo puede ver tus inscripciones anteriores para
              organizar las actividades. No mostramos públicamente tus datos.
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
