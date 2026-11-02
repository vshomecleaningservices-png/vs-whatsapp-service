/**
 * VS Home Cleaning Services — Saral AI Conversational Agent
 * ==========================================================
 * Fully Humanised Conversational Brain for WhatsApp (+91 75581 91073).
 * 
 * 6 Supported Languages:
 * 1. English
 * 2. தமிழ் (Tamil)
 * 3. Tanglish (Tamil in English letters)
 * 4. हिन्दी (Hindi)
 * 5. తెలుగు (Telugu)
 * 6. ಕನ್ನಡ (Kannada)
 * 
 * - Full multi-turn state persistence (Cart, Address, Slot, Language)
 * - Zero loops, zero repeated menus, zero hallucinations
 * - Explicit Summary Card before order creation with Payment Link
 * - On "YES": Creates booking in Firebase, auto-assigns to Partner App (partnerJobs),
 *   and sends Live GPS Tracking Link + Online Payment Link.
 */

const fs = require('fs');
const path = require('path');

// Auto-load .env if exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m) {
        let v = (m[2] || '').trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  } catch (e) {}
}

const FIREBASE_DB_URL = 'https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app';
const FOUNDER_PHONE = '916383458190';
const WEBSITE_URL = 'https://vshomecleaningservices.in';

// In-Memory Sessions
const sessions = new Map();

function getSession(phone) {
  const digits = String(phone).replace(/\D/g, '');
  const cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits;
  const isValidMobile = /^[6-9]\d{9}$/.test(cleanPhone);
  if (!sessions.has(cleanPhone)) {
    sessions.set(cleanPhone, {
      phone: cleanPhone,
      customerPhone: isValidMobile ? cleanPhone : null,
      name: null,
      lang: null,
      stage: 'asking_lang',
      cart: null,
      services: [],
      address: null,
      pincode: null,
      date: null,
      time: null,
      pendingRef: null,
      history: []
    });
  }
  return sessions.get(cleanPhone);
}

function generateRef() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `VS-${yy}${mm}${dd}-${rand}`;
}

