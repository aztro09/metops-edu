import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Campana } from './Campana';

const enlace = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'font-semibold text-ink' : 'text-mute hover:text-ink';

export function AppLayout() {
  const { usuario, puede, logout } = useAuth();
  const navegar = useNavigate();
  const iniciales = `${usuario?.nombre[0] ?? ''}${usuario?.apellidos[0] ?? ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-white">
      <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-hairline px-5 py-4 sm:px-10">
        <span className="text-[17px] font-semibold tracking-tight">MetOps EDU</span>
        <nav aria-label="Principal" className="flex flex-1 flex-wrap gap-x-7 gap-y-2 text-sm">
          <NavLink to="/" end className={enlace}>Inicio</NavLink>
          <NavLink to="/tickets" className={enlace}>Tickets</NavLink>
          {puede('analitica:ver') && <NavLink to="/analitica" className={enlace}>Analítica</NavLink>}
          {puede('usuarios:gestionar') && <NavLink to="/admin/usuarios" className={enlace}>Usuarios</NavLink>}
        </nav>
        <div className="flex items-center gap-4 text-sm text-mute">
          <Campana />
          <span
            title={`${usuario?.nombre} ${usuario?.apellidos}`}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white"
          >
            {iniciales}
          </span>
          <button
            type="button"
            className="min-h-11 px-2 hover:text-ink"
            onClick={async () => {
              await logout();
              navegar('/login');
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1160px] gap-7 px-5 py-10 sm:px-10 sm:py-12">
        <Outlet />
      </main>
    </div>
  );
}
