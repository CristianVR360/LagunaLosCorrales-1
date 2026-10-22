const { supabase } = require('../database/supabase');

const authenticateJWT = async (req, res, next) => {
  const headerAuth = req.headers.authorization;
  if (!headerAuth) {
    return res.status(401).json({
      message: 'Authorization header is missing',
    });
  }

  const token = headerAuth.split(' ')[1];

  if (!token || token === 'logout') {
    return res.status(401).json({
      message: 'Token not provided or user logged out',
    });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.warn('authenticateJWT: Supabase rejected token:', error ? error.message : 'no user found');
      return res.status(403).json({
        message: 'JWT invalid or expired',
      });
    }

    // Attach user info to request (default role is ADMIN_ROLE for authenticated dashboard users)
    req.user = {
      userId: user.id,
      email: user.email,
      role: (user.user_metadata && user.user_metadata.role) || 'ADMIN_ROLE'
    };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(403).json({
      message: 'JWT invalid',
    });
  }
};

const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.userId) {
    next();
  } else {
    res.status(403).json({
      message: 'User is not admin',
    });
  }
};

module.exports = {
  authenticateJWT,
  authorizeAdmin,
};
