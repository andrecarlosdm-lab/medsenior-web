const { verifyToken } = require('../utils/jwt');
const HttpError = require('../utils/httpError');

function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Token de autenticação ausente ou inválido.');
    }

    req.auth = verifyToken(token);
    next();
  } catch (error) {
    next(error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError'
      ? new HttpError(401, 'Token inválido ou expirado.')
      : error);
  }
}

function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new HttpError(401, 'Usuário não autenticado.'));
    }

    if (!roles.includes(req.auth.role)) {
      return next(new HttpError(403, 'Acesso negado para este perfil.'));
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorize
};
