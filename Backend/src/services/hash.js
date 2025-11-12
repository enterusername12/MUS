const bcrypt = require('bcryptjs');

const hashPassword = (password) =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, (err, hashed) => {
      if (err) reject(err);
      else resolve(hashed);
    });
  });

const comparePassword = (password, hash) =>
  new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (err, match) => {
      if (err) reject(err);
      else resolve(match);
    });
  });

module.exports = {
  hashPassword,
  comparePassword
};