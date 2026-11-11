module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metoda ni dovoljena.' });
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

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const subject = String(body.subject || 'Splošno vprašanje').trim();
    const message = String(body.message || '').trim();

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Prosimo, vpišite svoje ime.' });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Prosimo, vpišite veljaven e-naslov (npr. ime@primer.si).' });
    }

    if (!message || message.length < 5) {
      return res.status(400).json({ error: 'Prosimo, napišite svoje sporočilo ali vprašanje.' });
    }

    // Log message for review
    console.log('[Kontaktni obrazec]', {
      timestamp: new Date().toISOString(),
      name,
      email,
      subject,
      messageLength: message.length,
    });

    return res.status(200).json({
      success: true,
      message: 'Hvala! Tvoje sporočilo je bilo uspešno sprejeto. Odgovorili ti bomo na e-naslov v najkrajšem možnem času.',
    });
  } catch (err) {
    console.error('Napaka v kontaktnem obrazcu:', err);
    return res.status(500).json({
      error: 'Pri pošiljanju sporočila je prišlo do napake. Prosimo poskusite ponovno ali pišite neposredno na info@odfantadomodela.si.',
    });
  }
};
