import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstadoPill, PrioridadPill } from './ui';

describe('etiquetas', () => {
  it('la prioridad siempre muestra su texto (no depende solo del color)', () => {
    render(<PrioridadPill prioridad="CRITICA" />);
    expect(screen.getByText('Crítica')).toBeTruthy();
  });
  it('el estado se muestra en español', () => {
    render(<EstadoPill estado="EN_PROCESO" />);
    expect(screen.getByText('En proceso')).toBeTruthy();
  });
});
