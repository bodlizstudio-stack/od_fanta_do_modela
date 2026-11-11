const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metoda ni dovoljena. Zahtevana je POST metoda.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;

  if (!stripeSecretKey || !stripePriceId) {
    console.error('Missing Stripe environment variables: STRIPE_SECRET_KEY or STRIPE_PRICE_ID');
    return res.status(500).json({
      error: 'Plačilni sistem trenutno ni pravilno konfiguriran. Prosimo kontaktirajte podporo.',
    });
  }

  const stripe = new Stripe(stripeSecretKey);

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

    const { email, promoCode } = body;

    // Validate email if provided
    let customerEmail;
    if (email && typeof email === 'string') {
      const trimmedEmail = email.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        customerEmail = trimmedEmail;
      }
    }

    // Determine safe site base URL (always valid https://)
    function resolveBaseUrl(r) {
      const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '';
      if (typeof envUrl === 'string' && /^https?:\/\//i.test(envUrl.trim())) {
        return envUrl.trim().replace(/\/+$/, '');
      }
      const host = r.headers['x-forwarded-host'] || r.headers.host;
      if (host && typeof host === 'string') {
        const proto = r.headers['x-forwarded-proto'] || 'https';
        return `${proto}://${host}`.replace(/\/+$/, '');
      }
      return 'https://www.glowup-slo.si';
    }
    const siteUrl = resolveBaseUrl(req);

    // Handle secret promotion code
    let promotionCodeObj = null;
    if (promoCode && typeof promoCode === 'string') {
      const cleanCode = promoCode.trim();
      if (cleanCode.length > 0) {
        try {
          const promoList = await stripe.promotionCodes.list({
            code: cleanCode,
            active: true,
            limit: 1,
          });

          if (promoList.data && promoList.data.length > 0) {
            promotionCodeObj = promoList.data[0];
          } else {
            return res.status(400).json({
              error: 'Vnesena promocijska koda ni veljavna ali je potekla.',
            });
          }
        } catch (codeErr) {
          console.error('Napaka pri preverjanju promocijske kode:', codeErr.message);
          return res.status(400).json({
            error: 'Pri preverjanju promocijske kode je prišlo do napake.',
          });
        }
      }
    }

    // Construct Checkout Session parameters
    // Strict server-side: quantity is always 1, price comes only from STRIPE_PRICE_ID
    const sessionParams = {
      mode: 'payment',
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/uspeh?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/preklic`,
      customer_email: customerEmail || undefined,
      billing_address_collection: 'auto',
      metadata: {
        product: 'Od Fanta Do Modela',
        customer_email: customerEmail || '',
      },
    };

    if (promotionCodeObj) {
      sessionParams.discounts = [{ promotion_code: promotionCodeObj.id }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    // Create session (support Managed Payments parameter if enabled on Stripe account)
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        ...sessionParams,
        managed_payments: { enabled: true },
      });
    } catch (mpErr) {
      // If managed_payments parameter is rejected or already account-default, fallback seamlessly
      try {
        session = await stripe.checkout.sessions.create(sessionParams);
      } catch (fallbackErr) {
        console.error('Stripe session creation error:', fallbackErr);
        throw fallbackErr;
      }
    }

    return res.status(200).json({
      url: session.url,
      id: session.id,
    });
  } catch (error) {
    console.error('Napaka pri ustvarjanju Stripe seje:', error);
    return res.status(500).json({
      error: 'Pri pripravi varnega plačila je prišlo do napake. Prosimo poskusite ponovno čez trenutek.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
