const { User } = require('../models');
const logger = require('../utils/logger');
const { verifyAccessToken, publicUser } = require('../utils/tokenService');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const match = typeof authHeader === 'string' && authHeader.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
    if (!match) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    const token = match[1];
    const decoded = verifyAccessToken(token);
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    const userId = decoded.userId || decoded.sub;
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    req.user = publicUser(user);
    req.auth = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    logger.error(`Auth middleware error: ${error.message}`);
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role !== 'super_admin' && !roles.includes(req.user.role)) {
      logger.warn(`Unauthorized access by ${req.user.email} for roles: ${roles.join(', ')}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
