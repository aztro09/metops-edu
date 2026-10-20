import { Link } from 'react-router-dom';
import { fecha } from '../lib/format';
import type { TicketLista } from '../lib/tipos';
import { EstadoPill, PrioridadPill, Vacio } from './ui';

/** Tabla de tickets; en pantallas angostas se desplaza horizontalmente. */
export function TablaTickets({ items, vacio = 'No hay tickets para mostrar' }: { items: TicketLista[]; vacio?: string }) {
  if (items.length === 0) return <Vacio texto={vacio} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-mute">
          <tr>
            <th className="py-2 pr-4 font-medium">Folio</th>
            <th className="py-2 pr-4 font-medium">Título</th>
            <th className="py-2 pr-4 font-medium">Espacio</th>
            <th className="py-2 pr-4 font-medium">Prioridad</th>
            <th className="py-2 pr-4 font-medium">Estado</th>
            <th className="py-2 font-medium">Creado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-t border-line">
              <td className="py-3 pr-4 font-medium">
                <Link to={`/tickets/${t.id}`} className="text-brand">{t.folio}</Link>
              </td>
              <td className="max-w-[260px] truncate py-3 pr-4">{t.titulo}</td>
              <td className="py-3 pr-4 text-mute">{t.espacio.edificio.codigo} · {t.espacio.codigo}</td>
              <td className="py-3 pr-4"><PrioridadPill prioridad={t.prioridad} /></td>
              <td className="py-3 pr-4"><EstadoPill estado={t.estado} /></td>
              <td className="py-3 text-mute">{fecha(t.creadoAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
