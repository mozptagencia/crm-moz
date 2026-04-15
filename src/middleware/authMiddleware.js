// ============================================================
// Moz CRM · Middleware de autenticação JWT
// Verifica o token em cada rota protegida
// ============================================================
const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  // Token enviado no header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token em falta.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
};
