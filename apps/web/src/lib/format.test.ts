import { describe, expect, it } from 'vitest';
import { duracionHoras, nivelCalor } from './format';

describe('formato', () => {
  it('duración legible', () => {
    expect(duracionHoras(null)).toBe('—');
    expect(duracionHoras(0.5)).toBe('30 min');
    expect(duracionHoras(5.4)).toBe('5.4 h');
    expect(duracionHoras(72)).toBe('3.0 d');
  });
  it('rangos del mapa de calor', () => {
    expect([0, 1, 3, 4, 6, 7, 12].map(nivelCalor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});
