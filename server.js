/**
 * VS Home Cleaning Services — Saral WhatsApp Multi-Device Gateway
 * ---------------------------------------------------------------
 * Connects directly to WhatsApp via Multi-Device QR Code (Baileys).
 * 100% Free, zero Meta Cloud API fees, zero third-party subscriptions.
 * Runs 24/7 on port 3001.
 */

try { require('dotenv').config(); } catch (e) {}

const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const saralAgent = require('./saral-ai-agent');
let emailService = null;
try { emailService = require('./email-service'); } catch (e) { console.log('[Notice] email-service:', e.message); }

// Safe optional loading for voice agent and founder SOS modules
let handleInboundCall = () => '<Response><Say>VS Home Cleaning Support. Please visit our website.</Say></Response>';
let handleMenuSelection = async () => '<Response><Say>Connecting to support.</Say></Response>';
try {
  const voice = require('./vs-voice-agent');
  handleInboundCall = voice.handleInboundCall || handleInboundCall;
  handleMenuSelection = voice.handleMenuSelection || handleMenuSelection;
} catch (e) {
  console.log('[Notice] vs-voice-agent module optional fallback active.');
}

let triggerFounderSosCall = async () => ({ success: true, mode: 'fallback' });
let scanForEmergencyIssues = () => {};
let FOUNDER_CONFIG = { FOUNDER_PHONE: '+91 63834 58190' };
try {
  const sos = require('./vs-founder-sos');
  triggerFounderSosCall = sos.triggerFounderSosCall || triggerFounderSosCall;
  scanForEmergencyIssues = sos.scanForEmergencyIssues || scanForEmergencyIssues;
  FOUNDER_CONFIG = sos.FOUNDER_CONFIG || FOUNDER_CONFIG;
} catch (e) {
  console.log('[Notice] vs-founder-sos module optional fallback active.');
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG = {
  BUSINESS_NAME: 'VS Home Cleaning Services',
  AGENT_NAME: 'Saral',
  AGENT_PHONE: '917558191073',
  ADMIN_PHONE: '916383458190',
  SUPPORT_PHONE: '+91 75581 91073',
  FOUNDER_PHONE: '+91 63834 58190',
  TRACKING_BASE_URL: 'https://vshomecleaningservices.in/track-booking.html',
  REVIEW_BASE_URL: 'https://vshomecleaningservices.in/review.html'
};


// Razorpay Standard Checkout SDK Initialization
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_TuqvYRynPGvAma';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'sdGrGxE4BhK95aPj8oNT1vbq';

let razorpay = null;
try {
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
  });
  console.log('✅ Razorpay SDK initialized successfully with Key:', RAZORPAY_KEY_ID);
} catch (rErr) {
  console.error('Failed to initialize Razorpay SDK:', rErr.message);
}

let waSocket = null;
let currentQrDataUrl = null;
let connectionStatus = 'connecting'; // 'connecting' | 'qr_ready' | 'connected' | 'disconnected'
let connectedPhone = null;

const dispatchLogs = [];
function logDispatch(type, to, summary, status) {
  dispatchLogs.unshift({
    id: 'WA-' + Date.now().toString(36).toUpperCase(),
    type,
    to,
    summary,
    status: status || 'delivered',
    at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  if (dispatchLogs.length > 50) dispatchLogs.pop();
}

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

/**
 * Start Baileys WhatsApp Socket
 */

// =========================================================================
// FIREBASE REALTIME CLOUD SESSION PERSISTENCE (24/7 Zero Logout)
// =========================================================================
const FIREBASE_SESSION_URL = 'https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app/bookingLookup/wa_session.json';

async function restoreSessionFromFirebase(authDir) {
  try {
    console.log('[Firebase Session] Checking cloud backup for WhatsApp session...');
    const res = await fetch(FIREBASE_SESSION_URL);
    if (!res.ok) return false;
    const data = await res.json();
    if (data && Array.isArray(data.files) && data.files.length > 0) {
      if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
      for (const file of data.files) {
        if (file.name && file.content) {
          fs.writeFileSync(path.join(authDir, file.name), file.content, 'utf8');
        }
      }
      console.log(`[Firebase Session] Successfully restored ${data.files.length} auth files from Firebase Cloud!`);
      return true;
    }
  } catch (err) {
    console.error('[Firebase Session] Restore check failed:', err.message);
  }
  return false;
}

let backupDebounceTimeout = null;
function backupSessionToFirebase(authDir) {
  clearTimeout(backupDebounceTimeout);
  backupDebounceTimeout = setTimeout(async () => {
    try {
      if (!fs.existsSync(authDir)) return;
      const fileNames = fs.readdirSync(authDir);
      if (!fileNames.includes('creds.json')) return;

      const files = [];
      for (const name of fileNames) {
        const filePath = path.join(authDir, name);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath, 'utf8');
          files.push({ name, content });
        }
      }

      await fetch(FIREBASE_SESSION_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updatedAt: new Date().toISOString(),
          fileCount: files.length,
          files
        })
      });
      console.log(`[Firebase Session] Successfully backed up ${files.length} auth files to Firebase Cloud!`);
    } catch (err) {
      console.error('[Firebase Session] Backup to Firebase failed:', err.message);
    }
  }, 2500);
}