// -------------------------------------------------------------
// Multi-Language Strings Dictionary
// -------------------------------------------------------------
const I18N = {
  welcome: `Welcome to VS Home Cleaning Services, Chennai! 🧹✨
I am Saaral from Customer Operations.

Please select your preferred language to assist you:
1️⃣ English
2️⃣ தமிழ் (Tamil)
3️⃣ Tanglish (Tamil in English letters)
4️⃣ हिन्दी (Hindi)
5️⃣ తెలుగు (Telugu)
6️⃣ ಕನ್ನಡ (Kannada)

(Reply 1, 2, 3, 4, 5, or 6)`,

  cartAcknowledged: {
    en: (items, total) => `Thank you! I have received your cart order:
📋 *Services:* ${items}
💰 *Total Amount:* ₹${total} (Zero advance — 100% pay after inspection)

To schedule your certified cleaning specialist, please share:
📍 *Your Complete Delivery Address & Pincode in Chennai*
📅 *Preferred Date & Time Slot* (e.g. Tomorrow 10:00 AM)`,

    ta: (items, total) => `நன்றி! உங்கள் வாட்ஸ்அப் கார்ட் ஆர்டர் பெறப்பட்டது:
📋 *சேவைகள்:* ${items}
💰 *மொத்தத் தொகை:* ₹${total} (முன்பணம் எதுவும் இல்லை — வேலை முடிந்த பின் கட்டணம்)

எங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட் வர வேண்டிய:
📍 *உங்கள் முழு சென்னை முகவரி மற்றும் PIN Code*
📅 *விருப்பமான தேதி & நேர ஸ்லாட்டை* அனுப்பவும் (எ.கா: Tomorrow 10:00 AM)`,

    tanglish: (items, total) => `Nandri! Unga WhatsApp Cart order vandhuduchu:
📋 *Services:* ${items}
💰 *Total Amount:* ₹${total} (Zero Advance — Service mudinja appo pay pannalaam)

Specialist-ah assign panna:
📍 *Unga complete Chennai Address & Pincode*
📅 *Ungaluku convenient aana Date & Time Slot* share pannunga (e.g. Tomorrow 10:00 AM)`,

    hi: (items, total) => `धन्यवाद! आपका कार्ट ऑर्डर मिल गया है:
📋 *सेवाएं:* ${items}
💰 *कुल राशि:* ₹${total} (शून्य अग्रिम — निरीक्षण के बाद 100% भुगतान)

विशेषज्ञ आवंटित करने के लिए कृपया साझा करें:
📍 *चेन्नई में आपका पूरा पता और पिनकोड*
📅 *पसंदीदा तारीख और समय* (जैसे: कल सुबह 10:00 बजे)`,

    te: (items, total) => `ధన్యవాదాలు! మీ కార్ట్ ఆర్డర్ అందింది:
📋 *సేవలు:* ${items}
💰 *మొత్తం:* ₹${total} (జీరో అడ్వాన్స్ — పని చూసిన తర్వాతే చెల్లించండి)

స్పెషలిస్ట్‌ను కేటాయించడానికి దయచేసి పంపండి:
📍 *చెన్నైలోని మీ పూర్తి చిరునామా మరియు పిన్‌కోడ్*
📅 *కావలసిన తేదీ & సమయం* (ఉదా: రేపు ఉదయం 10:00 గంటలకు)`,

    kn: (items, total) => `ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಕಾರ್ಟ್ ಆರ್ಡರ್ ಸ್ವೀಕರಿಸಲಾಗಿದೆ:
📋 *ಸೇವೆಗಳು:* ${items}
💰 *ಒಟ್ಟು ಮೊತ್ತ:* ₹${total} (ಮುಂಗಡ ಹಣವಿಲ್ಲ — ಕೆಲಸ ಮುಗಿದ ನಂತರ ಪಾವತಿಸಿ)

ಸ್ಪೆಷಲಿಸ್ಟ್ ನಿಯೋಜಿಸಲು ದಯವಿಟ್ಟು ಕಳುಹಿಸಿ:
📍 *ಚೆನ್ನೈನಲ್ಲಿ ನಿಮ್ಮ ಸಂಪೂರ್ಣ ವಿಳಾಸ ಮತ್ತು ಪಿನ್‌ಕೋಡ್*
📅 *ದಿನಾಂಕ & ಸಮಯ* (ಉದಾ: ನಾಳೆ ಬೆಳಗ್ಗೆ 10:00)`
  },

  askSlotOnly: {
    en: (addr) => `Address saved: ${addr} 📍

Which date and time slot would you prefer?
🌅 Morning: 08:00 AM - 10:00 AM
☀️ Morning: 10:00 AM - 12:00 PM
🌤️ Afternoon: 02:00 PM - 04:00 PM
🌆 Evening: 04:00 PM - 06:00 PM`,

    ta: (addr) => `முகவரி பதிவானது: ${addr} 📍

எந்த தேதி மற்றும் நேர ஸ்லாட் உங்களுக்கு வசதியாக இருக்கும்?
🌅 காலை: 08:00 AM - 10:00 AM
☀️ காலை: 10:00 AM - 12:00 PM
🌤️ மதியம்: 02:00 PM - 04:00 PM
🌆 மாலை: 04:00 PM - 06:00 PM`,

    tanglish: (addr) => `Address note pannikittom: ${addr} 📍

Enthe date and time slot ungaluku convenient?
🌅 Morning: 08:00 AM - 10:00 AM
☀️ Morning: 10:00 AM - 12:00 PM
🌤️ Afternoon: 02:00 PM - 04:00 PM
🌆 Evening: 04:00 PM - 06:00 PM`,

    hi: (addr) => `पता सहेज लिया गया: ${addr} 📍

आपके लिए कौन सा समय सही रहेगा?
🌅 सुबह: 08:00 AM - 10:00 AM
☀️ सुबह: 10:00 AM - 12:00 PM
🌤️ दोपहर: 02:00 PM - 04:00 PM
🌆 शाम: 04:00 PM - 06:00 PM`,

    te: (addr) => `చిరునామా సేవ్ చేయబడింది: ${addr} 📍

మీకు ఏ సమయం అనుకూలంగా ఉంటుంది?
🌅 ఉదయం: 08:00 AM - 10:00 AM
☀️ ఉదయం: 10:00 AM - 12:00 PM
🌤️ మధ్యాహ్నం: 02:00 PM - 04:00 PM
🌆 సాయంత్రం: 04:00 PM - 06:00 PM`,

    kn: (addr) => `ವಿಳಾಸ ನಮೂದಿಸಲಾಗಿದೆ: ${addr} 📍

ನಿಮಗೆ ಯಾವ ಸಮಯ ಅನುಕೂಲ?
🌅 ಬೆಳಗ್ಗೆ: 08:00 AM - 10:00 AM
☀️ ಬೆಳಗ್ಗೆ: 10:00 AM - 12:00 PM
🌤️ ಮಧ್ಯಾಹ್ನ: 02:00 PM - 04:00 PM
🌆 ಸಂಜೆ: 04:00 PM - 06:00 PM`
  },

  summaryCard: {
    en: (ref, service, addr, slot, total, payLink) => `Here are your booking details:
━━━━━━━━━━━━━━━━━━━━━━
🏢 *VS Home Cleaning Services*
🔖 *Reference:* ${ref}
🧹 *Service:* ${service}
📍 *Address:* ${addr}
📅 *Slot:* ${slot}
💰 *Total Amount:* ₹${total} (Pay after service)
💳 *Payment Link:* ${payLink}
━━━━━━━━━━━━━━━━━━━━━━

Shall I confirm this booking and assign your specialist now?
👉 Reply *YES* to confirm`,

    ta: (ref, service, addr, slot, total, payLink) => `உங்கள் புக்கிங் விவரங்கள்:
━━━━━━━━━━━━━━━━━━━━━━
🏢 *VS Home Cleaning Services*
🔖 *புக்கிங் எண்:* ${ref}
🧹 *சேவை:* ${service}
📍 *முகவரி:* ${addr}
📅 *நேர ஸ்லாட்:* ${slot}
💰 *மொத்தத் தொகை:* ₹${total} (வேலை முடிந்த பின் தரலாம்)
💳 *ஆன்லைன் பேமெண்ட் லிங்க்:* ${payLink}
━━━━━━━━━━━━━━━━━━━━━━

உங்கள் புக்கிங்கை உறுதி செய்து ஸ்பெஷலிஸ்ட்டை ஒதுக்கவா?
👉 உறுதி செய்ய *YES* என பதிலளிக்கவும்`,

    tanglish: (ref, service, addr, slot, total, payLink) => `Unga booking summary details:
━━━━━━━━━━━━━━━━━━━━━━
🏢 *VS Home Cleaning Services*
🔖 *Booking Ref:* ${ref}
🧹 *Service:* ${service}
📍 *Address:* ${addr}
📅 *Slot:* ${slot}
💰 *Total Amount:* ₹${total} (Inspection mudinju pay pannalaam)
💳 *Payment Link:* ${payLink}
━━━━━━━━━━━━━━━━━━━━━━

Booking confirm panni specialist assign pannatuma?
👉 Confirm panna *YES* nu reply pannunga`,

    hi: (ref, service, addr, slot, total, payLink) => `आपकी बुकिंग का विवरण:
━━━━━━━━━━━━━━━━━━━━━━
🏢 *VS Home Cleaning Services*
🔖 *बुकिंग संदर्भ:* ${ref}
🧹 *सेवा:* ${service}
📍 *पता:* ${addr}
📅 *समय:* ${slot}
💰 *कुल राशि:* ₹${total} (सेवा के बाद भुगतान)
💳 *पेमेंट लिंक:* ${payLink}
━━━━━━━━━━━━━━━━━━━━━━

क्या मैं इस बुकिंग की पुष्टि करूं और विशेषज्ञ आवंटित करूं?
👉 पुष्टि के लिए *YES* लिखकर भेजें`,

    te: (ref, service, addr, slot, total, payLink) => `మీ బుకింగ్ వివరాలు:
━━━━━━━━━━━━━━━━━━━━━━
🏢 *VS Home Cleaning Services*
🔖 *బుకింగ్ నంబర్:* ${ref}
🧹 *సేవ:* ${service}
📍 *చిరునామా:* ${addr}
📅 *సమయం:* ${slot}
💰 *మొత్తం:* ₹${total} (సేవ తర్వాత చెల్లింపు)
💳 *ఆన్‌లైన్ పేమెంట్ లింక్:* ${payLink}
━━━━━━━━━━━━━━━━━━━━━━

ఈ బుకింగ్‌ను కన్ఫర్మ్ చేసి స్పెషలిస్ట్‌ను కేటాయించమంటారా?
👉 కన్ఫర్మ్ చేయడానికి *YES* అని రిప్లై ఇవ్వండి`,

    kn: (ref, service, addr, slot, total, payLink) => `ನಿಮ್ಮ ಬುಕಿಂಗ್ ವಿವರಗಳು:
━━━━━━━━━━━━━━━━━━━━━━
🏢 *VS Home Cleaning Services*
🔖 *ಬುಕಿಂಗ್ ರೆಫರೆನ್ಸ್:* ${ref}
🧹 *ಸೇವೆ:* ${service}
📍 *ವಿಳಾಸ:* ${addr}
📅 *ಸಮಯ:* ${slot}
💰 *ಒಟ್ಟು ಮೊತ್ತ:* ₹${total} (ಸೇವೆಯ ನಂತರ ಪಾವತಿ)
💳 *ಆನ್‌ಲೈನ್ ಪಾವತಿ ಲಿಂಕ್:* ${payLink}
━━━━━━━━━━━━━━━━━━━━━━

ಬುಕಿಂಗ್ ದೃಢೀಕರಿಸಿ ಸ್ಪೆಷಲಿಸ್ಟ್ ನಿಯೋಜಿಸಬೇಕೇ?
👉 ಖಚಿತಪಡಿಸಲು *YES* ಎಂದು ಉತ್ತರಿಸಿ`
  },

  confirmed: {
    en: (ref, trackLink, payLink) => `🎉 *Your booking is CONFIRMED!* (Ref: ${ref})
A certified cleaning specialist has been assigned to your service.

📍 *Track your specialist live:* ${trackLink}
💳 *Online Payment Link:* ${payLink}

Our team will arrive on time with complete mechanized equipment and eco-safe chemicals. Thank you for choosing VS Home Cleaning Services!`,

    ta: (ref, trackLink, payLink) => `🎉 *உங்கள் புக்கிங் வெற்றிகரமாக உறுதி செய்யப்பட்டது!* (எண்: ${ref})
உங்களுக்காக பயிற்சி பெற்ற கிளீனிங் ஸ்பெஷலிஸ்ட் ஒதுக்கப்பட்டுவிட்டார்.

📍 *நேரலை ட்ராக்கிங் லிங்க்:* ${trackLink}
💳 *ஆன்லைனில் செலுத்த:* ${payLink}

எங்கள் குழுவினர் முழு மெஷினரி உபகரணங்களுடன் சரியான நேரத்தில் வருவார்கள். VS Home Cleaning Services-ஐ தேர்ந்தெடுத்ததற்கு நன்றி!`,

    tanglish: (ref, trackLink, payLink) => `🎉 *Unga booking CONFIRM aayiduchu!* (Ref: ${ref})
Unga service-ku certified cleaning specialist assign aagitaaru.

📍 *Live Tracking Link:* ${trackLink}
💳 *Online Pay Link:* ${payLink}

Specialist complete mechanized equipment-oda on-time-la vandhuduvaanga. Thank you for choosing VS Home Cleaning Services!`,

    hi: (ref, trackLink, payLink) => `🎉 *आपकी बुकिंग की पुष्टि हो गई है!* (संदर्भ: ${ref})
आपके लिए प्रमाणित सफाई विशेषज्ञ आवंटित कर दिया गया है।

📍 *लाइव ट्रैकिंग:* ${trackLink}
💳 *ऑनलाइन भुगतान लिंक:* ${payLink}

हमारी टीम आधुनिक मशीनों के साथ समय पर पहुंचेगी। VS Home Cleaning Services चुनने के लिए धन्यवाद!`,

    te: (ref, trackLink, payLink) => `🎉 *మీ బుకింగ్ విజయవంతంగా కన్ఫర్మ్ అయింది!* (నంబర్: ${ref})
సర్టిఫైడ్ క్లీనింగ్ స్పెషలిస్ట్ కేటాయించబడ్డారు.

📍 *లైవ్ ట్రాకింగ్:* ${trackLink}
💳 *ఆన్‌లైన్ పేమెంట్:* ${payLink}

మా బృందం పూర్తి పరికరాలతో సమయానికి చేరుకుంటుంది. VS Home Cleaning Services ఎంచుకున్నందుకు ధన్యవాదాలు!`,

    kn: (ref, trackLink, payLink) => `🎉 *ನಿಮ್ಮ ಬುಕಿಂಗ್ ದೃಢೀಕರಿಸಲಾಗಿದೆ!* (ರೆಫರೆನ್ಸ್: ${ref})
ಪ್ರಮಾಣೀಕೃತ ಕ್ಲೀನಿಂಗ್ ಸ್ಪೆಷಲಿಸ್ಟ್ ನಿಯೋಜಿಸಲಾಗಿದೆ.

📍 *ಲೈವ್ ಟ್ರ್ಯಾಕಿಂಗ್:* ${trackLink}
💳 *ಆನ್‌ಲೈನ್ ಪಾವತಿ:* ${payLink}

ನಮ್ಮ ತಂಡವು ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ ಎಲ್ಲಾ ಉಪಕರಣಗಳೊಂದಿಗೆ ತಲುಪುತ್ತದೆ. VS Home Cleaning Services ಆಯ್ಕೆ ಮಾಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು!`
  }
};

