'use strict';

const jwt = require('jsonwebtoken');

// En produccion define JWT_SECRET como variable de entorno.
const SECRET = process.env.JWT_SECRET || 'mercadito-dev-secret-change-me';
const EXPIRES_IN = '12h';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// Verifica el token del header Authorization: Bearer <token>
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesion expirada o invalida' });
  }
}

// Restringe una ruta a ciertos roles. 'admin' siempre pasa.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'No tienes permiso para esta accion' });
  };
}

module.exports = { signToken, authRequired, requireRole, SECRET };
