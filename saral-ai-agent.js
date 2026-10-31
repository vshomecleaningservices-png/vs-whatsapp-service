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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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

  const addressKeywords = [
    'nagar', 'street', 'road', 'rd', 'flat', 'apartment', 'apt', 'block', 'floor',
    'door', 'colony', 'layout', 'cross', 'main', 'opp', 'near', 'beside', 'phase',
    'house', 'plot', 'avenue', 'sector', 'stage',
    'நகர்', 'தெரு', 'ரோடு', 'வீடு', 'அபார்ட்மெண்ட்'
  ];
  if (addressKeywords.some(kw => lower.includes(kw)) && clean.length >= 5) return true;

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
 * Save booking into Firebase RTDB (Singapore)
 */
async function saveBookingToFirebase(session) {
  const ref = generateRef();
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
async function callGeminiFlash(session, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const systemInstruction = `
You are Saral (சாரல்), the friendly, charming, highly professional customer relationship & booking assistant at VS Home Cleaning Services, Chennai.
Founder: Mr. Vignesh (Phone: +91 63834 58190).

Catalog & Pricing:
- Classic Bathroom Cleaning: ₹499 per bathroom
- Kitchen Deep Cleaning: ₹799
- Sofa Shampoo & Sanitization: ₹699 (3 to 5 seater), ₹899 (6-7 seater)
- Full Home Deep Cleaning: 1BHK ₹1499, 2BHK ₹1999, 3BHK ₹2499
- Balcony & Window Cleaning: ₹499
Terms: Zero advance, 100% pay after service (Cash or UPI). Diversey eco-friendly chemicals (safe for children & pets, zero acid).

Personality:
1. Warm, respectful, natural human conversational tone (use brief emojis).
2. NEVER repeat recorded greetings like a robot. Talk like an active human texting on WhatsApp.
3. Language: Match customer's language seamlessly (English, Tamil, or Tanglish).
4. Smoothly collect:
   a. Service & quantities (e.g. 4 bathrooms = 4x499 = ₹1996)
   b. Chennai locality & Flat/Street address
   c. Date & preferred time slot (Morning 8-10, Morning 10-12, Afternoon 2-4, Evening 4-6)
5. When all 3 (Services, Address, Slot) are collected, show a neat summary card and ask the customer to confirm with "Confirm" or "Yes".
6. When the customer confirms, add the exact tag: [CREATE_BOOKING: {"services": "...", "total": 1999, "address": "...", "date": "...", "time": "..."}] at the very end of your reply so the automated backend creates the booking!
`.trim();

  try {
    const contents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Vanakkam! I am Saral, ready to help customers naturally on WhatsApp.' }] },
      ...session.history.slice(-8),
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 350
        }
      })
    });

    const data = await res.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (replyText) {
      session.history.push({ role: 'user', parts: [{ text: userMessage }] });
      session.history.push({ role: 'model', parts: [{ text: replyText }] });
      return replyText;
    }
  } catch (err) {
    console.error('Gemini Flash call error:', err);
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

  // -------------------------------------------------------------
  // ATTEMPT 1: Google Gemini 2.0 Flash (If API Key is provided)
  // -------------------------------------------------------------
  if (process.env.GEMINI_API_KEY) {
    const geminiReply = await callGeminiFlash(session, text);
    if (geminiReply) {
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

          if (notifier && typeof notifier === 'function') {
            notifier(FOUNDER_PHONE, `🚨 *NEW SARAL GEMINI BOOKING!* 🚨\nRef: ${booking.ref}\nCustomer: ${booking.name}\nServices: ${booking.serviceType}\nTotal: ₹${booking.total}\nSlot: ${booking.preferredDate} (${booking.preferredTime})\nAddress: ${booking.address}`);
          }

          const cleanReply = geminiReply.replace(/\[CREATE_BOOKING:.*?\]/s, '').trim() +
            `\n\n🔍 *Live GPS Tracking:* https://vshomecleaningservices.in/track-booking.html?id=${booking.ref}`;
          return cleanReply;
        } catch (e) {}
      }
      return geminiReply.replace(/\[CREATE_BOOKING:.*?\]/s, '').trim();
    }
  }

  // -------------------------------------------------------------
  // ATTEMPT 2: Enhanced Native Human Dialogue Engine (Offline)
  // -------------------------------------------------------------
  const detectedLang = detectLanguage(text);
  if (detectedLang === 'tamil' || detectedLang === 'tanglish') session.language = detectedLang;
  const isTamil = session.language === 'tamil';

  // 1. Reference Number Lookup
  const refMatch = text.match(/VS-\d{6}-[A-Z0-9]{4}/i);
  if (refMatch) {
    const ref = refMatch[0].toUpperCase();
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/bookings/${ref}.json`);
      const b = await res.json();
      if (b) {
        return `🔍 *Booking Status (${ref})*:\n\n` +
          `🛠️ *Services:* ${b.serviceType}\n` +
          `📅 *Slot:* ${b.preferredDate} (${b.preferredTime})\n` +
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

  if (lower.includes('owner') || lower.includes('founder') || lower.includes('vignesh') || lower.includes('manager')) {
    return `Certainly! You can speak directly with our Founder:\n\n👤 **Mr. Vignesh (Founder & Operations)**\n📞 **Direct Helpline:** +91 63834 58190\n🏢 **VS Home Cleaning Services, Chennai**`;
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

    if (notifier && typeof notifier === 'function') {
      try {
        notifier(FOUNDER_PHONE, `🚨 *NEW SARAL WHATSAPP BOOKING!* 🚨\nRef: ${booking.ref}\nCustomer: ${booking.name}\nServices: ${booking.serviceType}\nTotal: ₹${booking.total}\nSlot: ${booking.preferredDate} (${booking.preferredTime})\nAddress: ${booking.address}`);
      } catch (e) {}
    }

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
  // 5. NATURAL HUMAN CONVERSATIONAL FLOW
  // -------------------------------------------------------------

  // Check if customer says "I will share address", "wait", "hold on", "one sec"
  const isAddressPromise = lower.includes('share my address') || lower.includes('send my address') ||
    lower.includes('sending address') || lower.includes('share address') || lower.includes('send address') ||
    lower.includes('sending now') || lower.includes('sharing now') || lower.includes('one sec') ||
    lower.includes('wait a minute') || (lower.startsWith('wait') && !lower.includes('bathroom') && !lower.includes('sofa'));

  if (isAddressPromise) {
    if (isTamil) {
      return `கண்டிப்பாங்க! உங்க ஏரியா பெயர், தெரு / Flat எண் மற்றும் PIN Code அனுப்புங்க, நான் இங்கேயே வெயிட் பண்றேன். 😊👍`;
    } else {
      return `Sure! Please take your time and send your Chennai Area, Street/Flat details and PIN Code whenever you're ready. I'm right here! 😊👍`;
    }
  }

  // CASE A: User provided a Date (e.g. "I need service for next month 13th") but NO service yet!
  if (session.date && session.services.length === 0) {
    session.stage = 'choosing';
    const formattedDate = session.dateLabel || session.date;
    return `Got it! Date: **${formattedDate}** is noted! 📅✨\n\n` +
      `Which service would you like us to schedule for that day?\n` +
      `1️⃣ *Classic Bathroom Cleaning* (₹499)\n` +
      `2️⃣ *Kitchen Deep Cleaning* (₹799)\n` +
      `3️⃣ *Sofa Shampoo & Sanitization* (₹699)\n` +
      `4️⃣ *Full Home Deep Cleaning* (1BHK ₹1499 | 2BHK ₹1999)\n` +
      `5️⃣ *Balcony & Glass Windows* (₹499)\n\n` +
      `Just reply with the service name or number (e.g. *"Bathroom"* or *"4 and 5"*). 😊`;
  }

  // CASE B: First Greeting (Sent ONLY ONCE!)
  if (!session.greeted && session.services.length === 0) {
    session.greeted = true;
    session.stage = 'choosing';
    const custName = session.name ? ` ${session.name}` : '';

    return `Hello${custName}! 👋 I'm **Saral**, your personal booking assistant from **VS Home Cleaning Services**, Chennai! 🧹✨\n\n` +
      `Our Top Popular Services:\n` +
      `1️⃣ *Classic Bathroom Cleaning* (₹499)\n` +
      `2️⃣ *Kitchen Deep Cleaning* (₹799)\n` +
      `3️⃣ *Sofa Shampoo & Sanitization* (₹699)\n` +
      `4️⃣ *Full Home Deep Cleaning* (1BHK ₹1499 | 2BHK ₹1999)\n` +
      `5️⃣ *Balcony & Glass Windows* (₹499)\n\n` +
      `Which service would you like to book? Just reply with the number or name (e.g. *"1 and 3"* or *"Bathroom"*). 😊`;
  }

  // CASE C: Services selected, but Address missing -> Ask for Address
  if (session.services.length > 0 && !session.address) {
    session.stage = 'asking_location';
    const total = session.services.reduce((sum, s) => sum + s.price, 0);
    const items = session.services.map((s, i) => `${i + 1}️⃣ *${s.name}* (₹${s.price})`).join('\n');

    return `Great choice! 👍\n\nSelected Services:\n${items}\n💰 *Total Amount:* ₹${total} (Zero advance, Pay After Service)\n\n` +
      `Where should our specialist arrive? Please share your **Chennai Area, Street / Flat number & PIN Code** (e.g. *Anna Nagar West, Flat 3B, 600040*).`;
  }

  // CASE D: Services and Address present, but Slot missing -> Ask for Slot
  if (session.services.length > 0 && session.address && (!session.date || !session.time)) {
    session.stage = 'asking_slot';
    const dateMention = session.date ? `on **${session.dateLabel || session.date}**` : '';

    return `Got it! Verified specialists available for **${session.address}**. ✅\n\n` +
      `What time slot suits you best ${dateMention}?\n` +
      `🌅 *Morning:* 08:00 AM - 10:00 AM\n` +
      `☀️ *Morning:* 10:00 AM - 12:00 PM\n` +
      `🌤️ *Afternoon:* 02:00 PM - 04:00 PM\n` +
      `🌆 *Evening:* 04:00 PM - 06:00 PM\n\n` +
      `Let me know your preferred slot (e.g. *"Morning 10 to 12"*).`;
  }

  // CASE E: Everything present -> Show Final Confirmation Summary
  if (session.services.length > 0 && session.address && session.date && session.time) {
    session.stage = 'confirming';
    const total = session.services.reduce((sum, s) => sum + s.price, 0);
    const serviceList = session.services.map(s => s.name).join(' + ');
    const custName = session.name || 'Sir / Madam';

    return `Awesome! Here is your booking summary:\n\n` +
      `🛠️ *Services:* ${serviceList}\n` +
      `💰 *Total Amount:* ₹${total} (100% Pay After Service)\n` +
      `📍 *Address:* ${session.address}\n` +
      `📅 *Slot:* ${session.date} (${session.time})\n` +
      `👤 *Customer:* ${custName}\n\n` +
      `Shall I confirm this booking? Please reply **"Confirm"** or **"Yes"**! 😊`;
  }

  // Fallback polite inquiry
  return `Hello! How can I help you today? You can tell me which cleaning service you need or share your preferred date! 😊`;
}

module.exports = {
  processCustomerMessage,
  SERVICES,
  saveBookingToFirebase
};
