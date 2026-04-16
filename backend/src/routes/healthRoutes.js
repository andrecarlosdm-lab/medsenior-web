const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const result = await db.query('select now() as db_time');
    res.json({ ok: true, service: 'medsenior-backend', dbTime: result.rows[0].db_time });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
