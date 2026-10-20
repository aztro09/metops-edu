import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../auth/AuthProvider';
import { obtenerToken, renovarSesion } from './api';

const Ctx = createContext<Socket | null>(null);
export const useSocket = () => useContext(Ctx);

/** Abre la conexión en tiempo real SOLO con sesión iniciada y la cierra al salir. */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const usuarioId = usuario?.id;

  useEffect(() => {
    if (!usuarioId) return;
    // `auth` como función: en cada (re)conexión se envía el token de acceso vigente.
    const s = io({ path: '/socket.io', transports: ['websocket'], auth: (cb) => cb({ token: obtenerToken() }) });
    // Si el token venció, se renueva la sesión y se reintenta.
    s.on('connect_error', async (e) => {
      if (e.message === 'NO_AUTENTICADO' && (await renovarSesion())) s.connect();
    });
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [usuarioId]);

  return <Ctx.Provider value={socket}>{children}</Ctx.Provider>;
}
