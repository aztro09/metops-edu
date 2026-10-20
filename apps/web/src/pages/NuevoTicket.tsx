import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { crearTicketSchema, MAX_EVIDENCIAS_POR_TICKET, MIME_EVIDENCIA } from '@metops/shared';
import { api, consulta, get, post } from '../lib/api';
import { erroresPorCampo } from '../lib/forms';
import { tamanoLegible } from '../lib/format';
import type { Categoria, Edificio, Equipo, Espacio } from '../lib/tipos';
import { Boton, Campo, Tarjeta, Titulo, claseInput, useToast } from '../components/ui';

const MAX_MB = 5;
const PASOS = ['Ubicación', 'Detalle', 'Evidencia', 'Confirmar'];
interface Borrador { edificioId: string; espacioId: string; equipoId: string; categoriaId: string; titulo: string; descripcion: string; ticketPadreId: number | null }
const vacio: Borrador = { edificioId: '', espacioId: '', equipoId: '', categoriaId: '', titulo: '', descripcion: '', ticketPadreId: null };
const CLAVE = 'metops:borrador-ticket';

export function NuevoTicket() {
  const navegar = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [paso, setPaso] = useState(0);
  const [d, setD] = useState<Borrador>(() => {
    try { return { ...vacio, ...(JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}') as Partial<Borrador>) }; } catch { return vacio; }
  });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  // El borrador sobrevive a una recarga de la página.
  useEffect(() => { try { sessionStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* sin almacenamiento */ } }, [d]);

  const edificios = useQuery({ queryKey: ['cat', 'edificios'], queryFn: () => get<{ items: Edificio[] }>('/catalogos/edificios') });
  const categorias = useQuery({ queryKey: ['cat', 'categorias'], queryFn: () => get<{ items: Categoria[] }>('/catalogos/categorias') });
  const espacios = useQuery({
    queryKey: ['cat', 'espacios', d.edificioId], enabled: !!d.edificioId,
    queryFn: () => get<{ items: Espacio[] }>(`/catalogos/espacios${consulta({ edificioId: d.edificioId })}`),
  });
  const equipos = useQuery({
    queryKey: ['cat', 'equipos', d.espacioId], enabled: !!d.espacioId,
    queryFn: () => get<{ items: Equipo[] }>(`/catalogos/equipos${consulta({ espacioId: d.espacioId })}`),
  });
  const similares = useQuery({
    queryKey: ['similares', d.espacioId, d.categoriaId, d.equipoId], enabled: !!d.espacioId && paso === 1 && !d.ticketPadreId,
    queryFn: () => get<{ items: { id: number; folio: string; titulo: string; estado: string }[] }>(
      `/tickets/similares${consulta({ espacioId: d.espacioId, categoriaId: d.categoriaId, equipoId: d.equipoId })}`),
  });

  const poner = (k: keyof Borrador, v: string) => setD((x) => ({
    ...x, [k]: v,
    ...(k === 'edificioId' ? { espacioId: '', equipoId: '' } : {}),
    ...(k === 'espacioId' ? { equipoId: '' } : {}),
  }));

  function validarPaso(): boolean {
    const e: Record<string, string> = {};
    if (paso === 0) {
      if (!d.edificioId) e.edificioId = 'Elige un edificio';
      if (!d.espacioId) e.espacioId = 'Elige un espacio';
    }
    if (paso === 1) {
      if (!d.categoriaId) e.categoriaId = 'Elige una categoría';
      if (d.titulo.trim().length < 5) e.titulo = 'Escribe un título de al menos 5 caracteres';
      if (d.descripcion.trim().length < 10) e.descripcion = 'Describe el problema (mínimo 10 caracteres)';
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  function elegirArchivos(lista: FileList | null) {
    const nuevos = [...(lista ?? [])];
    const e: string[] = [];
    const validos = nuevos.filter((f) => {
      if (!(MIME_EVIDENCIA as readonly string[]).includes(f.type)) { e.push(`${f.name}: solo JPG, PNG, WEBP o PDF`); return false; }
      if (f.size > MAX_MB * 1024 * 1024) { e.push(`${f.name}: máximo ${MAX_MB} MB`); return false; }
      return true;
    });
    setArchivos((a) => [...a, ...validos].slice(0, MAX_EVIDENCIAS_POR_TICKET));
    setErrores(e.length ? { archivos: e.join('. ') } : {});
  }

  async function crear() {
    const r = crearTicketSchema.safeParse({
      titulo: d.titulo, descripcion: d.descripcion, categoriaId: Number(d.categoriaId), espacioId: Number(d.espacioId),
      equipoId: d.equipoId ? Number(d.equipoId) : null, ...(d.ticketPadreId ? { ticketPadreId: d.ticketPadreId } : {}),
    });
    if (!r.success) { setErrores(erroresPorCampo(r.error)); return; }
    setEnviando(true);
    try {
      const t = await post<{ id: number; folio: string }>('/tickets', r.data);
      // La evidencia se sube DESPUÉS: si una falla, el ticket ya existe (CU-03, flujo alterno).
      let fallidos = 0;
      for (const f of archivos) {
        const fd = new FormData();
        fd.append('archivo', f);
        try { await api(`/tickets/${t.id}/evidencias`, { method: 'POST', body: fd }); } catch { fallidos++; }
      }
      sessionStorage.removeItem(CLAVE);
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      toast(fallidos ? `Ticket ${t.folio} creado, pero ${fallidos} archivo(s) no se pudieron subir` : `Ticket ${t.folio} creado`, fallidos ? 'info' : 'ok');
      navegar(`/tickets/${t.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo crear el ticket', 'error');
    } finally { setEnviando(false); }
  }

  const nombre = (lista: { id: number; nombre?: string; codigo?: string }[] | undefined, id: string) =>
    lista?.find((x) => String(x.id) === id);

  return (
    <>
      <Titulo titulo="Nuevo ticket" subtitulo="Cuéntanos qué falla y dónde." />
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} aria-current={i === paso ? 'step' : undefined}
            className={`rounded-full px-4 py-1.5 ${i === paso ? 'bg-ink text-white' : i < paso ? 'bg-hairline text-ink' : 'text-mute'}`}>
            {i + 1}. {p}
          </li>
        ))}
      </ol>

      <Tarjeta className="grid max-w-2xl gap-5">
        {paso === 0 && (
          <>
            <Campo etiqueta="Edificio" error={errores.edificioId}>
              <select className={claseInput} value={d.edificioId} onChange={(e) => poner('edificioId', e.target.value)}>
                <option value="">Selecciona…</option>
                {edificios.data?.items.map((x) => <option key={x.id} value={x.id}>{x.codigo} — {x.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Espacio" error={errores.espacioId}>
              <select className={claseInput} value={d.espacioId} disabled={!d.edificioId} onChange={(e) => poner('espacioId', e.target.value)}>
                <option value="">Selecciona…</option>
                {espacios.data?.items.map((x) => <option key={x.id} value={x.id}>{x.codigo} — {x.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Equipo (opcional)">
              <select className={claseInput} value={d.equipoId} disabled={!d.espacioId} onChange={(e) => poner('equipoId', e.target.value)}>
                <option value="">No aplica / no lo sé</option>
                {equipos.data?.items.map((x) => <option key={x.id} value={x.id}>{x.tipo} {x.etiquetaInventario ?? ''}</option>)}
              </select>
            </Campo>
          </>
        )}

        {paso === 1 && (
          <>
            {!!similares.data?.items.length && !d.ticketPadreId && (
              <div role="region" aria-label="Posibles duplicados" className="grid gap-3 rounded-2xl bg-white p-4">
                <b>¿Es alguno de estos incidentes ya reportados?</b>
                {similares.data.items.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span><b>{s.folio}</b> — {s.titulo}</span>
                    <Boton variante="secundario" onClick={() => setD((x) => ({ ...x, ticketPadreId: s.id, titulo: x.titulo || `Mismo problema que ${s.folio}` }))}>
                      Es el mismo, sumarme
                    </Boton>
                  </div>
                ))}
                <p className="text-xs text-mute">Si es distinto, continúa con el formulario.</p>
              </div>
            )}
            {d.ticketPadreId && (
              <p className="rounded-2xl bg-white p-3 text-sm">
                Te sumarás a un incidente existente.{' '}
                <button type="button" className="text-brand" onClick={() => setD((x) => ({ ...x, ticketPadreId: null }))}>Quitar</button>
              </p>
            )}
            <Campo etiqueta="Categoría" error={errores.categoriaId}>
              <select className={claseInput} value={d.categoriaId} onChange={(e) => poner('categoriaId', e.target.value)}>
                <option value="">Selecciona…</option>
                {categorias.data?.items.filter((c) => c.activa).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Título" error={errores.titulo}>
              <input className={claseInput} maxLength={150} value={d.titulo} onChange={(e) => poner('titulo', e.target.value)} />
            </Campo>
            <Campo etiqueta="Descripción" error={errores.descripcion}>
              <textarea className={`${claseInput} min-h-32 py-3`} maxLength={4000} value={d.descripcion} onChange={(e) => poner('descripcion', e.target.value)} />
            </Campo>
          </>
        )}

        {paso === 2 && (
          <>
            <Campo etiqueta={`Evidencia (opcional, hasta ${MAX_EVIDENCIAS_POR_TICKET} archivos de ${MAX_MB} MB)`} error={errores.archivos}>
              <input type="file" multiple accept={MIME_EVIDENCIA.join(',')} className={claseInput} onChange={(e) => { elegirArchivos(e.target.files); e.target.value = ''; }} />
            </Campo>
            <ul className="grid gap-2 text-sm">
              {archivos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                  <span>{f.name} <span className="text-mute">({tamanoLegible(f.size)})</span></span>
                  <button type="button" className="text-brand" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))}>Quitar</button>
                </li>
              ))}
            </ul>
          </>
        )}

        {paso === 3 && (
          <dl className="grid gap-3 text-sm">
            <div><dt className="text-mute">Ubicación</dt><dd>{nombre(edificios.data?.items, d.edificioId)?.codigo} · {nombre(espacios.data?.items, d.espacioId)?.codigo}</dd></div>
            <div><dt className="text-mute">Categoría</dt><dd>{nombre(categorias.data?.items, d.categoriaId)?.nombre}</dd></div>
            <div><dt className="text-mute">Título</dt><dd>{d.titulo}</dd></div>
            <div><dt className="text-mute">Descripción</dt><dd className="whitespace-pre-wrap">{d.descripcion}</dd></div>
            <div><dt className="text-mute">Archivos</dt><dd>{archivos.length}</dd></div>
            {d.ticketPadreId && <div><dt className="text-mute">Duplicado</dt><dd>Te sumas a un incidente existente</dd></div>}
          </dl>
        )}

        <div className="flex justify-between gap-3">
          <Boton variante="secundario" disabled={paso === 0 || enviando} onClick={() => setPaso(paso - 1)}>Atrás</Boton>
          {paso < 3
            ? <Boton onClick={() => validarPaso() && setPaso(paso + 1)}>Continuar</Boton>
            : <Boton disabled={enviando} onClick={crear}>{enviando ? 'Enviando…' : 'Enviar ticket'}</Boton>}
        </div>
      </Tarjeta>
    </>
  );
}
