const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Metoda ni dovoljena.');
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).send('Stripe ni konfiguriran na strežniku.');
  }

  const { session_id, token } = req.query;

  if (!session_id || !token || typeof token !== 'string') {
    return res.status(400).send('Manjkajo veljavni podatki za prenos (session_id in token).');
  }

  // Parse and validate token expiration
  const tokenParts = token.split('.');
  if (tokenParts.length !== 2) {
    return res.status(403).send('Neveljaven format varnostnega žetona.');
  }

  const [expiresStr, signature] = tokenParts;
  const expires = parseInt(expiresStr, 10);

  if (!expires || isNaN(expires) || Date.now() > expires) {
    return res.status(403).send('Povezava za prenos je potekla. Prosimo osvežite potrditveno stran za novo povezavo.');
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    // Verify session with Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) {
      return res.status(404).send('Plačilna seja ni bila najdena.');
    }

    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return res.status(403).send('Plačilo za to naročilo še ni bilo uspešno potrjeno.');
    }

    // Verify cryptographic signature
    const customerEmail = session.customer_details?.email || session.metadata?.customer_email || '';
    const signaturePayload = `${session.id}:${customerEmail}:${expires}`;
    const expectedSignature = crypto
      .createHmac('sha256', stripeSecretKey)
      .update(signaturePayload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(403).send('Neveljaven varnostni podpis. Dostop je zavrnjen.');
    }

    // Locate PDF file in private storage
    const candidatePaths = [
      path.join(process.cwd(), 'private', 'od-fanta-do-modela.pdf'),
      path.join(__dirname, '..', 'private', 'od-fanta-do-modela.pdf'),
      path.join(__dirname, 'private', 'od-fanta-do-modela.pdf'),
    ];

    let pdfPath = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        pdfPath = p;
        break;
      }
    }

    if (!pdfPath) {
      console.error('PDF datoteka ni bila najdena na strežniku v:', candidatePaths);
      return res.status(500).send('Datoteka digitalnega vodnika trenutno ni dosegljiva na strežniku. Prosimo kontaktirajte podporo.');
    }

    const fileBuffer = fs.readFileSync(pdfPath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Od-Fanta-do-Modela-Vodnik.pdf"');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).send(fileBuffer);
  } catch (error) {
    console.error('Napaka pri prenosu PDF:', error);
    return res.status(500).send('Napaka pri prenosu datoteke. Poskusite znova.');
  }
};
