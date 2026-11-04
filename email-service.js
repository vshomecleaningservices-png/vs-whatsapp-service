/**
 * VS Home Cleaning Services — Ultra-Sleek Luxury Email Service
 * -------------------------------------------------------------
 * Clean, compact, refined aesthetics:
 * - Real Company Logo: https://vshomecleaningservices.in/logo.png (110px)
 * - Official Team Hero Image: https://vshomecleaningservices.in/service%20hero.png
 * - Compact, proportionate layout (no oversized banners or text)
 * - Live Razorpay Payment Link
 */

const { Resend } = require('resend');
let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch (e) {
  try { Razorpay = require('./node_modules/razorpay'); } catch (e2) {}
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_4UoXV14m_EWctWWgGb3mdvYkQNt87Sf7X';
const resend = new Resend(RESEND_API_KEY);

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_TuqvYRynPGvAma';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'sdGrGxE4BhK95aPj8oNT1vbq';

let rzpInstance = null;
if (Razorpay) {
  try {
    rzpInstance = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  } catch (e) {}
}

const SENDER_EMAIL = process.env.EMAIL_FROM || 'VS Home Cleaning Services <bookings@vshomecleaningservices.in>';
const FOUNDER_NOTIFY_EMAILS = [
  'contact@vshomecleaningservices.in',
  'vshomecleaningservices@gmail.com'
];
const FOUNDER_NOTIFY_EMAIL = FOUNDER_NOTIFY_EMAILS[0];

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
}

/**
 * Generate a real Razorpay payment link dynamically
 */
async function generatePaymentLink({ ref, amount, name, email, mobile }) {
  if (!rzpInstance || !amount || amount <= 0) return null;
  try {
    const link = await rzpInstance.paymentLink.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      accept_partial: false,
      description: `Payment for VS Home Cleaning Services - Booking ${ref}`,
      customer: {
        name: name || 'Customer',
        email: email || 'customer@vshomecleaningservices.in',
        contact: mobile ? String(mobile).replace(/\D/g, '').slice(-10) : ''
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { booking_ref: ref }
    });
    return link.short_url;
  } catch (err) {
    console.warn('[Razorpay Link Warning]:', err.message);
    return `https://vshomecleaningservices.in/track-booking.html?ref=${encodeURIComponent(ref)}&pay=true`;
  }
}

/**
 * Compact, Refined Global Template (No oversized blocks)
 */
