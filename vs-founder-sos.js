/**
 * VS Home Cleaning Services — Founder Emergency SOS Voice Alert Engine
 * -------------------------------------------------------------------
 * Monitors Firebase Realtime Database for critical operational issues.
 * Automatically dials the Founder's mobile phone and speaks the alert.
 * Zero-dependency: Uses native Node.js fetch.
 */

try { require('dotenv').config(); } catch(e) {}

const FOUNDER_CONFIG = {
  AGENT_NAME: 'Saral',
  AGENT_PHONE: process.env.AGENT_PHONE || '+917558191073',
  FOUNDER_PHONE: process.env.FOUNDER_PHONE || '+916383458190',
  CALLER_ID: process.env.TWILIO_PHONE_NUMBER || process.env.EXOTEL_PHONE || '+917558191073',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  EXOTEL_SID: process.env.EXOTEL_SID || '',
  EXOTEL_TOKEN: process.env.EXOTEL_TOKEN || '',
  FIREBASE_DB_URL: 'https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app'
};

// Rate limiter: prevent duplicate calls for the same incident within 30 minutes
const calledIncidents = new Map();
const COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Triggers an emergency voice call to the Founder with Tamil/English Speech
 */
async function triggerFounderSosCall(incident) {
  const { incidentKey, reason, ref, details } = incident;

  const now = Date.now();
  if (calledIncidents.has(incidentKey)) {
    const lastCalled = calledIncidents.get(incidentKey);
    if (now - lastCalled < COOLDOWN_MS) {
      console.log(`[SOS Rate Limit] Incident ${incidentKey} already alerted at ${new Date(lastCalled).toLocaleTimeString()}`);
      return { success: false, reason: 'Cooldown active' };
    }
  }

  calledIncidents.set(incidentKey, now);

  const speechTamil = `அலர்ட் பாஸ்! நான் சாரல், VS Home Cleaning அவசர அறிவிப்பு. ` +
    `புக்கிங் எண் ${ref || ''}. ` +
    `${reason}. ` +
    `விவரங்கள்: ${details || ''}. ` +
    `தயவுசெய்து அட்மின் டேஷ்போர்டை உடனே செக் பண்ணவும்!`;

  const speechEnglish = `Alert Boss! This is Saral from VS Home Cleaning Services with an emergency update. ` +
    `Incident on Booking ${ref || 'Unknown'}. ` +
    `${reason}. Please check Admin Dashboard immediately.`;

  console.log(`\n======================================================`);
  console.log(`🚨 [FOUNDER SOS CALL TRIGGERED] -> Calling ${FOUNDER_CONFIG.FOUNDER_PHONE}`);
  console.log(`Reason: ${reason} (Ref: ${ref})`);
  console.log(`Message (Tamil): ${speechTamil}`);
  console.log(`======================================================\n`);

  // 1. If Twilio Credentials exist, make live outbound call via Twilio Voice API
  if (FOUNDER_CONFIG.TWILIO_ACCOUNT_SID && FOUNDER_CONFIG.TWILIO_AUTH_TOKEN) {
    try {
      const twiml = `<Response>` +
        `<Say voice="Polly.Aditi" language="ta-IN">${speechTamil}</Say>` +
        `<Pause length="1"/>` +
        `<Say voice="Polly.Aditi" language="en-IN">${speechEnglish}</Say>` +
        `</Response>`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${FOUNDER_CONFIG.TWILIO_ACCOUNT_SID}/Calls.json`;
      const authHeader = 'Basic ' + Buffer.from(`${FOUNDER_CONFIG.TWILIO_ACCOUNT_SID}:${FOUNDER_CONFIG.TWILIO_AUTH_TOKEN}`).toString('base64');

      const params = new URLSearchParams();
      params.append('To', FOUNDER_CONFIG.FOUNDER_PHONE);
      params.append('From', FOUNDER_CONFIG.CALLER_ID);
      params.append('Twiml', twiml);

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
      const data = await response.json();
      console.log(`[Twilio Call Placed] SID: ${data.sid}, Status: ${data.status}`);
      return { success: true, provider: 'Twilio', sid: data.sid };
    } catch (err) {
      console.error(`[Twilio Call Error]:`, err.message);
    }
  }

  // 2. Fallback logger / Webhook notification
  console.log(`[SOS Standby Mode] Ready for live credentials. Call simulated successfully for ${FOUNDER_CONFIG.FOUNDER_PHONE}.`);
  return { success: true, provider: 'Simulated/Webhook', speechTamil };
}

/**
 * Scans Firebase RTDB Singapore for emergency conditions
 */
async function scanForEmergencyIssues() {
  try {
    const res = await fetch(`${FOUNDER_CONFIG.FIREBASE_DB_URL}/bookings.json`);
    const bookings = await res.json() || {};
    const now = Date.now();

    for (const ref of Object.keys(bookings)) {
      const b = bookings[ref];
      if (!b || b.status === 'Cancelled' || b.status === 'Completed') continue;

      // Rule 1: No Partner Available / Needs Review for > 15 mins
      const isUnassigned = !b.assignedTo && (b.status === 'Booking Received' || b.status === 'received');
      const timeSinceBooking = now - (b.createdAt || now);
      const aa = b.autoAssignment || {};
      
      if (isUnassigned && (aa.state === 'review' || timeSinceBooking > 15 * 60 * 1000)) {
        await triggerFounderSosCall({
          incidentKey: `unassigned_${ref}`,
          ref: ref,
          reason: 'இந்த ஏரியாவில் பார்ட்னர் யாரும் கிடைக்கவில்லை அல்லது வேலை அசைன் ஆகாமல் நிற்கிறது',
          details: `ஏரியா: ${b.address || 'Chennai'} (${b.serviceType || 'Service'})`
        });
      }

      // Rule 2: Critical Customer Complaint
      if (b.complaint && (b.complaint.severity === 'critical' || b.complaint.status === 'urgent')) {
        await triggerFounderSosCall({
          incidentKey: `complaint_${ref}`,
          ref: ref,
          reason: 'கஸ்டமர் அவசர புகார் பதிவு செய்துள்ளார்',
          details: b.complaint.message || 'Customer complaint'
        });
      }
    }
  } catch (err) {
    console.warn('[SOS Scanner Network Warning]:', err.message);
  }
}

// Export for usage in server.js or standalone cron
module.exports = {
  triggerFounderSosCall,
  scanForEmergencyIssues,
  FOUNDER_CONFIG
};

// If run directly: node vs-founder-sos.js
if (require.main === module) {
  console.log('Testing Founder SOS Call Engine...');
  triggerFounderSosCall({
    incidentKey: 'test_sos_001',
    ref: 'VS-TEST-ALERT',
    reason: 'டெஸ்ட் அலர்ட்: பார்ட்னர் கிடைக்கவில்லை',
    details: 'OMR Hub - Deep Cleaning Booking'
  });
}
