require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function seedAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    const adminName = process.env.ADMIN_NAME || 'Super Admin';
    const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!mongoUri) throw new Error('MONGO_URI is required');
    if (!adminEmail) throw new Error('ADMIN_EMAIL is required');
    if (!adminPassword || adminPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD is required and must be at least 12 characters');
    }

    await mongoose.connect(mongoUri);

    // FIX: Use upsert instead of deleteMany — never wipe existing admins
    // Only create if not exists; if exists, update name only (never overwrite password blindly)
    const existing = await User.findOne({ email: adminEmail });

    if (existing) {
      existing.name = adminName;
      existing.role = 'super_admin';
      existing.isActive = true;
      // Only update password if FORCE_SEED_PASSWORD=true is set explicitly
      if (process.env.FORCE_SEED_PASSWORD === 'true') {
        existing.password = adminPassword;
        console.log('Password updated (FORCE_SEED_PASSWORD=true)');
      }
      await existing.save();
      console.log(`Updated existing super admin: ${existing.email} (${existing._id})`);
    } else {
      const admin = await User.create({
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        role: 'super_admin',
        isActive: true
      });
      console.log(`Created super admin: ${admin.email} (${admin._id})`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(`Admin seeding failed: ${error.message}`);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
}

seedAdmin();
