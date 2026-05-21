const User = require('../models/User');
const {
  issueLoginTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  publicUser
} = require('../utils/tokenService');

async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'email exists' });
    const user = await User.create({ name, email, password, role: 'user' });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const { accessToken, refreshToken } = await issueLoginTokens(user);
    return res.json({ token: accessToken, accessToken, refreshToken, user: publicUser(user) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
    const rotated = await rotateRefreshToken(refreshToken);
    return res.json({
      token: rotated.accessToken,
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      user: publicUser(rotated.user)
    });
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

async function me(req, res) {
  const userId = req.user && (req.user._id || req.user.id);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const user = await User.findById(userId).select('-password');
  return res.json({ user: publicUser(user) });
}

async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await revokeRefreshToken(refreshToken, 'logout');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login, refresh, me, logout };
