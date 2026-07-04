#!/usr/bin/env node
// ── backend/scripts/checkAdmin.js ──
//
// Standalone diagnostic for the exact symptom of ensureDefaultAdmin()
// appearing to never have run: connects to MongoDB directly (same .env
// config server.js uses), reports how many Admin documents exist and their
// username/role/active status (NEVER the password hash), and optionally
// force-seeds the default admin — but ONLY when the collection is
// genuinely empty, to avoid ever creating a duplicate or conflicting
// account.
//
// Usage (run from the repo root):
//   node backend/scripts/checkAdmin.js            — diagnose only, no writes
//   node backend/scripts/checkAdmin.js --seed      — diagnose, and create the
//                                                     default admin IF AND ONLY
//                                                     IF the collection is empty
//
// This does not start the Express app or touch any other collection.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dns = require('dns');
// Same network requirement as server.js — the mongodb+srv:// SRV lookup
// fails on this deployment's ISP without it. Keep in sync with server.js.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const { Admin } = require('../models');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sosparkdesign';
const SEED_FLAG = process.argv.includes('--seed');

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'soaspark2024';

function maskUri(uri) {
  // Never print a real password to the terminal, even though this is a
  // local diagnostic script — good hygiene in case the output gets pasted
  // somewhere later.
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

async function main() {
  console.log('SoSpark Admin diagnostic\n');
  console.log('Connecting to:', maskUri(MONGO_URI));

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 10000,
    family: 4,
  });
  console.log('Connected.\n');

  const count = await Admin.countDocuments();
  console.log(`Admin documents found: ${count}`);

  if (count > 0) {
    const admins = await Admin.find().select('username role active createdAt').lean();
    console.log('\nExisting admin accounts:');
    admins.forEach(a => {
      console.log(
        `  - username: ${a.username}` +
        `  | role: ${a.role}` +
        `  | active: ${a.active !== false}` + // matches the schema default (undefined counts as active)
        `  | created: ${a.createdAt ? a.createdAt.toISOString() : 'unknown'}`
      );
    });
    console.log('');
  }

  if (count === 0) {
    console.log('\nThe Admin collection is EMPTY. This confirms ensureDefaultAdmin()');
    console.log('never successfully created an account on this database.\n');

    if (SEED_FLAG) {
      console.log(`--seed flag provided. Creating default admin (${DEFAULT_USERNAME} / ${DEFAULT_PASSWORD})...`);
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
      await Admin.create({ username: DEFAULT_USERNAME, passwordHash, role: 'super_admin' });
      console.log('✅  Default admin created. You should be able to log in now.');
    } else {
      console.log('Re-run with --seed to create it:');
      console.log('  node backend/scripts/checkAdmin.js --seed');
    }
  } else if (SEED_FLAG) {
    console.log('--seed flag provided, but admin account(s) already exist —');
    console.log('refusing to reseed, to avoid creating a duplicate or conflicting account.');
    console.log('');
    console.log('If an existing admin has the wrong active/role state (see the list above),');
    console.log('that needs a targeted fix rather than a reseed — this script intentionally');
    console.log('does not modify existing accounts. Let me know what you see above and I can');
    console.log('build a specific, narrow fix for that exact state rather than guessing.');
  } else {
    console.log('\nAt least one admin account already exists (see list above). If login is');
    console.log('still failing, the account state above (active/role) is the next thing to');
    console.log('check — a false "active: false" or unexpected role would explain a 401 that');
    console.log('has nothing to do with password correctness.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Error:', err.message);
  console.error('(Connection or query failed — check MONGODB_URI in .env and that the DNS override above matches server.js.)');
  process.exit(1);
});
