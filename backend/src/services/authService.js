const db = require('../config/db');
const HttpError = require('../utils/httpError');
const { comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

async function login({ username, password, profile }) {
  const sql = `
    select
      u.id,
      u.full_name,
      u.username,
      u.role,
      u.status,
      u.provider_id,
      p.name as provider_name,
      u.password_hash
    from app.users u
    left join app.providers p on p.id = u.provider_id
    where lower(u.username) = lower($1)
      and u.role = $2
      and u.status = 'ATIVO'
    limit 1
  `;

  const { rows } = await db.query(sql, [username, profile]);
  const user = rows[0];

  if (!user) {
    throw new HttpError(401, 'Usuário, senha ou perfil inválidos.');
  }

  const passwordMatches = await comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    throw new HttpError(401, 'Usuário, senha ou perfil inválidos.');
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    username: user.username,
    providerId: user.provider_id || null
  });

  return {
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      role: user.role,
      status: user.status,
      providerId: user.provider_id,
      providerName: user.provider_name
    }
  };
}

module.exports = {
  login
};
