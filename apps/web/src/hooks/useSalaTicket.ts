import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../lib/socket';
import type { Comentario } from '../lib/tipos';

interface Presente { usuarioId: number; nombre: string }
interface AckUnir { ok: boolean; presentes?: Presente[]; comentarios?: Comentario[] }

/**
 * Entra a la sala del ticket y recibe mensajes, presencia y cambios en vivo.
 * Al reconectar vuelve a entrar con el último comentario recibido (`desdeId`) y recupera lo que se perdió.
 */
export function useSalaTicket(
  ticketId: number,
  ultimoId: () => number,
  alos: { mensaje: (c: Comentario) => void; actualizado: () => void },
) {
  const socket = useSocket();
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const manejadores = useRef(alos);
  manejadores.current = alos;
  const ultimo = useRef(ultimoId);
  ultimo.current = ultimoId;

  useEffect(() => {
    if (!socket || !Number.isFinite(ticketId)) return;
    let primera = true;
    const unir = () => {
      const desdeId = primera ? undefined : ultimo.current();
      primera = false;
      socket.emit('ticket:join', { ticketId, desdeId }, (r: AckUnir) => {
        if (!r?.ok) return;
        setPresentes(r.presentes ?? []);
        r.comentarios?.forEach((c) => manejadores.current.mensaje(c));
      });
    };
    const alMensaje = (c: Comentario & { ticketId: number }) => { if (c.ticketId === ticketId) manejadores.current.mensaje(c); };
    const alPresencia = (p: { ticketId: number; presentes: Presente[] }) => { if (p.ticketId === ticketId) setPresentes(p.presentes); };
    const alActualizar = (p: { ticketId: number }) => { if (p.ticketId === ticketId) manejadores.current.actualizado(); };

    if (socket.connected) unir();
    socket.on('connect', unir); // también se ejecuta en cada reconexión
    socket.on('chat:message', alMensaje);
    socket.on('presence:update', alPresencia);
    socket.on('ticket:updated', alActualizar);
    return () => {
      socket.emit('ticket:leave', { ticketId });
      socket.off('connect', unir);
      socket.off('chat:message', alMensaje);
      socket.off('presence:update', alPresencia);
      socket.off('ticket:updated', alActualizar);
    };
  }, [socket, ticketId]);

  return { presentes, conectado: !!socket?.connected, socket };
}