function wrapCompactTemplate({ title, preheader, bodyHtml, email = '' }) {
  const unsubUrl = `https://vshomecleaningservices.in/unsubscribe.html?email=${encodeURIComponent(email)}`;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    body { margin: 0; padding: 0; background-color: #0f172a; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; }
    table { border-collapse: separate; width: 100%; }
    td { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    img { border: 0; outline: none; text-decoration: none; max-width: 100%; }
    .wrapper { width: 100%; background-color: #0f172a; padding: 24px 10px; }
    .main-card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.35); }
    .hero-header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 22px 20px 18px; text-align: center; color: #ffffff; }
    .brand-logo { width: 110px; height: auto; margin: 0 auto 10px; display: block; }
    .hero-title { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.2px; color: #ffffff; }
    .hero-subtitle { margin: 4px 0 0; font-size: 11px; color: #94a3b8; font-weight: 400; }
    .content-body { padding: 20px 22px; background: #ffffff; }
    .team-hero-img { width: 100%; max-height: 160px; object-fit: cover; border-radius: 12px; margin: 6px 0 16px; display: block; border: 1px solid #e2e8f0; }
    .status-badge { display: inline-block; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 9999px; }
    .client-greeting { font-size: 17px; font-weight: 700; color: #0f172a; margin: 10px 0 2px; }
    .client-sub { font-size: 12px; color: #64748b; margin: 0 0 14px; }
    .timeline-bar { display: table; width: 100%; margin: 14px 0 18px; table-layout: fixed; }
    .timeline-node { display: table-cell; text-align: center; vertical-align: top; }
    .timeline-dot { width: 22px; height: 22px; border-radius: 50%; margin: 0 auto 4px; line-height: 22px; font-size: 10px; font-weight: 800; text-align: center; }
    .dot-done { background: #10b981; color: #ffffff; }
    .dot-wait { background: #f1f5f9; color: #94a3b8; border: 1px dashed #cbd5e1; }
    .node-title { font-size: 10px; font-weight: 700; color: #334155; }
    .details-box { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 14px 0; overflow: hidden; }
    .details-box td { padding: 9px 14px; font-size: 12px; border-bottom: 1px solid #edf2f7; }
    .details-box tr:last-child td { border-bottom: none; }
    .lbl { color: #64748b; font-weight: 500; width: 40%; }
    .val { color: #0f172a; font-weight: 700; text-align: right; width: 60%; }
    .val-code { background: #eff6ff; color: #2563eb; font-family: monospace; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
    .total-line td { background: #f1f5f9; padding: 11px 14px; }
    .total-title { font-size: 13px; font-weight: 700; color: #0f172a; }
    .total-price { font-size: 16px; font-weight: 800; color: #059669; text-align: right; }
    .guarantee-card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; margin: 14px 0; font-size: 11px; color: #166534; line-height: 1.5; }
    .btn-pay { display: inline-block; background: #10b981; color: #ffffff !important; text-decoration: none; padding: 11px 24px; border-radius: 10px; font-size: 13px; font-weight: 700; text-align: center; margin: 4px 0; }
    .btn-track { display: inline-block; background: #f1f5f9; color: #334155 !important; text-decoration: none; padding: 9px 20px; border-radius: 10px; font-size: 12px; font-weight: 600; text-align: center; border: 1px solid #cbd5e1; margin: 4px 0; }
    .help-bar { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; margin-top: 14px; font-size: 11px; color: #475569; text-align: center; }
    .footer-section { background: #0b0f19; padding: 20px 16px; text-align: center; color: #64748b; font-size: 10px; line-height: 1.6; }
    .footer-section a { color: #94a3b8; text-decoration: underline; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || 'VS Home Cleaning Services — Professional Deep Cleaning.'}
  </div>

  <table class="wrapper" role="presentation" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <div class="main-card">
          <!-- Compact Header -->
          <div class="hero-header">
            <img src="https://vshomecleaningservices.in/logo.png" alt="VS Home Cleaning" class="brand-logo">
            <h1 class="hero-title">VS HOME CLEANING SERVICES</h1>
            <p class="hero-subtitle">Chennai Residential &amp; Commercial Deep Cleaning</p>
          </div>

          <!-- Body -->
          <div class="content-body">
            ${bodyHtml}
          </div>

          <!-- Footer -->
          <div class="footer-section">
            <p style="margin: 2px 0;">Helpline: <strong style="color: #ffffff;">+91 79 7185 1000</strong> &bull; WhatsApp: <strong style="color: #ffffff;">+91 75581 91073</strong></p>
            <p style="margin: 2px 0;"><a href="https://vshomecleaningservices.in">vshomecleaningservices.in</a> &bull; <a href="mailto:contact@vshomecleaningservices.in">contact@vshomecleaningservices.in</a></p>
            <p style="margin: 10px 0 0; color: #475569;">
              <a href="${unsubUrl}">Unsubscribe</a> &bull; &copy; ${new Date().getFullYear()} VS Home Cleaning Services
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * 1. Customer Booking Confirmation (Compact + Real Team Photo + Live Pay Link)
 */
async function sendBookingConfirmationEmail(data) {
  try {
    const ref = data.ref || 'VS-PENDING';
    const customerName = data.name || data.customerName || 'Valued Customer';
    const recipientEmail = (data.email || data.customerEmail || '').trim();
    
    // Strict customer-only policy: never send booking confirmations to company or founder
    if (!recipientEmail || !recipientEmail.includes('@') || recipientEmail.includes('vshomecleaningservices')) {
      console.log(`[Resend Compact] Booking confirmation skipped for ${ref}: No valid external customer email (${recipientEmail})`);
      return { success: false, reason: 'No valid customer email' };
    }

    const serviceType = data.serviceType || 'Home Deep Cleaning';
    const preferredDate = data.preferredDate || 'Upcoming Date';
    const preferredTime = data.preferredTime || 'Scheduled Time';
    const totalAmount = data.total || 0;
    const address = data.address || 'Chennai';
    const paymentMethod = (data.paymentMethod || 'Pay after service').toUpperCase();

    // Generate or fetch Razorpay Payment Link
    let paymentLink = data.paymentLink;
    if (!paymentLink && totalAmount > 0) {
      paymentLink = await generatePaymentLink({
        ref,
        amount: totalAmount,
        name: customerName,
        email: recipientEmail,
        mobile: data.mobile
      });
    }
    if (!paymentLink) {
      paymentLink = 'https://razorpay.me/@vshomecleaningservices';
    }

    const bodyHtml = `
      <div style="text-align: center;">
        <span class="status-badge">✓ Booking Confirmed</span>
        <div class="client-greeting">வணக்கம், ${customerName}!</div>
        <div class="client-sub">Your home cleaning appointment has been locked.</div>
      </div>

      <!-- Real Team Photo from pricing page -->
      <img src="https://vshomecleaningservices.in/service%20hero.png" alt="VS Cleaning Specialists" class="team-hero-img">

      <!-- Compact Progress -->
      <div class="timeline-bar">
        <div class="timeline-node">
          <div class="timeline-dot dot-done">1</div>
          <div class="node-title" style="color:#059669;">Confirmed</div>
        </div>
        <div class="timeline-node">
          <div class="timeline-dot dot-wait">2</div>
          <div class="node-title">Dispatch</div>
        </div>
        <div class="timeline-node">
          <div class="timeline-dot dot-wait">3</div>
          <div class="node-title">Cleaning</div>
        </div>
        <div class="timeline-node">
          <div class="timeline-dot dot-wait">4</div>
          <div class="node-title">Inspection</div>
        </div>
      </div>

      <!-- Compact Summary Table -->
      <table class="details-box" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td class="lbl">Booking Ref</td>
          <td class="val"><span class="val-code">${ref}</span></td>
        </tr>
        <tr>
          <td class="lbl">Service</td>
          <td class="val">${serviceType}</td>
        </tr>
        <tr>
          <td class="lbl">Scheduled Slot</td>
          <td class="val">${preferredDate} (${preferredTime})</td>
        </tr>
        <tr>
          <td class="lbl">Location</td>
          <td class="val">${address}</td>
        </tr>
        <tr>
          <td class="lbl">Payment</td>
          <td class="val" style="color:#2563eb;">${paymentMethod}</td>
        </tr>
        <tr class="total-line">
          <td class="total-title">Total Estimated</td>
          <td class="total-price">${formatINR(totalAmount)}</td>
        </tr>
      </table>

      <!-- Compact Guarantee -->
      <div class="guarantee-card">
        <strong>🛡️ 100% Zero Advance:</strong> Pay zero upfront. Pay only after cleaning is complete and you are fully satisfied. Child &amp; pet-safe non-acid solutions guaranteed.
      </div>

      <!-- Direct Action Buttons -->
      <div style="text-align: center; margin: 16px 0 8px;">
        ${paymentLink ? `
          <div style="margin-bottom: 6px;">
            <a href="${paymentLink}" class="btn-pay" target="_blank">
              💳 Pay Online via UPI / GPay / Card (${formatINR(totalAmount)}) &rarr;
            </a>
          </div>
        ` : ''}
        <div>
          <a href="https://vshomecleaningservices.in/track-booking.html?ref=${encodeURIComponent(ref)}" class="btn-track">
            📍 Track Cleaner Live &rarr;
          </a>
        </div>
      </div>

      <div class="help-bar">
        Need assistance? Call Voice AI <strong>+91 79 7185 1000</strong> or WhatsApp <strong>+91 75581 91073</strong>.
      </div>
    `;

    const html = wrapCompactTemplate({
      title: `Booking Confirmed: ${ref} — VS Home Cleaning Services`,
      preheader: `Your ${serviceType} booking ${ref} is confirmed for ${preferredDate} (${preferredTime}). Zero advance needed.`,
      bodyHtml,
      email: recipientEmail
    });

    const res = await resend.emails.send({
      from: SENDER_EMAIL,
      to: recipientEmail,
      subject: `🧹 Booking Confirmed: ${ref} (${serviceType}) — VS Home Cleaning Services`,
      html
    });

    console.log(`[Resend Compact] Booking confirmation sent to ${recipientEmail} (ID: ${res.data?.id || res.id})`);
    return { success: true, emailId: res.data?.id || res.id, paymentLink };
  } catch (error) {
    console.error('[Resend Error] sendBookingConfirmationEmail:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 2. Weekly Promotional Privilege (Compact + Real Team Photo)
 */
async function sendWeeklyPromotionalEmail({ email, name, discountCode = 'VSWEEKEND15', discountPercent = '15%' }) {
  try {
    const customerName = name || 'Customer';

    const bodyHtml = `
      <div style="text-align: center;">
        <span style="display:inline-block; background:#fef3c7; color:#92400e; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; padding:3px 10px; border-radius:9999px;">
          ✨ Member Privilege
        </span>
        <div class="client-greeting">Flat ${discountPercent} Weekend Savings</div>
        <div class="client-sub">வணக்கம் ${customerName}! Enjoy a spotless, hygienic home this weekend.</div>
      </div>

      <!-- Real Team Photo from pricing page -->
      <img src="https://vshomecleaningservices.in/service%20hero.png" alt="VS Cleaning Specialists" class="team-hero-img">

      <!-- Compact Offer Box -->
      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:14px; text-align:center; margin:12px 0;">
        <div style="font-size:11px; font-weight:700; color:#1e40af;">Bathroom Deep Clean &bull; Kitchen Restoration &bull; Sofa Sanitization</div>
        <div style="margin:10px 0 4px;">
          <span style="font-size:11px; color:#64748b;">Promo Code:</span>
          <strong style="font-size:15px; color:#2563eb; font-family:monospace; background:#ffffff; padding:4px 10px; border-radius:6px; border:1px dashed #2563eb; margin-left:4px;">${discountCode}</strong>
        </div>
      </div>

      <div class="guarantee-card">
        <strong>✓ Zero Advance:</strong> Book online in 60 seconds. Pay only after work completion and your personal sign-off.
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin: 16px 0 6px;">
        <a href="https://vshomecleaningservices.in/booking.html?promo=${encodeURIComponent(discountCode)}" class="btn-pay">
          Claim 15% Privilege &amp; Book &rarr;
        </a>
      </div>

      <div style="text-align:center; font-size:11px; color:#94a3b8; margin-top:8px;">
        Call AI Helpline: <strong>+91 79 7185 1000</strong>
      </div>
    `;

    const html = wrapCompactTemplate({
      title: `Weekend Privilege: ${discountPercent} Savings — VS Home Cleaning`,
      preheader: `Rejuvenate your home with flat ${discountPercent} savings. Zero advance. Code ${discountCode}.`,
      bodyHtml,
      email
    });

    const res = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `✨ Weekend Sanctuary: ${discountPercent} Privilege on Deep Cleaning — VS Home Cleaning Services`,
      html
    });

    console.log(`[Resend Compact Promo] Sent to ${email} (ID: ${res.data?.id || res.id})`);
    return { success: true, emailId: res.data?.id || res.id };
  } catch (error) {
    console.error(`[Resend Promo Error] ${email}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 3. Payment Receipt & Founder Alert
 */
async function sendPaymentReceiptEmail(data) {
  try {
    const ref = data.ref || 'VS-PAYMENT';
    const customerName = data.name || data.customerName || 'Valued Customer';
    const recipientEmail = data.email || data.customerEmail || FOUNDER_NOTIFY_EMAIL;
    const paymentId = data.paymentId || data.razorpay_payment_id || 'PAY-N/A';
    const amountPaid = data.amount || 0;
    const serviceType = data.serviceType || 'Home Deep Cleaning';

    const bodyHtml = `
      <div style="text-align: center;">
        <span class="status-badge">✓ Payment Received</span>
        <div class="client-greeting">Thank You, ${customerName}!</div>
        <div class="client-sub">Your digital payment has been credited via Razorpay.</div>
      </div>

      <table class="details-box" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td class="lbl">Booking Ref</td>
          <td class="val"><span class="val-code">${ref}</span></td>
        </tr>
        <tr>
          <td class="lbl">Razorpay ID</td>
          <td class="val" style="font-family:monospace; font-size:11px;">${paymentId}</td>
        </tr>
        <tr>
          <td class="lbl">Service</td>
          <td class="val">${serviceType}</td>
        </tr>
        <tr>
          <td class="lbl">Timestamp</td>
          <td class="val">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
        </tr>
        <tr class="total-line">
          <td class="total-title">Amount Paid</td>
          <td class="total-price">${formatINR(amountPaid)}</td>
        </tr>
      </table>

      <div style="text-align: center; margin: 16px 0 6px;">
        <a href="https://vshomecleaningservices.in/track-booking.html?ref=${encodeURIComponent(ref)}" class="btn-track">
          View Complete Invoice &rarr;
        </a>
      </div>
    `;

    const html = wrapCompactTemplate({
      title: `Payment Receipt: ${paymentId} — VS Home Cleaning Services`,
      preheader: `Official payment receipt for ${formatINR(amountPaid)} (Booking Ref: ${ref}).`,
      bodyHtml,
      email: recipientEmail
    });

    const res = await resend.emails.send({
      from: SENDER_EMAIL,
      to: recipientEmail,
      subject: `🧾 Official Payment Receipt: ${formatINR(amountPaid)} (Ref: ${ref}) — VS Home Cleaning Services`,
      html
    });

    return { success: true, emailId: res.data?.id || res.id };
  } catch (error) {
    console.error('[Resend Error] sendPaymentReceiptEmail:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendFounderAlertEmail(data) {
  // Disabled permanently per user requirement: company / founder should NOT receive emails
  return { success: true, message: 'Founder email alert disabled per user instruction' };
}

module.exports = {
  sendBookingConfirmationEmail,
  sendPaymentReceiptEmail,
  sendWeeklyPromotionalEmail,
  sendFounderAlertEmail
};
