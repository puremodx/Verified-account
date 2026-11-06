const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.database();

const REGION = 'us-central1';
const VERIFY_MS = 12 * 60 * 60 * 1000; // approved access: 12 hours
const SESSION_MS = 15 * 60 * 1000;     // verification link: 15 minutes

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
function randomToken(bytes) {
  return crypto.randomBytes(bytes || 32).toString('hex');
}
function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function cleanId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(value)
    ? value : null;
}
function readBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}
function sendMethodError(res) {
  return res.status(405).json({ ok: false, error: 'POST required' });
}

exports.startVerification = onRequest({ region: REGION }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendMethodError(res);

  try {
    const installationId = cleanId(readBody(req).installation_id);
    if (!installationId) return res.status(400).json({ ok: false, error: 'Invalid installation_id' });

    const sid = randomToken(24);
    const token = randomToken(32);
    const now = Date.now();
    const expiresAt = now + SESSION_MS;
    const deviceHash = hash(installationId);

    await db.ref('verification/sessions/' + sid).set({
      device_hash: deviceHash,
      token_hash: hash(token),
      created_at: now,
      expires_at: expiresAt,
      used: false
    });

    const verificationUrl = 'https://puremodx.github.io/Verified-account/?sid=' +
      encodeURIComponent(sid) + '&token=' + encodeURIComponent(token);

    return res.json({
      ok: true,
      session_id: sid,
      verification_url: verificationUrl,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('startVerification failed', error);
    return res.status(500).json({ ok: false, error: 'Could not start verification' });
  }
});

exports.verify = onRequest({ region: REGION }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendMethodError(res);

  try {
    const body = readBody(req);
    const sid = String(body.sid || '');
    const token = String(body.token || '');
    if (!/^[a-f0-9]{48}$/.test(sid) || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ ok: false, verified: false, error: 'Invalid verification link' });
    }

    const ref = db.ref('verification/sessions/' + sid);
    const initial = await ref.get();
    const session = initial.val();
    if (!session) return res.status(404).json({ ok: false, verified: false, error: 'Session not found' });
    if (session.used) return res.status(409).json({ ok: false, verified: false, error: 'Link already used' });
    if (Date.now() > Number(session.expires_at || 0)) {
      return res.status(410).json({ ok: false, verified: false, error: 'Link expired' });
    }

    const expectedHash = String(session.token_hash || '');
    const actualHash = hash(token);
    const matches = /^[a-f0-9]{64}$/.test(expectedHash) &&
      crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    if (!matches) return res.status(403).json({ ok: false, verified: false, error: 'Invalid token' });

    // Atomically consume the one-time link so two requests cannot approve twice.
    const now = Date.now();
    const consumed = await ref.transaction(current => {
      if (!current || current.used) return;
      if (now > Number(current.expires_at || 0)) return;
      if (String(current.token_hash || '') !== expectedHash) return;
      return Object.assign({}, current, { used: true, used_at: now });
    }, undefined, false);

    if (!consumed.committed) {
      const latest = (await ref.get()).val();
      if (!latest) return res.status(404).json({ ok: false, verified: false, error: 'Session not found' });
      if (latest.used) return res.status(409).json({ ok: false, verified: false, error: 'Link already used' });
      return res.status(410).json({ ok: false, verified: false, error: 'Link expired' });
    }

    const verifiedAt = Date.now();
    const verifiedUntil = verifiedAt + VERIFY_MS;
    await db.ref('verification/devices/' + session.device_hash).update({
      status: 'verified',
      verified_at: verifiedAt,
      verified_until: verifiedUntil,
      last_session_id: sid
    });

    return res.json({ ok: true, verified: true, expires_at: verifiedUntil });
  } catch (error) {
    console.error('verify failed', error);
    return res.status(500).json({ ok: false, verified: false, error: 'Verification service error' });
  }
});

exports.checkStatus = onRequest({ region: REGION }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendMethodError(res);

  try {
    const installationId = cleanId(readBody(req).installation_id);
    if (!installationId) return res.status(400).json({ ok: false, error: 'Invalid installation_id' });

    const snap = await db.ref('verification/devices/' + hash(installationId)).get();
    const data = snap.val() || {};
    const until = Number(data.verified_until || 0);
    const verified = data.status === 'verified' && Date.now() < until;

    return res.json({
      ok: true,
      verified: verified,
      expires_at: verified ? until : 0
    });
  } catch (error) {
    console.error('checkStatus failed', error);
    return res.status(500).json({ ok: false, verified: false, error: 'Status check failed' });
  }
});
