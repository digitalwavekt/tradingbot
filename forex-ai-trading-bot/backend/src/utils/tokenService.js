const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { RefreshToken, User } = require('../models');

const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_EXPIRES_DAYS || 7);
const ISSUER = process.env.JWT_ISSUER || 'tradingbot-api';
const AUDIENCE = process.env.JWT_AUDIENCE || 'tradingbot-client';

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function newFamilyId() {
  return crypto.randomUUID();
}

function assertJwtConfig({ production = process.env.NODE_ENV === 'production' } = {}) {
  const access = getAccessSecret();
  const refresh = getRefreshSecret();
  const weak = value => !value || String(value).length < 32;

  if (production) {
    if (weak(access)) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
    if (weak(refresh)) throw new Error('JWT_REFRESH_SECRET must be at least 32 characters in production');
    if (access === refresh) throw new Error('JWT access and refresh secrets must be different in production');
    if (!process.env.JWT_ISSUER || !process.env.JWT_AUDIENCE) {
      throw new Error('JWT_ISSUER and JWT_AUDIENCE are required in production');
    }
  }

  if (!access || !refresh) throw new Error('JWT secrets are required');
}

function publicUser(user) {
  return {
    id: String(user._id || user.id),
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    lastLogin: user.lastLogin,
    isActive: user.isActive
  };
}

function signAccessToken(user) {
  assertJwtConfig({ production: false });
  return jwt.sign(
    {
      sub: String(user._id || user.id),
      userId: String(user._id || user.id),
      email: user.email,
      role: user.role,
      type: 'access'
    },
    getAccessSecret(),
    { expiresIn: ACCESS_EXPIRES, issuer: ISSUER, audience: AUDIENCE }
  );
}

async function issueRefreshToken(user, familyId = newFamilyId()) {
  assertJwtConfig({ production: false });
  const token = jwt.sign(
    {
      sub: String(user._id || user.id),
      userId: String(user._id || user.id),
      familyId,
      type: 'refresh'
    },
    getRefreshSecret(),
    { expiresIn: `${REFRESH_EXPIRES_DAYS}d`, issuer: ISSUER, audience: AUDIENCE }
  );
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ tokenHash, user: user._id || user.id, familyId, expiresAt });
  return { token, tokenHash, familyId, expiresAt };
}

function verifyAccessToken(token) {
  assertJwtConfig({ production: false });
  return jwt.verify(token, getAccessSecret(), { issuer: ISSUER, audience: AUDIENCE });
}

function verifyRefreshToken(token) {
  assertJwtConfig({ production: false });
  return jwt.verify(token, getRefreshSecret(), { issuer: ISSUER, audience: AUDIENCE });
}

async function revokeTokenFamily(familyId, reason = 'family_revoked') {
  await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: reason }
  );
}

async function rotateRefreshToken(refreshToken) {
  const tokenHash = sha256(refreshToken);
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new Error('Invalid refresh token');
  }

  if (payload.type !== 'refresh' || !payload.familyId) {
    throw new Error('Invalid refresh token type');
  }

  const stored = await RefreshToken.findOne({ tokenHash });
  if (!stored) {
    await revokeTokenFamily(payload.familyId, 'refresh_reuse_or_unknown_token');
    throw new Error('Refresh token reuse detected');
  }

  if (stored.revokedAt || stored.replacedByTokenHash || stored.expiresAt <= new Date()) {
    await revokeTokenFamily(stored.familyId, 'refresh_reuse_detected');
    throw new Error('Refresh token reuse detected');
  }

  const user = await User.findById(stored.user);
  if (!user || !user.isActive) throw new Error('User inactive');

  const accessToken = signAccessToken(user);
  const next = await issueRefreshToken(user, stored.familyId);
  stored.replacedByTokenHash = next.tokenHash;
  stored.revokedAt = new Date();
  stored.revokedReason = 'rotated';
  stored.lastUsedAt = new Date();
  await stored.save();

  return { accessToken, refreshToken: next.token, user };
}

async function revokeRefreshToken(refreshToken, reason = 'logout') {
  if (!refreshToken) return false;
  const tokenHash = sha256(refreshToken);
  const result = await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { revokedAt: new Date(), revokedReason: reason }
  );
  return result.modifiedCount > 0;
}

async function revokeAllUserTokens(userId, reason = 'logout_all') {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: reason }
  );
}

async function issueLoginTokens(user) {
  const accessToken = signAccessToken(user);
  const refresh = await issueRefreshToken(user);
  return { accessToken, refreshToken: refresh.token };
}

module.exports = {
  ACCESS_EXPIRES,
  REFRESH_EXPIRES_DAYS,
  ISSUER,
  AUDIENCE,
  assertJwtConfig,
  sha256,
  publicUser,
  signAccessToken,
  issueLoginTokens,
  verifyAccessToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  revokeTokenFamily
};
