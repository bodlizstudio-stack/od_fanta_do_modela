const { Resend } = require('resend');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate a cryptographically signed, time-limited download URL
 * Compatible with api/download.js
 */
function generateDownloadUrl(session, baseUrl, stripeSecretKey, daysValid = 7) {
  const customerEmail = session.customer_details?.email || session.metadata?.customer_email || '';
  const expires = Date.now() + daysValid * 24 * 60 * 60 * 1000;
  const signaturePayload = `${session.id}:${customerEmail}:${expires}`;
  const signature = crypto
    .createHmac('sha256', stripeSecretKey)
    .update(signaturePayload)
    .digest('hex');

  const token = `${expires}.${signature}`;
  const cleanBase = (baseUrl || 'https://www.glowup-slo.si').replace(/\/+$/, '');
  return `${cleanBase}/api/download?session_id=${encodeURIComponent(session.id)}&token=${encodeURIComponent(token)}`;
}

/**
 * Locate the private PDF file
 */
function getPdfBuffer() {
  const candidatePaths = [
    path.join(process.cwd(), 'private', 'od-fanta-do-modela.pdf'),
    path.join(__dirname, '..', 'private', 'od-fanta-do-modela.pdf'),
    path.join(__dirname, 'private', 'od-fanta-do-modela.pdf'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p);
      } catch (err) {
        console.warn('Napaka pri branju PDF datoteke za priponko:', err.message);
      }
    }
  }
  return null;
}

/**
 * Build HTML and Text email templates according to GlowUp brand guidelines
 */
