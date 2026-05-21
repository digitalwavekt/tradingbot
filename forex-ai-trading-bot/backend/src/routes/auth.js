const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const router = express.Router();
const { User, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { authenticate, authorize } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '1h';
const REFRESH_EXPIRES_IN = '7d';

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(12).required()
});

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

router.post('/register', authenticate, authorize(['admin']), async (req, res) => {
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

    res.status(201).json({
      message: 'User created',
      user: { id: user._id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.isLocked()) return res.status(423).json({ error: 'Account locked' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      await AuditLog.create({
        action: 'LOGIN', userEmail: email,
        details: { success: false, attempts: user.loginAttempts },
        severity: 'WARNING', ipAddress: req.ip
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign(
      { userId: user._id, type: 'refresh' },
      JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN }
    );

    await AuditLog.create({
      action: 'LOGIN', userId: user._id, userEmail: user.email,
      details: { success: true }, severity: 'INFO', ipAddress: req.ip
    });

    res.json({
      token, refreshToken,
      user: { id: user._id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') return res.status(403).json({ error: 'Invalid token type' });
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) return res.status(403).json({ error: 'User inactive' });
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token });
  } catch (error) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user._id, email: req.user.email,
      name: req.user.name, role: req.user.role, lastLogin: req.user.lastLogin
    }
  });
});

router.post('/logout', authenticate, async (req, res) => {
  try {
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

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ error: 'Current password incorrect' });
    user.password = newPassword;
    await user.save();
    await AuditLog.create({
      action: 'USER_UPDATE', userId: user._id, userEmail: user.email,
      details: { action: 'password_changed' }, severity: 'INFO', ipAddress: req.ip
    });
    res.json({ message: 'Password changed' });
  } catch (error) {
    res.status(500).json({ error: 'Password change failed' });
  }
});

module.exports = router;
