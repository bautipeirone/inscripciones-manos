import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { submit, download, preflight } from './attachmentHttp';
const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/inscriptions', method: 'POST', handler: submit });
http.route({ path: '/inscriptions', method: 'OPTIONS', handler: preflight });
http.route({ path: '/inscription-document', method: 'GET', handler: download });
http.route({
  path: '/inscription-document',
  method: 'OPTIONS',
  handler: preflight,
});
export default http;