async function startWhatsAppSocket() {
  const authDir = path.join(__dirname, 'auth_info_baileys');
  await restoreSessionFromFirebase(authDir);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['VS Home Cleaning', 'Chrome', '1.0.0']
  });

  waSocket = sock;

  sock.ev.on('creds.update', async () => { await saveCreds();  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'qr_ready';
      console.log('\n=============================================================');
      console.log('📲 [SARAL WHATSAPP QR CODE READY] Scan with phone 7558191073');
      console.log('Open WhatsApp -> Linked Devices -> Link a Device');
      console.log('=============================================================\n');
      qrcodeTerminal.generate(qr, { small: true });

      try {
        currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
      } catch (e) {
        console.error('QR image generation error:', e);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      connectionStatus = 'disconnected';
      console.log(`[WhatsApp Connection Closed] Code: ${statusCode}, Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startWhatsAppSocket, 3000);
      } else {
        console.log('[WhatsApp Logged Out] Removing auth and resetting...');
        try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
        setTimeout(startWhatsAppSocket, 3000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      backupSessionToFirebase(authDir);
      
      currentQrDataUrl = null;
      connectedPhone = sock.user?.id ? sock.user.id.split(':')[0] : CONFIG.AGENT_PHONE;
      console.log('\n=============================================================');
      console.log(`🎉 [SARAL IS LIVE ON WHATSAPP!] Connected as: +${connectedPhone}`);
      console.log('Saral will now automatically send WhatsApp messages for all bookings!');
      console.log('=============================================================\n');
    }
  });

  // Listen for incoming messages -> Saral AI Conversational Agent
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        if (!msg.key.fromMe && msg.key.remoteJid && !msg.key.remoteJid.includes('@g.us')) {
          const senderJid = msg.key.remoteJid;
          const senderPhone = senderJid.split('@')[0];
          const pushName = msg.pushName || '';

          // Check for WhatsApp Native Cart / Catalog Order
          const orderMsg = msg.message?.orderMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.orderMessage;
          const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';

          if (!orderMsg && (!text || !text.trim())) continue;

          try {
            // Instant typing presence in background (non-blocking)
            sock.sendPresenceUpdate('composing', senderJid).catch(() => {});

            let reply = null;
            if (orderMsg) {
              console.log(`\n🛒 [Incoming WhatsApp Cart Order from ${pushName || senderPhone}]: ${orderMsg.itemCount} items, total: ${orderMsg.totalAmount1000}`);
              reply = await saralAgent.handleCartOrder(senderPhone, orderMsg, pushName);
            } else {
              console.log(`\n💬 [Incoming WhatsApp from ${pushName || senderPhone} (${senderJid})]: "${text}"`);
              reply = await saralAgent.processCustomerMessage(
                senderPhone,
                text,
                pushName,
                (to, alertText) => sendWhatsAppMessage(to, alertText)
              );
            }

            if (reply) {
              await sock.sendMessage(senderJid, { text: reply });
              console.log(`🤖 [Saral Replied to ${senderPhone}]:\n${reply.split('\n')[0]}...`);
              logDispatch(orderMsg ? 'Cart Order Reply' : 'Saral AI Chat', senderPhone, `Replied to: "${(text || 'Cart Order').slice(0, 30)}"`, 'Delivered');
            }
          } catch (e) {
            console.error('Saral conversational reply failed:', e);
          }
        }
      }
    }
  });
}

/**
 * Dispatch real WhatsApp message via Baileys socket
 */
async function sendWhatsAppMessage(toPhone, messageText) {
  const cleanPhone = normalizePhone(toPhone);
  const jid = `${cleanPhone}@s.whatsapp.net`;

  if (waSocket && connectionStatus === 'connected') {
    try {
      await waSocket.sendMessage(jid, { text: messageText });
      console.log(`✓ [Real WhatsApp Sent] -> +${cleanPhone}`);
      return { success: true, mode: 'BaileysRealWhatsApp', to: cleanPhone };
    } catch (err) {
      console.error('[Baileys Send Error]:', err);
    }
  }

  // Fallback: return pre-filled WhatsApp link
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
  console.log(`[Standby Link Generated]: ${waLink}`);
  return { success: true, mode: 'StandbyDirectLink', waLink };
}

// -------------------------------------------------------------
// WEB UI: Visual QR Code Pairing Screen & Control Panel
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const isConn = connectionStatus === 'connected';

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Saral WhatsApp Gateway — VS Home Cleaning</title>
      <meta http-equiv="refresh" content="${isConn ? '15' : '4'}">
      <style>
        body { margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; background:#0b0f17; color:#f1f5f9; display:flex; justify-content:center; }
        .wrap { width:100%; max-width:680px; }
        .card { background:#111827; border:1px solid #1e293b; border-radius:16px; padding:28px; margin-bottom:20px; box-shadow:0 10px 30px rgba(0,0,0,0.5); text-align:center; }
        h1 { margin:0 0 6px 0; font-size:24px; color:#10b981; }
        .badge { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:99px; font-size:13px; font-weight:700; margin-bottom:20px; }
        .badge.online { background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); }
        .badge.waiting { background:rgba(234,179,8,0.15); color:#facc15; border:1px solid rgba(234,179,8,0.3); }
        .dot { width:10px; height:10px; border-radius:50%; }
        .dot.online { background:#10b981; box-shadow:0 0 10px #10b981; }
        .dot.waiting { background:#facc15; box-shadow:0 0 10px #facc15; }
        .qr-box { background:#fff; padding:16px; border-radius:16px; display:inline-block; margin:16px 0; box-shadow:0 4px 20px rgba(0,0,0,0.3); }
        .qr-box img { display:block; width:260px; height:260px; }
        .steps { text-align:left; background:#1e293b; border-radius:12px; padding:18px 22px; font-size:13.5px; line-height:1.6; color:#cbd5e1; margin-top:20px; }
        .steps b { color:#fff; }
        .btn { background:#10b981; color:#0b0f17; border:none; padding:10px 20px; border-radius:8px; font-weight:700; cursor:pointer; font-size:14px; text-decoration:none; display:inline-block; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="card">
          <h1>🧹 VS Home Cleaning Services</h1>
          <p style="color:#94a3b8;margin:4px 0 16px;font-size:14px;">Saral AI — 24/7 WhatsApp Automation Gateway</p>

          ${isConn ? `
            <div class="badge online"><span class="dot online"></span> 🟢 SARAL IS LIVE & CONNECTED!</div>
            <div style="background:#064e3b;border:1px solid #059669;padding:16px;border-radius:12px;margin:14px 0;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#6ee7b7;">Active Number: +${connectedPhone || CONFIG.AGENT_PHONE}</p>
              <p style="margin:6px 0 0;font-size:13px;color:#a7f3d0;">All customer booking confirmations & partner alerts are automatically sent from this WhatsApp account!</p>
            </div>
            <p style="color:#94a3b8;font-size:13px;margin-top:20px;">To disconnect or scan a different number, delete the <code>auth_info_baileys</code> folder.</p>
          ` : `
            <div class="badge waiting"><span class="dot waiting"></span> WAITING FOR SCAN (Agent: 7558191073)</div>
            <p style="font-size:14px;color:#cbd5e1;margin-bottom:8px;">Scan this QR Code with your <b>7558191073</b> WhatsApp:</p>

            ${currentQrDataUrl ? `
              <div class="qr-box">
                <img src="${currentQrDataUrl}" alt="WhatsApp QR Code">
              </div>
            ` : `
              <div style="padding:40px 20px;color:#94a3b8;font-size:13px;">
                <span style="display:inline-block;width:24px;height:24px;border:3px solid #10b981;border-top-transparent;border-radius:50%;animation:spin 1s linear infinite;"></span><br><br>
                Generating secure WhatsApp pairing code...
              </div>
            `}

            <div class="steps">
              <b>📱 How to Link in 20 seconds:</b><br>
              1. Open WhatsApp on your <b>${CONFIG.AGENT_PHONE}</b> phone.<br>
              2. Tap <b>Settings</b> or <b>3 dots ⋮</b> &rarr; <b>Linked Devices (இணைக்கப்பட்ட சாதனங்கள்)</b>.<br>
              3. Tap <b>Link a Device</b> and point your phone camera at this QR code.<br>
              4. The page will automatically refresh to 🟢 <b>Connected</b>!
            </div>
          `}
        </div>

        <div class="card" style="text-align:left;">
          <h3 style="margin-top:0;font-size:16px;color:#f1f5f9;">📋 Recent Sent Dispatches (${dispatchLogs.length})</h3>
          ${dispatchLogs.length === 0 ? '<p style="color:#64748b;font-size:13px;">When customers book, live WhatsApp dispatches will appear here.</p>' : `
            <table style="width:100%;font-size:12.5px;color:#cbd5e1;border-collapse:collapse;">
              ${dispatchLogs.map(l => `
                <tr style="border-bottom:1px solid #1e293b;">
                  <td style="padding:6px 0;color:#94a3b8;">${l.at}</td>
                  <td style="padding:6px 0;font-weight:700;color:#38bdf8;">${l.type}</td>
                  <td style="padding:6px 0;">+${l.to}</td>
                  <td style="padding:6px 0;color:#34d399;text-align:right;">✓ ${l.status}</td>
                </tr>
              `).join('')}
            </table>
          `}
        </div>
      </div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </body>
    </html>
  `);
});

// -------------------------------------------------------------
// HEALTH / KEEP-ALIVE PING (For 24/7 Cloud Uptime)
// -------------------------------------------------------------
app.get('/ping', (req, res) => res.json({ status: 'ok', time: Date.now(), connected: connectionStatus === 'connected' }));
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime(), agent: CONFIG.AGENT_NAME }));