// -------------------------------------------------------------
// Helper Extractors
// -------------------------------------------------------------
function detectLanguageChoice(text) {
  const t = text.trim().toLowerCase();
  if (t === '1' || t === 'english' || t === 'eng') return 'en';
  if (t === '2' || t === 'tamil' || t === 'தமிழ்' || t === 'tam') return 'ta';
  if (t === '3' || t === 'tanglish') return 'tanglish';
  if (t === '4' || t === 'hindi' || t === 'हिन्दी') return 'hi';
  if (t === '5' || t === 'telugu' || t === 'తెలుగు') return 'te';
  if (t === '6' || t === 'kannada' || t === 'ಕನ್ನಡ') return 'kn';
  return null;
}

function extractPincode(text) {
  const m = text.match(/\b600\d{3}\b/);
  return m ? m[0] : null;
}

function isAddressLike(text) {
  const t = text.toLowerCase();
  const hasPin = /\b600\d{3}\b/.test(t);
  const addressKeywords = ['nagar', 'street', 'road', 'st', 'rd', 'flat', 'plot', 'door', 'avenue', 'colony', 'apartment', 'chennai', 'ayanavaram', 'anna nagar', 'velachery', 'adyar', 'tambaram', 't nagar', 'porur', 'guindy', 'kodambakkam', 'mylapore', 'perambur', 'kilpauk', 'vadapalani', 'chromepet', 'medavakkam', 'omr', 'ecr', 'ambattur', 'madipakkam'];
  const matches = addressKeywords.filter(k => t.includes(k)).length;
  return hasPin || matches >= 2 || (matches >= 1 && /\d+/.test(t));
}

