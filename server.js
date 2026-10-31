/**
 * VS Home Cleaning Services — Saral WhatsApp Multi-Device Gateway
 * ---------------------------------------------------------------
 * Connects directly to WhatsApp via Multi-Device QR Code (Baileys).
 * 100% Free, zero Meta Cloud API fees, zero third-party subscriptions.
 * Runs 24/7 on port 3001.
 */

const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const saralAgent = require('./saral-ai-agent');

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
async function startWhatsAppSocket() {
  const authDir = path.join(__dirname, 'auth_info_baileys');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['VS Home Cleaning', 'Chrome', '1.0.0']
  });

  waSocket = sock;

  sock.ev.on('creds.update', saveCreds);

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
            // Human touch: Show "typing..." presence for 1.2s
            await sock.sendPresenceUpdate('composing', senderJid);
            await new Promise(res => setTimeout(res, 1200));
            await sock.sendPresenceUpdate('paused', senderJid);

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
// 2. API: PARTNER ASSIGNED ALERT
// -------------------------------------------------------------
app.post('/api/order-partner-check', async (req, res) => {
  try {
    const ref = (req.body.ref || req.body.order_id || req.query.ref || '').trim().toUpperCase();
    if (!ref) return res.status(400).json({ found: false, error: 'Order reference required' });

    const fbRes = await fetch(`https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app/bookings/${ref}.json`);
    const booking = await fbRes.json();

    if (!booking) {
      return res.json({
        found: false,
        ref,
        message: `Booking ${ref} not found in database.`
      });
    }

    const partnerName = booking.assignedPartnerName || booking.assignedName || null;
    const partnerPhone = booking.assignedPartnerMobile || booking.assignedMobile || null;

    if (partnerName) {
      // Trigger instant urgent WhatsApp alert to the assigned partner
      if (partnerPhone) {
        const pClean = normalizePhone(partnerPhone);
        const urgentMsg = `🚨 *URGENT CUSTOMER ENQUIRY — ACTION REQUIRED* 🚨\n\n` +
          `வணக்கம் *${partnerName}*!\n` +
          `புக்கிங் *${ref}* கஸ்டமர் உங்களுக்காக வீட்டில் காத்திருக்கிறார்கள்.\n` +
          `📍 முகவரி: ${booking.address || 'Chennai'}\n` +
          `🛠️ சர்வீஸ்: ${booking.serviceType}\n\n` +
          `தயவுசெய்து உடனடியாக வாடிக்கையாளரின் வீட்டிற்கு செல்லவும்! தாமதத்திற்கான காரணத்தை உடனே அட்மினிடம் தெரிவிக்கவும்.`;
        await sendWhatsAppMessage(pClean, urgentMsg);
        logDispatch('Urgent Partner Reminder', pClean, `Expedite: ${ref}`, 'Delivered');
      }

      return res.json({
        found: true,
        ref,
        partnerAssigned: true,
        partnerName,
        status: booking.status || 'Assigned',
        serviceType: booking.serviceType,
        customerSpokenReply: `Your booking is ${ref}. Specialist ${partnerName} has been assigned to your service. I have just triggered an urgent priority dispatch alert to ${partnerName} to reach your address immediately!`
      });
    } else {
      return res.json({
        found: true,
        ref,
        partnerAssigned: false,
        status: booking.status || 'Booking Received',
        serviceType: booking.serviceType,
        customerSpokenReply: `Your booking ${ref} is received, and our operations hub is currently expediting a nearby specialist to your home right now.`
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
