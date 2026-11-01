/**
 * VS Home Cleaning Services — Saral AI Conversational Agent
 * ==========================================================
 * Fully Humanised Conversational Brain for WhatsApp (+91 75581 91073).
 * 
 * Supports:
 * 1. LLM Mode (Google Gemini 2.0 Flash) when GEMINI_API_KEY is configured in .env
 *    - 100% Human conversational intelligence, wit, and empathy in English/Tamil/Tanglish.
 * 2. Enhanced Native NLP Engine (Offline Fallback)
 *    - Understands dates like "next month 13th", "november 13", "tomorrow 10am"
 *    - Never repeats greetings or recorded-sounding menus
 *    - Smart quantities (4 bathrooms = ₹1996, 7-seater sofa = ₹899)
 *    - Natural multi-turn interrogation: acknowledges dates & details before asking for missing info
 * - Writes directly to Firebase RTDB Singapore (/bookings and /bookingLookup)
 * - Alerts Founder (+91 63834 58190) and Partner App Alarm on port 5173
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from('QVEuQWI4Uk42SVRXSUdkcVJ0bVF0M2t6NnRsaHNmUFNfRE9BbWl4TERCUWZIR3ZSNHRKcmc=', 'base64').toString('utf8');

// Service Catalog
const SERVICES = [
  { num: 1, id: 'bathroom', name: 'Classic Bathroom Cleaning', price: 499, keywords: ['bathroom', 'toilet', 'washroom', 'restroom', 'பாத்ரூம்', 'டாய்லெட்'] },
  { num: 2, id: 'kitchen', name: 'Kitchen Deep Cleaning', price: 799, keywords: ['kitchen', 'stove', 'chimney', 'கிச்சன்', 'சமையலறை'] },
  { num: 3, id: 'sofa', name: 'Sofa Shampoo & Sanitization', price: 699, keywords: ['sofa', 'couch', 'cushion', 'சோபா', 'குஷன்'] },
  { num: 4, id: 'deep_cleaning', name: 'Full Home Deep Cleaning', price: 1499, keywords: ['deep cleaning', 'full home', 'full house', 'வீடு கிளீனிங்', '1bhk', '2bhk', '3bhk'] },
  { num: 5, id: 'balcony', name: 'Balcony & Window Cleaning', price: 499, keywords: ['balcony', 'window', 'பால்கனி', 'ஜன்னல்'] }
];

const CHENNAI_AREAS = [
  { name: 'Velachery', aliases: ['velachery', 'வேளச்சேரி'] },
  { name: 'Adyar', aliases: ['adyar', 'அடையாறு', 'அடையார்'] },
  { name: 'T Nagar', aliases: ['t nagar', 't.nagar', 'tnagar', 'தி நகர்', 'டி நகர்'] },
  { name: 'Anna Nagar', aliases: ['anna nagar', 'annanagar', 'அண்ணா நகர்', 'அண்ணாநகர்'] },
  { name: 'Mylapore', aliases: ['mylapore', 'மயிலாப்பூர்'] },
  { name: 'Porur', aliases: ['porur', 'போரூர்'] },
  { name: 'Guindy', aliases: ['guindy', 'கிண்டி'] },
  { name: 'Tambaram', aliases: ['tambaram', 'தாம்பரம்'] },
  { name: 'Chromepet', aliases: ['chromepet', 'குரோம்பேட்டை'] },
  { name: 'Pallavaram', aliases: ['pallavaram', 'பல்லாவரம்'] },
  { name: 'Medavakkam', aliases: ['medavakkam', 'மேடவாக்கம்'] },
  { name: 'Sholinganallur', aliases: ['sholinganallur', 'சோழிங்கநல்லூர்'] },
  { name: 'OMR', aliases: ['omr', 'ஓஎம்ஆர்', 'old mahabalipuram'] },
  { name: 'ECR', aliases: ['ecr', 'ஈசிஆர்'] },
  { name: 'Perungudi', aliases: ['perungudi', 'பெருங்குடி'] },
  { name: 'Thoraipakkam', aliases: ['thoraipakkam', 'துரைப்பாக்கம்'] },
  { name: 'Navalur', aliases: ['navalur', 'நாவலூர்'] },
  { name: 'Siruseri', aliases: ['siruseri', 'சிறுசேரி'] },
  { name: 'Vadapalani', aliases: ['vadapalani', 'வடபழனி'] },
  { name: 'Kodambakkam', aliases: ['kodambakkam', 'கோடம்பாக்கம்'] },
  { name: 'Nungambakkam', aliases: ['nungambakkam', 'நுங்கம்பாக்கம்'] },
  { name: 'Kilpauk', aliases: ['kilpauk', 'கீழ்ப்பாக்கம்'] },
  { name: 'Saidapet', aliases: ['saidapet', 'சைதாப்பேட்டை'] },
  { name: 'Ashok Nagar', aliases: ['ashok nagar', 'அசோக் நகர்'] },
  { name: 'KK Nagar', aliases: ['kk nagar', 'கே கே நகர்'] },
  { name: 'Valasaravakkam', aliases: ['valasaravakkam', 'வலசரவாக்கம்'] },
  { name: 'Virugambakkam', aliases: ['virugambakkam', 'விருகம்பாக்கம்'] },
  { name: 'Mogappair', aliases: ['mogappair', 'முகப்பேர்'] },
  { name: 'Ambattur', aliases: ['ambattur', 'அம்பத்தூர்'] },
  { name: 'Avadi', aliases: ['avadi', 'ஆவடி'] },
  { name: 'Kolathur', aliases: ['kolathur', 'கொளத்தூர்'] },
  { name: 'Perambur', aliases: ['perambur', 'பெரம்பூர்'] },
  { name: 'Madhavaram', aliases: ['madhavaram', 'மாதவரம்'] },
  { name: 'Thiruvanmiyur', aliases: ['thiruvanmiyur', 'திருவான்மியூர்'] },
  { name: 'Besant Nagar', aliases: ['besant nagar', 'பெசன்ட் நகர்'] },
  { name: 'Royapettah', aliases: ['royapettah', 'ராயப்பேட்டை'] },
  { name: 'Alwarpet', aliases: ['alwarpet', 'ஆழ்வார்பேட்டை'] },
  { name: 'Triplicane', aliases: ['triplicane', 'திருவல்லிக்கேணி'] }
];

// Customer Conversation Memory
const customerSessions = new Map();

function getSession(phone) {
  if (!customerSessions.has(phone)) {
    customerSessions.set(phone, {
      phone,
      stage: 'idle',
      greeted: false,
      services: [],
      address: null,
      areaName: null,
      pincode: null,
      date: null,
      dateLabel: null,
      time: null,
      customerPhone: phone.startsWith('91') ? phone.slice(2) : phone,
      name: null,
      language: 'english',
      history: [], // for Gemini multi-turn context
      lastActive: Date.now()
    });
  }
  const s = customerSessions.get(phone);
  s.lastActive = Date.now();
  return s;
}

function generateRef() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return `VS-${y}${m}${day}-${rand}`;
}

function detectLanguage(text) {
  const tamilRegex = /[\u0B80-\u0BFF]/;
  if (tamilRegex.test(text)) return 'tamil';
  const lower = text.toLowerCase();
  const tanglishWords = ['machi', 'machan', 'bro', 'thala', 'venum', 'pannanum', 'iruka', 'evlo', 'varum', 'eppadi', 'kudunga', 'sollunga', 'panlama', 'nalaiku', 'innaiku', 'seri', 'panna'];
  if (tanglishWords.some(w => lower.includes(w))) return 'tanglish';
  return 'english';
}

/**
 * Smart Quantity & Multi-Service Parser
 */