function extractDateAndTime(text) {
  const lower = text.toLowerCase();
  let date = null;
  let time = null;

  if (lower.includes('today') || lower.includes('இன்னைக்கு') || lower.includes('aaj') || lower.includes('ఈరోజు') || lower.includes('ಇಂದು')) {
    date = 'Today';
  } else if (lower.includes('tomorrow') || lower.includes('நாளை') || lower.includes('kal') || lower.includes('రేపు') || lower.includes('ನಾಳೆ')) {
    date = 'Tomorrow';
  } else {
    const dm = text.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
    if (dm) date = dm[0];
  }

  const tm = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))/i);
  if (tm) {
    time = tm[0].toUpperCase();
  } else if (lower.includes('morning') || lower.includes('காலை') || lower.includes('सुबह') || lower.includes('ఉదయం') || lower.includes('ಬೆಳಗ್ಗೆ')) {
    time = '10:00 AM - 12:00 PM';
  } else if (lower.includes('afternoon') || lower.includes('மதியம்') || lower.includes('दोपहर') || lower.includes('మధ్యాహ్నం')) {
    time = '02:00 PM - 04:00 PM';
  } else if (lower.includes('evening') || lower.includes('மாலை') || lower.includes('शाम') || lower.includes('సాయంత్రం') || lower.includes('ಸಂಜೆ')) {
    time = '04:00 PM - 06:00 PM';
  }

  return { date, time };
}

