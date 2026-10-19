//creacion de roles y estadios
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
  for
}