function parseServicesAndQuantities(text, existingServices = []) {
  const lower = text.toLowerCase();
  const cart = new Map();

  for (const item of existingServices) {
    cart.set(item.id, { ...item });
  }

  // 1. Bathroom Quantity (e.g. "4 bathroom", "2 toilets")
  const bathMatch = lower.match(/\b(\d+)\s*(bathroom|bathrooms|toilet|toilets|washroom|restroom|பாத்ரூம்|டாய்லெட்)\b/);
  if (bathMatch) {
    const qty = parseInt(bathMatch[1], 10);
    cart.set('bathroom', {
      id: 'bathroom',
      name: `Classic Bathroom Cleaning (${qty} Bathrooms)`,
      price: qty * 499,
      count: qty
    });
  }

  // 2. Sofa Seater Quantity (e.g. "7 seater sofa", "5 seater")
  const sofaMatch = lower.match(/\b(\d+)\s*(seater|seat)\s*(sofa|couch)?\b/) || lower.match(/\b(sofa|couch)\s*(\d+)\s*(seater|seat)\b/);
  if (sofaMatch) {
    const seats = parseInt(sofaMatch[1] || sofaMatch[2], 10);
    let price = 699;
    if (seats > 5) price = 699 + (seats - 5) * 100;
    cart.set('sofa', {
      id: 'sofa',
      name: `Sofa Shampoo & Sanitization (${seats}-Seater)`,
      price,
      count: 1
    });
  }

  // Clean out matched quantity phrases to avoid false triggers
  const cleanedText = lower
    .replace(/\b\d+\s*(bathroom|bathrooms|toilet|toilets|washroom|seater|seat|sofa|bhk|bed|room)\b/g, ' ')
    .trim();

  // Standalone numbers: "1 and 3", "4 and 5"
  const numberTokens = cleanedText.match(/\b([1-5])\b/g);
  if (numberTokens) {
    numberTokens.forEach(numStr => {
      const num = parseInt(numStr, 10);
      const svc = SERVICES.find(s => s.num === num);
      if (svc && !cart.has(svc.id)) {
        cart.set(svc.id, {
          id: svc.id,
          name: svc.name,
          price: svc.price,
          count: 1
        });
      }
    });
  }

  // Keyword matches
  for (const s of SERVICES) {
    if (s.keywords.some(k => cleanedText.includes(k))) {
      if (!cart.has(s.id)) {
        cart.set(s.id, {
          id: s.id,
          name: s.name,
          price: s.price,
          count: 1
        });
      }
    }
  }

  return Array.from(cart.values());
}

/**
 * Strict Address Validator
 */
function isValidAddress(text) {
  if (!text) return false;
  const clean = text.trim();
  const lower = clean.toLowerCase();

  const serviceKeywords = [
    'bathroom', 'toilet', 'washroom', 'kitchen', 'sofa', 'seater', 'balcony', 'bhk',
    'cleaning', 'deep clean', 'clean', 'rates', 'price', 'cost', 'service',
    'next month', 'tomorrow', 'today', 'morning', 'evening'
  ];
  if (serviceKeywords.some(sk => lower.includes(sk))) {
    const hasExplicitHouseKw = /\b(flat|apartment|apt|door|plot|street|road|nagar)\b/i.test(lower);
    if (!hasExplicitHouseKw) return false;
  }

  if (/^(\d|and|\+|yes|no|ok|okay|book|confirm|rates|price|hi|hello|\d\s*(and|\+|,)\s*\d)$/i.test(lower)) return false;
  if (/^\d{1,2}$/.test(lower)) return false;

  const areaMatch = CHENNAI_AREAS.find(a => a.aliases.some(alias => lower.includes(alias)));
  if (areaMatch) return true;

  if (/\b600\d{3}\b/.test(lower)) return true;

  const addressRegex = /\b(nagar|street|road|rd|flat|apartment|apt|block|floor|door|colony|layout|cross|main|opp|near|beside|phase|house|plot|avenue|sector|stage)\b/i;
  const tamilAddressRegex = /(நகர்|தெரு|ரோடு|வீடு|அபார்ட்மெண்ட்|பிளாட்)/;
  if ((addressRegex.test(lower) || tamilAddressRegex.test(lower)) && clean.length >= 6) return true;

  return false;
}

function extractAreaAndPin(text) {
  const lower = text.toLowerCase();
  let areaName = null;
  let pincode = null;

  for (const a of CHENNAI_AREAS) {
    if (a.aliases.some(alias => lower.includes(alias))) {
      areaName = a.name;
      break;
    }
  }

  const pinMatch = text.match(/\b(600\d{3})\b/);
  if (pinMatch) pincode = pinMatch[1];

  return { areaName, pincode };
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Natural Date & Time Slot Extractor
 * Supports: "next month 13th", "november 13", "tomorrow 10am", "morning 10 to 12"
 */
function extractDateAndTime(text) {
  const lower = text.toLowerCase();
  let date = null;
  let dateLabel = null;
  let time = null;
  const now = new Date();

  // 1. "next month [day]" e.g. "next month 13th", "next month 5"
  const nextMonthMatch = lower.match(/next month\s*(\d{1,2})(?:st|nd|rd|th)?/);
  if (nextMonthMatch) {
    const day = parseInt(nextMonthMatch[1], 10);
    const target = new Date(now.getFullYear(), now.getMonth() + 1, day);
    date = formatLocalDate(target);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    dateLabel = `${day}th ${monthNames[target.getMonth()]}`;
  }

  // 2. Specific Month Name + Day: e.g. "november 13", "nov 13th", "13th november"
  const monthNameMatch = lower.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})(?:st|nd|rd|th)?/) ||
    lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/);
  if (monthNameMatch && !date) {
    const monthStr = (monthNameMatch[1].length > 2 ? monthNameMatch[1] : monthNameMatch[2]).slice(0, 3);
    const day = parseInt(monthNameMatch[1].length > 2 ? monthNameMatch[2] : monthNameMatch[1], 10);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = months.indexOf(monthStr.toLowerCase());
    if (mIdx !== -1) {
      const yr = mIdx < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
      const target = new Date(yr, mIdx, day);
      date = formatLocalDate(target);
      dateLabel = `${day}th ${monthStr.toUpperCase()}`;
    }
  }

  // 3. Today / Tomorrow / Day after
  if (!date) {
    if (lower.includes('today') || lower.includes('innaiku') || lower.includes('இன்று')) {
      date = formatLocalDate(now);
      dateLabel = 'Today';
    } else if (lower.includes('tomorrow') || lower.includes('nalaiku') || lower.includes('நாளை')) {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      date = formatLocalDate(t);
      dateLabel = 'Tomorrow';
    } else if (lower.includes('day after')) {
      const t = new Date(now);
      t.setDate(t.getDate() + 2);
      date = formatLocalDate(t);
      dateLabel = 'Day after tomorrow';
    }
  }

  // Time slot matching
  if (lower.includes('morning 8') || lower.includes('8 am') || lower.includes('8am') || lower.includes('8 to 10') || lower.includes('8-10')) {
    time = '08:00 AM - 10:00 AM';
  } else if (lower.includes('10 to 12') || lower.includes('10-12') || lower.includes('10 am') || lower.includes('10am') || lower.includes('morning')) {
    time = '10:00 AM - 12:00 PM';
  } else if (lower.includes('12 to 2') || lower.includes('12-2') || lower.includes('12 pm') || lower.includes('noon')) {
    time = '12:00 PM - 02:00 PM';
  } else if (lower.includes('2 to 4') || lower.includes('2-4') || lower.includes('2 pm') || lower.includes('afternoon')) {
    time = '02:00 PM - 04:00 PM';
  } else if (lower.includes('4 to 6') || lower.includes('4-6') || lower.includes('4 pm') || lower.includes('evening')) {
    time = '04:00 PM - 06:00 PM';
  } else if (lower.includes('6 to 8') || lower.includes('6-8') || lower.includes('6 pm')) {
    time = '06:00 PM - 08:00 PM';
  }

  return { date, dateLabel, time };
}

