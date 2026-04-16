const express = require('express');
const db = require('../config/db');
const { hashPassword } = require('../utils/password');
const HttpError = require('../utils/httpError');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('operadora', 'lideranca'), async (req, res, next) => {
  try {
    const role = req.query.role;
    const params = [];
    const conditions = [];

    if (role) {
      params.push(role);
      conditions.push(`u.role = $${params.length}`);
    }

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

    const sql = `
      select u.id, u.full_name, u.username, u.role, u.status, u.notes, u.provider_id,
             p.name as provider_name, u.created_at, u.updated_at
      from app.users u
      left join app.providers p on p.id = u.provider_id
      ${where}
      order by u.role, u.full_name
    `;

    const { rows } = await db.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize('operadora'), async (req, res, next) => {
  try {
    const {
      fullName,
      username,
      password,
      role,
      status = 'ATIVO',
      notes = '',
      providerId = null
    } = req.body;

    if (!fullName || !username || !password || !role) {
      throw new HttpError(400, 'fullName, username, password e role são obrigatórios.');
    }

    if (role === 'prestador' && !providerId) {
      throw new HttpError(400, 'providerId é obrigatório para usuário prestador.');
    }

    const passwordHash = await hashPassword(password);

    const sql = `
      insert into app.users (full_name, username, password_hash, role, status, notes, provider_id)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, full_name, username, role, status, notes, provider_id, created_at, updated_at
    `;

    const { rows } = await db.query(sql, [fullName, username, passwordHash, role, status, notes, providerId]);
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return next(new HttpError(409, 'Já existe um usuário com esse username.'));
    }
    return next(error);
  }
});

router.put('/:id', authorize('operadora'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      username,
      password,
      role,
      status,
      notes,
      providerId
    } = req.body;

    const currentResult = await db.query('select * from app.users where id = $1', [id]);
    const current = currentResult.rows[0];
    if (!current) {
      throw new HttpError(404, 'Usuário não encontrado.');
    }

    const passwordHash = password ? await hashPassword(password) : current.password_hash;

    const sql = `
      update app.users
      set full_name = $2,
          username = $3,
          password_hash = $4,
          role = $5,
          status = $6,
          notes = $7,
          provider_id = $8,
          updated_at = now()
      where id = $1
      returning id, full_name, username, role, status, notes, provider_id, created_at, updated_at
    `;

    const { rows } = await db.query(sql, [
      id,
      fullName ?? current.full_name,
      username ?? current.username,
      passwordHash,
      role ?? current.role,
      status ?? current.status,
      notes ?? current.notes,
      providerId ?? current.provider_id
    ]);

    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return next(new HttpError(409, 'Já existe um usuário com esse username.'));
    }
    return next(error);
  }
});

module.exports = router;
