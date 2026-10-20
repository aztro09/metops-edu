import { describe, expect, it } from 'vitest';
import { puede, transicionValida, registroSchema } from './index';

describe('RBAC', () => {
  it('el alumno no puede asignar ni gestionar usuarios', () => {
    expect(puede(['ALUMNO'], 'ticket:asignar')).toBe(false);
    expect(puede(['ALUMNO'], 'usuarios:gestionar')).toBe(false);
  });
  it('el administrador puede asignar', () => {
    expect(puede(['ADMINISTRADOR'], 'ticket:asignar')).toBe(true);
  });
  it('con varios roles basta uno', () => {
    expect(puede(['ALUMNO', 'TECNICO'], 'ticket:tomar')).toBe(true);
  });
});

describe('flujo de estados', () => {
  it('Cerrado solo desde Resuelto (RN-02)', () => {
    expect(transicionValida('RESUELTO', 'CERRADO')).toBe(true);
    expect(transicionValida('ABIERTO', 'CERRADO')).toBe(false);
    expect(transicionValida('EN_PROCESO', 'CERRADO')).toBe(false);
  });
});

describe('validación de registro', () => {
  it('rechaza una contraseña débil', () => {
    const r = registroSchema.safeParse({
      claveInstitucional: '2020630001', nombre: 'Ana', apellidos: 'Pérez',
      correo: 'ana@example.com', password: 'corta', rol: 'ALUMNO',
    });
    expect(r.success).toBe(false);
  });
});
