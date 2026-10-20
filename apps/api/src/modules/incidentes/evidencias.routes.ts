import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import { MAX_EVIDENCIAS_POR_TICKET, MIME_EVIDENCIA } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import { sesion, type Guardias } from '../../core/auth';
import { AppError, noEncontrado, solicitudInvalida } from '../../core/errors';
import { registrarHistorial } from '../../core/historial';
import { esDuenoOPersonal } from './dto';

export function rutasEvidencias(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  const { prisma, storage } = ctx;
  const auth = { preHandler: [g.autenticar] };

  // ---------- Subir (RF-16) ----------
  app.post('/tickets/:id/evidencias', auth, async (req, reply) => {
    const u = sesion(req);
    const ticketId = Number((req.params as { id: string }).id);
    const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!t || !esDuenoOPersonal(u.roles, u.id, t.reportanteId)) throw noEncontrado('Ticket no encontrado');

    const cuantas = await prisma.evidencia.count({ where: { ticketId } });
    if (cuantas >= MAX_EVIDENCIAS_POR_TICKET) {
      throw new AppError(409, 'LIMITE_EVIDENCIAS', `Máximo ${MAX_EVIDENCIAS_POR_TICKET} archivos por ticket`);
    }

    const archivo = await req.file();
    if (!archivo) throw solicitudInvalida('SIN_ARCHIVO', 'Adjunta un archivo en el campo "archivo"');
    const datos = await archivo.toBuffer(); // lanza FST_REQ_FILE_TOO_LARGE si excede el límite

    // El tipo se detecta por el CONTENIDO (firma del archivo), nunca por la extensión ni el tipo que declara el cliente.
    const real = await fileTypeFromBuffer(datos);
    if (!real || !(MIME_EVIDENCIA as readonly string[]).includes(real.mime)) {
      throw solicitudInvalida('TIPO_NO_PERMITIDO', 'Solo se permiten imágenes (JPG, PNG, WEBP) y PDF');
    }

    // La clave la genera el servidor; el nombre original solo se guarda como dato.
    const key = `tickets/${ticketId}/${randomUUID()}.${real.ext}`;
    const nombre = path.basename(archivo.filename || 'archivo').slice(0, 255);
    await storage.guardar(key, datos);
    try {
      const e = await prisma.$transaction(async (tx) => {
        const fila = await tx.evidencia.create({
          data: { ticketId, subidoPor: u.id, nombreArchivo: nombre, tipoMime: real.mime, tamanoBytes: datos.length, storageKey: key },
        });
        await registrarHistorial(tx, { ticketId, usuarioId: u.id, accion: 'EVIDENCIA_AGREGADA', detalle: { evidenciaId: fila.id, nombre } });
        return fila;
      });
      return reply.status(201).send({ evidencia: { id: e.id, nombreArchivo: e.nombreArchivo, tipoMime: e.tipoMime, tamanoBytes: e.tamanoBytes } });
    } catch (err) {
      await storage.borrar(key); // no dejar archivos huérfanos si falló la base de datos
      throw err;
    }
  });

  // ---------- Descargar (valida permisos antes de entregar el archivo) ----------
  app.get('/evidencias/:id', auth, async (req, reply) => {
    const u = sesion(req);
    const e = await prisma.evidencia.findUnique({
      where: { id: Number((req.params as { id: string }).id) },
      include: { ticket: { select: { reportanteId: true } } },
    });
    if (!e || !esDuenoOPersonal(u.roles, u.id, e.ticket.reportanteId)) throw noEncontrado('Archivo no encontrado');

    const flujo = await storage.leer(e.storageKey).catch(() => {
      throw noEncontrado('El archivo ya no está disponible');
    });
    const disposicion = e.tipoMime === 'application/pdf' ? 'attachment' : 'inline';
    return reply
      .header('Content-Type', e.tipoMime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, max-age=0')
      .header('Content-Disposition', `${disposicion}; filename*=UTF-8''${encodeURIComponent(e.nombreArchivo)}`)
      .send(flujo);
  });
}
