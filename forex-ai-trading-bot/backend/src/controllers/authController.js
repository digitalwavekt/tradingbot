const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES_DAYS = 30;

async function register(req, res) {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'email exists' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash, role: role || 'user' });
    // TODO: restrict register in production (admin-only)
    return res.json({ id: user._id, email: user.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const access = jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
    const refreshToken = jwt.sign({ sub: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_EXPIRES_DAYS}d` });
    await RefreshToken.create({ token: refreshToken, user: user._id, expiresAt: new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 3600 * 1000) });
    return res.json({ accessToken: access, refreshToken });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (!stored) return res.status(401).json({ error: 'invalid refresh token' });
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const access = jwt.sign({ sub: payload.sub }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
    return res.json({ accessToken: access });
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

async function me(req, res) {
  const userId = req.user && req.user.sub;
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const user = await User.findById(userId).select('-password');
  return res.json(user);
}

async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await RefreshToken.deleteOne({ token: refreshToken });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login, refresh, me, logout };
