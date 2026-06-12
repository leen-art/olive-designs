function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not logged in.' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return function(req, res, next) {
    if (!req.session || !req.session.userId) {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Not logged in.' });
      }
      return res.redirect('/login');
    }
    if (req.session.role !== role) {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      return res.status(403).send('Access denied.');
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };