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
// Gemini LLM Caller (Multi-Model Resilient)
// ─────────────────────────────────────────────
const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

async function askGemini(prompt, systemInstruction, history = []) {
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    console.warn('[Gemini Notice]: Gemini API Key not found');
    return null;
  }

  const contents = [];
  const recentHistory = history.slice(-4);
  for (const h of recentHistory) {
    contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1200
    }
  };

  // Try each model in sequence
  for (const model of CANDIDATE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply && reply.trim()) {
          return reply.trim();
        }
      } else {
        console.warn(`[Gemini ${model}]: Status ${res.status}, trying next model...`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[Gemini ${model} Error]:`, err.message);
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// Main Message Processor
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

  // 3. WHATSAPP ORDER COMPLETION LOGIC
  // If customer has an active Cart order or expressed booking intent and sends address/slot
  if (session.stage === 'waiting_address' || (session.cart && isAddressLike(text))) {
    if (isAddressLike(text)) {
      session.address = text;
      const pin = extractPincode(text);
      if (pin) session.pincode = pin;
    }
    const { date, time } = extractDateAndTime(text);
    if (date) session.date = date;
    if (time) session.time = time;

    // If we have address, auto-confirm booking in Firebase!
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

  // 4. INSTANT CONTEXTUAL HELPLINE REPLIES (Instant <10ms, Zero Waiting!)
  if (isEmergency) {
    const partnerName = activeBooking?.assignedPartnerName || 'Vignesh S';
    const ref = activeBooking?.ref || 'Active Job';
    return `Romba sorry for the delay / inconvenience! 🙏\n\nUnga booking (${ref}) specialist **${partnerName}**-ku ippove urgent WhatsApp alert send pannittaen. Avanga ungalukku call panra maathiri inform pannirukkom.\n\nFounder Vignesh-kum direct notification poirukku. Urgent help-ku call: ${SUPPORT_PHONE}`;
  }

  if (activeBooking) {
    if (/payment|amount|total|charge|evvalavu|panam|cost|fee|bill|pay/i.test(lower)) {
      return `Vanakkam Vignesh sir! Unga booking (Ref: *${activeBooking.ref}*) total payment amount ₹${activeBooking.total || 3998}. Advance edhum thevaiyilla sir! Service mudinjadhum cash or UPI (GPay/PhonePe) moolam pay pannalaam.`;
    }
    if (/enna book|service|details|order|what service|kudu|solren/i.test(lower)) {
      return `Neenga book pannirukura service: *${activeBooking.serviceType || 'Custom Cleaning Plan'}* (Ref: *${activeBooking.ref}*).\n\n📅 Scheduled Slot: ${activeBooking.preferredDate || 'Upcoming'} (${activeBooking.preferredTime || '10:00 AM - 12:00 PM'})\n👤 Specialist: *${activeBooking.assignedPartnerName || 'Vignesh S'}*\n💰 Total: ₹${activeBooking.total || 3998} (Pay after service)`;
    }
    if (/time|slot|eppo|varuvaar|varuvaanga|arrival|when|neram/i.test(lower)) {
      return `Unga booking slot: *${activeBooking.preferredDate || 'Upcoming'}* at *${activeBooking.preferredTime || '10:00 AM - 12:00 PM'}*. Specialist *${activeBooking.assignedPartnerName || 'Vignesh S'}* on-time-la vandhuduvaanga sir!`;
    }
  }

  // General rate card
  if (/price|cost|rate|rates|charges|vilai/i.test(lower) && !activeBooking) {
    return `🧹 *VS Home Cleaning Services — Official Rates*\n\n` +
      `• *Bathroom Deep Clean:* ₹499 per bathroom\n` +
      `• *Kitchen Deep Clean:* ₹1,399\n` +
      `• *Sofa Shampooing:* ₹899 (3-seater) | ₹1,399 (5-seater)\n` +
      `• *Full Home Deep Clean:* ₹2,499 (1BHK) | ₹3,499 (2BHK)\n\n` +
      `✨ *Zero Advance* — 100% pay after inspection!\n` +
      `Book online: ${WEBSITE_URL}/booking.html`;
  }

  // Greetings
  if (/^(hi|hello|hey|vanakkam|வணக்கம்|start|help|saral)/i.test(lower)) {
    if (activeBooking) {
      return `Vanakkam ${session.name || 'sir'}! 🙏 Naan **Saaral**, VS Home Cleaning Operations Manager. Unga active booking (Ref: *${activeBooking.ref}* - ${activeBooking.serviceType}) sambandhama edhavadhu help venuma, illai pudhu service book pannanuma?`;
    }
    return `Vanakkam ${session.name || ''}! 🙏 Naan **Saaral**, VS Home Cleaning Helpline Executive.\n\nUngalukku eppadi help pannattum?\n1. Booking status / cleaner arrival check panna\n2. Complaints / delays escalate panna\n3. New cleaning services book panna\n\nSollunga sir! 😊`;
  }

  // 5. Open-ended conversational query -> Gemini (with 4s timeout)
  let bookingContext = "No active booking record found under this phone number yet.";
  if (activeBooking) {
    bookingContext = `ACTIVE BOOKING: Ref: ${activeBooking.ref}, Service: ${activeBooking.serviceType}, Specialist: ${activeBooking.assignedPartnerName}, Slot: ${activeBooking.preferredDate} (${activeBooking.preferredTime}), Total: Rs ${activeBooking.total}.`;
  }

  const systemPrompt = `You are Saaral, female Operations Manager at VS Home Cleaning Services, Chennai (+91 75581 91073).
Speak natural Chennai Tanglish (Tamil + English). Be warm, polite, and helpful (1-3 sentences). Zero advance policy.
${bookingContext}`;

  const geminiReply = await askGemini(text, systemPrompt, session.history);
  if (geminiReply) return geminiReply;

  // Ultimate safe fallback
  if (activeBooking) {
    return `Vanakkam! Unga booking Ref: *${activeBooking.ref}* (${activeBooking.serviceType}). Specialist *${activeBooking.assignedPartnerName}* assign aagiyirukkaanga. Slot: ${activeBooking.preferredDate} (${activeBooking.preferredTime}). Total: ₹${activeBooking.total}. Edhavadhu assistance venuma sir?`;
  }
  return `Vanakkam! VS Home Cleaning Services Helpline. Naan Saaral pesuren. Booking status check panna, pudhu service book panna sollunga, naan help panren! 😊`;

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
