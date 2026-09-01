const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.database();

const VERIFY_MS = 12 * 60 * 60 * 1000;
const SESSION_MS = 15 * 60 * 1000;

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cleanId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(value)
    ? value
    : null;
}

exports.startVerification = onRequest(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });

  const installationId = cleanId(req.body?.installation_id);
  if (!installationId) return res.status(400).json({ ok: false, error: 'Invalid installation_id' });

  const sid = randomToken(24);
  const token = randomToken(32);
  const now = Date.now();
  const expiresAt = now + SESSION_MS;
  const deviceHash = hash(installationId);

  await db.ref(`verification/sessions/${sid}`).set({
    device_hash: deviceHash,
    token_hash: hash(token),
    created_at: now,
    expires_at: expiresAt,
    used: false
  });

  // This URL is the GitHub Pages frontend.
  // URLKing can be inserted in front of it later without exposing a secret here.
  const verificationUrl = `https://puremodx.github.io/Verified-account/?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(token)}`;

  res.json({ ok: true, session_id: sid, verification_url: verificationUrl, expires_at: expiresAt });
});

exports.verify = onRequest(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('Method not allowed');

  const sid = String(req.query.sid || req.body?.sid || '');
  const token = String(req.query.token || req.body?.token || '');
  if (!/^[a-f0-9]{48}$/.test(sid) || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send('Invalid verification link.');
  }

  const ref = db.ref(`verification/sessions/${sid}`);
  const snap = await ref.get();
  const session = snap.val();
  if (!session) return res.status(404).send('Verification session not found.');
  if (session.used) return res.status(409).send('This verification link has already been used.');
  if (Date.now() > Number(session.expires_at || 0)) return res.status(410).send('This verification link has expired.');
  if (!crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(String(session.token_hash || '')))) {
    return res.status(403).send('Invalid verification token.');
  }

  const until = Date.now() + VERIFY_MS;
  await db.ref(`verification/devices/${session.device_hash}`).update({
    status: 'verified',
    verified_at: Date.now(),
    verified_until: until
  });
  await ref.update({ used: true, used_at: Date.now() });

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0d0f14;color:white;font:16px Arial;display:grid;place-items:center;min-height:100vh}.c{width:min(90%,420px);padding:32px;border-radius:24px;background:#20242d;text-align:center}.ok{font-size:64px;color:#49dc73}</style><div class="c"><div class="ok">✓</div><h1>Device Verified</h1><p>Your verification is active for <b>12 hours</b>.</p><p>You can return to the app.</p></div>`);
});

exports.checkStatus = onRequest(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });

  const installationId = cleanId(req.body?.installation_id);
  if (!installationId) return res.status(400).json({ ok: false, error: 'Invalid installation_id' });

  const snap = await db.ref(`verification/devices/${hash(installationId)}`).get();
  const data = snap.val() || {};
  const until = Number(data.verified_until || 0);
  const verified = data.status === 'verified' && Date.now() < until;

  res.json({ ok: true, verified, expires_at: verified ? until : 0 });
});