// -------------------------------------------------------------
// 1. API: BOOKING CONFIRMATION
// -------------------------------------------------------------
app.post('/api/send-confirmation', async (req, res) => {
  try {
    const { ref, name, mobile, service, date, time, total, address } = req.body;
    const phone = normalizePhone(mobile);

    const customerMsg = `🧹 *VS HOME CLEANING SERVICES* 🧹\n\n` +
      `வணக்கம் *${name || 'Customer'}*! 🙏\n` +
      `நான் *சாரல் (Saral)*, VS Home Cleaning-ன் AI உதவியாளர். உங்கள் புக்கிங் வெற்றிகரமாக பதிவு செய்யப்பட்டுள்ளது.\n\n` +
      `📋 *Booking Reference:* ${ref}\n` +
      `🛠️ *Service:* ${service || 'Home Cleaning'}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time Slot:* ${time}\n` +
      `💰 *Estimated Total:* ₹${total || 499}\n` +
      `📍 *Location:* ${address || 'Chennai'}\n\n` +
      `🔍 *Live Tracking Link:* \n${CONFIG.TRACKING_BASE_URL}?id=${ref}\n\n` +
      `எங்கள் கிளீனர் ஒதுக்கப்பட்டு விரைவில் உங்களை தொடர்பு கொள்வார்.\n` +
      `உதவிக்கு என்னை அழைக்கவும்: ${CONFIG.SUPPORT_PHONE}`;

    const custResult = await sendWhatsAppMessage(phone, customerMsg);
    logDispatch('Booking Confirmation', phone, `${ref} · ${service}`, 'Delivered');

    // Admin Notification
    const adminMsg = `🚨 *NEW BOOKING RECEIVED* 🚨\n\n` +
      `📋 *Ref:* ${ref}\n` +
      `👤 *Customer:* ${name} (+${phone})\n` +
      `🛠️ *Service:* ${service}\n` +
      `📅 *Slot:* ${date} (${time})\n` +
      `💰 *Amount:* ₹${total}\n` +
      `📍 *Address:* ${address}\n\n` +
      `⚡ *Admin Dashboard:* https://vshomecleaningservices.in/admin.html`;

    // Admin WhatsApp Alert disabled per founder preference (Only voice/SOS calls alert founder)
    // await sendWhatsAppMessage(CONFIG.ADMIN_PHONE, adminMsg);
    // logDispatch('Admin Booking Alert', CONFIG.ADMIN_PHONE, `Alert: ${ref}`, 'Delivered');

    res.json({ success: true, ref, customerPhone: phone, result: custResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 1.5. API: WEB CHAT & VOICE COMPANION (POWERS WEBSITE SAARAL AI)
// -------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const text = (req.body?.message || req.body?.text || '').trim();
    const phone = req.body?.phone || 'web_guest';
    const name = req.body?.name || 'Customer';
    if (!text) return res.json({ reply: 'வணக்கம்! உங்களுக்கு எப்படி உதவட்டும்?' });

    const reply = await saralAgent.processCustomerMessage(phone, text, name, null);
    res.json({ reply });
  } catch (err) {
    console.error('Web Chat API error:', err);
    res.json({ reply: 'வணக்கம்! VS Home Cleaning Services-ல் என்ன சேவை தேவைப்படுகிறது?' });
  }
});

// -------------------------------------------------------------

// -------------------------------------------------------------
// 1.6. RAZORPAY STANDARD WEB CHECKOUT: CREATE ORDER
// -------------------------------------------------------------
app.post('/api/create-order', async (req, res) => {
  try {
    let { amount, currency, receipt, notes } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Ensure amount is in paise (minimum 100 paise = ₹1)
    const amountInPaise = Math.round(Number(amount));
    if (isNaN(amountInPaise) || amountInPaise < 100) {
      return res.status(400).json({ error: 'Amount must be at least 100 paise (₹1)' });
    }

    if (!razorpay) {
      return res.status(500).json({ error: 'Razorpay SDK is not configured' });
    }

    const options = {
      amount: amountInPaise,
      currency: currency || 'INR',
      receipt: String(receipt || ('rcpt_' + Date.now())).slice(0, 40),
      notes: notes || {}
    };

    const order = await razorpay.orders.create(options);

    return res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('Razorpay Create Order Error:', err);
    if (err.statusCode === 401 || (err.error && err.error.code === 'BAD_REQUEST_ERROR' && err.error.description?.toLowerCase().includes('auth'))) {
      return res.status(401).json({ error: 'Razorpay authentication failed' });
    }
    return res.status(err.statusCode || 500).json({
      error: err.error?.description || err.message || 'Failed to create Razorpay order'
    });
  }
});

// -------------------------------------------------------------
// 1.7. RAZORPAY STANDARD WEB CHECKOUT: VERIFY PAYMENT SIGNATURE
// -------------------------------------------------------------
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, ref } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification fields (order_id, payment_id, signature)'
      });
    }

    const payload = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    const isMatch = (
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature))
    );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Signature verification failed. Invalid payment signature.'
      });
    }

    // Update Firebase booking status if booking ref is provided
    // Trigger Automated Email Receipt via Resend
    if (emailService) {
      emailService.sendPaymentReceiptEmail({
        ref: ref || 'VS-PAYMENT',
        paymentId: razorpay_payment_id,
        amount: req.body?.amount || 0,
        customerName: req.body?.name || 'Customer',
        email: req.body?.email,
        serviceType: req.body?.serviceType || 'Home Deep Cleaning'
      }).catch(e => console.error('Payment receipt email failed:', e.message));
    }

    if (ref) {
      try {
        await fetch(`https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app/bookingLookup/${ref}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentStatus: 'PAID',
            paymentMethod: 'razorpay',
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            paidAt: Date.now()
          })
        });
      } catch (dbErr) {
        console.warn('Firebase payment update notice:', dbErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Payment verified successfully',
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id
    });
  } catch (err) {
    console.error('Razorpay Verify Payment Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Payment verification processing error'
    });
  }
});


// 1.8. RESEND AUTOMATED BOOKING CONFIRMATION & FOUNDER ALERT
// -------------------------------------------------------------
app.post('/api/send-booking-email', async (req, res) => {
  try {
    const booking = req.body;
    if (!booking || (!booking.ref && !booking.mobile)) {
      return res.status(400).json({ success: false, error: 'Booking reference or details required' });
    }

    if (emailService) {
      const results = await Promise.allSettled([
        emailService.sendBookingConfirmationEmail(booking),
        emailService.sendFounderAlertEmail(booking)
      ]);
      return res.json({
        success: true,
        message: 'Email automation dispatched',
        confirmation: results[0]?.value,
        founderAlert: results[1]?.value
      });
    }

    return res.status(503).json({ success: false, error: 'Email service uninitialized' });
  } catch (err) {
    console.error('Send booking email error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});


// 1.9. PERSISTENT SUBSCRIBER MANAGEMENT & WEEKLY LUXURY PROMOTIONS
// -------------------------------------------------------------
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');

function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading subscribers:', e.message);
  }
  return {};
}

function saveSubscribers(subs) {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subs, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving subscribers:', e.message);
  }
}

// Subscribe customer (called on login, booking, or newsletter form)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, name, mobile, source = 'website' } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const subs = loadSubscribers();

    subs[cleanEmail] = {
      email: cleanEmail,
      name: name || subs[cleanEmail]?.name || 'Valued Customer',
      mobile: mobile || subs[cleanEmail]?.mobile || '',
      isSubscribed: true,
      subscribedAt: subs[cleanEmail]?.subscribedAt || Date.now(),
      lastUpdated: Date.now(),
      source
    };

    saveSubscribers(subs);
    console.log(`[Newsletter] Subscribed: ${cleanEmail} (${source})`);
    return res.json({ success: true, message: 'Subscribed successfully', email: cleanEmail });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Unsubscribe customer (1-click CAN-SPAM compliance)
app.all('/api/unsubscribe', async (req, res) => {
  try {
    const email = (req.query?.email || req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Email parameter required' });
    }

    const subs = loadSubscribers();
    if (subs[email]) {
      subs[email].isSubscribed = false;
      subs[email].unsubscribedAt = Date.now();
      saveSubscribers(subs);
    }

    console.log(`[Newsletter] Unsubscribed: ${email}`);
    if (req.method === 'GET' && !req.xhr && !req.headers.accept?.includes('application/json')) {
      return res.redirect(`https://vshomecleaningservices.in/unsubscribe.html?unsubscribed=true&email=${encodeURIComponent(email)}`);
    }
    return res.json({ success: true, message: 'Unsubscribed successfully', email });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Send Weekly Luxury Promotional Emails (ONLY to isSubscribed === true)
app.post('/api/send-weekly-promotions', async (req, res) => {
  try {
    if (!emailService || typeof emailService.sendWeeklyPromotionalEmail !== 'function') {
      return res.status(503).json({ success: false, error: 'Email service unavailable' });
    }

    const subs = loadSubscribers();
    const activeSubs = Object.values(subs).filter(s => s && s.isSubscribed === true && s.email);

    if (activeSubs.length === 0) {
      return res.json({ success: true, count: 0, message: 'No active subscribers found' });
    }

    console.log(`[Weekly Promo Engine] Disptaching to ${activeSubs.length} verified active subscribers...`);

    const results = [];
    for (const sub of activeSubs) {
      try {
        const sendRes = await emailService.sendWeeklyPromotionalEmail({
          email: sub.email,
          name: sub.name,
          discountCode: 'VSWEEKEND15',
          discountPercent: '15%'
        });
        results.push({ email: sub.email, success: sendRes.success, id: sendRes.emailId });

        if (subs[sub.email]) {
          subs[sub.email].lastPromoSentAt = Date.now();
        }
      } catch (err) {
        results.push({ email: sub.email, success: false, error: err.message });
      }
    }

    saveSubscribers(subs);
    return res.json({
      success: true,
      totalActiveSubscribers: activeSubs.length,
      dispatched: results
    });
  } catch (err) {
    console.error('Weekly promo dispatch error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});


// 1.10. AUTOMATED WEEKLY PROMOTIONAL CRON (EVERY SATURDAY 9:00 AM IST)
// -------------------------------------------------------------------
let cron = null;
try {
  cron = require('node-cron');
  // Schedule: Every Saturday at 09:00 AM Indian Standard Time (Asia/Kolkata)
  cron.schedule('0 9 * * 6', async () => {
    console.log('[Weekly Auto-Cron] Triggering Saturday 9:00 AM Promotional Campaign...');
    try {
      if (!emailService || typeof emailService.sendWeeklyPromotionalEmail !== 'function') return;
      const subs = loadSubscribers();
      const activeSubs = Object.values(subs).filter(s => s && s.isSubscribed === true && s.email);
      console.log(`[Weekly Auto-Cron] Sending to ${activeSubs.length} active verified subscribers...`);
      for (const sub of activeSubs) {
        try {
          await emailService.sendWeeklyPromotionalEmail({
            email: sub.email,
            name: sub.name,
            discountCode: 'VSWEEKEND15',
            discountPercent: '15%'
          });
          if (subs[sub.email]) subs[sub.email].lastPromoSentAt = Date.now();
        } catch (e) {
          console.error('[Weekly Auto-Cron Single Error]:', sub.email, e.message);
        }
      }
      saveSubscribers(subs);
      console.log('[Weekly Auto-Cron] Saturday Campaign successfully dispatched to all active subscribers!');
    } catch (err) {
      console.error('[Weekly Auto-Cron Failed]:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });
  console.log('✅ Weekly Promotional Auto-Cron initialized (Every Saturday 9:00 AM IST)');
} catch (cronErr) {
  console.log('[Notice] node-cron optional fallback:', cronErr.message);
}

// 2. API: ORDER & PHONE LOOKUP (FOR AI VOICE & WHATSAPP)
// -------------------------------------------------------------
app.all(['/api/order-partner-check', '/api/lookup-booking-by-phone', '/api/lookup-booking'], async (req, res) => {
  try {
    const rawInput = (req.body?.query || req.body?.phone || req.body?.mobile || req.body?.ref || req.body?.order_id || req.query?.query || req.query?.phone || req.query?.mobile || req.query?.ref || '').trim();
    if (!rawInput) return res.status(400).json({ found: false, error: 'Order reference or registered phone number required' });

    let booking = null;
    let ref = null;

    // Check if input is a phone number (e.g. 10 digits or starts with 91)
    const digitsOnly = rawInput.replace(/\D/g, '');
    const isPhone = digitsOnly.length >= 10 && !rawInput.toUpperCase().startsWith('VS-');

    if (isPhone) {
      const p10 = digitsOnly.slice(-10);
      const fbRes = await fetch(`https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app/bookings.json`);
      const allBookings = await fbRes.json();
      if (allBookings) {
        const matches = Object.values(allBookings).filter(b => {
          if (!b) return false;
          const bMobile = String(b.mobile || b.customerMobile || '').replace(/\D/g, '').slice(-10);
          return bMobile === p10;
        });
        matches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (matches.length > 0) {
          booking = matches[0];
          ref = booking.ref;
        }
      }
    } else {
      ref = rawInput.toUpperCase();
      const fbRes = await fetch(`https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app/bookings/${ref}.json`);
      booking = await fbRes.json();
    }

    if (!booking) {
      return res.json({
        found: false,
        query: rawInput,
        customerSpokenReply: `I checked our system, but could not locate any active booking with that detail. Would you like me to book a cleaning service for you now?`
      });
    }

    ref = booking.ref || ref;
    const partnerName = booking.assignedPartnerName || booking.assignedName || null;
    const partnerPhone = booking.assignedPartnerMobile || booking.assignedMobile || null;
    const serviceType = booking.serviceType || 'Home Cleaning';
    const scheduledSlot = `${booking.preferredDate || 'Upcoming'} at ${booking.preferredTime || 'scheduled time'}`;
    const status = booking.status || 'Booking Received';

    if (partnerName) {
      // Trigger instant urgent WhatsApp alert to the assigned partner if caller is escalating
      if (partnerPhone && (req.body?.alert_partner || req.query?.alert_partner)) {
        const pClean = normalizePhone(partnerPhone);
        const urgentMsg = `🚨 *URGENT CUSTOMER CALL ENQUIRY* 🚨\n\n` +
          `வணக்கம் *${partnerName}*!\n` +
          `புக்கிங் *${ref}* வாடிக்கையாளர் அழைப்பில் உங்களுக்காக காத்திருக்கிறார்கள்.\n` +
          `📍 முகவரி: ${booking.address || 'Chennai'}\n` +
          `🛠️ சர்வீஸ்: ${serviceType}\n\n` +
          `தயவுசெய்து உடனடியாக வாடிக்கையாளரை அழைத்து கிளம்பவும்!`;
        await sendWhatsAppMessage(pClean, urgentMsg);
        logDispatch('Voice Partner Alert', pClean, `Expedite: ${ref}`, 'Delivered');
      }

      return res.json({
        found: true,
        ref,
        partnerAssigned: true,
        partnerName,
        serviceType,
        scheduledSlot,
        address: booking.address,
        total: booking.total,
        status,
        customerSpokenReply: `Yes! I found your booking for ${serviceType} scheduled for ${scheduledSlot}. Specialist ${partnerName} has been assigned to your service!`
      });
    } else {
      return res.json({
        found: true,
        ref,
        partnerAssigned: false,
        serviceType,
        scheduledSlot,
        address: booking.address,
        total: booking.total,
        status,
        customerSpokenReply: `I found your booking for ${serviceType} scheduled for ${scheduledSlot}. Our operations hub is currently assigning the nearest specialist to your address!`
      });
    }
  } catch (err) {
    res.status(500).json({ found: false, error: err.message });
  }
});

app.post('/api/send-partner-assigned', async (req, res) => {
  try {
    const { ref, customerName, customerMobile, partnerName, partnerPhone, service, date, time } = req.body;
    const cPhone = normalizePhone(customerMobile);
    const pPhone = normalizePhone(partnerPhone);

    const custMsg = `✨ *VS CLEANING SPECIALIST ASSIGNED* ✨\n\n` +
      `வணக்கம் *${customerName || 'Customer'}*!\n` +
      `உங்கள் புக்கிங் *${ref}*-க்கு எங்கள் தொழில்முறை Cleaner நியமிக்கப்பட்டுள்ளார்.\n\n` +
      `👤 *Specialist:* ${partnerName || 'Verified Cleaner'}\n` +
      `📅 *Scheduled Slot:* ${date} (${time})\n\n` +
      `🛡️ *Customer Privacy:* உங்களுடைய பாதுகாப்பிற்காக Partner-ஓட Personal Number மறைக்கப்பட்டுள்ளது.\n` +
      `📞 *VS Relay Support (Saral):* ${CONFIG.SUPPORT_PHONE}\n\n` +
      `🔍 *Live Tracking:* ${CONFIG.TRACKING_BASE_URL}?id=${ref}`;

    await sendWhatsAppMessage(cPhone, custMsg);
    logDispatch('Partner Assigned (Customer)', cPhone, `${ref} -> ${partnerName}`, 'Delivered');

    if (pPhone) {
      const partMsg = `🔔 *NEW CLEANING JOB ASSIGNED* 🔔\n\n` +
        `வணக்கம் *${partnerName}*!\n` +
        `உங்களுக்கு புதிய கிளீனிங் வேலை அசைன் செய்யப்பட்டுள்ளது.\n\n` +
        `📋 *Job Ref:* ${ref}\n` +
        `🛠️ *Service:* ${service || 'Cleaning'}\n` +
        `📅 *Date & Slot:* ${date} (${time})\n\n` +
        `📲 தயவுசெய்து உங்கள் **VS Partner App**-ஐ திறந்து வேலையை Accept செய்யவும்!\n` +
        `Partner App: http://localhost:5173/`;

      await sendWhatsAppMessage(pPhone, partMsg);
      logDispatch('Job Alert (Partner)', pPhone, `Job: ${ref}`, 'Delivered');
    }

    res.json({ success: true, ref, partnerName });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 2B. API: PARTNER REAL-TIME STATUS UPDATE -> CUSTOMER NOTIFICATION
// -------------------------------------------------------------
app.post('/api/partner-status-update', async (req, res) => {
  try {
    const { ref, status, customerMobile, customerName, partnerName } = req.body;
    if (!ref || !status) return res.status(400).json({ success: false, error: 'ref and status required' });

    const cPhone = normalizePhone(customerMobile);
    const trackingUrl = `${CONFIG.TRACKING_BASE_URL}?id=${ref}`;
    const pName = partnerName || 'Cleaning Specialist';
    const cName = customerName || 'Customer';

    let updateMsg = null;
    if (status.toLowerCase().includes('on the way') || status.toLowerCase().includes('ontheway')) {
      updateMsg = `🚗 *VS CLEANING UPDATE: SPECIALIST ON THE WAY!* 🚗\n\n` +
        `வணக்கம் *${cName}*!\n` +
        `உங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட் **${pName}** உங்கள் முகவரிக்கு புறப்பட்டுவிட்டார்.\n\n` +
        `🔍 *Live GPS Tracking:* \n${trackingUrl}\n\n` +
        `எங்கள் ஸ்பெஷலிஸ்ட் விரைவில் உங்களை அடைவார்!`;
    } else if (status.toLowerCase().includes('arrived')) {
      updateMsg = `📍 *VS CLEANING UPDATE: SPECIALIST ARRIVED!* 📍\n\n` +
        `வணக்கம் *${cName}*!\n` +
        `உங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட் **${pName}** உங்கள் வீட்டை அடைந்துவிட்டார்.\n\n` +
        `தயவுசெய்து கதவைத் திறந்து ஸ்பெஷலிஸ்ட்டை அனுமதிக்கவும். சிறந்த சேவை அளிக்கப்படும்! ✨`;
    } else if (status.toLowerCase().includes('progress') || status.toLowerCase().includes('started')) {
      updateMsg = `🧹 *VS CLEANING UPDATE: JOB IN PROGRESS* 🧹\n\n` +
        `வணக்கம் *${cName}*!\n` +
        `உங்கள் வீட்டில் கிளீனிங் வேலை தற்போது துவங்கப்பட்டு தீவிரமாக நடைபெற்று வருகிறது.\n\n` +
        `100% Eco-Friendly & Safe முறையிலான கிளீனிங் உறுதி செய்யப்படுகிறது.`;
    } else if (status.toLowerCase().includes('completed')) {
      updateMsg = `🎉 *VS CLEANING UPDATE: SERVICE COMPLETED!* 🎉\n\n` +
        `வணக்கம் *${cName}*!\n` +
        `உங்கள் புக்கிங் (*${ref}*) கிளீனிங் வேலை வெற்றிகரமாக நிறைவடைந்தது.\n\n` +
        `💰 தொகையை Cash அல்லது UPI மூலம் ஸ்பெஷலிஸ்ட்டிடம் நேரடியாக செலுத்தலாம்.\n\n` +
        `⭐ உங்கள் அனுபவம் எப்படி இருந்தது? 1 நிமிடம் மதிப்பீடு பகிருங்கள்:\n${CONFIG.REVIEW_BASE_URL}?id=${ref}\n\n` +
        `நன்றி! மீண்டும் VS Home Cleaning-ஐ அழைக்கவும்! 🌸`;
    }

    if (updateMsg && cPhone) {
      await sendWhatsAppMessage(cPhone, updateMsg);
      logDispatch(`Job Status: ${status}`, cPhone, `Ref: ${ref}`, 'Delivered');
    }

    res.json({ success: true, ref, status, notified: Boolean(updateMsg && cPhone) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. AI VOICE HELPLINE & FOUNDER SOS (Inbound IVR & Escalations)
// -------------------------------------------------------------
app.post('/voice/incoming', (req, res) => {
  const caller = req.body.From || req.body.Caller || 'Unknown';
  console.log(`📞 [Inbound Voice Call] Incoming call from: ${caller}`);
  const twiml = handleInboundCall();
  res.set('Content-Type', 'text/xml');
  res.send(twiml);
});

app.post('/voice/menu-select', async (req, res) => {
  const digits = req.body.Digits || '';
  const callerPhone = req.body.From || req.body.Caller || '';
  console.log(`🔢 [IVR Menu Selected] Caller: ${callerPhone}, Pressed: ${digits}`);
  const twiml = await handleMenuSelection(digits, callerPhone);
  res.set('Content-Type', 'text/xml');
  res.send(twiml);
});

app.post('/api/trigger-sos', async (req, res) => {
  const { reason, ref, details } = req.body;
  if (!reason) return res.status(400).json({ success: false, error: 'Reason is required' });

  const result = await triggerFounderSosCall({
    incidentKey: `api_${ref || Date.now()}`,
    ref: ref || 'MANUAL-ALERT',
    reason,
    details: details || ''
  });
  res.json(result);
});

// Periodic background scan for Firebase emergency issues every 60s
setInterval(() => {
  scanForEmergencyIssues();
}, 60 * 1000);

// Start Express Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🧹 VS Home Cleaning — Saral Autonomous AI Hub (WhatsApp + Voice)`);
  console.log(`Open http://localhost:${PORT} in your browser to scan QR code!`);
  console.log(`Voice & SOS Target: ${FOUNDER_CONFIG.FOUNDER_PHONE}`);
  console.log(`=======================================================`);
  startWhatsAppSocket();
});
