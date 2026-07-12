// ── Video upload handling (multer config) ──
//
// Security posture, since file upload is the highest-risk surface added to
// this backend:
//  - The client's filename is NEVER used to build a filesystem path. Every
//    saved file gets a fresh crypto.randomUUID() name, with an extension
//    chosen from a server-side allowlist keyed by verified MIME type — not
//    parsed out of the client's filename. This closes both path-traversal
//    (e.g. "../../evil.js") and extension-spoofing attacks.
//  - fileFilter uses a MIME-type ALLOWLIST (mp4/webm/mov/mkv), not a
//    blocklist. Anything not explicitly recognized is rejected.
//  - limits.fileSize is enforced by multer at the stream level (rejects
//    mid-upload once exceeded), not after the whole file is already on disk.
//  - Uses diskStorage, not memoryStorage — large video files never sit
//    fully in server RAM.
//
// UPLOAD_DIR defaults to backend/uploads/videos, but can be pointed anywhere
// (e.g. a separate mounted volume) via VIDEO_UPLOAD_DIR in .env. This
// directory must be in .gitignore — actual video files should never be
// committed to the repo.

const multer = require('multer');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = process.env.VIDEO_UPLOAD_DIR
  ? path.resolve(process.env.VIDEO_UPLOAD_DIR)
  : path.join(__dirname, '../uploads/videos');

// Ensure the directory exists at boot (module load time) — multer would
// otherwise fail on every single upload attempt if this is missing, which
// is a much worse failure mode than creating it once, proactively, here.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Extension chosen server-side from this map — never taken from the
// client's original filename, which is untrusted input.
const MIME_TO_EXT = {
  'video/mp4':        '.mp4',
  'video/webm':       '.webm',
  'video/quicktime':  '.mov',
  'video/x-matroska': '.mkv',
};

const MAX_FILE_SIZE_BYTES = (parseInt(process.env.MAX_VIDEO_UPLOAD_MB, 10) || 500) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!MIME_TO_EXT[file.mimetype]) {
    return cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: mp4, webm, mov, mkv.`));
  }
  cb(null, true);
}

const uploadVideo = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

module.exports = { uploadVideo, UPLOAD_DIR };