// -------------------------------------------------------------
// Firebase Booking Writer & Auto-Dispatch
// -------------------------------------------------------------
async function saveBookingToFirebase(session, notifier) {
  const ref = session.pendingRef || generateRef();
  session.pendingRef = null;
  const total = session.services.reduce((sum, s) => sum + s.price, 0) || 499;
  const mobile = (/^[6-9]\d{9}$/.test(session.customerPhone) ? session.customerPhone : (/^[6-9]\d{9}$/.test(session.phone) ? session.phone : '7200910738'));
  const serviceNames = session.services.map(s => s.name).join(' + ') || 'Classic Bathroom Cleaning';

  const bookingData = {
    ref,
    name: session.name || 'WhatsApp Customer',
    mobile,
    serviceType: serviceNames,
    address: session.address ? `${session.address} (PIN: ${session.pincode || '600001'})` : `Chennai - ${session.pincode || '600001'}`,
    pincode: session.pincode || '600001',
    preferredDate: session.date || 'Tomorrow',
    preferredTime: session.time || '10:00 AM - 12:00 PM',
    status: 'Team Assigned',
    paymentType: 'COD',
    paymentMethod: 'Cash on Service / Online UPI',
    total,
    subtotal: total,
    createdAt: Date.now(),
    bookedVia: 'WhatsApp Saaral Human Executive',
    notes: 'Booked via WhatsApp with auto-assignment'
  };

  // Find active partner
  let partnerUid = 'partner-1';
  let partnerName = 'Vignesh S';
  let partnerPhone = '916383458190';

  try {
    const pRes = await fetch(`${FIREBASE_DB_URL}/partners.json`);
    const pData = await pRes.json();
    if (pData && !pData.error && typeof pData === 'object') {
      const keys = Object.keys(pData);
      for (const k of keys) {
        if (pData[k] && (pData[k].accountStatus === 'active' || !pData[k].accountStatus)) {
          partnerUid = k;
          partnerName = pData[k].name || 'Vignesh S';
          partnerPhone = pData[k].phone || pData[k].phoneNumber || '916383458190';
          break;
        }
      }
    }
  } catch (e) {}

  bookingData.assignedTo = partnerUid;
  bookingData.assignedPartnerName = partnerName;
  bookingData.assignedPartnerMobile = partnerPhone;

  try {
    // 1. Write to /bookings
    await fetch(`${FIREBASE_DB_URL}/bookings/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData)
    });

    // 2. Write to /bookingLookup, phone mirror, and recent_bookings
    const lookupRecord = {
      ref,
      status: 'Team Assigned',
      serviceType: bookingData.serviceType,
      total,
      preferredDate: bookingData.preferredDate,
      preferredTime: bookingData.preferredTime,
      customerName: bookingData.name,
      customerMobile: mobile,
      assignedPartnerName: partnerName
    };
    const p10 = String(mobile).replace(/\D/g, '').slice(-10);
    await Promise.allSettled([
      fetch(`${FIREBASE_DB_URL}/bookingLookup/${ref}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lookupRecord)
      }),
      p10 ? fetch(`${FIREBASE_DB_URL}/bookingLookup/by_phone_${p10}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lookupRecord)
      }) : Promise.resolve(),
      fetch(`${FIREBASE_DB_URL}/bookingLookup/recent_bookings/${ref}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lookupRecord)
      })
    ]);

    // 3. Write to /partnerJobs
    const partnerJobPayload = {
      bookingRef: ref,
      serviceType: bookingData.serviceType,
      category: 'cleaning',
      customerName: bookingData.name,
      customerPhone: mobile,
      address: bookingData.address,
      area: session.pincode || 'Chennai',
      distance: '2.5 km',
      date: bookingData.preferredDate,
      time: bookingData.preferredTime,
      price: total,
      serviceValue: total,
      commission: Math.round(total * 0.15),
      netEarnings: Math.round(total * 0.85),
      status: 'pending',
      scheduledTimeGroup: 'upcoming',
      assignedPartnerId: partnerUid,
      createdAt: Date.now()
    };

    await fetch(`${FIREBASE_DB_URL}/partnerJobs/${partnerUid}/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partnerJobPayload)
    });

    // 4. Partner Notification
    await fetch(`${FIREBASE_DB_URL}/partnerNotifications/${partnerUid}/notif_${Date.now()}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New Job Assigned!',
        description: `New ${bookingData.serviceType} at ${bookingData.address}`,
        time: 'Just now',
        category: 'Jobs',
        unread: true,
        actionScreen: 'job_detail',
        jobId: ref,
        createdAt: Date.now()
      })
    });

    // 5. Alert partner via WhatsApp if notifier available
    if (notifier && partnerPhone) {
      const pClean = partnerPhone.replace(/\D/g, '');
      const partnerAlertMsg = `🔔 *NEW CLEANING JOB ASSIGNED!* 🔔\n\n` +
        `வணக்கம் *${partnerName}*!\n` +
        `உங்களுக்கு ஒரு புதிய கிளீனிங் ஆர்டர் ஒதுக்கப்பட்டுள்ளது!\n\n` +
        `🆔 *Booking Ref:* *${ref}*\n` +
        `🧹 *Service:* ${bookingData.serviceType}\n` +
        `📍 *Address:* ${bookingData.address}\n` +
        `📅 *Slot:* ${bookingData.preferredDate} (${bookingData.preferredTime})\n` +
        `💰 *Order Value:* ₹${total}\n` +
        `💵 *Your Net Payout:* ₹${Math.round(total * 0.85)}\n\n` +
        `Partner App-ஐ திறந்து உடனடியாக ஆர்டரை Accept செய்யவும்! ⚡`;
      try { await notifier(pClean, partnerAlertMsg); } catch (e) {}
    }
  } catch (err) {
    console.error('[saveBookingToFirebase error]:', err);
  }

  return bookingData;
}

