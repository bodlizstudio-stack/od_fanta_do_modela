const Stripe = require('stripe');
const { sendPurchaseEmail } = require('./email');

// Disable automatic body parsing on Vercel so we can verify the raw Stripe signature
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// In-memory cache of processed sessions to guard against rapid webhook retries
const processedSessionsCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 ura

function cleanCache() {
  const now = Date.now();
  for (const [id, item] of processedSessionsCache.entries()) {
    if (now - item.timestamp > CACHE_TTL_MS) {
      processedSessionsCache.delete(id);
    }
  }
}

function getRawBody(req) {
  if (req.rawBody) return Promise.resolve(req.rawBody);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metoda ni dovoljena.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    console.error('[Webhook] Manjka STRIPE_SECRET_KEY v okoljskih spremenljivkah.');
    return res.status(500).json({ error: 'Stripe ni konfiguriran na strežniku.' });
  }

  const stripe = new Stripe(stripeSecretKey);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await getRawBody(req);

    if (webhookSecret) {
      if (!signature) {
        console.error('[Webhook] Manjka stripe-signature glava.');
        return res.status(400).send('Manjka Stripe podpis.');
      }
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      console.warn('[Webhook] OPOZORILO: STRIPE_WEBHOOK_SECRET ni nastavljen v okoljskih spremenljivkah. Telo se bere brez preverjanja podpisa.');
      event = JSON.parse(rawBody.toString('utf8'));
    }
  } catch (err) {
    console.error(`[Webhook] Napaka pri preverjanju podpisa: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    cleanCache();

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;

        // Verify payment status strictly: only fulfill when payment is confirmed
        const isPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
        if (!isPaid) {
          console.log(`[Webhook] Seja ${session.id} še ni plačana (status: ${session.payment_status}). Prenos in e-pošta začasno zadržana.`);
          break;
        }

        // Multi-layer idempotency check:
        // 1. In-memory cache (guards against concurrent webhook deliveries in the same instance)
        // 2. Stripe persistent session metadata
        const cached = processedSessionsCache.get(session.id);
        const isAlreadySentInMetadata = session.metadata && session.metadata.email_sent === 'true';

        if (isAlreadySentInMetadata || (cached && cached.status === 'done')) {
          console.log(`[Webhook] Seja ${session.id} je že bila izpolnjena in e-pošta poslana (idempotentno preskočeno).`);
          break;
        }

        if (cached && cached.status === 'processing') {
          console.log(`[Webhook] Seja ${session.id} se trenutno že procesira (preprečena sočasna podvojitev).`);
          break;
        }

        // Mark as processing in memory
        processedSessionsCache.set(session.id, { status: 'processing', timestamp: Date.now() });

        console.log(`[Webhook] Uspešno plačilo za sejo ${session.id}. Pošiljam e-sporočilo z vodnikom...`);

        // Send transactional email with PDF download link and attachment
        const emailResult = await sendPurchaseEmail(session);

        if (emailResult.success) {
          processedSessionsCache.set(session.id, {
            status: 'done',
            emailId: emailResult.emailId,
            timestamp: Date.now(),
          });
          console.log(`[Webhook] E-pošta uspešno dostavljena za sejo ${session.id}. Resend ID: ${emailResult.emailId}`);
        } else {
          processedSessionsCache.set(session.id, {
            status: 'failed',
            error: emailResult.error,
            timestamp: Date.now(),
          });
          console.error(`[Webhook] Opozorilo: Pošiljanje e-pošte za sejo ${session.id} ni uspelo: ${emailResult.error}`);
        }

        // Persist fulfillment and email delivery status in Stripe metadata
        const updatedMetadata = {
          ...session.metadata,
          fulfilled: 'true',
          fulfilled_at: session.metadata?.fulfilled_at || new Date().toISOString(),
          email_sent: emailResult.success ? 'true' : 'failed',
          email_sent_at: emailResult.success ? new Date().toISOString() : undefined,
          resend_id: emailResult.emailId || '',
          email_error: emailResult.success ? '' : (emailResult.error || 'Neznana napaka').slice(0, 400),
        };

        try {
          await stripe.checkout.sessions.update(session.id, {
            metadata: updatedMetadata,
          });
        } catch (updateErr) {
          console.warn(`[Webhook] Opozorilo pri posodobitvi metadata seje ${session.id}: ${updateErr.message}`);
        }

        const customerEmail = session.customer_details?.email || session.metadata?.customer_email;
        console.log(`[Webhook] Naročilo za ${customerEmail || 'neznan e-naslov'} uspešno zaključeno.`);
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        console.warn(`[Webhook] Asinhronsko plačilo ni uspelo za sejo ${session.id}. PDF ne bo poslan.`);
        break;
      }

      default:
        // Safely acknowledge unhandled events
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Napaka pri procesiranju dogodka:', err);
    return res.status(500).json({ error: 'Napaka pri procesiranju webhook dogodka.' });
  }
};
