const {
  sendContactCustomerEmail,
  sendContactOwnerEmail,
  cleanHeaderValue,
} = require('./email');

// In-memory rate limiting map: ip -> [timestamp, timestamp, ...]
const ipRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minut
const RATE_LIMIT_MAX_REQUESTS = 5; // max 5 sporočil na 15 minut

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const timestamps = (ipRateLimitMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRateLimitMap.set(ip, timestamps);
    return true;
  }

  timestamps.push(now);
  ipRateLimitMap.set(ip, timestamps);
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metoda ni dovoljena. Zahtevana je POST metoda.' });
  }

  // Determine client IP for rate limiting
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : (req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');

  if (isRateLimited(clientIp)) {
    console.warn(`[Kontakt] Presežena omejitev pošiljanja (Rate limit) za IP: ${clientIp}`);
    return res.status(429).json({
      error: 'Prejeli smo preveč sporočil v kratkem času. Prosimo poskusite ponovno čez nekaj minut.',
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};

    // 1. Anti-spam Honeypot check (field hidden from real users via CSS)
    const honeypot = body.website_url || body._hp;
    if (honeypot && typeof honeypot === 'string' && honeypot.trim().length > 0) {
      console.warn('[Kontakt] Zaznan bot preko honeypot polja.');
      // Return benign success response without sending emails
      return res.status(200).json({
        success: true,
        message: 'Hvala! Vaše sporočilo je bilo sprejeto.',
      });
    }

    // 2. Anti-spam timestamp check (if rendered by client)
    if (body._t) {
      const loadTime = Number(body._t);
      if (!isNaN(loadTime) && Date.now() - loadTime < 1200) {
        console.warn('[Kontakt] Zaznan bot (obrazec oddan v manj kot 1.2s).');
        return res.status(400).json({
          error: 'Oddaja obrazca je bila prehitra. Prosimo poskusite ponovno.',
        });
      }
    }

    // 3. Extract and sanitize input data
    const rawName = String(body.name || '').trim();
    const rawEmail = String(body.email || '').trim().toLowerCase();
    const rawSubject = String(body.subject || 'Splošno vprašanje').trim();
    const rawMessage = String(body.message || '').trim();

    const name = cleanHeaderValue(rawName);
    const email = cleanHeaderValue(rawEmail);
    const subject = cleanHeaderValue(rawSubject) || 'Splošno vprašanje';
    const message = rawMessage;

    // 4. Server-side validations
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Prosimo, vpišite svoje ime (vsaj 2 znaka).' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Ime je predolgo (največ 100 znakov).' });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Prosimo, vpišite veljaven e-naslov (npr. luka@primer.si).' });
    }
    if (email.length > 120) {
      return res.status(400).json({ error: 'E-naslov je predolgo (največ 120 znakov).' });
    }

    if (!message || message.length < 5) {
      return res.status(400).json({ error: 'Prosimo, napišite svoje sporočilo ali vprašanje (vsaj 5 znakov).' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: 'Sporočilo je predolgo (največ 4000 znakov).' });
    }

    const submissionDate = new Date().toLocaleString('sl-SI', {
      timeZone: 'Europe/Ljubljana',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    console.log(`[Kontakt] Prejeto novo povpraševanje od: ${name} (${email}), zadeva: ${subject}`);

    // 5. Send notification email to website owner (Critical)
    const ownerResult = await sendContactOwnerEmail({
      name,
      email,
      subject,
      message,
      date: submissionDate,
    });

    if (!ownerResult.success) {
      console.error(`[Kontakt] Pošiljanje obvestila lastniku ni uspelo: ${ownerResult.error}`);
      return res.status(500).json({
        error: 'Pri pošiljanju sporočila je prišlo do napake. Prosimo kontaktirajte nas neposredno na bodlizstudio@gmail.com.',
      });
    }

    // 6. Send automatic confirmation email to visitor (Customer Acknowledgment)
    const customerResult = await sendContactCustomerEmail({
      name,
      email,
      subject,
      message,
    });

    if (!customerResult.success) {
      console.warn(`[Kontakt] Obvestilo lastniku poslano, potrditveno sporočilo obiskovalcu pa ni uspelo (možen trial domain limit): ${customerResult.error}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Hvala! Vaše sporočilo smo uspešno prejeli. Odgovorili vam bomo v najkrajšem možnem času.',
      ownerDelivered: true,
      customerDelivered: customerResult.success,
    });
  } catch (err) {
    console.error('[Kontakt] Neujeta izjema v kontaktnem obrazcu:', err);
    return res.status(500).json({
      error: 'Pri pošiljanju sporočila je prišlo do nepredvidene napake. Prosimo pišite na bodlizstudio@gmail.com.',
    });
  }
};
