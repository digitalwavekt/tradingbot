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

    const deleted = await User.deleteMany({
      $or: [
        { role: { $in: ['super_admin', 'admin'] } },
        { email: adminEmail }
      ]
    });

    const admin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'super_admin',
      isActive: true
    });

    console.log(`Deleted old admin records: ${deleted.deletedCount}`);
    console.log(`Seeded super admin: ${admin.email} (${admin._id})`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(`Admin seeding failed: ${error.message}`);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
}

seedAdmin();
