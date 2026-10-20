import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crearUsuarioSchema, ROLES, type Rol } from '@metops/shared';
import { consulta, get, patch, post } from '../lib/api';
import { erroresPorCampo } from '../lib/forms';
import type { Pagina, Usuario } from '../lib/tipos';
import { Boton, Campo, Cargando, ErrorCarga, Tarjeta, Titulo, claseInput, useToast } from '../components/ui';

export function Usuarios() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rol, setRol] = useState('');
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ claveInstitucional: '', nombre: '', apellidos: '', correo: '', password: '', roles: ['TECNICO'] as Rol[] });
  const [errores, setErrores] = useState<Record<string, string>>({});

  const lista = useQuery({
    queryKey: ['usuarios', q, rol],
    queryFn: () => get<Pagina<Usuario>>(`/users${consulta({ q, rol, pageSize: 50 })}`),
  });
  const guardar = useMutation({
    mutationFn: (c: { id: number; cambios: Partial<{ activo: boolean; roles: Rol[] }> }) => patch(`/users/${c.id}`, c.cambios),
    onSuccess: () => { setEditando(null); void qc.invalidateQueries({ queryKey: ['usuarios'] }); toast('Cambios guardados', 'ok'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'),
  });

  async function crear(e: FormEvent) {
    e.preventDefault();
    const r = crearUsuarioSchema.safeParse(f);
    if (!r.success) return setErrores(erroresPorCampo(r.error));
    try {
      await post('/users', r.data);
      setNuevo(false); setErrores({});
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast('Usuario creado', 'ok');
    } catch (err) { setErrores({ _: err instanceof Error ? err.message : 'No se pudo crear' }); }
  }
  const alternar = (r: Rol, lista: Rol[], set: (v: Rol[]) => void) => set(lista.includes(r) ? lista.filter((x) => x !== r) : [...lista, r]);

  return (
    <>
      <Titulo titulo="Usuarios" subtitulo="Cuentas y roles.">
        <Boton onClick={() => setNuevo((v) => !v)}>{nuevo ? 'Cerrar' : 'Nuevo usuario'}</Boton>
      </Titulo>

      {nuevo && (
        <Tarjeta>
          <form onSubmit={crear} noValidate className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <Campo etiqueta="Clave institucional" error={errores.claveInstitucional}><input className={claseInput} value={f.claveInstitucional} onChange={(e) => setF({ ...f, claveInstitucional: e.target.value })} /></Campo>
            <Campo etiqueta="Correo" error={errores.correo}><input className={claseInput} type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></Campo>
            <Campo etiqueta="Nombre(s)" error={errores.nombre}><input className={claseInput} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Apellidos" error={errores.apellidos}><input className={claseInput} value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
            <Campo etiqueta="Contraseña inicial" error={errores.password}><input className={claseInput} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Campo>
            <fieldset className="grid gap-1 text-sm"><legend className="mb-1 font-medium">Roles</legend>
              {ROLES.map((r) => <label key={r} className="flex items-center gap-2"><input type="checkbox" checked={f.roles.includes(r)} onChange={() => alternar(r, f.roles, (v) => setF({ ...f, roles: v }))} /> {r}</label>)}
              {errores.roles && <span role="alert" className="text-danger">{errores.roles}</span>}
            </fieldset>
            {errores._ && <p role="alert" className="text-sm text-danger sm:col-span-2">{errores._}</p>}
            <div className="sm:col-span-2"><Boton type="submit">Crear usuario</Boton></div>
          </form>
        </Tarjeta>
      )}

      <div className="flex flex-wrap gap-3">
        <input aria-label="Buscar" placeholder="Nombre, correo o clave" className={`${claseInput} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Rol" className={`${claseInput} max-w-44`} value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {lista.isLoading ? <Cargando /> : lista.isError ? <ErrorCarga error={lista.error} reintentar={() => lista.refetch()} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-mute"><tr><th className="py-2 pr-4 font-medium">Nombre</th><th className="py-2 pr-4 font-medium">Correo</th><th className="py-2 pr-4 font-medium">Roles</th><th className="py-2 pr-4 font-medium">Estado</th><th /></tr></thead>
            <tbody>
              {lista.data?.items.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-3 pr-4">{u.nombre} {u.apellidos}</td>
                  <td className="py-3 pr-4 text-mute">{u.correo}</td>
                  <td className="py-3 pr-4">{u.roles.join(', ')}</td>
                  <td className="py-3 pr-4">{u.activo ? 'Activo' : 'Inactivo / pendiente'}</td>
                  <td className="py-3 text-right">
                    <button type="button" className="min-h-11 px-2 text-brand" onClick={() => { setEditando(u); setRoles(u.roles); }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <Tarjeta className="grid max-w-md gap-4">
          <h2 className="text-[19px] font-semibold">{editando.nombre} {editando.apellidos}</h2>
          <fieldset className="grid gap-1 text-sm"><legend className="mb-1 font-medium">Roles</legend>
            {ROLES.map((r) => <label key={r} className="flex items-center gap-2"><input type="checkbox" checked={roles.includes(r)} onChange={() => alternar(r, roles, setRoles)} /> {r}</label>)}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Boton disabled={roles.length === 0} onClick={() => guardar.mutate({ id: editando.id, cambios: { roles } })}>Guardar roles</Boton>
            <Boton variante={editando.activo ? 'peligro' : 'secundario'}
              onClick={() => { if (!editando.activo || window.confirm('¿Desactivar esta cuenta? Se cerrarán sus sesiones.')) guardar.mutate({ id: editando.id, cambios: { activo: !editando.activo } }); }}>
              {editando.activo ? 'Desactivar' : 'Activar'}
            </Boton>
            <Boton variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Boton>
          </div>
        </Tarjeta>
      )}
    </>
  );
}
