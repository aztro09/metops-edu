import { crearPrisma } from '../src/core/db';
import { hashPassword } from '../src/core/seguridad';

const prisma = crearPrisma(process.env.DATABASE_URL!);

async function usuario(d: { clave: string; nombre: string; apellidos: string; correo: string; password: string; roles: string[] }) {
  const roles = await prisma.rol.findMany({ where: { nombre: { in: d.roles } } });
  const existente = await prisma.usuario.findUnique({ where: { correo: d.correo } });
  if (existente) return existente;
  return prisma.usuario.create({
    data: {
      claveInstitucional: d.clave, nombre: d.nombre, apellidos: d.apellidos, correo: d.correo,
      passwordHash: await hashPassword(d.password), activo: true,
      roles: { create: roles.map((r) => ({ rolId: r.id })) },
    },
  });
}

async function main() {
  // ---- Administrador inicial (obligatorio) ----
  await usuario({
    clave: process.env.ADMIN_CLAVE ?? 'ADMIN0001', nombre: 'Administrador', apellidos: 'MetOps',
    correo: (process.env.ADMIN_CORREO ?? 'admin@metops.local').toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? 'Cambiar.Esta.Clave.123', roles: ['ADMINISTRADOR'],
  });

  // ---- Categorías base (ASI 6) ----
  const categorias: [string, string][] = [
    ['Proyector', 'MEDIA'], ['Red / Wi-Fi', 'ALTA'], ['Computadora', 'MEDIA'], ['Impresora', 'BAJA'],
    ['Mobiliario / Instalaciones', 'BAJA'], ['Disponibilidad de espacio', 'MEDIA'], ['Software', 'BAJA'],
  ];
  for (const [nombre, prioridadSugerida] of categorias) {
    await prisma.categoria.upsert({ where: { nombre }, update: {}, create: { nombre, prioridadSugerida } });
  }

  // ---- Solo en desarrollo: datos de ejemplo para probar la interfaz ----
  if (process.env.NODE_ENV !== 'production') {
    const clave = 'Demo.Password.123';
    await usuario({ clave: 'TEC0001', nombre: 'Tomás', apellidos: 'Técnico', correo: 'tecnico@metops.local', password: clave, roles: ['TECNICO'] });
    await usuario({ clave: '2020630001', nombre: 'Ana', apellidos: 'Alumna', correo: 'alumno@metops.local', password: clave, roles: ['ALUMNO'] });
    await usuario({ clave: 'DOC0001', nombre: 'Diego', apellidos: 'Docente', correo: 'docente@metops.local', password: clave, roles: ['DOCENTE'] });

    const ed = await prisma.edificio.upsert({ where: { codigo: 'E2' }, update: {}, create: { codigo: 'E2', nombre: 'Edificio 2' } });
    const espacios = [
      { codigo: 'A-201', nombre: 'Salón A-201', tipo: 'SALON', x: 0, y: 0 },
      { codigo: 'A-202', nombre: 'Salón A-202', tipo: 'SALON', x: 1, y: 0 },
      { codigo: 'A-203', nombre: 'Salón A-203', tipo: 'SALON', x: 2, y: 0 },
      { codigo: 'A-204', nombre: 'Salón A-204', tipo: 'SALON', x: 3, y: 0 },
      { codigo: 'LAB1', nombre: 'Laboratorio 1', tipo: 'LABORATORIO', x: 0, y: 1 },
      { codigo: 'LAB2', nombre: 'Laboratorio 2', tipo: 'LABORATORIO', x: 1, y: 1 },
      { codigo: 'LAB3', nombre: 'Laboratorio 3', tipo: 'LABORATORIO', x: 2, y: 1 },
    ];
    for (const e of espacios) {
      const esp = await prisma.espacio.upsert({
        where: { edificioId_codigo: { edificioId: ed.id, codigo: e.codigo } }, update: {},
        create: { edificioId: ed.id, codigo: e.codigo, nombre: e.nombre, tipo: e.tipo, piso: 0, mapaX: e.x, mapaY: e.y },
      });
      await prisma.equipo.upsert({
        where: { etiquetaInventario: `PRY-${e.codigo}` }, update: {},
        create: { espacioId: esp.id, tipo: 'PROYECTOR', etiquetaInventario: `PRY-${e.codigo}`, descripcion: `Proyector de ${e.nombre}` },
      });
    }
  }
  console.log('Seed completado');
}

main().finally(() => prisma.$disconnect());
