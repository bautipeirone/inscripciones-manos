import { useState, type ReactNode } from 'react';
import { useData } from './data';
import { Brand, Modal } from './ui';

// Branding and shell adapted from ~/manos/src/components/{header,footer}.tsx.
// Authentication links are limited to the private admin area.
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav aria-label="Navegación principal">
          {children ?? <a href="/">Inicio</a>}
        </nav>
      </div>
    </header>
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
