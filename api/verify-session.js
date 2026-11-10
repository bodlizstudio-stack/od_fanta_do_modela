const Stripe = require('stripe');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda ni dovoljena.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'Stripe ni konfiguriran na strežniku.' });
  }

  const { session_id } = req.query;
  if (!session_id || typeof session_id !== 'string' || !session_id.startsWith('cs_')) {
    return res.status(400).json({ error: 'Neveljaven identifikator seje.' });
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items'],
    });

    if (!session) {
      return res.status(404).json({ error: 'Plačilna seja ni bila najdena.' });
    }

    const customerEmail = session.customer_details?.email || session.metadata?.customer_email || '';
    const isPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';

    if (isPaid) {
      // Generate secure time-limited token (valid for 24 hours)
      const expires = Date.now() + 24 * 60 * 60 * 1000;
      const signaturePayload = `${session.id}:${customerEmail}:${expires}`;
      const signature = crypto
        .createHmac('sha256', stripeSecretKey)
        .update(signaturePayload)
        .digest('hex');

      const token = `${expires}.${signature}`;
      const downloadUrl = `/api/download?session_id=${encodeURIComponent(session.id)}&token=${encodeURIComponent(token)}`;

      const formattedTotal = session.amount_total != null
        ? (session.amount_total / 100).toFixed(2).replace('.', ',') + ' €'
        : '24,99 €';

      return res.status(200).json({
        status: 'paid',
        customerEmail,
        customerName: session.customer_details?.name || '',
        amountTotal: formattedTotal,
        product: 'Od Fanta do Modela — 94-stranski digitalni vodnik (PDF)',
        downloadUrl,
      });
    } else {
      return res.status(200).json({
        status: 'pending',
        message: 'Plačilo je v obdelavi. Prosimo počakajte trenutek ali preverite svoj e-naslov.',
      });
    }
  } catch (error) {
    console.error('Napaka pri preverjanju seje:', error);
    return res.status(400).json({
      error: 'Preverjanje plačilne seje ni uspelo.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