function buildEmailTemplates(downloadUrl) {
  const plainText = `Pozdravljen!

Hvala za nakup vodnika Od Fanta Do Modela! 🔥

Tvoj vodnik je pripravljen in že te čaka.

V njem boš našel nasvete za izboljšanje videza, samozavesti, urejenosti in vsakodnevnih navad.

Klikni spodnjo povezavo in prenesi svoj vodnik:
${downloadUrl}

(Povezava je varna in veljavna 7 dni. Vodnik je v PDF formatu in je prav tako priložen temu sporočilu.)

Hvala za zaupanje in dobrodošel v GlowUp!

Ekipa GlowUp
https://www.glowup-slo.si/

Pomoč in podpora: bodlizstudio@gmail.com
`;

  const html = `<!DOCTYPE html>
<html lang="sl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tvoj vodnik Od Fanta Do Modela je pripravljen! ✨</title>
</head>
<body style="margin:0;padding:0;background-color:#090B09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E8ECE6;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#090B09;padding:40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#121612;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;box-shadow:0 15px 40px rgba(0,0,0,0.6);">
          
          <!-- Header Bar with Brand -->
          <tr>
            <td style="padding:32px 30px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);background-color:#0E110E;">
              <div style="font-family:'Cinzel',Georgia,serif;font-weight:800;font-size:18px;letter-spacing:0.18em;text-transform:uppercase;color:#FFFFFF;margin:0;">
                OD FANTA <span style="color:#d4af37;">DO MODELA</span>
              </div>
              <div style="font-size:12px;letter-spacing:0.08em;color:#768076;margin-top:6px;text-transform:uppercase;">
                GlowUp Digitalna Izdaja
              </div>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding:36px 32px 28px;">
              <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#FFFFFF;margin:0 0 18px;line-height:1.3;">
                Pozdravljen!
              </h1>
              
              <p style="font-size:16px;line-height:1.65;color:#E8ECE6;margin:0 0 16px;">
                Hvala za nakup vodnika <strong>Od Fanta Do Modela</strong>! 🔥
              </p>

              <p style="font-size:15px;line-height:1.65;color:#B8C0B8;margin:0 0 16px;">
                Tvoj vodnik je pripravljen in že te čaka.
              </p>

              <p style="font-size:15px;line-height:1.65;color:#B8C0B8;margin:0 0 28px;">
                V njem boš našel preizkušene nasvete za izboljšanje videza, samozavesti, urejenosti in vsakodnevnih navad, ki prinašajo dolgoročne rezultate.
              </p>

              <!-- CTA Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${downloadUrl}" target="_blank" style="display:inline-block;background-color:#65EC45;color:#061406;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;text-decoration:none;padding:16px 36px;border-radius:6px;box-shadow:0 6px 20px rgba(101,236,69,0.35);text-transform:uppercase;">
                      PRENESI SVOJ VODNIK &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security / Validity Info Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0D0F0D;border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin:24px 0 28px;padding:16px 20px;">
                <tr>
                  <td style="font-size:13px;line-height:1.55;color:#8E988A;">
                    🔒 <strong>Varen prenos:</strong> Povezava je varna in veljavna 7 dni. PDF datoteko preprosto shrani na svoj telefon (aplikacija <em>Datoteke</em> / <em>Knjige</em>) ali na računalnik. Za vsak primer je vodnik priložen tudi v priponki tega sporočila.
                  </td>
                </tr>
              </table>

              <p style="font-size:15px;line-height:1.65;color:#B8C0B8;margin:0 0 6px;">
                Hvala za zaupanje in dobrodošel v GlowUp!
              </p>
              <p style="font-size:15px;font-weight:700;color:#FFFFFF;margin:0 0 4px;">
                Ekipa GlowUp
              </p>
              <p style="font-size:13px;margin:0;">
                <a href="https://www.glowup-slo.si/" target="_blank" style="color:#65EC45;text-decoration:none;">https://www.glowup-slo.si/</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 30px;background-color:#0A0C0A;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="font-size:12px;color:#768076;margin:0 0 6px;line-height:1.5;">
                To sporočilo je bilo poslano avtomatsko ob uspešnem nakupu digitalnega vodnika.
              </p>
              <p style="font-size:12px;color:#768076;margin:0;line-height:1.5;">
                Potrebuješ pomoč? Piši nam na <a href="mailto:bodlizstudio@gmail.com" style="color:#65EC45;text-decoration:none;">bodlizstudio@gmail.com</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, plainText };
}

/**
 * Send order confirmation email with PDF download link and attachment via Resend
 *
 * @param {Object} session - Stripe Checkout Session object
 * @param {Object} options - Configuration overrides
 * @returns {Promise<{success: boolean, emailId?: string, error?: string}>}
 */
async function sendPurchaseEmail(session, options = {}) {
  const resendApiKey = options.resendApiKey || process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('[Email] RESEND_API_KEY ni nastavljen v okoljskih spremenljivkah. Pošiljanje e-pošte preskočeno.');
    return { success: false, error: 'RESEND_API_KEY ni konfiguriran' };
  }

  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.customer_email;

  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customerEmail)) {
    console.error(`[Email] Neveljaven e-naslov kupca za sejo ${session.id}: ${customerEmail}`);
    return { success: false, error: 'Neveljaven e-naslov kupca' };
  }

  const stripeSecretKey = options.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error('[Email] STRIPE_SECRET_KEY manjka za podpis žetona prenosa.');
    return { success: false, error: 'STRIPE_SECRET_KEY ni konfiguriran' };
  }

  const siteUrl = options.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glowup-slo.si';
  const downloadUrl = generateDownloadUrl(session, siteUrl, stripeSecretKey, 7);
  const { html, plainText } = buildEmailTemplates(downloadUrl);

  const resend = new Resend(resendApiKey);

  // Email From: allow custom domain if configured, fallback to onboarding@resend.dev
  const emailFrom = process.env.EMAIL_FROM || 'GlowUp <onboarding@resend.dev>';

  const emailPayload = {
    from: emailFrom,
    to: customerEmail,
    subject: 'Tvoj vodnik Od Fanta Do Modela je pripravljen! ✨',
    text: plainText,
    html: html,
  };

  // Add PDF attachment if available and under provider limits
  const pdfBuffer = getPdfBuffer();
  if (pdfBuffer && pdfBuffer.length > 0) {
    emailPayload.attachments = [
      {
        filename: 'Od-Fanta-do-Modela-Vodnik.pdf',
        content: pdfBuffer,
      },
    ];
  }

  try {
    console.log(`[Email] Pošiljam e-sporočilo na ${customerEmail} (Seja: ${session.id})...`);
    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('[Email] Resend API napaka:', error);
      return { success: false, error: error.message || 'Resend API napaka' };
    }

    console.log(`[Email] Uspešno poslano na ${customerEmail}! Resend ID: ${data?.id}`);
    return { success: true, emailId: data?.id };
  } catch (err) {
    console.error('[Email] Izjema pri klicu Resend:', err);
    return { success: false, error: err.message || 'Neznana napaka pri pošiljanju e-pošte' };
  }
}

module.exports = {
  generateDownloadUrl,
  buildEmailTemplates,
  sendPurchaseEmail,
  getPdfBuffer,
};
