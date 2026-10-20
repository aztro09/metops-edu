import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@metops/shared';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';
import { erroresPorCampo } from '../lib/forms';
import { Boton, Campo, claseInput } from '../components/ui';

export function Login() {
  const { usuario, login } = useAuth();
  const navegar = useNavigate();
  const loc = useLocation() as { state?: { desde?: string } };
  const [datos, setDatos] = useState({ identificador: '', password: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={loc.state?.desde ?? '/'} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = loginSchema.safeParse(datos);
    if (!r.success) return setErrores(erroresPorCampo(r.error));
    setErrores({});
    setEnviando(true);
    try {
      await login(r.data);
      navegar(loc.state?.desde ?? '/', { replace: true });
    } catch (err) {
      // Mensaje genérico: no revela si la cuenta existe (RN de seguridad).
      setErrores({ _: err instanceof ApiError ? err.message : 'No se pudo iniciar sesión' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-8 px-6">
      <div className="grid gap-2 text-center">
        <h1 className="text-[40px] font-semibold tracking-tight">MetOps EDU</h1>
        <p className="text-[17px] text-mute">Reporta y sigue incidentes de tu escuela.</p>
      </div>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <Campo etiqueta="Correo o clave institucional" error={errores.identificador}>
          <input className={claseInput} autoComplete="username" value={datos.identificador}
            onChange={(e) => setDatos({ ...datos, identificador: e.target.value })} />
        </Campo>
        <Campo etiqueta="Contraseña" error={errores.password}>
          <input className={claseInput} type="password" autoComplete="current-password" value={datos.password}
            onChange={(e) => setDatos({ ...datos, password: e.target.value })} />
        </Campo>
        {errores._ && <p role="alert" className="text-sm text-danger">{errores._}</p>}
        <Boton type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Iniciar sesión'}</Boton>
      </form>
      <p className="text-center text-sm text-mute">
        ¿No tienes cuenta? <Link to="/registro" className="text-brand">Regístrate</Link>
      </p>
    </main>
  );
}
