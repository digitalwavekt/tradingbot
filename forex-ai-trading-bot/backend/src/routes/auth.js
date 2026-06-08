const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { User, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { authenticate, authorize } = require('../middleware/auth');
const {
  issueLoginTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  publicUser
} = require('../utils/tokenService');

// FIX: login schema — no min() on password (old users with shorter passwords can still login)
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register schema (admin-created users) — strict password rules
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(12).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/)
    .messages({
      'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character'
    }),
  name: Joi.string().min(2).required(),
  role: Joi.string().valid('admin', 'subadmin', 'user', 'auditor').optional()
});

// Public registration — same rules, no role field
const publicRegisterSchema = registerSchema.fork(['role'], schema => schema.forbidden());

// Admin-only: create user with any role
router.post('/register', authenticate, authorize(['super_admin', 'admin']), async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, name, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const user = await User.create({ email, password, name, role: role || 'user' });

    await AuditLog.create({
      action: 'USER_CREATE', userId: req.user._id, userEmail: req.user.email,
      details: { createdUser: email, role: role || 'user' },
      severity: 'INFO', ipAddress: req.ip
    });

    res.status(201).json({ message: 'User created', user: publicUser(user) });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Public self-registration — role always 'user'
router.post('/public-register', async (req, res) => {
  try {
    const { error } = publicRegisterSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, name } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const user = await User.create({ email, password, name, role: 'user' });
    await AuditLog.create({
      action: 'USER_SELF_REGISTER',
      userId: user._id,
      userEmail: user.email,
      details: { role: 'user' },
      severity: 'INFO',
      ipAddress: req.ip
    });

    res.status(201).json({ message: 'User created', user: publicUser(user) });
  } catch (error) {
    logger.error(`Public registration error: ${error.message}`);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.isLocked()) return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      await user.save();
      await AuditLog.create({
        action: 'LOGIN', userEmail: email,
        details: { success: false, attempts: user.loginAttempts },
        severity: 'WARNING', ipAddress: req.ip
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login — reset lock state
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    const { accessToken, refreshToken } = await issueLoginTokens(user);

    await AuditLog.create({
      action: 'LOGIN', userId: user._id, userEmail: user.email,
      details: { success: true }, severity: 'INFO', ipAddress: req.ip
    });

    res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      user: publicUser(user)
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    const rotated = await rotateRefreshToken(refreshToken);
    res.json({
      token: rotated.accessToken,
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      user: publicUser(rotated.user)
    });
  } catch (error) {
    logger.warn(`Token refresh failed: ${error.message}`);
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      _id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      lastLogin: req.user.lastLogin,
      isActive: req.user.isActive
    }
  });
});

// Logout — revoke this refresh token
router.post('/logout', authenticate, async (req, res) => {
  try {
    if (req.body?.refreshToken) {
      await revokeRefreshToken(req.body.refreshToken, 'logout');
    }
    await AuditLog.create({
      action: 'LOGOUT',
      userId: req.user._id,
      userEmail: req.user.email,
      details: { success: true },
      severity: 'INFO',
      ipAddress: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Logout all sessions
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await revokeAllUserTokens(req.user.id, 'logout_all');
    await AuditLog.create({
      action: 'LOGOUT_ALL',
      userId: req.user._id,
      userEmail: req.user.email,
      details: { success: true },
      severity: 'INFO',
      ipAddress: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Logout all failed' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword required' });
    }
    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ error: 'Current password incorrect' });

    // Validate new password strength
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
    if (!strongPassword.test(newPassword)) {
      return res.status(400).json({
        error: 'New password must be 12+ chars with uppercase, lowercase, number, and special character'
      });
    }

    user.password = newPassword;
    await user.save();

    await AuditLog.create({
      action: 'USER_UPDATE', userId: user._id, userEmail: user.email,
      details: { action: 'password_changed' }, severity: 'INFO', ipAddress: req.ip
    });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Password change failed' });
  }
});

module.exports = router;
