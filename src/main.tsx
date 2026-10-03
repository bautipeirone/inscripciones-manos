import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { DemoData, LiveData } from './data';
import App from './App';
import { Brand } from './ui';
import './styles.css';

const url = import.meta.env.VITE_CONVEX_URL;
const root = createRoot(document.getElementById('root')!);
if (url) {
  const client = new ConvexReactClient(url);
  root.render(
    <StrictMode>
      <ConvexAuthProvider client={client}>
        <LiveData>
          <App />
        </LiveData>
      </ConvexAuthProvider>
    </StrictMode>,
  );
} else if (import.meta.env.DEV) {
  root.render(
    <StrictMode>
      <DemoData>
        <App />
      </DemoData>
    </StrictMode>,
  );
} else {
  root.render(
    <main className="setup-page">
      <Brand />
      <h1>Estamos preparando el próximo encuentro.</h1>
      <p>
        Las inscripciones todavía no están disponibles. Volvé a visitarnos
        pronto.
      </p>
    </main>,
  );
}
