const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda ni dovoljena.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'Stripe ni konfiguriran na strežniku.' });
  }

  const code = req.query.code ? String(req.query.code).trim() : '';
  if (!code) {
    return res.status(400).json({ valid: false, error: 'Vnesite kodo za popust.' });
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const promoList = await stripe.promotionCodes.list({
      code: code,
      active: true,
      limit: 1,
    });

    if (promoList.data && promoList.data.length > 0) {
      const promo = promoList.data[0];
      const coupon = promo.coupon;
      let discountText = 'Popust uveljavljen';
      let finalPrice = '21,24 €';

      if (coupon && coupon.percent_off) {
        discountText = `-${coupon.percent_off} % popust`;
        const discounted = 24.99 * (1 - coupon.percent_off / 100);
        finalPrice = discounted.toFixed(2).replace('.', ',') + ' €';
      }

      return res.status(200).json({
        valid: true,
        code: promo.code,
        discountText,
        finalPrice,
      });
    } else {
      return res.status(200).json({
        valid: false,
        error: 'Vnesena koda za popust ni veljavna ali je potekla.',
      });
    }
  } catch (err) {
    console.error('Napaka pri preverjanju promocijske kode:', err);
    return res.status(500).json({
      valid: false,
      error: 'Pri preverjanju kode je prišlo do napake. Poskusite znova.',
    });
  }
};
