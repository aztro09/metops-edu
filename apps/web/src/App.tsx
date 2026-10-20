import { Navigate, Route, Routes } from 'react-router-dom';
import { RequierePermiso, RequiereSesion } from './auth/Guards';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { Registro } from './pages/Registro';
import { Dashboard } from './pages/Dashboard';
import { NuevoTicket } from './pages/NuevoTicket';
import { Tickets } from './pages/Tickets';
import { TicketDetalle } from './pages/TicketDetalle';
import { Usuarios } from './pages/Usuarios';
import { Analitica } from './pages/Analitica';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
      <Route element={<RequiereSesion />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/nuevo" element={<NuevoTicket />} />
          <Route path="tickets/:id" element={<TicketDetalle />} />
          <Route element={<RequierePermiso permiso="analitica:ver" />}>
            <Route path="analitica" element={<Analitica />} />
          </Route>
          <Route element={<RequierePermiso permiso="usuarios:gestionar" />}>
            <Route path="admin/usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
