// k6: 50 usuarios virtuales durante 5 minutos (RNF-01: p95 < 300 ms).
// Uso (PowerShell):  k6 run -e BASE_URL=http://localhost:3000 load/prueba.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '5m',
  thresholds: { http_req_duration: ['p(95)<300'], http_req_failed: ['rate<0.01'] },
};
const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ identificador: 'tecnico@metops.local', password: 'Demo.Password.123' }), { headers: { 'Content-Type': 'application/json' } });
  return { token: r.json('accessToken') };
}
export default function (d) {
  const h = { headers: { Authorization: `Bearer ${d.token}` } };
  const lista = http.get(`${BASE}/api/tickets?pageSize=15`, h);
  check(lista, { 'lista 200': (r) => r.status === 200 });
  check(http.get(`${BASE}/api/analytics/kpis`, h), { 'kpis 200': (r) => r.status === 200 });
  sleep(1);
}
