// ── B6: API key pool encryption helper ──
//
// Used by routes/apikeys.js to encrypt provider API keys before storing them,
// and will be needed by the API-agent worker (routes/chat.js) to decrypt a
// key at the moment it's actually used for a request. Exporting both
// encrypt() and decrypt() here — rather than duplicating this logic in
// chat.js — is the coordination point mentioned in the brief: the API-agent
// worker should `require('../utils/keyCrypto')` rather than re-implementing
// its own encryption scheme against the same stored data.
//
// Key material: derived from API_KEY_ENCRYPTION_SECRET via SHA-256 (gives a
// full 32-byte key regardless of the input secret's length/format). Falls
// back to JWT_SECRET, then to the same hardcoded fallback string used
// elsewhere in this app, ONLY so the app doesn't crash on boot if unset —
// this fallback path is flagged loudly by B4's env validation at
// server.js boot and at /api/health. Set a dedicated
// API_KEY_ENCRYPTION_SECRET in production; don't reuse JWT_SECRET for both
// token signing and data-at-rest encryption long-term.

const crypto = require('crypto');

const FALLBACK_SECRET = 'sosparkdesign_fallback_secret_change_in_prod';

function getEncryptionKey() {
  const secret =
    process.env.API_KEY_ENCRYPTION_SECRET ||
    process.env.JWT_SECRET ||
    FALLBACK_SECRET;
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes → AES-256
}

// Returns "iv:authTag:ciphertext" (all hex), safe to store as a single string.
function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV, standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

function decrypt(payload) {
  const [ivHex, authTagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Malformed encrypted payload');
  }
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