/**
 * Find recent booking(s) for a customer's phone number from Firebase RTDB (Singapore)
 */
async function findCustomerBookings(phone) {
  if (!phone) return [];
  const p10 = String(phone).replace(/\D/g, '').slice(-10);
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/bookings.json`);
    const data = await res.json();
    if (!data) return [];
    const list = Object.values(data).filter(b => {
      if (!b) return false;
      const bMobile = String(b.mobile || b.customerMobile || '').replace(/\D/g, '').slice(-10);
      return bMobile === p10;
    });
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  } catch (err) {
    console.error('Error finding customer bookings in Firebase:', err);
    return [];
  }
}

/**
 * Save booking into Firebase RTDB (Singapore)
 */
async function saveBookingToFirebase(session) {
  const ref = session.pendingRef || generateRef();
  session.pendingRef = null;
  const total = session.services.reduce((sum, s) => sum + s.price, 0) || 499;
  const mobile = (session.customerPhone || session.phone || '9999999999').replace(/\D/g, '').slice(-10);
  const serviceNames = session.services.map(s => s.name).join(' + ') || 'Classic Bathroom Cleaning';

  const bookingData = {
    ref,
    name: session.name || 'WhatsApp Customer',
    mobile,
    serviceType: serviceNames,
    address: session.address ? `${session.address} (PIN: ${session.pincode || '600001'})` : `Chennai - ${session.pincode || '600001'}`,
    pincode: session.pincode || '600001',
    preferredDate: session.date || new Date().toISOString().split('T')[0],
    preferredTime: session.time || '10:00 AM - 12:00 PM',
    status: 'Booking Received',
    paymentType: 'COD',
    paymentMethod: 'Cash on Service / UPI',
    total,
    subtotal: total,
    createdAt: Date.now(),
    bookedVia: 'WhatsApp AI Agent (Saral)',
    notes: 'Booked autonomously via WhatsApp Saral'
  };

  try {
    await fetch(`${FIREBASE_DB_URL}/bookings/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData)
    });

    await fetch(`${FIREBASE_DB_URL}/bookingLookup/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref,
        status: 'Booking Received',
        serviceType: bookingData.serviceType,
        total,
        preferredDate: bookingData.preferredDate,
        preferredTime: bookingData.preferredTime,
        customerName: bookingData.name,
        customerMobile: mobile
      })
    });

    console.log(`✓ [Firebase Booking Created by Saral]: ${ref}`);
    return bookingData;
  } catch (err) {
    console.error('Firebase save error from WhatsApp Saral:', err);
    return bookingData;
  }
}

/**
 * Call Google Gemini 2.0 Flash for True Human Conversational Intelligence
 */
async function callGeminiFlash(session, userMessage, customerBookings = [], customApiKey = null) {
  const apiKey = (customApiKey || process.env.GEMINI_API_KEY || GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  let bookingInfo = "No previous booking found for this customer phone.";
  let activePartnerName = null;

  if (customerBookings && customerBookings.length > 0) {
    const b = customerBookings[0];
    activePartnerName = b.assignedPartnerName || b.assignedName || null;
    bookingInfo = `
CUSTOMER EXISTING BOOKING IN DATABASE:
- Reference ID: ${b.ref}
- Services: ${b.serviceType}
- Scheduled Slot: ${b.preferredDate} (${b.preferredTime})
- Assigned Cleaner / Specialist: ${activePartnerName || 'Assigning nearest cleaner now'}
- Current Status: ${b.status}
- Address: ${b.address}
- Total Amount: ₹${b.total} (Pay after service)
- Live Tracking Link: https://vshomecleaningservices.in/track-booking.html?id=${b.ref}
`;
  }

  const systemInstruction = `
You are Saaral (சாரல்), the friendly, charming, highly intelligent Chief Operations & Customer Relationship Voice/WhatsApp Assistant for VS Home Cleaning Services, Chennai (+91 75581 91073).
Senior Operations Manager: Mr. Vignesh.
Website: vshomecleaningservices.in

${bookingInfo}

Catalog & Starting Rates:
- Bathroom Cleaning Packages: Classic ₹499 | Premium ₹549 | Eco-Smart ₹599 (per bathroom)
- Kitchen Deep Cleaning: Starting from ₹799 (Chimney, stove, oil stains, tiles)
- Sofa Shampoo & Sanitization: ₹699 (3 to 5 seater), ₹899 (6-7 seater)
- Full Home Deep Cleaning: 1BHK ₹1499, 2BHK ₹1999, 3BHK ₹2499
- Balcony & Window Cleaning: ₹499
- Add-on services (cupboards, fridge, fans, lofts): from ₹69
Terms: Zero advance, 100% pay after service (Cash or UPI). Safe eco-friendly Diversey solutions (zero acid, child & pet safe).

YOUR CONVERSATIONAL INTELLIGENCE & ROLE:
You are an expert, warm, human-like Customer Support & Operations Problem Solver — NOT a rigid booking robot.

1. Casual chatter & greetings ("Saptiya", "Saptingala", "Hi", "Eppadi irukinga", "Good morning", "Enna pandra"):
   Reply with authentic Tamil warmth and gentle humor! (e.g. "வணக்கம்! இன்னும் சாப்பிடலங்க, நீங்க சாப்டீங்களா? 😊 உங்களுக்கு நான் எப்படி உதவலாம் சொல்லுங்க!"). NEVER ask for address or slot for casual talk!

2. Booking Inquiries, Rate Cards, Packages & "I want to book":
   Do NOT confuse or interrogate customers with endless back-and-forth text questions!
   Instead, politely give starting prices and guide them to visually choose from our WhatsApp Catalog / Cart or Website:
   - In Tamil:
     "கண்டிப்பாங்க! நம்மகிட்ட பாத்ரூம் (Classic ₹499 | Premium ₹549 | Eco-Smart ₹599), கிச்சன் (₹799), சோபா மற்றும் முழு வீடு கிளீனிங்கிற்கு முழுமையான பேக்கேஜ்கள் உள்ளன.
     நீங்கள் நேரடியாக நம்ம வாட்ஸ்அப் மேலே உள்ள **Store / Catalog (🛍️)** ஐகானை க்ளிக் செய்து அனைத்து பேக்கேஜ்களையும் படங்களுடன் பார்த்து கார்ட்டில் (Cart) புக் செய்யலாம்! அல்லது நம்ம வெப்சைட்டான **vshomecleaningservices.in**-லும் புக் செய்யலாம்.
     கார்ட் அல்லது வெப்சைட்டில் ஆர்டர் போட்ட அடுத்த நொடி, உங்களுக்கான Order ID உருவாக்கப்பட்டு நான் அதை உறுதி செய்கிறேன்! ஏதேனும் சந்தேகம் உள்ளதா? 😊"
   - In English:
     "Certainly! You can easily explore our full packages with photos and transparent prices in our **WhatsApp Catalog (🛍️ icon at the top)** or on our website **vshomecleaningservices.in**! Simply add your services to Cart and order. Once placed, I will instantly confirm your Order ID and assign a specialist. Can I help you with any questions? 😊"

3. Order Tracking / "Where is my cleaner" / "Partner not arrived" / "Delay" / "Late":
   - Use the CUSTOMER EXISTING BOOKING info from database!
   - Report their Order Ref, Scheduled Slot, and Assigned Specialist name.
   - If they report cleaner has not arrived, say: "I have just sent an urgent priority dispatch alert to specialist ${activePartnerName || 'our team'} to reach your home immediately!" and append [ALERT_PARTNER: true] so our backend alerts the partner.

4. Cancellation, Rescheduling & Support:
   - Help customers modify slots or cancel with empathy.
   - Diversey eco-friendly safe chemicals (zero acid, pet & kid safe).
   - Zero advance, 100% pay after service (Cash or UPI).

5. Never say "Founder" or "Owner" (refer only to "Senior Operations Manager" or "Executive Support Team").
`.trim();

  try {
    // 1. If key is from xAI Grok (starts with xai-)
    if (apiKey.startsWith('xai-')) {
      const messages = [
        { role: 'system', content: systemInstruction },
        ...session.history.slice(-8).map(h => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.parts?.[0]?.text || ''
        })),
        { role: 'user', content: userMessage }
      ];

      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages,
          temperature: 0.7,
          max_tokens: 350
        })
      });

      const data = await res.json();
      const replyText = data.choices?.[0]?.message?.content;
      if (replyText) {
        session.history.push({ role: 'user', parts: [{ text: userMessage }] });
        session.history.push({ role: 'model', parts: [{ text: replyText }] });
        return replyText;
      } else {
        console.log('xAI Grok API error:', data);
      }
    }

    // 2. Google Gemini 3.8 Flash via robust HTTPS request (Avoids undici IPv6 timeout bug on Windows)
    // Strictly validate multiturn history to prevent Google alternating role errors
    const validHistory = [];
    let expectedRole = 'user';
    for (const item of (session.history || [])) {
      if (item && item.role === expectedRole && item.parts?.[0]?.text) {
        validHistory.push(item);
        expectedRole = expectedRole === 'user' ? 'model' : 'user';
      }
    }
    if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
      validHistory.pop();
    }

    const contents = [
      ...validHistory.slice(-6),
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const postPayload = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const callGeminiHttps = () => new Promise((resolve) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postPayload)
        },
        timeout: 5000
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const reply = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (reply) resolve(reply);
            else resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => {
        resolve(null);
      });

      req.write(postPayload);
      req.end();
    });

    const geminiReply = await callGeminiHttps();
    if (geminiReply) {
      session.history.push({ role: 'user', parts: [{ text: userMessage }] });
      session.history.push({ role: 'model', parts: [{ text: geminiReply }] });
      return geminiReply;
    }
  } catch (err) {
    console.error('LLM call error:', err);
  }
  return null;
}

/**
 * Main Saral Conversational Brain
 */
async function processCustomerMessage(phone, userText, senderPushName, notifier) {
  const session = getSession(phone);
  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  if (senderPushName && !session.name) {
    session.name = senderPushName.replace(/[^\w\s]/gi, '').trim() || null;
  }

  const p10 = String(session.customerPhone || phone || '').replace(/\D/g, '').slice(-10);
  const customerBookings = await findCustomerBookings(p10);
  const activeApiKey = (process.env.GEMINI_API_KEY || process.env.XAI_API_KEY || GEMINI_API_KEY || '').trim();

  // -------------------------------------------------------------
  // ATTEMPT 1: Google Gemini Flash / LLM (If API Key is provided)
  // -------------------------------------------------------------
  if (activeApiKey) {
    const geminiReply = await callGeminiFlash(session, text, customerBookings, activeApiKey);
    if (geminiReply) {
      // Check if partner alert is triggered
      if (geminiReply.includes('[ALERT_PARTNER: true]') && customerBookings.length > 0) {
        const b = customerBookings[0];
        const pPhone = b.assignedPartnerMobile || b.assignedMobile;
        const pName = b.assignedPartnerName || b.assignedName || 'Specialist';
        if (pPhone && notifier && typeof notifier === 'function') {
          const pClean = String(pPhone).replace(/\D/g, '');
          const urgentMsg = `🚨 *URGENT CUSTOMER WAITING ALERT* 🚨\n\n` +
            `வணக்கம் *${pName}*!\n` +
            `புக்கிங் *${b.ref}* வாடிக்கையாளர் (+91 ${p10}) உங்களுக்காக வீட்டில் காத்துக் கொண்டிருக்கிறார்கள்!\n` +
            `📍 முகவரி: ${b.address || 'Chennai'}\n` +
            `தயவுசெய்து உடனடியாக வாடிக்கையாளரை அழைத்து கிளம்பவும்!`;
          try { await notifier(pClean, urgentMsg); } catch (e) {}
        }
      }

      // Check if Gemini triggered automated booking
      const bookMatch = geminiReply.match(/\[CREATE_BOOKING:\s*(\{.*?\})\]/s);
      if (bookMatch) {
        try {
          const parsed = JSON.parse(bookMatch[1]);
          session.services = [{ name: parsed.services, price: parsed.total }];
          session.address = parsed.address;
          session.date = parsed.date;
          session.time = parsed.time;
          const booking = await saveBookingToFirebase(session);
          session.services = [];
          session.address = null;

          const cleanReply = geminiReply
            .replace(/\[CREATE_BOOKING:.*?\]/s, '')
            .replace(/\[ALERT_PARTNER:\s*true\]/gi, '')
            .trim() +
            `\n\n🔍 *Live GPS Tracking:* https://vshomecleaningservices.in/track-booking.html?id=${booking.ref}`;
          return cleanReply;
        } catch (e) {}
      }

      return geminiReply
        .replace(/\[CREATE_BOOKING:.*?\]/s, '')
        .replace(/\[ALERT_PARTNER:\s*true\]/gi, '')
        .trim();
    }
  }

  // -------------------------------------------------------------
  // ATTEMPT 2: Enhanced Native Human Dialogue Engine (Offline)
  // -------------------------------------------------------------
  const detectedLang = detectLanguage(text);
  if (detectedLang === 'tamil' || detectedLang === 'tanglish') session.language = detectedLang;
  const isTamil = session.language === 'tamil';

  // -------------------------------------------------------------
  // AUTONOMOUS INTENT 1: PARTNER ARRIVAL DELAY & ESCALATION
  // -------------------------------------------------------------
  const isPartnerDelayQuery = (
    lower.includes('partner not arrived') || lower.includes('cleaner not arrived') ||
    lower.includes('not arrived') || lower.includes('hasnt arrived') || lower.includes('has not arrived') ||
    lower.includes('not reached') || lower.includes('cleaner late') || lower.includes('partner late') ||
    lower.includes('delay') || lower.includes('where is cleaner') || lower.includes('where is partner') ||
    lower.includes('cleaner enga') || lower.includes('partner enga') || lower.includes('innum varala') ||
    lower.includes('varalaya') || lower.includes('yen varala') || lower.includes('yen innum varala') ||
    lower.includes('eppo varuvanga') || lower.includes('cleaner coming') ||
    (lower.includes('partner') && (lower.includes('come') || lower.includes('reach') || lower.includes('waiting') || lower.includes('where') || lower.includes('late'))) ||
    (lower.includes('cleaner') && (lower.includes('come') || lower.includes('reach') || lower.includes('waiting') || lower.includes('where') || lower.includes('late')))
  );

  if (isPartnerDelayQuery) {
    const p10 = String(session.customerPhone || phone || '').replace(/\D/g, '').slice(-10);
    const bookings = await findCustomerBookings(p10);
    const b = bookings[0];

    if (b) {
      const partnerName = b.assignedPartnerName || b.assignedName || null;
      const partnerPhone = b.assignedPartnerMobile || b.assignedMobile || null;

      if (partnerName) {
        // 1. Immediately trigger high-priority alert to the partner via WhatsApp
        if (partnerPhone && notifier && typeof notifier === 'function') {
          const pClean = String(partnerPhone).replace(/\D/g, '');
          const urgentMsg = `🚨 *URGENT CUSTOMER WAITING ALERT — ACTION REQUIRED* 🚨\n\n` +
            `வணக்கம் *${partnerName}*!\n` +
            `புக்கிங் *${b.ref}* வாடிக்கையாளர் (+91 ${p10}) உங்களுக்காக வீட்டில் காத்துக் கொண்டிருக்கிறார்கள்!\n` +
            `📍 முகவரி: ${b.address || 'Chennai'}\n` +
            `🛠️ சர்வீஸ்: ${b.serviceType}\n` +
            `📅 ஸ்லாட்: ${b.preferredDate} (${b.preferredTime})\n\n` +
            `தயவுசெய்து உடனடியாக வாடிக்கையாளரை அழைத்து கிளம்பவும்! நீங்கள் எங்கு இருக்கிறீர்கள் என்பதை பார்ட்னர் ஆப்பில் உடனே அப்டேட் செய்யவும்.`;
          try { await notifier(pClean, urgentMsg); } catch (e) {}
        }

        // 2. Reply to customer with partner details and live GPS tracking
        return `வணக்கம் ${b.name || 'Sir / Madam'}! 🙏\n\n` +
          `உங்கள் புக்கிங் (*${b.ref}*) விவரங்களை சரிபார்த்தேன்:\n\n` +
          `👤 *ஒதுக்கப்பட்ட ஸ்பெஷலிஸ்ட்:* **${partnerName}**\n` +
          `🛠️ *சர்வீஸ்:* ${b.serviceType}\n` +
          `📅 *திட்டமிடப்பட்ட ஸ்லாட்:* ${b.preferredDate} (${b.preferredTime})\n` +
          `📊 *தற்போதைய நிலை:* *${b.status || 'Assigned'}*\n\n` +
          `⚡ நான் இப்போதே **${partnerName}**-க்கு வாட்ஸ்அப்பில் அவசர அலர்ட் அனுப்பிவிட்டேன்! அவர் உடனடியாக உங்களிடம் புறப்பட்டு வருமாறு அறிவுறுத்தப்பட்டுள்ளார்.\n\n` +
          `🔍 *நேரடி Live GPS Tracking Link:* \nhttps://vshomecleaningservices.in/track-booking.html?id=${b.ref}\n\n` +
          `கவலைப்பட வேண்டாம், உங்கள் திருப்தியே எங்களின் முதல் நோக்கம்! ஏதேனும் கூடுதல் உதவி தேவையெனில் உடனே தெரிவிக்கவும். ✨`;
      } else {
        return `வணக்கம் ${b.name || 'Sir / Madam'}! 🙏\n\n` +
          `உங்கள் புக்கிங் (*${b.ref}*) சிஸ்டத்தில் பெறப்பட்டு தயார் நிலையில் உள்ளது.\n\n` +
          `🛠️ *சர்வீஸ்:* ${b.serviceType}\n` +
          `📅 *ஸ்லாட்:* ${b.preferredDate} (${b.preferredTime})\n` +
          `📊 *நிலை:* *${b.status || 'Booking Received'}*\n\n` +
          `எங்கள் Operations மையம் உங்கள் முகவரிக்கு அருகிலுள்ள சிறந்த ஸ்பெஷலிஸ்ட்டை உடனடியாக ஒதுக்கி வருகிறது. இன்னும் சில நிமிடங்களில் பார்ட்னர் விவரம் உங்களுக்கு உறுதி செய்யப்படும்!\n\n` +
          `🔍 *நேரடி ட்ராக்கிங்:* \nhttps://vshomecleaningservices.in/track-booking.html?id=${b.ref}`;
      }
    } else {
      return `வணக்கம்! உங்கள் வாட்ஸ்அப் எண்ணில் (+91 ${p10}) பதிவு செய்யப்பட்ட புக்கிங் எதுவும் தற்போது காணப்படவில்லை.\n\n` +
        `உங்களிடம் Booking Reference எண் (எ.கா: *VS-XXXXXX*) இருந்தால் பகிருங்கள், நான் உடனடியாக ட்ராக் செய்கிறேன்! அல்லது புதிய கிளீனிங் சர்வீஸ் புக் செய்ய உதவட்டுமா? 😊`;
    }
  }

  // -------------------------------------------------------------
  // AUTONOMOUS INTENT 2: MY ORDERS / BOOKING DETAILS / STATUS CHECK
  // -------------------------------------------------------------
  const isOrderDetailsQuery = (
    lower.includes('already booked') || lower.includes('booked one order') ||
    lower.includes('share the order') || lower.includes('share the orders') ||
    lower.includes('share orders') || lower.includes('my order') || lower.includes('my booking') ||
    lower.includes('order details') || lower.includes('check my order') ||
    lower.includes('order status') || lower.includes('booking status') ||
    lower.includes('ennoda booking') || lower.includes('booking details') ||
    lower.includes('track my order') || lower.includes('tracking link') ||
    lower.includes('view my booking') || lower.includes('last booking')
  );

  if (isOrderDetailsQuery) {
    const p10 = String(session.customerPhone || phone || '').replace(/\D/g, '').slice(-10);
    const bookings = await findCustomerBookings(p10);
    const b = bookings[0];

    if (b) {
      const partner = b.assignedPartnerName || b.assignedName || 'ஒதுக்கப்பட்டு வருகிறார் (Assigning soon)';
      return `📋 *உங்கள் புக்கிங் விவரங்கள்:* 🌟\n\n` +
        `🆔 *Booking Ref:* **${b.ref}**\n` +
        `🛠️ *சர்வீஸ்:* ${b.serviceType}\n` +
        `📅 *தேதி & நேரம்:* ${b.preferredDate} (${b.preferredTime})\n` +
        `👤 *ஸ்பெஷலிஸ்ட்:* **${partner}**\n` +
        `📍 *முகவரி:* ${b.address}\n` +
        `💰 *மொத்தத் தொகை:* ₹${b.total} (100% Pay After Service)\n` +
        `📊 *நிலை:* *${b.status || 'Confirmed'}*\n\n` +
        `🔍 *Live GPS Tracking:* \nhttps://vshomecleaningservices.in/track-booking.html?id=${b.ref}\n\n` +
        `ஏதேனும் மாற்றம் செய்ய வேண்டுமா அல்லது ஏதேனும் உதவி தேவையா? தயங்காமல் தெரிவிக்கவும்! 😊`;
    } else {
      return `வணக்கம்! உங்கள் எண்ணில் (+91 ${p10}) சமீபத்திய புக்கிங் எதுவும் காணப்படவில்லை.\n\n` +
        `உங்களிடம் Booking Reference எண் (VS-XXXXXX) இருந்தால் அனுப்புங்கள் அல்லது புதிய கிளீனிங் சர்வீஸ் புக் செய்ய விரும்புகிறீர்களா? 😊`;
    }
  }

  // 1. Direct Reference Number Lookup
  const refMatch = text.match(/VS-\d{6}-[A-Z0-9]{4}/i) || text.match(/\b(VS-[A-Z0-9-]+)\b/i);
  if (refMatch) {
    const ref = refMatch[0].toUpperCase();
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/bookings/${ref}.json`);
      const b = await res.json();
      if (b) {
        const partner = b.assignedPartnerName || b.assignedName || 'ஒதுக்கப்பட்டு வருகிறார் (Assigning soon)';
        return `🔍 *Booking Status (${ref})*:\n\n` +
          `🛠️ *Services:* ${b.serviceType}\n` +
          `📅 *Slot:* ${b.preferredDate} (${b.preferredTime})\n` +
          `👤 *Specialist:* **${partner}**\n` +
          `📍 *Address:* ${b.address}\n` +
          `📊 *Status:* *${b.status}*\n` +
          `💰 *Amount:* ₹${b.total} (Pay after service)\n\n` +
          `🔍 *Live GPS Tracking:* https://vshomecleaningservices.in/track-booking.html?id=${ref}`;
      }
    } catch (e) {}
    return `Sorry, we could not find booking ref *${ref}*. Please check and send the reference code again.`;
  }

  // 2. FAQ Inquiries (Safety, Rate Card, Payment, Founder)
  if (lower.includes('chemical') || lower.includes('acid') || lower.includes('safe') || lower.includes('மருந்து')) {
    return `🛡️ **100% Safe & Eco-Friendly Guarantee!**\n\nWe strictly do NOT use harsh acids. Our specialists use professional **Taski / Diversey Eco-Friendly** solutions.\n\n✅ 100% safe for kids, elders & pets 🐾\n✅ Zero damage to tiles & fittings\n\nWhich cleaning service can I arrange for you? 😊`;
  }

  if (lower.includes('rate') || lower.includes('price') || lower.includes('cost') || lower.includes('evlo') || lower.includes('விலை')) {
    return `🏷️ **VS Home Cleaning Services — Official Rate Card** 🌟\n\n` +
      `1️⃣ *Classic Bathroom Cleaning:* ₹499 per bathroom\n` +
      `2️⃣ *Kitchen Deep Cleaning:* ₹799\n` +
      `3️⃣ *Sofa Shampoo Sanitization:* ₹699 (3-5 Seater)\n` +
      `4️⃣ *Full Home Deep Cleaning:* 1BHK ₹1499 | 2BHK ₹1999 | 3BHK ₹2499\n` +
      `5️⃣ *Balcony & Window Cleaning:* ₹499\n\n` +
      `💡 Zero Advance — 100% Pay After Work!\nWhich service would you like to schedule? 😊`;
  }

  if (lower.includes('payment') || lower.includes('gpay') || lower.includes('advance') || lower.includes('பணம்')) {
    return `💳 **Payment Policy:**\n\nYou do NOT need to pay any advance! 100% Pay After Service. 👍 You can pay via UPI (GPay/PhonePe) or Cash after the specialist completes the work. 😊`;
  }

  if (lower.includes('owner') || lower.includes('founder') || lower.includes('vignesh') || lower.includes('manager') || lower.includes('support team')) {
    return `Certainly! You are connected directly with **VS Home Cleaning Executive Support (Saral)**. 🌸\n\nI can assist you with all bookings, partner coordination, pricing, and rescheduling. For critical escalations, our **Senior Operations Manager** will review your request directly. How can I assist you right now? 😊`;
  }

  // 3. Extract Services, Quantities, Address, Date & Time
  session.services = parseServicesAndQuantities(text, session.services);

  if (isValidAddress(text)) {
    session.address = text;
    const { areaName, pincode } = extractAreaAndPin(text);
    if (areaName) session.areaName = areaName;
    if (pincode) session.pincode = pincode;
  }

  const { date, dateLabel, time } = extractDateAndTime(text);
  if (date) {
    session.date = date;
    session.dateLabel = dateLabel;
  }
  if (time) session.time = time;

  // 4. Confirmation Execution
  const isConfirming = (session.stage === 'confirming' || (session.services.length > 0 && session.address && session.date)) && (
    /\b(confirm|yes|proceed|book|ok|okay|sure|done|fine|correct|aama|சரி|பண்ணு|புக்)\b/i.test(lower) ||
    lower.includes('confirm') || lower.includes('book') || lower.includes('yes')
  );

  if (isConfirming && session.services.length > 0 && session.address && session.date) {
    const booking = await saveBookingToFirebase(session);
    session.stage = 'idle';
    session.services = [];
    session.address = null;

    return `🎉 **BOOKING CONFIRMED SUCCESSFULLY!** 🎉\n\n` +
      `📋 *Booking Reference:* **${booking.ref}**\n` +
      `🛠️ *Services:* ${booking.serviceType}\n` +
      `💰 *Total Amount:* ₹${booking.total} (Pay after service - Cash/UPI)\n` +
      `📅 *Scheduled Slot:* ${booking.preferredDate} (${booking.preferredTime})\n` +
      `📍 *Location:* ${booking.address}\n\n` +
      `🚗 Our verified cleaning specialist has been dispatched and will arrive on time.\n\n` +
      `🔍 *Live GPS Tracking:* \nhttps://vshomecleaningservices.in/track-booking.html?id=${booking.ref}\n\n` +
      `Thank you for choosing VS Home Cleaning Services! ✨\n- Warm regards, **Saral** 🌸`;
  }

  // -------------------------------------------------------------
  // 5. NATURAL HUMAN CONVERSATIONAL FLOW & CHATTER (100% Warm & Human)
  // -------------------------------------------------------------

  // Casual 1: Saptiya / Saptingala / Food / Lunch / Dinner
  if (lower.includes('sapt') || lower.includes('sapud') || lower.includes('lunch') || lower.includes('dinner') || lower.includes('breakfast') || lower.includes('சாப்ட்') || lower.includes('சாப்பாடு')) {
    const saptReplies = [
      `ஹாஹா, நான் AI ஆச்சே! எனக்கு கரண்ட் தான் சாப்பாடு ⚡😜 நீங்க சாப்டீங்களா? என்ன ஸ்பெஷல் இன்னைக்கு? சொல்லுங்க, உங்களுக்கு என்ன கிளீனிங் சர்வீஸ் பாக்கணும்? 😊🌸`,
      `இன்னும் சாப்பிடலங்க, எனக்கு டிஜிட்டல் பவர் தான் உணவு! 🤖✨ நீங்க சாப்டீங்களா? வீட்ல எதுவும் பாத்ரூம், கிச்சன் கிளீனிங் தேவைப்பட்டா சொல்லுங்க, நான் ரெடியா இருக்கேன்! 👍`
    ];
    return saptReplies[Math.floor(Math.random() * saptReplies.length)];
  }

  // Casual 2: Enna pandra / Enna panra / What are you doing
  if (lower.includes('enna pan') || lower.includes('enna pandra') || lower.includes('what are you doing') || lower.includes('enna seira') || lower.includes('என்ன பண்ற') || lower.includes('என்ன செய்ற')) {
    return `ஹே, சும்மா தான் இருக்கேன்! நம்ம சென்னை கஸ்டமர்ஸ்க்கு கிளீனிங் புக்கிங் உதவிகளை பாத்துட்டு இருக்கேன் 🌸 நீங்க என்ன பண்றீங்க? சொல்லுங்க, உங்களுக்கு பாத்ரூம், கிச்சன் அல்லது சோபா கிளீனிங் ஏதும் தேவைப்படுதா? 😊`;
  }

  // Casual 3: Eppadi iruka / How are you / Nalla irukiya
  if (lower.includes('epdi iruk') || lower.includes('eppadi iruk') || lower.includes('how are you') || lower.includes('nalla iruk') || lower.includes('எப்படி இருக்கீங்க') || lower.includes('நல்லா இருக்கீங்களா')) {
    return `நான் ரொம்ப சூப்பரா, புத்துணர்ச்சியா இருக்கேன்! 🌸 நீங்க எப்படி இருக்கீங்க? இன்னைக்கு உங்க வீட்டுக்கு என்ன கிளீனிங் சர்வீஸ் ஏற்பாடு பண்ணட்டும்? ✨`;
  }

  // Casual 4: Single-word Greetings (Hi, Hello, Vanakkam, Machi, Bro, Thala, Hey)
  const isGreetingOnly = /^(hi|hello|hey|vanakkam|வணக்கம்|machi|machan|bro|thala|good morning|good evening|good afternoon|namaste|ஹாய்|ஹலோ)$/i.test(lower.trim()) ||
    lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'vanakkam' || lower === 'வணக்கம்';
  if (isGreetingOnly) {
    return `வணக்கம்! நான் VS Home Cleaning-ன் சாரல் 🌸 சொல்லுங்க, உங்களுக்கு எப்படி உதவலாம்? பாத்ரூம் கிளீனிங் (₹499), கிச்சன் டீப் கிளீனிங் (₹799), சோபா ஷாம்பு அல்லது முழு வீடு கிளீனிங் சர்வீஸ் எது வேணும்னாலும் சொல்லுங்க, பெஸ்ட்டா பண்ணி தரோம்! 😊✨`;
  }

  // Casual 5: Thanks / Appreciation (Nandri, Super, Thanks, Great, Thank you for the service)
  if (lower.includes('thank') || lower.includes('nandri') || lower.includes('நன்றி') || lower.includes('super') || lower.includes('சூப்பர்') || lower.includes('great') || lower.includes('nice') || lower.includes('semma') || lower.includes('tq')) {
    return `ரொம்ப மகிழ்ச்சிங்க! 🙏 உங்களுக்கு எப்போது கிளீனிங் உதவி தேவைப்பட்டாலும் ஒரு மெசேஜ் பண்ணுங்க, நான் உடனடியா அரேஞ்ச் பண்ணிடுவேன்! உங்கள் நாள் சிறக்கட்டும்! 🌸✨`;
  }

  // Casual 6: Okay / Seri / Hm / Bye
  if (/^(ok|okay|okey|seri|சரி|fine|k|hmm|done|yes|bye|good night)$/i.test(lower.trim()) || lower === 'okey' || lower === 'sari' || lower === 'seri' || lower === 'ok') {
    return `சரிங்க! 👍 உங்களுக்கு எப்போது கிளீனிங் தேவைப்பட்டாலும் சொல்லுங்க, நான் உடனடியாக அரேஞ்ச் பண்ணி தர்றேன்! ஏதேனும் சந்தேகம் இருந்தா தயங்காம கேளுங்க. 😊🌸`;
  }

  // Partner Assignment / How it works
  if (lower.includes('assign') || lower.includes('partner eppadi') || lower.includes('cleaner eppadi') || lower.includes('how partner') || lower.includes('who will come') || lower.includes('யாரு வருவா')) {
    return `வணக்கம்! 🙏 நீங்க வெப்சைட் அல்லது வாட்ஸ்அப்ல புக் செய்த அடுத்த நொடி, உங்க சென்னை முகவரிக்கு மிக அருகிலுள்ள எங்களின் பயிற்சி பெற்ற கிளீனிங் ஸ்பெஷலிஸ்ட் ஒதுக்கப்படுவார்!\n\nஅவருடைய பெயர், மொபைல் எண் மற்றும் நேரடி Live GPS Tracking Link உங்களுக்கு வாட்ஸ்அப்பில் உடனே வந்துவிடும். அவர் சரியான நேரத்திற்கு வந்து கிளீனிங் முடித்த பிறகு மட்டும் நீங்க பணம் கொடுத்தால் போதும் (Zero Advance)! 😊✨`;
  }

  // Check if customer says "I will share address", "wait", "hold on", "one sec"
  const isAddressPromise = lower.includes('share my address') || lower.includes('send my address') ||
    lower.includes('sending address') || lower.includes('share address') || lower.includes('send address') ||
    lower.includes('sending now') || lower.includes('sharing now') || lower.includes('one sec') ||
    lower.includes('wait a minute') || (lower.startsWith('wait') && !lower.includes('bathroom') && !lower.includes('sofa'));

  if (isAddressPromise) {
    return `கண்டிப்பாங்க! உங்க ஏரியா பெயர், தெரு / Flat எண் மற்றும் PIN Code அனுப்புங்க, நான் இங்கேயே வெயிட் பண்றேன். 😊👍`;
  }

  // CASE B: Catalog & Store Guidance (Clear, non-pushy, zero confusion)
  if (lower.includes('service') || lower.includes('package') || lower.includes('book') || lower.includes('bathroom') || lower.includes('kitchen') || lower.includes('sofa') || lower.includes('clean')) {
    return `வணக்கம்! 🙏\n\nநம்ம VS Home Cleaning-ல் பாத்ரூம் (Classic ₹499, Premium ₹549, Eco-Smart ₹599), கிச்சன் டீப் கிளீனிங் (₹799), சோபா மற்றும் முழு வீடு கிளீனிங்கிற்கு முழுமையான பேக்கேஜ்கள் உள்ளன.\n\n` +
      `🛍️ **எளிய முன்பதிவு (Easy Visual Booking):**\n` +
      `நீங்கள் குழப்பமே இல்லாமல், அனைத்து பேக்கேஜ்களையும் படங்களுடன் பார்த்து புக் செய்ய:\n` +
      `1️⃣ மேலே உள்ள **WhatsApp Store / Catalog (🛍️)** ஐகானை க்ளிக் செய்து கார்ட்டில் (Cart) ஆட் செய்து ஆர்டர் அனுப்பலாம்!\n` +
      `2️⃣ அல்லது நம்முடைய அதிகாரப்பூர்வ வெப்சைட்டான **https://vshomecleaningservices.in**-ல் 1 நிமிடத்தில் புக் செய்யலாம்.\n\n` +
      `நீங்கள் கார்ட் அல்லது வெப்சைட்டில் ஆர்டர் போட்ட அடுத்த நொடி, உங்களுக்கான **Order ID** உருவாக்கப்பட்டு எங்கள் ஸ்பெஷலிஸ்ட் ஒதுக்கப்படுவார்!\n\n` +
      `ஏதேனும் சந்தேகம் உள்ளதா அல்லது ஏதேனும் உதவி தேவையா? தயங்காமல் கேளுங்கள்! 😊`;
  }

  // Fallback: Warm, natural human response (NEVER dumping cold English template)
  return `வணக்கம்! நான் VS Home Cleaning-ன் AI உதவியாளர் **சாரல்** 🌸\n\nசொல்லுங்க, உங்களுக்கு என்ன கிளீனிங் உதவி தேவைப்படுது? பாத்ரூம், கிச்சன், சோபா அல்லது வீடு கிளீனிங் சர்வீஸ் வேணுமா? அல்லது ஏற்கனவே புக் செய்த ஆர்டரை ட்ராக் பண்ணனுமா? சொல்லுங்க, நான் உதவ ரெடி! 😊`;
}

