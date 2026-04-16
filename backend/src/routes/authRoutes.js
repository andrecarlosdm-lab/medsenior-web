const express = require('express');
const authService = require('../services/authService');
const HttpError = require('../utils/httpError');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password, profile } = req.body;

    if (!username || !password || !profile) {
      throw new HttpError(400, 'username, password e profile são obrigatórios.');
    }

    const data = await authService.login({ username, password, profile });
    res.json({ ok: true, ...data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
