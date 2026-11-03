/**
 * VS Home Cleaning Services — Saral AI Helpline Agent (Powered by Gemini 3.6 Flash)
 * =================================================================================
 * Real Humanized AI Helpline for WhatsApp (+91 75581 91073).
 * 
 * Powered by Google Gemini 3.6 Flash:
 * 1. Speaks 100% like a genuine, caring Chennai Customer Operations Executive.
 * 2. Checks live Firebase bookings and speaks real details (Ref, Specialist, Slot).
 * 3. Handles WhatsApp Orders / Cart / Text Bookings directly & writes to Firebase / partnerJobs.
 * 4. In case of delays/complaints, immediately alerts Partner & Founder on WhatsApp.
 * 5. Handles questions about services, pricing, rescheduling, or feedback.
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

const FIREBASE_DB_URL = 'https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app';
const FOUNDER_PHONE   = '916383458190';
const SUPPORT_PHONE   = '+91 75581 91073';
const WEBSITE_URL     = 'https://vshomecleaningservices.in';

let cachedGeminiKey = process.env.GEMINI_API_KEY || null;

async function getGeminiKey() {
  if (cachedGeminiKey) return cachedGeminiKey;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/bookingLookup/gemini_key.json`);
    const key = await res.json();
    if (key && typeof key === 'string' && key.length > 10) {
      cachedGeminiKey = key;
      return cachedGeminiKey;
    }
  } catch (e) {}
  return null;
}

const sessions = new Map();

function getSession(phone) {
  const digits = String(phone).replace(/\D/g, '');
  const clean  = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!sessions.has(clean)) {
    sessions.set(clean, {
      phone: clean,
      name: null,
      history: [],
      pendingRef: null,
      cart: null,
      services: [],
      address: null,
      pincode: null,
      date: null,
      time: null,
      stage: 'idle' // idle | waiting_address | confirming | completed
    });
  }
  return sessions.get(clean);
}

function generateRef() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return `VS-${yy}${mm}${dd}-${rand}`;
}

async function getActivePartner() {
  try {
    const r = await fetch(`${FIREBASE_DB_URL}/partners.json`);
    const d = await r.json();
    if (d && !d.error && typeof d === 'object') {
      for (const k of Object.keys(d)) {
        const p = d[k];
        if (p && (p.accountStatus === 'active' || !p.accountStatus)) {
          return { uid: k, name: p.name || 'Vignesh S', phone: p.phone || p.phoneNumber || '916383458190' };
        }
      }
    }
  } catch (e) {}
  return { uid: 'partner-1', name: 'Vignesh S', phone: '916383458190' };
}

async function lookupBooking(queryOrPhone) {
  const clean = String(queryOrPhone || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const digitsOnly = String(queryOrPhone || '').replace(/\D/g, '');
  const p10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : null;

  // 1. Check phone mirror
  if (p10) {
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bookingLookup/by_phone_${p10}.json`);
      const d = await r.json();
      if (d && !d.error && d.ref) return d;
    } catch (e) {}
  }

  // 2. Check direct ref
  let refKey = clean;
  if (clean.startsWith('VS') && clean.length >= 12 && !clean.includes('-')) {
    refKey = `VS-${clean.slice(2, 8)}-${clean.slice(8, 12)}`;
  }
  try {
    const r = await fetch(`${FIREBASE_DB_URL}/bookingLookup/${refKey}.json`);
    const d = await r.json();
    if (d && !d.error && d.status) return d;
  } catch (e) {}

  // 3. Fallback to recent bookings
  try {
    const r = await fetch(`${FIREBASE_DB_URL}/bookingLookup/recent_bookings.json`);
    const recent = await r.json();
    if (recent && typeof recent === 'object') {
      for (const [k, b] of Object.entries(recent)) {
        if (!b) continue;
        const bMob = String(b.customerMobile || b.mobile || '').replace(/\D/g, '').slice(-10);
        if (p10 && bMob === p10) return b;
        const bRef = String(b.ref || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (clean && bRef === clean) return b;
      }
    }
  } catch (e) {}

  return null;
}

// ─────────────────────────────────────────────
// Save WhatsApp Booking to Firebase & Dispatch
// ─────────────────────────────────────────────
async function saveBookingToFirebase(session, notifier) {
  const ref = session.pendingRef || generateRef();
  session.pendingRef = null;

  const total = (session.cart?.total) ||
                (session.services.reduce((s, x) => s + x.price, 0)) ||
                499;

  const rawMobile = session.customerPhone || session.phone || '';
  const cleanMobDigits = String(rawMobile).replace(/\D/g, '');
  const mobile = cleanMobDigits.length >= 10 ? cleanMobDigits.slice(-10) : '7200910738';
  const serviceName = (session.cart?.title) ||
                      (session.services.map(s => s.name).join(' + ')) ||
                      'Home Deep Cleaning';

  const partner = await getActivePartner();

  const bookingRecord = {
    ref,
    name: session.name || 'WhatsApp Customer',
    mobile,
    serviceType: serviceName,
    address: session.address ? `${session.address} (PIN: ${session.pincode || '600001'})` : 'Chennai',
    pincode: session.pincode || '600001',
    preferredDate: session.date || 'Tomorrow',
    preferredTime: session.time || '10:00 AM - 12:00 PM',
    status: 'Team Assigned',
    paymentType: 'COD',
    paymentMethod: 'Cash on Service / Online UPI',
    total,
    subtotal: total,
    assignedTo: partner.uid,
    assignedPartnerName: partner.name,
    assignedPartnerMobile: partner.phone,
    createdAt: Date.now(),
    bookedVia: 'WhatsApp Saaral AI'
  };

  const lookupRecord = {
    ref,
    status: 'Team Assigned',
    serviceType: serviceName,
    total,
    preferredDate: bookingRecord.preferredDate,
    preferredTime: bookingRecord.preferredTime,
    customerName: bookingRecord.name,
    customerMobile: mobile,
    assignedPartnerName: partner.name,
    assignedPartnerMobile: partner.phone
  };

  const p10 = mobile.slice(-10);

  const jobPayload = {
    bookingRef: ref,
    serviceType: serviceName,
    category: 'cleaning',
    customerName: bookingRecord.name,
    customerPhone: mobile,
    address: bookingRecord.address,
    date: bookingRecord.preferredDate,
    time: bookingRecord.preferredTime,
    price: total,
    status: 'pending',
    assignedTo: partner.uid,
    assignedPartnerName: partner.name,
    createdAt: Date.now()
  };

  const notifPayload = {
    type: 'new_job',
    bookingRef: ref,
    customerName: bookingRecord.name,
    customerPhone: mobile,
    serviceType: serviceName,
    address: bookingRecord.address,
    date: bookingRecord.preferredDate,
    time: bookingRecord.preferredTime,
    price: total,
    createdAt: Date.now(),
    read: false
  };

  await Promise.allSettled([
    // 1. Direct booking lookup
    fetch(`${FIREBASE_DB_URL}/bookingLookup/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lookupRecord)
    }),
    // 2. Phone mirror lookup (used by voice helpline & phone search)
    fetch(`${FIREBASE_DB_URL}/bookingLookup/by_phone_${p10}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lookupRecord)
    }),
    // 3. Recent bookings index
    fetch(`${FIREBASE_DB_URL}/bookingLookup/recent_bookings/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lookupRecord)
    }),
    // 4. Partner App global jobs list
    fetch(`${FIREBASE_DB_URL}/partnerJobs/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload)
    }),
    // 5. Partner App UID specific jobs list (Partner App listens to partnerJobs/<uid>)
    fetch(`${FIREBASE_DB_URL}/partnerJobs/${partner.uid}/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload)
    }),
    // 6. Partner App In-App Notification (triggers sound/badge in partner app)
    fetch(`${FIREBASE_DB_URL}/partnerNotifications/${partner.uid}/${ref}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notifPayload)
    })
  ]);

  if (notifier) {
    const pClean = partner.phone.replace(/\D/g, '');
    const pTarget = pClean.length === 10 ? '91' + pClean : pClean;

    const partnerAlert = `🔔 *NEW CLEANING JOB ASSIGNED (WhatsApp)* 🔔\n\n` +
      `📋 *Job Ref:* ${ref}\n` +
      `👤 *Customer:* ${bookingRecord.name} (+91 ${mobile})\n` +
      `🛠️ *Service:* ${serviceName}\n` +
      `📅 *Date & Slot:* ${bookingRecord.preferredDate} (${bookingRecord.preferredTime})\n` +
      `📍 *Address:* ${bookingRecord.address}\n` +
      `💰 *Amount:* ₹${total} (Collect after inspection)\n\n` +
      `Partner App-ல் சரிபார்த்து உறுதி செய்யவும்! ⚡`;

    const founderAlert = `🚨 *NEW WHATSAPP BOOKING CREATED* 🚨\n\n` +
      `Ref: ${ref} | ₹${total}\n` +
      `Customer: ${bookingRecord.name} (+91 ${mobile})\n` +
      `Service: ${serviceName}\n` +
      `Partner Assigned: ${partner.name}\n` +
      `Slot: ${bookingRecord.preferredDate} (${bookingRecord.preferredTime})`;

    await Promise.allSettled([
      notifier(pTarget, partnerAlert),
      notifier(FOUNDER_PHONE, founderAlert)
    ]);
  }

  session.stage = 'completed';
  session.cart = null;
  session.services = [];
  const savedAddress = session.address;
  session.address = null;

  return {
    ref,
    partnerName: partner.name,
    total,
    date: bookingRecord.preferredDate,
    time: bookingRecord.preferredTime,
    address: savedAddress
  };
}

// ─────────────────────────────────────────────
// Address & Time slot extractors
// ─────────────────────────────────────────────
function extractPincode(text) {
  const m = text.match(/\b600\d{3}\b/);
  return m ? m[0] : null;
}

function isAddressLike(text) {
  const t = text.toLowerCase();
  const hasPin = /\b600\d{3}\b/.test(t);
  const keywords = ['nagar', 'street', 'road', 'st,', 'rd,', 'flat', 'plot', 'door', 'avenue', 'colony', 'apartment', 'chennai', 'anna nagar', 'velachery', 'adyar', 'tambaram', 't nagar', 'porur', 'guindy', 'kodambakkam', 'mylapore', 'perambur', 'kilpauk', 'vadapalani', 'chromepet', 'medavakkam', 'omr', 'ecr', 'ambattur', 'madipakkam', 'no.', 'no '];
  return hasPin || keywords.some(k => t.includes(k));
}

function extractDateAndTime(text) {
  const lower = text.toLowerCase();
  let date = null;
  let time = null;

  if (lower.includes('today') || lower.includes('innaiku') || lower.includes('இன்னைக்கு') || lower.includes('aaj')) {
    date = 'Today';
  } else if (lower.includes('tomorrow') || lower.includes('naalai') || lower.includes('நாளை') || lower.includes('kal')) {
    date = 'Tomorrow';
  } else {
    const dm = text.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
    if (dm) date = dm[0];
  }

  const tm = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (tm) {
    time = tm[0].toUpperCase();
  } else if (lower.includes('morning') || lower.includes('காலை') || lower.includes('8') || lower.includes('10')) {
    time = '10:00 AM - 12:00 PM';
  } else if (lower.includes('afternoon') || lower.includes('மதியம்') || lower.includes('2')) {
    time = '02:00 PM - 04:00 PM';
  } else if (lower.includes('evening') || lower.includes('மாலை') || lower.includes('4')) {
    time = '04:00 PM - 06:00 PM';
  }

  return { date, time };
}

// ─────────────────────────────────────────────
// Gemini LLM Caller (Fast 2.5s Timeout, Non-blocking)
// ─────────────────────────────────────────────
async function askGemini(prompt, systemInstruction, history = []) {
  const apiKey = await getGeminiKey();
  if (!apiKey) return null;

  const contents = [];
  const recentHistory = history.slice(-4);
  for (const h of recentHistory) {
    contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply && reply.trim()) return reply.trim();
    }
  } catch (err) {
    clearTimeout(timeoutId);
  }

  return null;
}

// ─────────────────────────────────────────────
// Main Message Processor (High Performance <50ms)
// ─────────────────────────────────────────────
async function processCustomerMessage(phone, userText, senderPushName, notifier) {
  const session = getSession(phone);
  const text    = (userText || '').trim();
  const lower   = text.toLowerCase();

  if (senderPushName && !session.name) {
    session.name = senderPushName.replace(/[^\w\s]/gi, '').trim() || null;
  }

  const cleanDigits = String(phone).replace(/\D/g, '');
  const p10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

  const phoneInText = text.match(/\b[6-9]\d{9}\b/);
  if (phoneInText) session.customerPhone = phoneInText[0];
  const refInText   = text.match(/VS-\d{6}-[A-Z0-9]{4}/i);
  const lookupQuery = refInText ? refInText[0].toUpperCase() : (phoneInText ? phoneInText[0] : p10);

  // 1. Fetch live booking from Firebase
  const activeBooking = await lookupBooking(lookupQuery) || await lookupBooking(p10);

  // 2. Detect delay / complaint / emergency and alert Partner + Founder
  const isEmergency = [
    'not arrived', 'didnt come', 'did not come', 'delay', 'delayed', 'late', 'where is', 'call me',
    'varala', 'varalaye', 'innum varala', 'eppo varuvaar', 'cleaner varala', 'partner varala', 'late aaguthu',
    'cancel', 'complaint', 'problem', 'issue', 'bad service', 'cheat', 'urgent', 'emergency', 'help', 'cleaner enga'
  ].some(k => lower.includes(k));

  let partnerAlertSent = false;
  if (isEmergency && notifier) {
    const partnerName  = activeBooking?.assignedPartnerName || 'Vignesh S';
    const partnerPhone = activeBooking?.assignedPartnerMobile || FOUNDER_PHONE;
    const ref          = activeBooking?.ref || 'Active Job';

    const pClean = partnerPhone.replace(/\D/g, '');
    const pTarget = pClean.length === 10 ? '91' + pClean : pClean;

    const urgentPartnerAlert = `🚨 *URGENT CUSTOMER HELPLINE ALERT* 🚨\n\n` +
      `வாடிக்கையாளர் (+91 ${p10}) உங்களுக்காக காத்திருக்காங்க / புகார் அளித்துள்ளார்கள்:\n"${text}"\n\n` +
      `Ref: ${ref}\n` +
      `தயவுசெய்து உடனடியாக வாடிக்கையாளரைத் தொடர்புகொள்ளவும்! ⚡`;

    const founderAlert = `🚨 *CUSTOMER HELPLINE ISSUE* 🚨\n\n` +
      `Caller: +91 ${p10} (${session.name || 'Customer'})\n` +
      `Booking: ${ref}\n` +
      `Assigned Partner: ${partnerName}\n` +
      `Message: "${text}"\n\n` +
      `Saral Helpline has alerted the partner. Immediate founder oversight active!`;

    await Promise.allSettled([
      notifier(pTarget, urgentPartnerAlert),
      notifier(FOUNDER_PHONE, founderAlert)
    ]);
    partnerAlertSent = true;
  }

  // 3. WHATSAPP ORDER COMPLETION LOGIC (Direct text address / slot)
  if (session.stage === 'waiting_address' || (session.cart && isAddressLike(text))) {
    if (isAddressLike(text)) {
      session.address = text;
      const pin = extractPincode(text);
      if (pin) session.pincode = pin;
    }
    const { date, time } = extractDateAndTime(text);
    if (date) session.date = date;
    if (time) session.time = time;

    if (session.address) {
      if (!session.date) session.date = 'Tomorrow';
      if (!session.time) session.time = '10:00 AM - 12:00 PM';

      const booked = await saveBookingToFirebase(session, notifier);

      return `🎉 *உங்கள் புக்கிங் வெற்றிகரமாக உறுதியானது!* (Ref: *${booked.ref}*)\n\n` +
        `உங்களுக்காக எங்கள் தொழில்முறை கிளீனிங் ஸ்பெஷலிஸ்ட் **${booked.partnerName}** ஒதுக்கப்பட்டுவிட்டார்.\n\n` +
        `📅 *நேரம்:* ${booked.date} (${booked.time})\n` +
        `💰 *தொகை:* ₹${booked.total} (முன்பணம் ஏதுமில்லை — வேலை முடிந்த பின் செலுத்தலாம்)\n` +
        `📍 *முகவரி:* ${booked.address || 'Chennai'}\n\n` +
        `🔍 *Live Tracking Link:* \n${WEBSITE_URL}/track-booking.html?id=${booked.ref}\n\n` +
        `எங்கள் ஸ்பெஷலிஸ்ட் குறித்த நேரத்தில் உங்கள் இருப்பிடத்திற்கு வந்துவிடுவார். நன்றி! 🧹✨`;
    }
  }

  // 4. INSTANT CONTEXTUAL HELPLINE REPLIES (<10ms, Zero Waiting)
  if (isEmergency) {
    const partnerName = activeBooking?.assignedPartnerName || 'Vignesh S';
    const ref = activeBooking?.ref || 'Active Job';
    return `Romba sorry for the delay / inconvenience! 🙏\n\nUnga booking (${ref}) specialist **${partnerName}**-ku ippove urgent WhatsApp alert send pannittaen. Avanga ungalukku call panra maathiri inform pannirukkom.\n\nFounder Vignesh-kum direct notification poirukku. Urgent help-ku call: ${SUPPORT_PHONE}`;
  }

  // Polite acknowledgments / closers ("Okey", "Okey done", "Thanks", "Super", "Sari")
  const isCloser = /^(ok|okey|okay|ok done|okey done|okay done|done|all done|sari|seri|super|thanks|thank you|thx|nandri|great|perfect|sure|bye|good night|tq)$/i.test(lower) ||
    /^(ok|okey|okay|thanks|thank you|nandri|sari|super)\s*(pa|bro|sir|mam|saral|ji)?[.!]?$/i.test(lower);

  if (isCloser) {
    if (activeBooking) {
      return `Nandri ${session.name || 'sir'}! 🙏 Unga specialist **${activeBooking.assignedPartnerName || 'Vignesh S'}** on-time-la vandhu super-ah clean panni tharuvaanga. Edhavadhu thevaippatta eppo vena inga message pannalaam or call 07971851000. Have a great day! 🌸✨`;
    }
    return `Nandri ${session.name || 'sir'}! 🙏 Edhavadhu services thevaippatta eppo vena inga message pannalaam. Have a wonderful day! 🌸✨`;
  }

  // Greetings
  if (/^(hi|hello|hey|vanakkam|வணக்கம்|start|help|saral)/i.test(lower) && !activeBooking) {
    return `Vanakkam ${session.name || ''}! 🙏 Naan **Saaral**, VS Home Cleaning Helpline Executive.\n\nUngalukku eppadi help pannattum?\n1. 🧹 *New Cleaning Services Book panna*\n2. 💰 *Service Rates & Price details therinjukka*\n3. 🔍 *Booking status & Cleaner track panna*\n\nSollunga sir! 😊 (24/7 Voice Helpline: 07971851000)`;
  }

  // ────────────── SPECIFIC SERVICES REPLIES (Instant <10ms) ──────────────
  // Bathroom Cleaning
  if (/bathroom|toilet|washroom|bath|closet/i.test(lower)) {
    return `🚿 *Bathroom Deep Cleaning — VS Home Cleaning*\n\n` +
      `• *Rate:* ₹499 per bathroom\n` +
      `• *Includes:* Hard water stain removal, tile & floor acid-free scrubbing, toilet descaling, taps & chrome buffing, mirror shine, complete sanitization.\n` +
      `• *Zero Advance:* 100% pay after inspection!\n\n` +
      `Direct Online Booking: ${WEBSITE_URL}/booking.html\n` +
      `Or reply with your Address & Preferred Slot here to book directly! ✨`;
  }

  // Kitchen Cleaning
  if (/kitchen|chimney|stove|samayal/i.test(lower)) {
    return `🍳 *Kitchen Deep Cleaning — VS Home Cleaning*\n\n` +
      `• *Rate:* ₹1,399 (Full Kitchen)\n` +
      `• *Includes:* Heavy grease & oil degreasing, chimney surface scrubbing, wall tile descaling, cabinets interior & exterior, gas stove polishing, sink & drainage sanitization.\n` +
      `• *Zero Advance:* Pay after service!\n\n` +
      `Direct Online Booking: ${WEBSITE_URL}/booking.html\n` +
      `Or reply with your Address & Preferred Slot here to book directly! ✨`;
  }

  // Sofa / Mattress Shampooing
  if (/sofa|couch|mattress|cushion|chair/i.test(lower)) {
    return `🛋️ *Sofa & Fabric Deep Shampooing — VS Home Cleaning*\n\n` +
      `• *3-Seater Sofa:* ₹899\n` +
      `• *5-Seater Sofa / L-Shape:* ₹1,399\n` +
      `• *Includes:* High-power dry extraction, organic shampoo foam scrub, stain removal, rapid moisture extraction (dries quickly).\n` +
      `• *Zero Advance:* 100% satisfaction guaranteed!\n\n` +
      `Direct Online Booking: ${WEBSITE_URL}/booking.html\n` +
      `Or reply with your Address & Preferred Slot here to book directly! ✨`;
  }

  // Full Home Cleaning
  if (/full home|house|home clean|deep clean|flat|apartment|veedu|1bhk|2bhk|3bhk|villa/i.test(lower)) {
    return `🏠 *Full Home Deep Cleaning — VS Home Cleaning*\n\n` +
      `• *1 BHK:* ₹2,499\n` +
      `• *2 BHK:* ₹3,499\n` +
      `• *3 BHK:* ₹4,499\n` +
      `• *Includes:* All bathrooms deep clean, full kitchen degreasing, all rooms, balconies, fans, windows, switches & machine floor scrubbing.\n` +
      `• *Zero Advance:* Pay only after full inspection!\n\n` +
      `Direct Online Booking: ${WEBSITE_URL}/booking.html\n` +
      `Or reply with your Address & Preferred Slot here to book directly! ✨`;
  }

  // Water Tank / Sump
  if (/tank|water tank|sump/i.test(lower)) {
    return `🚰 *Water Tank & Sump Cleaning — VS Home Cleaning*\n\n` +
      `• *Overhead Sintex Tank:* from ₹699\n` +
      `• *Underground Sump:* from ₹999\n` +
      `• *Includes:* High-pressure sludge extraction, bacterial descaling, UV / potassium permanganate sanitization.\n\n` +
      `Book online: ${WEBSITE_URL}/booking.html or call 07971851000`;
  }

  // General Booking Intent
  if (/book|booking|service venum|clean pannanum|order|schedule|need cleaning/i.test(lower)) {
    session.stage = 'waiting_address';
    return `Super sir! VS Home Cleaning-ல் மிக எளிதாக புக் செய்யலாம்! 🧹✨\n\nதயவுசெய்து:\n1. *என்ன சேவை தேவை?* (Bathroom / Kitchen / Sofa / Full Home)\n2. *உங்கள் சென்னை முகவரி & PIN Code*\n3. *விருப்பமான தேதி & நேரம்* (e.g. Tomorrow 10 AM)\n\nஇதை மெசேஜ் பண்ணுங்க, நான் உடனே ஸ்பெஷலிஸ்ட்டை ஒதுக்கி கன்ஃபார்ம் செய்திடுறேன்! (Zero Advance)`;
  }

  // Location / Coverage Intent
  if (/location|chennai|area|service area|engalaam|pincode|covai|coimbatore/i.test(lower)) {
    return `📍 *VS Home Cleaning Services Chennai City முழுவதும் கிடைக்கும்!*\n\n` +
      `Anna Nagar, T Nagar, Velachery, Adyar, Tambaram, Porur, Guindy, OMR, ECR, Vadapalani, Ambattur, Kilpauk, Mylapore உட்பட சென்னை மற்றும் புறநகர் பகுதிகள் அனைத்திலும் எங்கள் ஸ்பெஷலிஸ்ட்டுகள் உடனடியாக வந்து கிளீன் செய்து தருவார்கள்!\n\n` +
      `Online Booking: ${WEBSITE_URL}/booking.html | Helpline: 07971851000`;
  }

  // Contact / Call / Phone Intent
  if (/call|phone|number|helpline|pesanum|support|contact|contact number/i.test(lower)) {
    return `📞 *VS Home Cleaning Services 24/7 Support:*\n\n` +
      `• *Voice Helpline:* 07971851000 (24/7 AI & Operations Manager Saaral)\n` +
      `• *WhatsApp Helpline:* +91 75581 91073\n` +
      `• *Website:* ${WEBSITE_URL}\n\n` +
      `எந்த உதவி தேவைப்பட்டாலும் தயங்காமல் அழைக்கவும் sir! 😊`;
  }

  // Active Booking Inquiries
  if (activeBooking) {
    if (/^(hi|hello|hey|vanakkam|வணக்கம்|start|saral)/i.test(lower)) {
      return `Vanakkam ${session.name || 'sir'}! 🙏 Naan **Saaral**, VS Home Cleaning Operations Manager. Unga active booking (Ref: *${activeBooking.ref}* - ${activeBooking.serviceType}) paathen. Specialist *${activeBooking.assignedPartnerName || 'Vignesh S'}* assign aagiyirukkaanga. Edhavadhu details venuma sir?`;
    }

    if (/payment|amount|total|charge|evvalavu|panam|cost|fee|bill|pay|kudukanum|evlo/i.test(lower)) {
      return `Vanakkam ${session.name || 'sir'}! Unga booking (Ref: *${activeBooking.ref}*) total payment amount ₹${activeBooking.total || 499}. Advance edhum thevaiyilla sir! Service mudinjadhum clean-ah check pannittu cash or UPI (GPay/PhonePe) moolam pay pannalaam. 💰`;
    }

    if (/enna service|service details|enna book|order|what service|service|package/i.test(lower)) {
      return `Neenga book pannirukura service: *${activeBooking.serviceType || 'Home Deep Cleaning'}* (Ref: *${activeBooking.ref}*).\n\n📅 Scheduled Slot: ${activeBooking.preferredDate || 'Upcoming'} (${activeBooking.preferredTime || '10:00 AM - 12:00 PM'})\n👤 Specialist: *${activeBooking.assignedPartnerName || 'Vignesh S'}*\n💰 Total: ₹${activeBooking.total || 499} (Pay after service)`;
    }

    if (/time|slot|eppo|eppa|varuvaar|varuvaanga|arrival|when|neram/i.test(lower)) {
      return `Unga booking slot: *${activeBooking.preferredDate || 'Upcoming'}* at *${activeBooking.preferredTime || '10:00 AM - 12:00 PM'}*. Specialist *${activeBooking.assignedPartnerName || 'Vignesh S'}* on-time-la vandhuduvaanga sir! ⏱️`;
    }

    if (/specialist|cleaner|partner|who is|yaaru|yaar/i.test(lower)) {
      return `Unga cleaning specialist: *${activeBooking.assignedPartnerName || 'Vignesh S'}* (Contact: ${activeBooking.assignedPartnerMobile || '916383458190'}). Specialist arrival-ku munnaadi ungalukku call pannuvaanga sir! 🤝`;
    }

    if (/cancel/i.test(lower)) {
      return `Unga booking (Ref: *${activeBooking.ref}*) cancel panna virumbureengala sir? Zero cancellation charges! Cancel confirm panna 'CONFIRM CANCEL' nu anupunga, illai helpline 07971851000-ku call pannalaam.`;
    }
  }

  // General Rate Card
  if (/price|cost|rate|rates|charges|vilai/i.test(lower)) {
    return `🧹 *VS Home Cleaning Services — Official Rates*\n\n` +
      `• *Bathroom Deep Clean:* ₹499 per bathroom\n` +
      `• *Kitchen Deep Clean:* ₹1,399\n` +
      `• *Sofa Shampooing:* ₹899 (3-seater) | ₹1,399 (5-seater)\n` +
      `• *Full Home Deep Clean:* ₹2,499 (1BHK) | ₹3,499 (2BHK)\n\n` +
      `✨ *Zero Advance* — 100% pay after inspection!\n` +
      `Book online: ${WEBSITE_URL}/booking.html`;
  }

  // 5. Open-ended conversational query -> Gemini (with 2.5s timeout)
  let bookingContext = "No active booking record found under this phone number yet.";
  if (activeBooking) {
    bookingContext = `ACTIVE BOOKING: Ref: ${activeBooking.ref}, Service: ${activeBooking.serviceType}, Specialist: ${activeBooking.assignedPartnerName}, Slot: ${activeBooking.preferredDate} (${activeBooking.preferredTime}), Total: Rs ${activeBooking.total}.`;
  }

  const systemPrompt = `You are Saaral, female Operations Manager at VS Home Cleaning Services, Chennai (+91 75581 91073).
Speak natural Chennai Tanglish (Tamil + English). Be warm, polite, and helpful (1-3 sentences). Zero advance policy.
${bookingContext}`;

  const geminiReply = await askGemini(text, systemPrompt, session.history);
  if (geminiReply) return geminiReply;

  // 6. Instant Bulletproof Safe Fallback (<1ms)
  if (activeBooking) {
    return `Vanakkam ${session.name || 'sir'}! Unga booking Ref: *${activeBooking.ref}* (${activeBooking.serviceType}). Specialist *${activeBooking.assignedPartnerName || 'Vignesh S'}* on-time-la vandhuduvaanga. Slot: ${activeBooking.preferredDate} (${activeBooking.preferredTime}). Total: ₹${activeBooking.total}. Edhavadhu thevaippatta sollunga sir! (Helpline: 07971851000)`;
  }

  return `Vanakkam ${session.name || ''}! 🙏 Naan **Saaral**, VS Home Cleaning Operations Manager.\n\nUngalukku eppadi help pannattum?\n• *Service Rates therinjukka* ('Rates' nu anupunga)\n• *Bathroom, Kitchen, Sofa, Full Home book panna*\n• *Active Booking Status check panna*\n\nDirect 24/7 Helpline: 07971851000. Sollunga sir! 😊`;

  // Update session history
  session.history.push({ role: 'user', text });
  session.history.push({ role: 'model', text: finalReply });
  if (session.history.length > 8) session.history = session.history.slice(-8);

  return finalReply;
}

// ─────────────────────────────────────────────
// WhatsApp Catalog Cart Handler
// ─────────────────────────────────────────────
async function handleCartOrder(phone, orderMsg, pushName) {
  const session = getSession(phone);
  if (pushName && !session.name) session.name = pushName.replace(/[^\w\s]/gi, '').trim() || null;

  const itemCount = orderMsg?.itemCount || 1;
  const rawTotal = orderMsg?.totalAmount1000;
  const total = rawTotal ? Math.round(Number(rawTotal) / 1000) : 1148;
  const orderTitle = orderMsg?.orderTitle || 'Cleaning Services';

  session.cart = { itemCount, total, title: `${itemCount} Services (${orderTitle})` };
  session.stage = 'waiting_address';

  return `🛒 *WHATSAPP CART ORDER RECEIVED!* ✨\n\n` +
    `வணக்கம் ${session.name || ''}! உங்கள் கார்ட் ஆர்டர் வெற்றிகரமாக பெறப்பட்டது:\n` +
    `📋 *சேவை:* ${session.cart.title}\n` +
    `💰 *தொகை:* ₹${total} (முன்பணம் எதுவும் இல்லை — வேலை முடிந்த பின் கட்டணம்!)\n\n` +
    `எங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட்டை உடனடியாக ஒதுக்க, தயவுசெய்து:\n` +
    `📍 *உங்கள் முழு சென்னை முகவரி மற்றும் PIN Code*\n` +
    `📅 *விருப்பமான தேதி & நேர ஸ்லாட்டை* அனுப்பவும்!\n\n` +
    `(எ.கா: Door No 12, Gandhi Street, Anna Nagar, 600040. Tomorrow 10 AM)`;
}

module.exports = {
  processCustomerMessage,
  handleCartOrder,
  saveBookingToFirebase
};
