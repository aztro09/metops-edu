import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { registroSchema } from '@metops/shared';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';
import { erroresPorCampo } from '../lib/forms';
import { Boton, Campo, claseInput } from '../components/ui';

const vacio = { claveInstitucional: '', nombre: '', apellidos: '', correo: '', password: '', rol: 'ALUMNO' };

export function Registro() {
  const { registrar } = useAuth();
  const [d, setD] = useState(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState<{ requiereAprobacion: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = (k: keyof typeof vacio) => ({
    value: d[k],
    onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }),
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = registroSchema.safeParse(d);
    if (!r.success) return setErrores(erroresPorCampo(r.error));
    setErrores({});
    setEnviando(true);
    try {
      setListo(await registrar(r.data));
    } catch (err) {
      setErrores({ _: err instanceof ApiError ? err.message : 'No se pudo crear la cuenta' });
    } finally {
      setEnviando(false);
    }
  }

  if (listo)
    return (
      <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-6 text-center">
        <h1 className="text-[32px] font-semibold tracking-tight">Cuenta creada</h1>
        <p className="text-[17px] text-mute">
          {listo.requiereAprobacion
            ? 'Un administrador debe aprobar tu cuenta de docente antes de que puedas entrar.'
            : 'Ya puedes iniciar sesión.'}
        </p>
        <Link to="/login" className="text-brand">Ir a iniciar sesión</Link>
      </main>
    );

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-6 py-10">
      <h1 className="text-center text-[32px] font-semibold tracking-tight">Crear cuenta</h1>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <Campo etiqueta="Soy" error={errores.rol}>
          <select className={claseInput} {...campo('rol')}>
            <option value="ALUMNO">Alumno</option>
            <option value="DOCENTE">Docente</option>
          </select>
        </Campo>
        <Campo etiqueta="Boleta o número de empleado" error={errores.claveInstitucional}>
          <input className={claseInput} {...campo('claveInstitucional')} />
        </Campo>
        <Campo etiqueta="Nombre(s)" error={errores.nombre}><input className={claseInput} {...campo('nombre')} /></Campo>
        <Campo etiqueta="Apellidos" error={errores.apellidos}><input className={claseInput} {...campo('apellidos')} /></Campo>
        <Campo etiqueta="Correo" error={errores.correo}>
          <input className={claseInput} type="email" autoComplete="email" {...campo('correo')} />
        </Campo>
        <Campo etiqueta="Contraseña" error={errores.password} ayuda="Mínimo 10 caracteres, con mayúscula, minúscula y número.">
          <input className={claseInput} type="password" autoComplete="new-password" {...campo('password')} />
        </Campo>
        {errores._ && <p role="alert" className="text-sm text-danger">{errores._}</p>}
        <Boton type="submit" disabled={enviando}>{enviando ? 'Creando…' : 'Crear cuenta'}</Boton>
      </form>
      <p className="text-center text-sm text-mute">
        ¿Ya tienes cuenta? <Link to="/login" className="text-brand">Inicia sesión</Link>
      </p>
    </main>
  );
}