// -------------------------------------------------------------
// Cart Handler
// -------------------------------------------------------------
async function handleCartOrder(phone, orderMsg, pushName) {
  const session = getSession(phone);
  if (pushName && !session.name) {
    session.name = pushName.replace(/[^\w\s]/gi, '').trim() || null;
  }

  const itemCount = orderMsg?.itemCount || 1;
  const rawTotal = orderMsg?.totalAmount1000;
  const total = rawTotal ? Math.round(Number(rawTotal) / 1000) : 1148;
  const orderTitle = orderMsg?.orderTitle || 'Cleaning Services';
  const ref = generateRef();
  session.pendingRef = ref;

  session.cart = {
    itemCount,
    total,
    title: orderTitle
  };

  session.services = [{
    id: 'whatsapp_cart',
    name: `${itemCount} Services (${orderTitle})`,
    price: total,
    count: itemCount
  }];

  session.stage = 'cart_received';

  // If customer has NOT picked a language yet, prompt with languages
  if (!session.lang) {
    return `🛒 *WHATSAPP CART ORDER RECEIVED!* ✨\n` +
      `(Total: ₹${total} for ${itemCount} services)\n\n` +
      I18N.welcome;
  }

  const lang = session.lang || 'en';
  return I18N.cartAcknowledged[lang](session.services[0].name, total);
}

