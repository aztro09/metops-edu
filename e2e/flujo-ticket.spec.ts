import { expect, test, type Browser, type Page } from '@playwright/test';

const PASS_DEMO = 'Demo.Password.123';

async function entrar(browser: Browser, correo: string, password = PASS_DEMO): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Correo o clave institucional').fill(correo);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL('/');
  return page;
}

// PS-05: flujo completo entre cuatro personas.
test('alumno reporta → admin asigna y conversa → técnico resuelve → alumno cierra', async ({ browser }) => {
  const alumno = await entrar(browser, 'alumno@metops.local');
  await alumno.goto('/tickets/nuevo');
  await alumno.getByLabel('Edificio').selectOption({ index: 1 });
  await alumno.getByLabel('Espacio').selectOption({ index: 1 });
  await alumno.getByRole('button', { name: 'Continuar' }).click();
  await alumno.getByLabel('Categoría').selectOption({ index: 1 });
  await alumno.getByLabel('Título').fill('Proyector no enciende en el aula');
  await alumno.getByLabel('Descripción').fill('Desde la mañana el proyector no da señal ni enciende.');
  await alumno.getByRole('button', { name: 'Continuar' }).click(); // evidencia (opcional)
  await alumno.getByRole('button', { name: 'Continuar' }).click();
  await alumno.getByRole('button', { name: 'Enviar ticket' }).click();
  await alumno.waitForURL(/\/tickets\/\d+$/);

  const admin = await entrar(browser, process.env.ADMIN_CORREO ?? 'admin@metops.local',process.env.ADMIN_PASSWORD ?? 'Cambiar.Esta.Clave.123');
  await admin.goto(alumno.url());
  await admin.getByLabel('Técnico').selectOption({ label: 'Tomás Técnico' });
  await admin.getByRole('button', { name: 'Asignar', exact: true }).click();
  await expect(admin.getByText('Tomás Técnico').first()).toBeVisible();

  // Nota interna: la ve el personal, NO el alumno (RN-06).
  await admin.getByLabel('Mensaje').fill('Revisar la lámpara del proyector');
  await admin.getByLabel('Nota interna').check();
  await admin.getByRole('button', { name: 'Enviar' }).click();
  await admin.getByLabel('Nota interna').uncheck();
  await admin.getByLabel('Mensaje').fill('Ya viene el técnico');
  await admin.getByRole('button', { name: 'Enviar' }).click();

  // El alumno lo recibe EN VIVO, sin recargar (PS-24).
  await expect(alumno.getByText('Ya viene el técnico')).toBeVisible();
  await expect(alumno.getByText('Revisar la lámpara del proyector')).toHaveCount(0);

  const tecnico = await entrar(browser, 'tecnico@metops.local');
  await tecnico.goto(alumno.url());
  await tecnico.getByRole('button', { name: 'Pasar a En proceso' }).click();
  await tecnico.getByRole('button', { name: 'Pasar a Resuelto' }).click();

  await alumno.reload();
  await alumno.getByRole('button', { name: 'Confirmar y cerrar' }).click();
  await expect(alumno.getByText('Cerrado').first()).toBeVisible();
});
