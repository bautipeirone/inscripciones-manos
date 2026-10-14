import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { submit, download, preflight } from './attachmentHttp';
import { httpAction } from './_generated/server';
import { resendClient } from './emails';
const http = httpRouter();
auth.addHttpRoutes(http);
http.route({
  path: '/resend-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!process.env.RESEND_WEBHOOK_SECRET)
      return new Response('Webhook no configurado.', { status: 503 });
    try {
      return await resendClient().handleResendEventWebhook(ctx, request);
    } catch {
      return new Response('No pudimos procesar el webhook.', { status: 400 });
    }
  }),
});
http.route({ path: '/inscriptions', method: 'POST', handler: submit });
http.route({ path: '/inscriptions', method: 'OPTIONS', handler: preflight });
http.route({ path: '/inscription-document', method: 'GET', handler: download });
http.route({
  path: '/inscription-document',
  method: 'OPTIONS',
  handler: preflight,
});
export default http;
