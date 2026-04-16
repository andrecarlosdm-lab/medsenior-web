const db = require('../config/db');
const { hashPassword } = require('../utils/password');

async function upsertUser({ fullName, username, password, role, providerId = null }) {
  const passwordHash = await hashPassword(password);
  await db.query(`
    insert into app.users (full_name, username, password_hash, role, status, provider_id)
    values ($1, $2, $3, $4, 'ATIVO', $5)
    on conflict (username)
    do update set
      full_name = excluded.full_name,
      password_hash = excluded.password_hash,
      role = excluded.role,
      provider_id = excluded.provider_id,
      status = 'ATIVO',
      updated_at = now()
  `, [fullName, username, passwordHash, role, providerId]);
}

async function runSeed() {
  const providerResult = await db.query(`
    insert into app.providers (code, name, state, city, status)
    values ('P001', 'Prestador Exemplo', 'ES', 'Vitória', 'ATIVO')
    on conflict (code)
    do update set name = excluded.name
    returning id
  `);

  const providerId = providerResult.rows[0].id;

  await upsertUser({
    fullName: 'Operadora',
    username: 'operadora',
    password: 'Operadora@2026',
    role: 'operadora'
  });

  await upsertUser({
    fullName: 'Auditoria',
    username: 'auditoria',
    password: 'Auditoria@2026',
    role: 'auditoria'
  });

  await upsertUser({
    fullName: 'Liderança',
    username: 'lideranca',
    password: 'Lideranca@2026',
    role: 'lideranca'
  });

  await upsertUser({
    fullName: 'Prestador Exemplo',
    username: 'prestador',
    password: 'Prestador@2026',
    role: 'prestador',
    providerId
  });

  const existingRecord = await db.query('select id from app.records where protocol = $1', ['MS-DEMO-0001']);
  if (!existingRecord.rows[0]) {
    await db.query(`
      insert into app.records (
        protocol, patient_name, plan_type, request_type, solicitation, provider_id,
        status, priority, created_by, assist_reg, state, observation
      )
      select 'MS-DEMO-0001', 'Paciente Demonstração', 'Premium', 'Internação', 'Avaliação clínica',
             $1, 'PENDENTE', 'ALTA', u.id, 'OPERADORA', 'ES', 'Registro inicial de demonstração'
      from app.users u
      where u.username = 'operadora'
      limit 1
    `, [providerId]);
  }
}

module.exports = {
  runSeed
};
