import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { errorMessage } from './ui';

const labels = {
  pending: 'Pendiente de envío',
  waiting: 'En cola de envío',
  queued: 'En cola de envío',
  sent: 'Enviado al proveedor',
  delivered: 'Entregado',
  delivery_delayed: 'Entrega demorada; el proveedor sigue intentando',
  bounced: 'Rebotado',
  failed: 'No se pudo enviar',
  cancelled: 'Cancelado',
  unknown: 'Estado de entrega no disponible',
};

export function ConfirmationEmail({
  registrationId,
  disabled,
}: {
  registrationId: string;
  disabled: boolean;
}) {
  const delivery = useQuery(api.emails.status, {
    registrationId: registrationId as Id<'registrations'>,
  });
  const retry = useMutation(api.emails.retry);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="notice">
      <h4>Correo de inscripción</h4>
      <p role="status">
        {delivery === undefined
          ? 'Consultando el envío…'
          : delivery === null
            ? 'Esta inscripción es anterior al envío de correos.'
            : labels[delivery.state]}
      </p>
      {delivery?.complained && (
        <p>El destinatario marcó el correo como spam.</p>
      )}
      {delivery?.error && <p className="small">{delivery.error}</p>}
      {delivery?.state === 'failed' && !delivery.canRetry && (
        <p className="small">
          El resultado del envío requiere revisión en el proveedor antes de
          intentar otro envío.
        </p>
      )}
      {!!delivery?.attempts && (
        <p className="muted small">Intentos de envío: {delivery.attempts}</p>
      )}
      {delivery?.canRetry && (
        <button
          className="button button-outline button-small"
          disabled={disabled || retrying}
          onClick={async () => {
            setRetrying(true);
            setError('');
            try {
              await retry({
                registrationId: registrationId as Id<'registrations'>,
              });
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setRetrying(false);
            }
          }}
        >
          {retrying ? 'Reintentando…' : 'Reintentar correo'}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
