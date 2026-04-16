const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(String(password), String(hash));
}

module.exports = {
  hashPassword,
  comparePassword
};
