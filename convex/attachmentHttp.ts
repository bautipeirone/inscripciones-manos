import { ConvexError } from 'convex/values';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  validateAttachments,
  validateAttachmentContent,
} from '../src/attachments';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};
export const preflight = httpAction(
  async () => new Response(null, { status: 204, headers: corsHeaders }),
);
export const submit = httpAction(async (ctx, request) => {
  const stored: Id<'_storage'>[] = [];
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_ATTACHMENTS * MAX_ATTACHMENT_BYTES + 256 * 1024)
      throw new ConvexError('El envío supera el tamaño máximo permitido.');
    const form = await new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: bytes,
    }).formData();
    const raw = form.get('registration');
    if (typeof raw !== 'string')
      throw new ConvexError('Revisá los datos de inscripción.');
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new ConvexError('Revisá los datos de inscripción.');
    }
    // Convex validators check the JSON shape, then domain rules check availability and consent.
    await ctx.runQuery(internal.registrations.validateSubmission, { input });
    const values = form.getAll('attachments');
    if (values.some((file) => typeof file === 'string'))
      throw new ConvexError('Revisá los documentos adjuntos.');
    const files = values as File[];
    const metadata = files.map((file) => ({
      name: file.name,
      contentType: file.type,
      size: file.size,
    }));
    try {
      validateAttachments(metadata);
      for (const file of files) await validateAttachmentContent(file);
    } catch (error) {
      throw new ConvexError((error as Error).message);
    }
    const attachments = [];
    for (const [index, file] of files.entries()) {
      const storageId = await ctx.storage.store(file);
      stored.push(storageId);
      attachments.push({ ...metadata[index], storageId });
    }
    // Revalidate availability and capacity atomically after the upload.
    const result = await ctx.runMutation(
      internal.registrations.submitWithAttachments,
      { input, attachments },
    );
    return Response.json(result, { headers: corsHeaders });
  } catch (error) {
    for (const storageId of stored) await ctx.storage.delete(storageId);
    const message =
      error instanceof ConvexError && typeof error.data === 'string'
        ? error.data
        : 'No pudimos guardar la inscripción y los documentos. Revisá el formulario y volvé a intentar.';
    return Response.json(
      { error: message },
      { status: 400, headers: corsHeaders },
    );
  }
});
export const download = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const file = await ctx.runQuery(internal.registrations.attachmentForAdmin, {
      id: url.searchParams.get('id') as Id<'registrations'>,
      index: Number(url.searchParams.get('index')),
    });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob)
      return new Response('No encontramos el documento.', {
        status: 404,
        headers: corsHeaders,
      });
    return new Response(blob, {
      headers: {
        ...corsHeaders,
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('No pudimos acceder al documento.', {
      status: 403,
      headers: corsHeaders,
    });
  }
});