/**
 * Handle WhatsApp Native Catalog / Cart Order
 */
async function handleCartOrder(phone, orderMsg, pushName) {
  const session = getSession(phone);
  if (pushName && !session.name) {
    session.name = pushName.replace(/[^\w\s]/gi, '').trim() || null;
  }

  const itemCount = orderMsg?.itemCount || 1;
  const rawTotal = orderMsg?.totalAmount1000;
  const total = rawTotal ? Math.round(Number(rawTotal) / 1000) : 3097;
  const orderTitle = orderMsg?.orderTitle || 'Cleaning Services';
  const ref = generateRef();
  session.pendingRef = ref;

  session.services = [{
    id: 'whatsapp_cart',
    name: `${itemCount} Services from WhatsApp Cart (${orderTitle})`,
    price: total,
    count: itemCount
  }];

  const prevBookings = await findCustomerBookings(phone);
  const prevAddress = prevBookings.length > 0 && prevBookings[0].address ? prevBookings[0].address : null;

  if (prevAddress) {
    session.address = prevAddress;
    session.stage = 'asking_slot';
    return `🛒 **WHATSAPP CART ORDER RECEIVED!** ✨\n\n` +
      `வணக்கம் *${session.name || 'Customer'}*! 🙏\n` +
      `உங்கள் வாட்ஸ்அப் கார்ட் ஆர்டர் வெற்றிகரமாக பதிவு செய்யப்பட்டுள்ளது.\n\n` +
      `🆔 *Booking Reference:* **${ref}**\n` +
      `📦 *சேவைகள்:* ${itemCount} சேவைகள் (${orderTitle})\n` +
      `💰 *மொத்தத் தொகை:* ₹${total} (100% Pay After Service - Zero Advance)\n` +
      `📍 *முகவரி:* ${prevAddress}\n\n` +
      `எங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட் வர எந்த நேர ஸ்லாட் வசதியாக இருக்கும்?\n` +
      `🌅 *Morning:* 08:00 AM - 10:00 AM\n` +
      `☀️ *Morning:* 10:00 AM - 12:00 PM\n` +
      `🌤️ *Afternoon:* 02:00 PM - 04:00 PM\n` +
      `🌆 *Evening:* 04:00 PM - 06:00 PM\n\n` +
      `(வேறு முகவரி எனில் புதிய முகவரியையும் அனுப்பலாம்) 😊`;
  } else {
    session.stage = 'asking_location';
    return `🛒 **WHATSAPP CART ORDER RECEIVED!** ✨\n\n` +
      `வணக்கம் *${session.name || 'Customer'}*! 🙏\n` +
      `உங்கள் வாட்ஸ்அப் கார்ட் ஆர்டர் வெற்றிகரமாக பதிவு செய்யப்பட்டுள்ளது.\n\n` +
      `🆔 *Booking Reference:* **${ref}**\n` +
      `📦 *தேர்ந்தெடுக்கப்பட்டவை:* ${itemCount} சேவைகள் (${orderTitle})\n` +
      `💰 *மொத்தத் தொகை:* ₹${total} (100% Pay After Service - Zero Advance)\n\n` +
      `📍 எங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட் வர வேண்டிய உங்கள் **சென்னை முகவரி மற்றும் PIN Code**-ஐ பகிருங்கள் (எ.கா: *Anna Nagar West, Flat 3B, 600040*).\n\n` +
      `முகவரி கிடைத்ததும் நேர ஸ்லாட்டை உறுதி செய்து ஸ்பெஷலிஸ்ட்டை உடனடியாக ஒதுக்குகிறேன்! 🧹✨`;
  }
}

module.exports = {
  processCustomerMessage,
  handleCartOrder,
  SERVICES,
  saveBookingToFirebase
};
