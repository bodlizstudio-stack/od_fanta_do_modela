const Stripe = require('stripe');

// Disable automatic body parsing on Vercel so we can verify the raw Stripe signature
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

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
    console.error('Missing STRIPE_SECRET_KEY');
    return res.status(500).json({ error: 'Stripe ni konfiguriran.' });
  }

  const stripe = new Stripe(stripeSecretKey);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await getRawBody(req);

    if (webhookSecret) {
      if (!signature) {
        console.error('Missing stripe-signature header');
        return res.status(400).send('Manjka Stripe podpis.');
      }
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // In development or when webhook secret is not yet registered
      console.warn('OPOZORILO: STRIPE_WEBHOOK_SECRET ni nastavljen v okoljskih spremenljivkah. Telo se bere brez preverjanja podpisa.');
      event = JSON.parse(rawBody.toString('utf8'));
    }
  } catch (err) {
    console.error(`Napaka pri preverjanju podpisa webhooka: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;

        // Verify payment status
        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
          // Idempotency check: verify if already fulfilled
          const isAlreadyFulfilled = session.metadata && session.metadata.fulfilled === 'true';

          if (isAlreadyFulfilled) {
            console.log(`[Webhook] Seja ${session.id} je že bila izpolnjena (idempotentno preskočeno).`);
          } else {
            console.log(`[Webhook] Uspešno plačilo za sejo ${session.id}. Izvajam izpolnitev naročila...`);

            // Mark session as fulfilled in Stripe persistent metadata
            try {
              await stripe.checkout.sessions.update(session.id, {
                metadata: {
                  ...session.metadata,
                  fulfilled: 'true',
                  fulfilled_at: new Date().toISOString(),
                },
              });
            } catch (updateErr) {
              console.warn(`[Webhook] Opozorilo pri posodobitvi metadata seje: ${updateErr.message}`);
            }

            const customerEmail = session.customer_details?.email || session.metadata?.customer_email;
            console.log(`[Webhook] Naročilo za ${customerEmail || 'neznan e-naslov'} uspešno zabeleženo.`);
          }
        } else {
          console.log(`[Webhook] Seja ${session.id} še ni plačana (status: ${session.payment_status}).`);
        }
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        console.warn(`[Webhook] Asinhronsko plačilo ni uspelo za sejo ${session.id}.`);
        break;
      }

      default:
        // Other events can be safely acknowledged
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Napaka pri procesiranju dogodka:', err);
    return res.status(500).json({ error: 'Napaka pri procesiranju webhook dogodka.' });
  }
};