// -------------------------------------------------------------
// Main Customer Message Processor
// -------------------------------------------------------------
async function processCustomerMessage(phone, userText, senderPushName, notifier) {
  const session = getSession(phone);
  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  // Extract real 10-digit mobile number if customer mentions it in message or address
  const phoneInText = text.match(/\b[6-9]\d{9}\b/);
  if (phoneInText) {
    session.customerPhone = phoneInText[0];
  }

  if (senderPushName && !session.name) {
    session.name = senderPushName.replace(/[^\w\s]/gi, '').trim() || null;
  }

  // 1. GREETINGS (Hi, Hello, Hey, Menu, Language) -> ALWAYS SHOW 6-LANGUAGE MENU!
  const isGreeting = ['hi', 'hello', 'hey', 'வணக்கம்', 'namaste', 'start', 'menu', 'vanakkam', 'language', 'change language'].includes(lower);
  if (isGreeting) {
    return I18N.welcome;
  }

  // 2. Language Selection Check (1 to 6)
  const pickedLang = detectLanguageChoice(text);
  if (pickedLang) {
    session.lang = pickedLang;
    const lang = session.lang;

    // If customer already sent a Cart or selected services
    if (session.services && session.services.length > 0) {
      const sName = session.services[0].name;
      const total = session.services.reduce((sum, s) => sum + s.price, 0);

      if (session.address && (session.date || session.time)) {
        session.stage = 'confirming';
        const payLink = `${WEBSITE_URL}/pay.html?ref=${session.pendingRef || generateRef()}&amount=${total}`;
        return I18N.summaryCard[lang](session.pendingRef, sName, session.address, `${session.date || 'Tomorrow'}, ${session.time || '10:00 AM'}`, total, payLink);
      } else if (session.address) {
        return I18N.askSlotOnly[lang](session.address);
      } else {
        return I18N.cartAcknowledged[lang](sName, total);
      }
    }

    // No cart yet -> Ask what service they need in their chosen language
    const langAck = {
      en: "Language set to English! 👍\nHow can we help you today? Are you looking for Bathroom, Kitchen, Sofa, or Full Home Cleaning?",
      ta: "மொழி தமிழ் என மாற்றப்பட்டது! 👍\nஇன்று உங்களுக்கு என்ன சேவை தேவைப்படுகிறது? பாத்ரூம், கிச்சன், சோபா அல்லது முழு வீடு சுத்தம் செய்வதா?",
      tanglish: "Language Tanglish-ku set aayiduchu! 👍\nInniku ungaluku enna service venum? Bathroom, Kitchen, Sofa, or Full Home Deep Cleaning?",
      hi: "भाषा हिंदी चुनी गई है! 👍\nआज हम आपकी क्या मदद कर सकते हैं? बाथरूम, किचन, सोफा या पूरे घर की सफाई?",
      te: "భాష తెలుగుగా మార్చబడింది! 👍\nఈరోజు మీకు ఏ సర్వీస్ కావాలి? బాత్రూమ్, కిచెన్, సోఫా లేదా పూర్తి ఇల్లు క్లీనింగ్?",
      kn: "ಭಾಷೆಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ! 👍\nಇಂದು ನಿಮಗೆ ಯಾವ ಸೇವೆ ಬೇಕು? ಬಾತ್‌ರೂಮ್, ಕಿಚನ್, ಸೋಫಾ ಅಥವಾ ಪೂರ್ಣ ಮನೆ ಶುಚಿಗೊಳಿಸುವಿಕೆ?"
    };
    return langAck[lang];
  }

  // Fallback language to English if not chosen yet
  const lang = session.lang || 'en';

  // 3. Explicit "YES" / "CONFIRM" Confirmation State
  const isConfirm = ['yes', 'confirm', 'ok', 'sure', 'yes confirm', 'proceed', 'done', 'சரி', 'ஆம்', 'ஹா', 'సరే', 'ಸರಿ'].includes(lower);
  if (isConfirm && (session.stage === 'confirming' || (session.address && session.services.length > 0))) {
    const total = session.services.reduce((sum, s) => sum + s.price, 0) || 1148;
    const ref = session.pendingRef || generateRef();
    session.pendingRef = ref;
    
    // Save to Firebase & Auto-Assign to partner
    await saveBookingToFirebase(session, notifier);

    session.stage = 'completed';
    const trackLink = `${WEBSITE_URL}/track.html?ref=${ref}`;
    const payLink = `${WEBSITE_URL}/pay.html?ref=${ref}&amount=${total}`;

    const confirmMsg = I18N.confirmed[lang](ref, trackLink, payLink);

    // Reset session for future bookings
    session.services = [];
    session.address = null;
    session.pendingRef = null;

    return confirmMsg;
  }

  // 4. Capture Address
  if (isAddressLike(text)) {
    session.address = text;
    const pin = extractPincode(text);
    if (pin) session.pincode = pin;

    // Check if slot was also in the same text
    const { date, time } = extractDateAndTime(text);
    if (date) session.date = date;
    if (time) session.time = time;

    // If we have services + address + slot -> Show Summary Card
    if (session.services && session.services.length > 0 && (session.date || session.time)) {
      session.stage = 'confirming';
      const ref = session.pendingRef || generateRef();
      session.pendingRef = ref;
      const total = session.services.reduce((sum, s) => sum + s.price, 0);
      const sName = session.services[0].name;
      const slot = `${session.date || 'Tomorrow'}, ${session.time || '10:00 AM - 12:00 PM'}`;
      const payLink = `${WEBSITE_URL}/pay.html?ref=${ref}&amount=${total}`;

      return I18N.summaryCard[lang](ref, sName, session.address, slot, total, payLink);
    } else {
      // Address received, ask ONLY for slot
      return I18N.askSlotOnly[lang](session.address);
    }
  }

  // 5. Capture Date & Time Slot
  const dt = extractDateAndTime(text);

  // Smart slot matching for simple texts like '10', '10am', 'morning', 'afternoon'
  const isMorning = lower.includes('morning') || lower === '10' || lower === '10 am' || lower === '10am' || lower.includes('8') || lower.includes('8am');
  const isAfternoon = lower.includes('afternoon') || lower === '2' || lower === '2 pm' || lower === '2pm';
  const isEvening = lower.includes('evening') || lower === '4' || lower === '4 pm' || lower === '4pm';

  if (!dt.time) {
    if (isMorning) dt.time = '10:00 AM - 12:00 PM';
    else if (isAfternoon) dt.time = '02:00 PM - 04:00 PM';
    else if (isEvening) dt.time = '04:00 PM - 06:00 PM';
  }
  if (!dt.date && dt.time) {
    dt.date = 'Tomorrow';
  }
  if (dt.date || dt.time) {
    if (dt.date) session.date = dt.date;
    if (dt.time) session.time = dt.time;

    if (session.services && session.services.length > 0 && session.address) {
      session.stage = 'confirming';
      const ref = session.pendingRef || generateRef();
      session.pendingRef = ref;
      const total = session.services.reduce((sum, s) => sum + s.price, 0);
      const sName = session.services[0].name;
      const slot = `${session.date || 'Tomorrow'}, ${session.time || '10:00 AM - 12:00 PM'}`;
      const payLink = `${WEBSITE_URL}/pay.html?ref=${ref}&amount=${total}`;

      return I18N.summaryCard[lang](ref, sName, session.address, slot, total, payLink);
    } else if (!session.address) {
      const askAddr = {
        en: `Slot noted: ${session.date || 'Tomorrow'} ${session.time || '10:00 AM'}. 📅\n\nPlease share your complete Chennai address & pincode to assign your specialist.`,
        ta: `நேர ஸ்லாட் பதிவானது: ${session.date || 'Tomorrow'} ${session.time || '10:00 AM'}. 📅\n\nஎங்கள் ஸ்பெஷலிஸ்ட் வர உங்கள் முழு சென்னை முகவரி மற்றும் PIN Code அனுப்பவும்.`,
        tanglish: `Slot note pannikittom: ${session.date || 'Tomorrow'} ${session.time || '10:00 AM'}. 📅\n\nSpecialist vara unga Chennai delivery address & pincode share pannunga.`,
        hi: `समय नोट कर लिया गया है। 📅\n\nकृपया विशेषज्ञ भेजने के लिए अपना पूरा पता और पिनकोड भेजें।`,
        te: `సమయం నమోదు చేయబడింది. 📅\n\nదయచేసి స్పెషలిస్ట్‌ను పంపడానికి మీ పూర్తి చిరునామా మరియు పిన్‌కోడ్ పంపండి.`,
        kn: `ಸಮಯ ನಮೂದಿಸಲಾಗಿದೆ. 📅\n\nಸ್ಪೆಷಲಿಸ್ಟ್ ಕಳುಹಿಸಲು ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸಂಪೂರ್ಣ ವಿಳಾಸ ಮತ್ತು ಪಿನ್‌ಕೋಡ್ ಕಳುಹಿಸಿ.`
      };
      return askAddr[lang];
    }
  }

  // 6. Direct Service Intent (e.g. "i want move in bathroom cleaning 2 tolet")
  if (lower.includes('bathroom') || lower.includes('tolet') || lower.includes('toilet')) {
    const qtyMatch = text.match(/(\d+)/);
    const count = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const pricePerUnit = lower.includes('move') ? 599 : (lower.includes('eco') || lower.includes('premium')) ? 549 : 499;
    const total = pricePerUnit * count;
    const sName = `Move-in Bathroom Cleaning (${count} Toilet${count > 1 ? 's' : ''})`;

    session.services = [{ id: 'b_custom', name: sName, price: total, count }];
    session.pendingRef = generateRef();

    if (session.address) {
      session.stage = 'confirming';
      const slot = `${session.date || 'Tomorrow'}, ${session.time || '10:00 AM'}`;
      const payLink = `${WEBSITE_URL}/pay.html?ref=${session.pendingRef}&amount=${total}`;
      return I18N.summaryCard[lang](session.pendingRef, sName, session.address, slot, total, payLink);
    } else {
      return I18N.cartAcknowledged[lang](sName, total);
    }
  }

  // 7. General Inquiry / Human Reply
  if (lower.includes('cost') || lower.includes('rate') || lower.includes('price')) {
    const rates = {
      en: "Here are our most popular cleaning services:\n• Bathroom Cleaning: ₹499 - ₹599 per bathroom\n• Kitchen Deep Cleaning: ₹999 - ₹1,499\n• Sofa Shampooing: ₹899 (3-seater), ₹1,399 (5-seater)\n• Full Home Deep Cleaning: ₹2,499 (1BHK), ₹3,499 (2BHK)\n\nWhich service would you like to book?",
      ta: "எங்களின் முக்கிய சேவைக் கட்டணங்கள்:\n• பாத்ரூம் கிளீனிங்: ₹499 முதல் ₹599 (ஒரு பாத்ரூம்)\n• கிச்சன் டீப் கிளீனிங்: ₹999 முதல் ₹1,499\n• சோபா ஷாம்பு கிளீனிங்: ₹899 (3-சீட்டர்), ₹1,399 (5-சீட்டர்)\n• முழு வீடு டீப் கிளீனிங்: ₹2,499 (1BHK), ₹3,499 (2BHK)\n\nஉங்களுக்கு இதில் எந்த சேவை தேவைப்படுகிறது?",
      tanglish: "Popular services rate card:\n• Bathroom Cleaning: ₹499 - ₹599 per bathroom\n• Kitchen Deep Cleaning: ₹999 - ₹1,499\n• Sofa Shampooing: ₹899 (3-seater), ₹1,399 (5-seater)\n• Full Home Deep Cleaning: ₹2,499 (1BHK), ₹3,499 (2BHK)\n\nUngaluku entha service book pannanum?",
      hi: "लोकप्रिय सेवाओं की दरें:\n• बाथरूम की सफाई: ₹499 - ₹599 प्रति बाथरूम\n• किचन डीप क्लीनिंग: ₹999 - ₹1,499\n• सोफा शैम्पू: ₹899 (3-सीटर), ₹1,399 (5-सीटर)\n• पूरे घर की गहरी सफाई: ₹2,499 (1BHK), ₹3,499 (2BHK)\n\nआप कौन सी सेवा बुक करना चाहते हैं?",
      te: "ప్రసిద్ధ సేవల ధరలు:\n• బాత్రూమ్ క్లీనింగ్: ₹499 - ₹599 ఒక్కో బాత్రూమ్‌కు\n• కిచెన్ డీప్ క్లీనింగ్: ₹999 - ₹1,499\n• సోఫా షాంపూ: ₹899 (3-సీటర్), ₹1,399 (5-సీటర్)\n• పూర్తి ఇల్లు డీప్ క్లీనింగ్: ₹2,499 (1BHK), ₹3,499 (2BHK)\n\nమీరు ఏ సేవను బుక్ చేయాలనుకుంటున్నారు?",
      kn: "ಜನಪ್ರಿಯ ಸೇವೆಗಳ ದರಗಳು:\n• ಬಾತ್‌ರೂಮ್ ಕ್ಲೀನಿಂಗ್: ₹499 - ₹599 ಪ್ರತಿ ಬಾತ್‌ರೂಮ್‌ಗೆ\n• ಕಿಚನ್ ಡೀಪ್ ಕ್ಲೀನಿಂಗ್: ₹999 - ₹1,499\n• ಸೋಫಾ ಶಾಂಪೂ: ₹899 (3-ಸೀಟರ್), ₹1,399 (5-ಸೀಟರ್)\n• ಪೂರ್ಣ ಮನೆ ಡೀಪ್ ಕ್ಲೀನಿಂಗ್: ₹2,499 (1BHK), ₹3,499 (2BHK)\n\nನೀವು ಯಾವ ಸೇವೆಯನ್ನು ಬುಕ್ ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?"
    };
    return rates[lang];
  }

  // Default Polite Human Response
  const defaultReply = {
    en: "Thank you for contacting VS Home Cleaning Services, Chennai! 🧹✨\nHow can we help you today? Please share what service you need or your address to proceed.",
    ta: "VS Home Cleaning Services-ஐ தொடர்பு கொண்டதற்கு நன்றி! 🧹✨\nஉங்களுக்கு என்ன சேவை தேவைப்படுகிறது என்று கூறினால் உடனே ஸ்பெஷலிஸ்ட்டை ஏற்பாடு செய்கிறேன்.",
    tanglish: "VS Home Cleaning Services contact pannadhuku nandri! 🧹✨\nUngaluku enna cleaning service venum nu sonna odaney specialist assign pannidalaam.",
    hi: "VS Home Cleaning Services से संपर्क करने के लिए धन्यवाद! 🧹✨\nकृपया बताएं कि आपको किस सेवा की आवश्यकता है।",
    te: "VS Home Cleaning Services ని సంప్రదించినందుకు ధన్యవాదాలు! 🧹✨\nదయచేసి మీకు ఏ సేవ అవసరమో చెప్పండి.",
    kn: "VS Home Cleaning Services ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು! 🧹✨\nದಯವಿಟ್ಟು ನಿಮಗೆ ಯಾವ ಸೇವೆ ಬೇಕು ಎಂದು ತಿಳಿಸಿ."
  };

  return defaultReply[lang];
}

module.exports = {
  processCustomerMessage,
  handleCartOrder,
  saveBookingToFirebase
};

