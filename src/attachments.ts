export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png';
export type Attachment = { name: string; contentType: string; size: number };
const extensions: Record<string, RegExp> = {
  'application/pdf': /\.pdf$/i,
  'image/jpeg': /\.jpe?g$/i,
  'image/png': /\.png$/i,
};
export function validateAttachments(files: Attachment[]) {
  if (files.length > MAX_ATTACHMENTS)
    throw new Error('Podés adjuntar hasta 3 documentos.');
  for (const file of files) {
    if (
      !file.name.trim() ||
      file.name.length > 120 ||
      /[\x00-\x1f\x7f/\\]/.test(file.name)
    )
      throw new Error(
        'Usá nombres de archivo de hasta 120 caracteres, sin barras ni caracteres de control.',
      );
    if (!extensions[file.contentType]?.test(file.name))
      throw new Error('Solo se admiten documentos PDF e imágenes JPEG o PNG.');
    if (
      !Number.isInteger(file.size) ||
      file.size <= 0 ||
      file.size > MAX_ATTACHMENT_BYTES
    )
      throw new Error(
        'Cada documento debe tener contenido y pesar hasta 5 MB.',
      );
  }
}
export async function validateAttachmentContent(file: Blob) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signatures: Record<string, number[]> = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  };
  if (!signatures[file.type]?.every((byte, index) => bytes[index] === byte))
    throw new Error(
      'El contenido del documento no coincide con su formato PDF, JPEG o PNG.',
    );
}
