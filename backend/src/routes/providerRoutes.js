const express = require('express');
const db = require('../config/db');
const HttpError = require('../utils/httpError');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('operadora', 'lideranca', 'auditoria'), async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      select id, code, name, cnpj, state, city, contact_name, contact_phone, contact_email, status, notes, created_at, updated_at
      from app.providers
      order by name
    `);
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize('operadora'), async (req, res, next) => {
  try {
    const {
      code,
      name,
      cnpj,
      state,
      city,
      contactName,
      contactPhone,
      contactEmail,
      status = 'ATIVO',
      notes = ''
    } = req.body;

    if (!name) {
      throw new HttpError(400, 'name é obrigatório.');
    }

    const { rows } = await db.query(`
      insert into app.providers (
        code, name, cnpj, state, city, contact_name, contact_phone, contact_email, status, notes
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      returning *
    `, [code, name, cnpj, state, city, contactName, contactPhone, contactEmail, status, notes]);

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return next(new HttpError(409, 'Já existe prestador com esse código ou CNPJ.'));
    }
    return next(error);
  }
});

router.put('/:id', authorize('operadora'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('select * from app.providers where id = $1', [id]);
    const current = existing.rows[0];
    if (!current) {
      throw new HttpError(404, 'Prestador não encontrado.');
    }

    const payload = {
      code: req.body.code ?? current.code,
      name: req.body.name ?? current.name,
      cnpj: req.body.cnpj ?? current.cnpj,
      state: req.body.state ?? current.state,
      city: req.body.city ?? current.city,
      contactName: req.body.contactName ?? current.contact_name,
      contactPhone: req.body.contactPhone ?? current.contact_phone,
      contactEmail: req.body.contactEmail ?? current.contact_email,
      status: req.body.status ?? current.status,
      notes: req.body.notes ?? current.notes
    };

    const { rows } = await db.query(`
      update app.providers
      set code = $2,
          name = $3,
          cnpj = $4,
          state = $5,
          city = $6,
          contact_name = $7,
          contact_phone = $8,
          contact_email = $9,
          status = $10,
          notes = $11,
          updated_at = now()
      where id = $1
      returning *
    `, [
      id,
      payload.code,
      payload.name,
      payload.cnpj,
      payload.state,
      payload.city,
      payload.contactName,
      payload.contactPhone,
      payload.contactEmail,
      payload.status,
      payload.notes
    ]);

    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return next(new HttpError(409, 'Já existe prestador com esse código ou CNPJ.'));
    }
    return next(error);
  }
});

module.exports = router;
