import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { useSocket } from '../lib/socket';
import { fechaHora } from '../lib/format';
import type { Notificacion } from '../lib/tipos';
import { useToast } from './ui';

/** Campana de avisos: contador, lista desplegable y aviso en vivo por WebSocket (RF-22, RF-23). */
export function Campana() {
  const [abierta, setAbierta] = useState(false);
  const qc = useQueryClient();
  const socket = useSocket();
  const toast = useToast();
  const navegar = useNavigate();

  const { data } = useQuery({
    queryKey: ['notificaciones'],
    queryFn: () => get<{ items: Notificacion[]; noLeidas: number }>('/notificaciones'),
  });

  useEffect(() => {
    if (!socket) return;
    const alLlegar = (n: Notificacion) => {
      toast(n.mensaje, 'info');
      void qc.invalidateQueries({ queryKey: ['notificaciones'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    };
    socket.on('notification:new', alLlegar);
    return () => {
      socket.off('notification:new', alLlegar);
    };
  }, [socket, qc, toast]);

  const leerTodas = useMutation({
    mutationFn: () => post('/notificaciones/leer-todas'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
  const leer = useMutation({
    mutationFn: (id: number) => post(`/notificaciones/${id}/leer`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });

  const noLeidas = data?.noLeidas ?? 0;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={abierta}
        aria-label={`Avisos, ${noLeidas} sin leer`}
        className="min-h-11 px-2 hover:text-ink"
        onClick={() => setAbierta((v) => !v)}
      >
        Avisos {noLeidas > 0 && <b className="text-brand">{noLeidas}</b>}
      </button>
      {abierta && (
        <div className="absolute right-0 z-40 mt-1 w-80 rounded-2xl border border-line bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between px-2 pb-2 text-ink">
            <b>Avisos</b>
            <button type="button" className="text-brand" onClick={() => leerTodas.mutate()}>
              Marcar todo como leído
            </button>
          </div>
          <ul className="grid max-h-80 gap-1 overflow-auto">
            {(data?.items ?? []).length === 0 && <li className="px-2 py-6 text-center">Sin avisos</li>}
            {(data?.items ?? []).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left hover:bg-surface ${n.leida ? 'text-mute' : 'text-ink'}`}
                  onClick={() => {
                    leer.mutate(n.id);
                    setAbierta(false);
                    if (n.ticketId) navegar(`/tickets/${n.ticketId}`);
                  }}
                >
                  <span className="block text-sm">{n.mensaje}</span>
                  <span className="text-xs text-mute">{fechaHora(n.creadoAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
