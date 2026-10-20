//creacion de roles y estadios
import { create } from 'domain';
import {createPrisma} from '../src/core/db';
import {hashPassword} from '../src/core/security';

const prisma = createPrisma(process.env.DATA_URL!);

async function user(d: {key: string, name: string; surname: string; email: string; password: string; roles: string[]}){
  const roles = await prisma.rol.findMany({where: {name: {in: d.roles}}});
  const exists = await prisma.user.findUnique({where: {email: d.email}});

  if(exists) return exists;

  return prisma.user.create({
    data: {
      passwordInstitucional: d.key, name: d.name, surname: d.surname, email: d.email,
      passwordHash: await hashPassword(d.password), active: true,
      roles: {create: roles.map((r) => ({roleId: roles.id})},
    },
  });
}

async function main(){
  //administrador
  await user({
    key: process.env.ADMIN_KEY ?? 'ADMIN1', name: 'Administrator', surname: 'MetOps', email: (process.env.ADMIN_EMAIL ?? 'admin@metops/local').toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? 'admin2639.metops', roles: ['ADMINISTRADOR'],
  });

  //categorias
  const categories: [string, string][] = [
    ['Proyector', 'MEDIA'], ['Red / Wi-Fi', 'ALTA'], ['Computadora', 'MEDIA'], ['Impresora', 'BAJA'],    ['Mobiliario / Instalaciones', 'BAJA'], ['Disponibilidad de espacio', 'MEDIA'], ['Software', 'BAJA'],
  ];
  for (const [name, suggestedPriority] of categories){
    await prisma.category.upsert({ where: {name}, update: {}, create: {name, suggestedPriority}});
  }

  //datos ejemplo
  if (process.env.NODE_ENV !== 'production'){
    const pass = 'prueba.demo2639';
    await user({key: 'TEC1', name: 'David', surname: 'Rodriguez', email: 'tecnico1@metops.local', password: pass, roles:['TECNICO']});
    await user({ key: '2022630276', name: 'Andres', surname: 'Galicia', email: 'alumno@metops.local', password: pass, roles: ['ALUMNO'] });
    await user({ key: 'DOC1', name: 'Diego', surname: 'Docente', email: 'docente@metops.local', password: pass, roles: ['DOCENTE'] });

    const bu = await prisma.building.upsert({where: {code: 'E2'}, update:{}, create: {code: 'E2', name: 'Edificio 2'}});

    const spaces = [
      { code: 'A-201', name: 'Salón A-201', type: 'SALON', x: 0, y: 0 },
      { code: 'A-202', name: 'Salón A-202', type: 'SALON', x: 1, y: 0 },
      { code: 'A-203', name: 'Salón A-203', type: 'SALON', x: 2, y: 0 },
      { code: 'A-204', name: 'Salón A-204', type: 'SALON', x: 3, y: 0 },
      { code: 'LAB1', name: 'Laboratorio 1', type: 'LABORATORIO', x: 0, y: 1 },
      { code: 'LAB2', name: 'Laboratorio 2', type: 'LABORATORIO', x: 1, y: 1 },
      { code: 'LAB3', name: 'Laboratorio 3', type: 'LABORATORIO', x: 2, y: 1 },
    ];
    for(const s of spaces){
      const spa = await prisma.space.upsert({
        where:{ buildingId_code: {buildingId: bu.id, code: s.code}}, update:{},
        create:{ buildingId: bu.id, code: s.code, name: s.name, type: s.type, floor: 0, mapX: s.x, mapY: s.y},
      });
      await prisma.equipment.upsert({
        where: { inventoryTag: 'PRY-${s.code}'}, update:{},
        create: {spaceId: spa.id, type: 'PROYECTOR', inventoryTag: 'PRY-${s.code}', type: 'PROYECTOR', description: 'Proyector'},
      });
    }
  }
  console.log('Seed completed');
}

main().finally(() => prisma.$disconnect());