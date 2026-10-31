/**
 * VS Home Cleaning Services — Customer Inbound AI Phone Helpline
 * ----------------------------------------------------------------
 * Handles incoming customer phone calls 24/7 with zero human employees.
 * Generates TwiML / Voice XML or connects to Conversational Voice AI.
 */

try { require('dotenv').config(); } catch(e) {}

const DB_URL = 'https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app';
const AGENT_NAME = 'Saral';
const AGENT_PHONE = process.env.AGENT_PHONE || '+917558191073';
const FOUNDER_PHONE = process.env.FOUNDER_PHONE || '+916383458190';

/**
 * 1. Initial Call Greeting & Interactive Voice Menu (IVR / Speech)
 */
function handleInboundCall() {
  const greetingTamil = `வணக்கம்! VS Home Cleaning Services-க்கு வரவேற்கிறோம். நான் உங்கள் AI உதவியாளர் சாரல் (Saral). `;
  const menuTamil = `புதிய கிளீனிங் புக்கிங் செய்ய 1-ஐ அழுத்தவும். ` +
    `உங்கள் புக்கிங் நிலை அறிய 2-ஐ அழுத்தவும். ` +
    `எங்கள் நிறுவனருடன் நேரடியாக பேச 3-ஐ அழுத்தவும்.`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="ta-IN">${greetingTamil}</Say>
  <Gather numDigits="1" action="/voice/menu-select" method="POST" timeout="8">
    <Say voice="Polly.Aditi" language="ta-IN">${menuTamil}</Say>
    <Say voice="Polly.Aditi" language="en-IN">Welcome to VS Home Cleaning Services. I am Saral, your AI assistant. Press 1 for New Booking, Press 2 for Booking Status, Press 3 to speak directly with our Founder.</Say>
  </Gather>
  <Redirect>/voice/incoming</Redirect>
</Response>`;

  return twiml;
}

/**
 * 2. Menu Selection Handler
 */
async function handleMenuSelection(digit, callerPhone) {
  let twiml = '';

  if (digit === '1') {
    // New Booking Flow
    const bookingMsg = `நன்றி! எங்கள் வெப்சைட்டில் சலுகையுடன் உடனடியாக புக் செய்ய உங்கள் வாட்ஸ்அப் எண்ணிற்கு இப்போது ஒரு பிரத்யேக லிங்க் அனுப்பியுள்ளோம். அல்லது தொடர்ந்து பேசவும்.`;
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="ta-IN">${bookingMsg}</Say>
  <Say voice="Polly.Aditi" language="en-IN">A direct booking link with festival discounts has been sent to your WhatsApp number.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Aditi" language="ta-IN">எங்கள் சேவைக்குழு உங்களை உடனே திரும்ப அழைக்கும். நன்றி!</Say>
</Response>`;

  } else if (digit === '2') {
    // Status Lookup Flow
    // Look up caller phone in Firebase
    let statusText = 'உங்கள் எண்ணில் சமீபத்திய புக்கிங் எதுவும் காணப்படவில்லை.';
    try {
      const res = await fetch(`${DB_URL}/bookings.json`);
      const bookings = await res.json() || {};
      const cleanCaller = (callerPhone || '').replace(/\D/g, '').slice(-10);

      for (const ref of Object.keys(bookings)) {
        const b = bookings[ref];
        if (!b) continue;
        const bPhone = (b.mobile || b.phone || '').replace(/\D/g, '').slice(-10);
        if (cleanCaller && bPhone === cleanCaller) {
          statusText = `உங்கள் புக்கிங் எண் ${ref}. இதன் நிலை: ${b.status || 'Received'}. ` +
            (b.assignedName ? `உங்களுக்கு நியமிக்கப்பட்ட கிளீனர் ${b.assignedName}. ` : 'கிளீனர் ஒதுக்கப்பட்டு வருகிறார். ');
          break;
        }
      }
    } catch (e) {
      console.warn('Status lookup fallback:', e.message);
    }

    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="ta-IN">${statusText}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Aditi" language="ta-IN">மேலும் உதவிக்கு எங்களை வாட்ஸ்அப்பில் தொடர்பு கொள்ளவும். நன்றி!</Say>
</Response>`;

  } else if (digit === '3') {
    // Forward / Patch directly to Founder
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="ta-IN">உங்கள் அழைப்பு எங்கள் நிறுவனருக்கு இணைக்கப்படுகிறது. தயவுசெய்து காத்திருக்கவும்.</Say>
  <Say voice="Polly.Aditi" language="en-IN">Connecting your call to our Founder. Please stay on the line.</Say>
  <Dial callerId="${callerPhone || ''}">${FOUNDER_PHONE}</Dial>
</Response>`;

  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="ta-IN">தவறான தேர்வு. மீண்டும் முயற்சிக்கவும்.</Say>
  <Redirect>/voice/incoming</Redirect>
</Response>`;
  }

  return twiml;
}

module.exports = {
  handleInboundCall,
  handleMenuSelection
};
