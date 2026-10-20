import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRIORIDADES, TRANSICIONES, type EstadoNombre } from '@metops/shared';
import { useAuth } from '../auth/AuthProvider';
import { api, get, obtenerBlob, patch, post } from '../lib/api';
import { ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, fechaHora, tamanoLegible } from '../lib/format';
import type { Comentario, Pagina, TicketDetalle as Detalle, Usuario } from '../lib/tipos';
import { useSalaTicket } from '../hooks/useSalaTicket';
import { Boton, Cargando, ErrorCarga, EstadoPill, PrioridadPill, Tarjeta, claseInput, useToast } from '../components/ui';

const FINALES: EstadoNombre[] = ['RESUELTO', 'CERRADO'];

export function TicketDetalle() {
  const id = Number(useParams().id);
  const { usuario, puede } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [extra, setExtra] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState('');
  const [interno, setInterno] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [panel, setPanel] = useState<null | 'reabrir' | 'escalar' | 'solicitar'>(null);
  const [tecnicoId, setTecnicoId] = useState('');

  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => get<{ ticket: Detalle }>(`/tickets/${id}`) });
  const t = q.data?.ticket;
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['ticket', id] });
    void qc.invalidateQueries({ queryKey: ['tickets'] });
  };

  // Mensajes: los cargados por REST + los que llegan en vivo (sin duplicados).
  const mensajes = useMemo(() => {
    const m = new Map<number, Comentario>();
    for (const c of [...(t?.comentarios ?? []), ...extra]) m.set(c.id, c);
    return [...m.values()].sort((a, b) => a.id - b.id);
  }, [t?.comentarios, extra]);

  const { presentes, socket } = useSalaTicket(id, () => mensajes.at(-1)?.id ?? 0, {
    mensaje: (c) => setExtra((e) => [...e, c]),
    actualizado: refrescar,
  });

  const staff = puede('ticket:ver-todos');
  const admin = puede('ticket:asignar');
  const tecnicos = useQuery({
    queryKey: ['tecnicos'], enabled: admin,
    queryFn: () => get<Pagina<Usuario>>('/users?rol=TECNICO&activo=true&pageSize=100'),
  });

  const accion = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => { setPanel(null); setMotivo(''); refrescar(); },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo completar la acción', 'error'),
  });

  if (q.isLoading) return <Cargando />;
  if (q.isError || !t) return <ErrorCarga error={q.error ?? new Error('Ticket no encontrado')} reintentar={() => q.refetch()} />;

  const final = FINALES.includes(t.estado);
  const esDueno = t.reportante?.id === usuario?.id;
  const esMio = t.asignado?.id === usuario?.id;
  const puedeCambiar = puede('ticket:cambiar-estado') && (admin || esMio) && !final;
  const siguientes = TRANSICIONES[t.estado].filter((s) => s !== 'CERRADO');

  async function enviarMensaje(e: FormEvent) {
    e.preventDefault();
    const contenido = texto.trim();
    if (!contenido) return;
    const esInterno = staff && interno;
    if (socket?.connected) {
      socket.emit('chat:message', { ticketId: id, contenido, esInterno }, (r: { ok: boolean; error?: { mensaje: string } }) => {
        if (!r.ok) toast(r.error?.mensaje ?? 'No se pudo enviar', 'error');
        else setTexto('');
      });
    } else {
      // Sin conexión en vivo: el mismo comentario se guarda por REST.
      await api(`/tickets/${id}/comentarios`, { method: 'POST', body: JSON.stringify({ contenido, esInterno }) });
      setTexto('');
      refrescar();
    }
  }

  async function verEvidencia(evId: number) {
    const url = URL.createObjectURL(await obtenerBlob(`/evidencias/${evId}`));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <>
      <div className="grid gap-2">
        <Link to="/tickets" className="text-sm text-brand">← Tickets</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">{t.folio}</h1>
          <PrioridadPill prioridad={t.prioridad} />
          <EstadoPill estado={t.estado} />
        </div>
        <p className="text-[19px]">{t.titulo}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-5">
          <Tarjeta className="grid gap-4">
            <p className="whitespace-pre-wrap">{t.descripcion}</p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-mute">Ubicación</dt><dd>{t.espacio.edificio.codigo} · {t.espacio.codigo} — {t.espacio.nombre}</dd></div>
              <div><dt className="text-mute">Categoría</dt><dd>{t.categoria.nombre}</dd></div>
              <div><dt className="text-mute">Reportó</dt><dd>{t.reportante?.nombreCompleto}</dd></div>
              <div><dt className="text-mute">Técnico</dt><dd>{t.asignado?.nombreCompleto ?? 'Sin asignar'}</dd></div>
              <div><dt className="text-mute">Creado</dt><dd>{fechaHora(t.creadoAt)}</dd></div>
              {t.duplicados > 0 && <div><dt className="text-mute">Reportes duplicados</dt><dd>{t.duplicados}</dd></div>}
            </dl>
            {t.evidencias.length > 0 && (
              <div className="grid gap-2">
                <h2 className="text-sm font-medium">Evidencias</h2>
                {t.evidencias.map((ev) => (
                  <button key={ev.id} type="button" className="text-left text-sm text-brand" onClick={() => void verEvidencia(ev.id)}>
                    {ev.nombreArchivo} <span className="text-mute">({tamanoLegible(ev.tamanoBytes)})</span>
                  </button>
                ))}
              </div>
            )}
          </Tarjeta>

          <Tarjeta className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[19px] font-semibold">Conversación</h2>
              {presentes.length > 0 && (
                <span className="text-sm text-mute" aria-live="polite">
                  Viendo ahora: {presentes.map((p) => p.nombre).join(', ')}
                </span>
              )}
            </div>
            <ul className="grid gap-3">
              {mensajes.length === 0 && <li className="text-sm text-mute">Aún no hay mensajes.</li>}
              {mensajes.map((c) => (
                <li key={c.id} className={`rounded-2xl p-3 text-sm ${c.esInterno ? 'border border-dashed border-ink bg-white' : 'bg-white'}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-mute">
                    <b className="text-ink">{c.autorNombre}</b>{fechaHora(c.creadoAt)}
                    {c.esInterno && <span className="rounded-full bg-ink px-2 py-0.5 text-white">Nota interna</span>}
                  </div>
                  <p className="whitespace-pre-wrap">{c.contenido}</p>
                </li>
              ))}
            </ul>
            <form onSubmit={enviarMensaje} className="grid gap-3">
              <textarea aria-label="Mensaje" className={`${claseInput} min-h-20 py-3`} maxLength={2000} value={texto}
                placeholder="Escribe un mensaje…" onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviarMensaje(e as unknown as FormEvent); } }} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {staff
                  ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} /> Nota interna (solo personal)</label>
                  : <span />}
                <Boton type="submit" disabled={!texto.trim()}>Enviar</Boton>
              </div>
            </form>
          </Tarjeta>
        </div>

        <div className="grid content-start gap-5">
          <Tarjeta className="grid gap-3">
            <h2 className="text-[19px] font-semibold">Acciones</h2>

            {puede('ticket:tomar') && !t.asignado && !final && (
              <Boton onClick={() => accion.mutate(() => post(`/tickets/${id}/tomar`))}>Tomar ticket</Boton>
            )}

            {admin && !final && (
              <div className="grid gap-2">
                <select aria-label="Técnico" className={claseInput} value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                  <option value="">Asignar a…</option>
                  {tecnicos.data?.items.map((u) => <option key={u.id} value={u.id}>{u.nombre} {u.apellidos}</option>)}
                </select>
                <Boton variante="secundario" disabled={!tecnicoId} onClick={() => accion.mutate(() => patch(`/tickets/${id}/asignacion`, { tecnicoId: Number(tecnicoId) }))}>
                  {t.asignado ? 'Reasignar' : 'Asignar'}
                </Boton>
              </div>
            )}

            {puedeCambiar && siguientes.map((s) => (
              <Boton key={s} variante="secundario" onClick={() => accion.mutate(() => patch(`/tickets/${id}/estado`, { estado: s }))}>
                Pasar a {ETIQUETA_ESTADO[s]}
              </Boton>
            ))}

            {t.estado === 'RESUELTO' && (esDueno || admin) && (
              <Boton onClick={() => accion.mutate(() => patch(`/tickets/${id}/estado`, { estado: 'CERRADO' }))}>Confirmar y cerrar</Boton>
            )}

            {admin && !final && (
              <label className="grid gap-1 text-sm">
                <span className="text-mute">Prioridad</span>
                <select className={claseInput} value={t.prioridad} onChange={(e) => accion.mutate(() => patch(`/tickets/${id}`, { prioridad: e.target.value }))}>
                  {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
                </select>
              </label>
            )}

            {puede('ticket:escalar') && (admin || esMio) && !final && <Boton variante="fantasma" onClick={() => setPanel('escalar')}>Escalar…</Boton>}
            {admin && final && <Boton variante="fantasma" onClick={() => setPanel('reabrir')}>Reabrir…</Boton>}
            {!admin && esDueno && final && <Boton variante="fantasma" onClick={() => setPanel('solicitar')}>Solicitar reapertura…</Boton>}

            {panel && (
              <div className="grid gap-2">
                <textarea aria-label="Motivo" className={`${claseInput} min-h-20 py-3`} placeholder="Motivo (mínimo 5 caracteres)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <div className="flex gap-2">
                  <Boton variante="secundario" onClick={() => setPanel(null)}>Cancelar</Boton>
                  <Boton disabled={motivo.trim().length < 5} onClick={() => accion.mutate(() =>
                    panel === 'reabrir' ? post(`/tickets/${id}/reabrir`, { motivo })
                    : panel === 'escalar' ? post(`/tickets/${id}/escalar`, { motivo })
                    : post(`/tickets/${id}/comentarios`, { contenido: `Solicito reabrir este ticket: ${motivo}`, esInterno: false }))}>
                    Confirmar
                  </Boton>
                </div>
              </div>
            )}
          </Tarjeta>

          <Tarjeta className="grid gap-3">
            <h2 className="text-[19px] font-semibold">Historial</h2>
            <ol className="grid gap-3 text-sm">
              {t.historial.map((h) => (
                <li key={h.id}>
                  <b>{h.accion.replaceAll('_', ' ').toLowerCase()}</b>
                  {h.estadoNuevo && <> → {ETIQUETA_ESTADO[h.estadoNuevo]}</>}
                  <div className="text-xs text-mute">{h.usuario} · {fechaHora(h.creadoAt)}</div>
                </li>
              ))}
            </ol>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
