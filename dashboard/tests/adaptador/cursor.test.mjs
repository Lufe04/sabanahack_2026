// Prueba agregada al integrar el adaptador: el cursor de GET /api/events debe ser numérico.
// Con `ORDER BY seq` sobre el alias `seq::text`, el registro 10 quedaba antes que el 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { makeRepository } from '../../src/lib/cultivos/adaptador/repository.mjs';
import { validate } from '../../src/lib/cultivos/adaptador/validation.mjs';

test('el cursor pagina en orden numérico con más de 9 registros', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(await readFile(new URL('./001_cultivos.sql', import.meta.url), 'utf8'));
  await pg.exec("INSERT INTO cultivos_lotes VALUES('L01','Norte')");
  const pool = { query: (...a) => pg.query(...a), connect: async () => ({ query: (...a) => pg.query(...a), release() {} }) };
  const repo = makeRepository(pool);
  for (let i = 0; i < 25; i++) {
    const e = { id: randomUUID(), schema_version: 2, type: 'observation', captured_at: '2026-10-24T15:00:00Z', mission: 'Cursor', model_version: 'experimental-v5',
      scores: { alternaria: 0.02, botrytis: 0.03, sana: 0.93, trips: 0.02 }, alert: false, capture_mode: 'periodic', photo_mime: null, photo_base64: null,
      route_context: { inspection_id: randomUUID(), plan_id: randomUUID(), lot_id: 'L01', waypoint_id: randomUUID(), location: null }, location: null };
    await repo.save(validate(e));
  }
  const vistos = [];
  let after = '0';
  for (let pagina = 0; pagina < 5; pagina++) {
    const { registros, siguiente } = await repo.list(after);
    if (!registros.length) break;
    vistos.push(...registros.map((r) => Number(r.seq)));
    assert.equal(siguiente, registros.at(-1).seq);
    after = siguiente;
  }
  assert.deepEqual(vistos, [...vistos].sort((a, b) => a - b), 'orden numérico');
  assert.equal(new Set(vistos).size, 25, 'sin repetidos ni saltos');
  await pg.close();
});
