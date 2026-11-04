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

async function findAvailablePartner(reqDate, reqTime, pincode) {
  let partners = {};
  try {
    const r = await fetch(`${FIREBASE_DB_URL}/bookingLookup/partners.json`);
    const d = await r.json();
    if (d && !d.error && typeof d === 'object') partners = d;
  } catch (e) {}

  if (Object.keys(partners).length === 0) {
    partners['partner-1'] = {
      uid: 'partner-1',
      name: 'Vignesh S',
      phone: '916383458190',
      accountStatus: 'active',
      coveredAreas: ['all']
    };
  }

  const activeList = Object.entries(partners).filter(([k, p]) => {
    if (!p) return false;
    const isActive = p.accountStatus === 'active' || !p.accountStatus;
    if (!isActive) return false;
    if (pincode && p.coveredAreas && !p.coveredAreas.includes('all')) {
      if (!p.coveredAreas.includes(pincode)) return false;
    }
    return true;
  });

  if (activeList.length === 0) {
    return { available: false, reason: 'no_active_partner' };
  }

  let recentBookings = {};
  try {
    const r = await fetch(`${FIREBASE_DB_URL}/bookingLookup/recent_bookings.json`);
    const d = await r.json();
    if (d && !d.error && typeof d === 'object') recentBookings = d;
  } catch (e) {}

  for (const [uid, p] of activeList) {
    let isBusy = false;
    for (const b of Object.values(recentBookings)) {
      if (!b || b.status === 'cancelled') continue;
      const isSamePartner = b.assignedTo === uid || String(b.assignedPartnerMobile || '').includes('6383458190');
      const isSameDate = String(b.preferredDate || '').trim().toLowerCase() === String(reqDate || '').trim().toLowerCase();
      const isSameTime = String(b.preferredTime || '').trim().toLowerCase() === String(reqTime || '').trim().toLowerCase();
      if (isSamePartner && isSameDate && isSameTime) {
        isBusy = true;
        break;
      }
    }
    if (!isBusy) {
      return {
        available: true,
        partner: {
          uid,
          name: p.name || 'Vignesh S',
          phone: p.phone || p.phoneNumber || '916383458190'
        }
      };
    }
  }

  return { available: false, reason: 'slot_fully_booked' };
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

  const reqDate = session.date || 'Tomorrow';
  const reqTime = session.time || '10:00 AM - 12:00 PM';
  const pincode = session.pincode || extractPincode(session.address || '');

  const partnerCheck = await findAvailablePartner(reqDate, reqTime, pincode);

  if (!partnerCheck.available) {
    const enquiryRecord = {
      ref,
      name: session.name || 'WhatsApp Customer',
      mobile,
      serviceType: serviceName,
      address: session.address ? `${session.address} (PIN: ${pincode || '600001'})` : 'Chennai',
      pincode: pincode || '600001',
      preferredDate: reqDate,
      preferredTime: reqTime,
      total,
      status: 'pending_manual_dispatch',
      reason: partnerCheck.reason,
      createdAt: Date.now()
    };

    await Promise.allSettled([
      fetch(`${FIREBASE_DB_URL}/bookingLookup/pending_enquiries/${ref}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enquiryRecord)
      }),
      fetch(`${FIREBASE_DB_URL}/bookingLookup/${ref}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enquiryRecord)
      })
    ]);

    if (notifier) {
      const urgentAlert = `🚨 *NO SPECIALIST AVAILABLE ALERT* 🚨\n\n` +
        `👤 *வாடிக்கையாளர்:* ${enquiryRecord.name} (+91 ${mobile})\n` +
        `📅 *கேட்ட நேரம்:* ${reqDate} (${reqTime})\n` +
        `📍 *பகுதி / Pincode:* ${enquiryRecord.address}\n` +
        `🛠️ *சேவை:* ${serviceName}\n` +
        `💰 *தொகை:* ₹${total}\n` +
        `📋 *Ref:* ${ref}\n\n` +
        `⚠️ *காரணம்:* அந்த நேரத்தில் அனைத்து ஸ்பெஷலிஸ்ட்டுகளும் பிஸியாக உள்ளார்கள் / கிடைக்கவில்லை.\n` +
        `தயவுசெய்து உடனடியாக வாடிக்கையாளரைத் தொடர்புகொண்டு மேனுவலாக நேரத்தை ஒதுக்கவும்! ⚡`;

      await Promise.allSettled([
        notifier('916383458190', urgentAlert),
        notifier(FOUNDER_PHONE, urgentAlert)
      ]);
    }

    session.stage = 'completed';
    session.cart = null;
    session.services = [];
    session.address = null;

    return {
      available: false,
      ref,
      date: reqDate,
      time: reqTime,
      total
    };
  }

  const partner = partnerCheck.partner;

  const bookingRecord = {
    ref,
    name: session.name || 'WhatsApp Customer',
    mobile,
    serviceType: serviceName,
    address: session.address ? `${session.address} (PIN: ${session.pincode || '600001'})` : 'Chennai',
    pincode: session.pincode || '600001',
    preferredDate: reqDate,
    preferredTime: reqTime,
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
    available: true,
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

  // ── SPECIAL WORKFLOW: PARTNER REPORTING UNREMOVABLE STAIN / ACID DAMAGE ──
  const isStainReport = /stain|acid|damage|enamel|burn|karai|pogala/i.test(lower);
  if (isStainReport && refInText) {
    const targetRef = refInText[0].toUpperCase();
    const targetBooking = await lookupBooking(targetRef);
    if (targetBooking) {
      await fetch(`${FIREBASE_DB_URL}/bookingLookup/${targetRef}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'inspection_stain_reported',
          stainReportedAt: Date.now(),
          stainNote: text
        })
      });

      const cMobile = String(targetBooking.customerMobile || targetBooking.mobile || '').replace(/\D/g, '').slice(-10);
      if (cMobile) {
        const cTarget = '91' + cMobile;
        const custStainMsg = `⚠️ *VS HOME CLEANING — INSPECTION REPORT* ⚠️\n\n` +
          `வணக்கம் *${targetBooking.customerName || 'Customer'}*! 🙏\n` +
          `உங்கள் இல்லத்திற்கு வந்துள்ள எங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட் *${targetBooking.assignedPartnerName || 'Vignesh S'}* கறைகளை ஆய்வு செய்தார்.\n\n` +
          `🔬 *ஆய்வு விவரம் (Inspection Findings):*\n` +
          `இது சாதாரண உப்புக்கறை இல்லைங்க. முன்பு பயன்படுத்திய ஸ்ட்ராங் ஆசிட் காரணமாக டைல்ஸின் மேல் இருக்கும் எனாமல் பளபளப்பு எரிந்துபோய் உள்ளது (*Acid Burn / Permanent Glaze Damage*). இதற்கு மேல் அதிக கெமிக்கல் போட்டு அழுத்தினால் டைல்ஸ் மேலும் சேதமடைய வாய்ப்புள்ளது.\n\n` +
          `எங்கள் நிறுவனம் 100% நேர்மை மட்டுமே பின்பற்றும்! உங்களுக்காக 2 வழிகள்:\n` +
          `1️⃣ *PROCEED:* எனாமல் பாதிப்பைத் தவிர்த்து, மற்ற அனைத்து உப்புக்கறை, பேசின், டேப், கம்மோட் அனைத்தையும் தரமாக டீப் கிளீன் செய்து தரலாம் (கட்டணம்: ₹${targetBooking.total || 499}).\n` +
          `2️⃣ *CANCEL:* இந்த கறை போகாவிட்டால் கிளீனிங் வேண்டாம் என்றால் — *100% Zero Cancellation Fee!* உங்களிடம் ₹1 கூட வாங்காமல் ஆர்டர் ரத்து செய்யப்படும்.\n\n` +
          `உங்கள் முடிவை:\n` +
          `👉 *PROCEED* (தொடர) அல்லது\n` +
          `👉 *CANCEL* (ரத்து செய்ய)\n` +
          `என்று இங்கு ரிப்ளை செய்யவும்!`;

        if (notifier) await notifier(cTarget, custStainMsg);
        const cSession = getSession(cMobile);
        cSession.stage = 'awaiting_stain_decision';
        cSession.stainRef = targetRef;
      }

      return `✅ *INSPECTION REPORT SENT TO CUSTOMER!* 📋\n\nRef: *${targetRef}*\nவாடிக்கையாளருக்கு விளக்கம் மற்றும் 2 Options (PROCEED / CANCEL) அனுப்பப்பட்டுள்ளது. வாடிக்கையாளர் ரிப்ளை செய்ததும் உங்களுக்கு உடனே WhatsApp-ல் தகவல் வரும்! தயவுசெய்து 2 நிமிடம் காத்திருக்கவும். 🙏`;
    }
  }

  // ── SPECIAL WORKFLOW: CUSTOMER RESPONDING TO STAIN REPORT (PROCEED or CANCEL) ──
  const isAwaitingStain = session.stage === 'awaiting_stain_decision' || activeBooking?.status === 'inspection_stain_reported';
  if (isAwaitingStain) {
    const sRef = session.stainRef || activeBooking?.ref;
    const pPhone = activeBooking?.assignedPartnerMobile || FOUNDER_PHONE;
    const pClean = pPhone.replace(/\D/g, '');
    const pTarget = pClean.length === 10 ? '91' + pClean : pClean;

    // Customer says PROCEED
    if (/proceed|option 1|clean|continue|sari|pannunga|paravala|safe/i.test(lower)) {
      session.stage = 'idle';
      session.stainRef = null;

      await fetch(`${FIREBASE_DB_URL}/bookingLookup/${sRef}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', customerStainDecision: 'PROCEED' })
      });

      if (notifier) {
        const pAlert = `🔔 *CUSTOMER APPROVED SAFE DEEP CLEAN!* 🔔\n\n` +
          `Ref: *${sRef}*\n` +
          `வாடிக்கையாளர் எனாமல் சேதத்தைத் தவிர்த்து, மற்ற இடங்களை டீப் கிளீன் செய்ய ஒப்புக்கொண்டார்! வேலையைத் தொடரலாம். 🧹⚡`;
        await notifier(pTarget, pAlert);
      }

      return `✅ *மிக்க நன்றி ${session.name || 'sir'}!* 🙏\n\nஎங்கள் ஸ்பெஷலிஸ்ட் எனாமல் சேதத்தைத் தவிர்த்து, உங்கள் பாத்ரூமின் மற்ற அனைத்து உப்புக்கறை, பேசின், டேப், கம்மோட் பகுதிகளை பளபளப்பாக டீப் கிளீன் செய்து தருவார்! கிளீனிங் முடிந்த பின் சரிபார்த்து கட்டணம் செலுத்தலாம். 🧹✨`;
    }

    // Customer says CANCEL
    if (/cancel|vendaam|option 2|close|cancel pannidunga|venda|zero fee|close order/i.test(lower)) {
      session.stage = 'idle';
      session.stainRef = null;

      await fetch(`${FIREBASE_DB_URL}/bookingLookup/${sRef}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled_enamel_damage', customerStainDecision: 'CANCEL' })
      });

      if (notifier) {
        const pAlert = `🛑 *JOB CANCELLED (Mutual Agreement)* 🛑\n\n` +
          `Ref: *${sRef}*\n` +
          `வாடிக்கையாளர் ₹0 கட்டணத்தில் ஆர்டரை ரத்து செய்ய ஒப்புக்கொண்டார் (Acid Burn Enamel Damage).\n` +
          `பொருட்களை எடுத்துக்கொண்டு பாதுகாப்பாக கிளம்பவும்! 👍`;
        const founderAlert = `📋 *JOB CLOSED (Acid Damage Verified)* 🚨\n\nRef: ${sRef}\nCustomer: ${activeBooking?.customerName || p10}\nClosed with ₹0 charges on mutual customer agreement.`;

        await Promise.allSettled([
          notifier(pTarget, pAlert),
          notifier(FOUNDER_PHONE, founderAlert)
        ]);
      }

      return `✅ *உங்கள் புக்கிங் (Ref: ${sRef}) ₹0 கட்டணத்தில் வெற்றிகரமாக ரத்து செய்யப்பட்டது!* 🙏\n\nமுன்பணம் எதுவும் இல்லை, கேன்சலேஷன் கட்டணமும் இல்லை. 100% நேர்மை மட்டுமே VS Home Cleaning-ன் பலம்! எதிர்காலத்தில் எங்கள் சேவை தேவைப்பட்டால் எப்போது வேண்டுமானாலும் அழைக்கலாம். Have a wonderful day! 🌸✨`;
    }
  }

  // 2. Detect delay / complaint / emergency and alert Partner + Founder
  const isEmergency = [
    'not arrived', 'didnt come', "didn't come", 'did not come', 'delay', 'delayed', 'where is', 'call me',
    'varala', 'varalaye', 'innum varala', 'eppo varuvaar', 'cleaner varala', 'partner varala', 'late aaguthu',
    'complaint', 'problem', 'bad service', 'cheat', 'urgent', 'emergency', 'help me', 'cleaner enga'
  ].some(k => lower.includes(k)) || (/\blate\b/i.test(lower) && !/later/i.test(lower));

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

      if (booked && booked.available === false) {
        return `வணக்கம் ${session.name || 'sir'}! 🙏 நீங்கள் கேட்ட நேரத்தில் (${booked.date} ${booked.time}) உங்கள் பகுதியில் உள்ள எங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட்டுகள் அனைவரும் தற்போது முன்பதிவு செய்யப்பட்டுள்ளார்கள் (No Specialist Available).\n\nஉங்கள் என்கொயரி வெற்றிகரமாக பதிவு செய்யப்பட்டுள்ளது (Ref: *${booked.ref}*).\nஎங்கள் சீனியர் ஆபரேஷன்ஸ் மேலாளர் அடுத்த 15 நிமிடங்களில் உங்களை நேரடியாக அழைத்து, உங்களுக்கான மாற்று நேரத்தை உடனடியாக ஏற்பாடு செய்வார்! நன்றி. 🧹✨`;
      }

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

  // Polite acknowledgments / closers ("Okey", "Okey done", "Thanks", "Super", "Sari", "Pathutu solra")
  const isCloser = /^(ok|okey|okay|ok done|okey done|okay done|done|all done|sari|seri|super|thanks|thank you|thx|nandri|great|perfect|sure|bye|good night|tq)($|\b|[.!]|\s)/i.test(lower.trim()) ||
    /^(ok|okey|okay|thanks|thank you|nandri|sari|super)\s*(pa|bro|sir|mam|saral|ji)?[.!]?$/i.test(lower) ||
    /pathutu solra|paathutu solren|apram solren|aprom solran|later|afterwards|call you later|will let you know|check pannitu solren/i.test(lower);

  if (isCloser) {
    if (activeBooking) {
      return `Nandri ${session.name || 'sir'}! 🙏 Unga specialist **${activeBooking.assignedPartnerName || 'Vignesh S'}** on-time-la vandhu super-ah clean panni tharuvaanga. Edhavadhu thevaippatta eppo vena inga message pannalaam or call 07971851000. Have a great day! 🌸✨`;
    }
    return `Kandippa ${session.name || 'sir'}! 🙏 Ungalukku eppo cleaning services thevaipattalum ingaye WhatsApp-la sollunga. Naanga Chennai full-ah quick slots arrange pannuvom. Have a wonderful day! 🌸✨\n\n(24/7 Voice Helpline: 07971851000)`;
  }

  // ── NUMERIC SHORTCUTS (1, 2, 3) & MENU OPTIONS ──
  // Option 1: New Booking
  if (/^(1|option 1|one)\s*$/i.test(lower.trim())) {
    return `🧹 *VS Home Cleaning Services — Quick Booking*\n\n` +
      `Ungalukku entha service thevai?\n` +
      `1️⃣ *Bathroom Deep Cleaning:* ₹499 per bathroom\n` +
      `2️⃣ *Kitchen Deep Cleaning:* ₹1,399 (Full Kitchen)\n` +
      `3️⃣ *Sofa Shampooing:* ₹899 (3-Seater) / ₹1,399 (5-Seater)\n` +
      `4️⃣ *Full Home Deep Cleaning:* ₹2,499 (1 BHK) / ₹3,499 (2 BHK)\n\n` +
      `👉 *Direct Online Booking:* ${WEBSITE_URL}/booking.html\n` +
      `Or unga Service Name, Area (e.g. Velachery) & Preferred Slot inga reply pannunga, naan slot book panniduren! 😊 (Zero Advance)`;
  }

  // Option 2: Rate Card
  if (/^(2|option 2|two)\s*$/i.test(lower.trim())) {
    return `💰 *VS Home Cleaning Services — Official Rates*\n\n` +
      `• *Bathroom Deep Clean:* ₹499 per bathroom\n` +
      `• *Kitchen Deep Clean:* ₹1,399 (Complete Kitchen)\n` +
      `• *Sofa Shampooing:* ₹899 (3-Seater) / ₹1,399 (5-Seater)\n` +
      `• *Full Home Deep Clean:* ₹2,499 (1 BHK) / ₹3,499 (2 BHK) / ₹4,499 (3 BHK)\n` +
      `• *Water Tank / Sump:* ₹699\n\n` +
      `💯 *100% Zero Advance:* Pay only after service inspection!\n` +
      `👉 *Direct Booking:* ${WEBSITE_URL}/booking.html ✨`;
  }

  // Option 3: Active Booking Status & Tracker
  if (/^(3|option 3|three)\s*$/i.test(lower.trim()) || (/status|track|nilavaram|booking status|en booking|cleaner enga/i.test(lower) && !/sofa|bhk|bed|couch|bath|kitchen/i.test(lower))) {
    if (activeBooking) {
      return `🔍 *Unga Active Booking Status (Ref: ${activeBooking.ref})* 📋\n\n` +
        `• *Service:* ${activeBooking.serviceType || 'Home Cleaning'}\n` +
        `• *Slot:* ${activeBooking.time || activeBooking.scheduledSlot || 'Tomorrow 10:00 AM'}\n` +
        `• *Specialist:* ${activeBooking.assignedPartnerName || 'Vignesh S'} (${activeBooking.assignedPartnerMobile || '916383458190'})\n` +
        `• *Total:* ₹${activeBooking.total || 499} (முன்பணம் ஏதுமில்லை — வேலை முடிந்த பின் செலுத்தலாம்)\n` +
        `• *Status:* ${activeBooking.status || 'Team Assigned'}\n\n` +
        `Specialist குறித்த நேரத்தில் உங்கள் இல்லத்திற்கு வந்துவிடுவார்! உதவிக்கு: 07971851000 🧹✨`;
    }
    return `🔍 Unga number (+91 ${p10})-la ippo active booking ethuvum kaattala sir.\n\nNeenga vera number-la book panniruntha, unga *Booking Reference Number* (e.g. VS-XXXXXX) anupunga, naan live status paarthu solren! 📋\n\nNew Booking panna: ${WEBSITE_URL}/booking.html ✨`;
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

  // Active Booking Inquiries (Priority for Customers with Active Jobs)
  if (activeBooking) {
    if (/^(hi|hello|hey|vanakkam|வணக்கம்|start|saral)/i.test(lower)) {
      return `Vanakkam ${session.name || 'sir'}! 🙏 Naan **Saaral**, VS Home Cleaning Operations Manager. Unga active booking (Ref: *${activeBooking.ref}* - ${activeBooking.serviceType}) paathen. Specialist *${activeBooking.assignedPartnerName || 'Vignesh S'}* assign aagiyirukkaanga. Edhavadhu details venuma sir?`;
    }

    if (/specialist|cleaner|partner|who is|yaaru|yaar/i.test(lower)) {
      return `Unga cleaning specialist: *${activeBooking.assignedPartnerName || 'Vignesh S'}* (Contact: ${activeBooking.assignedPartnerMobile || '916383458190'}). Specialist arrival-ku munnaadi ungalukku call pannuvaanga sir! 🤝`;
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

    if (/cancel/i.test(lower)) {
      return `Unga booking (Ref: *${activeBooking.ref}*) cancel panna virumbureengala sir? Zero cancellation charges! Cancel confirm panna 'CONFIRM CANCEL' nu anupunga, illai helpline 07971851000-ku call pannalaam.`;
    }
  }

  // Contact / Call / Phone Intent
  if (/call|phone|number|helpline|pesanum|support|contact|contact number/i.test(lower)) {
    return `📞 *VS Home Cleaning Services 24/7 Support:*\n\n` +
      `• *Voice Helpline:* 07971851000 (24/7 AI & Operations Manager Saaral)\n` +
      `• *WhatsApp Helpline:* +91 75581 91073\n` +
      `• *Website:* ${WEBSITE_URL}\n\n` +
      `எந்த உதவி தேவைப்பட்டாலும் தயங்காமல் அழைக்கவும் sir! 😊`;
  }

  // Payment / Advance Policy Intent
  if (/advance|payment|pay|cash|upi|gpay|card|kattanam/i.test(lower)) {
    return `💰 *VS Home Cleaning Payment Policy — 100% Zero Advance!*\n\n` +
      `• *முன்பணம் ஏதுமில்லை!* கிளீனிங் முடிந்த பிறகு, நீங்கள் முழுமையாக சரிபார்த்து திருப்தி அடைந்த பின் மட்டுமே பணம் செலுத்த வேண்டும்.\n` +
      `• *Payment Methods:* Cash on Service or Online UPI (GPay / PhonePe / Paytm / QR Scanner).\n\n` +
      `Direct Online Booking: ${WEBSITE_URL}/booking.html ✨`;
  }

  // Materials & Equipment Intent
  if (/material|chemical|machine|equipment|tools|porul/i.test(lower)) {
    return `🧰 *VS Home Cleaning Materials & Equipment:*\n\n` +
      `• எங்கள் கிளீனிங் ஸ்பெஷலிஸ்ட்டுகள் அனைத்து தரமான Acid-Free ஜெர்மன் பார்முலா கிளீனிங் கெமிக்கல்கள், High-Power Vacuum Extraction Machine, Single Disc Scrubber மற்றும் மைக்ரோஃபைபர் துணிகளை அவர்களே எடுத்து வருவார்கள்!\n` +
      `• நீங்கள் தண்ணீர் மற்றும் மின்சாரம் (Power supply) மட்டும் கொடுத்தால் போதும் sir! 😊\n\n` +
      `Book directly here or call 07971851000! ✨`;
  }

  // Duration / Time Intent
  if (/how much time|evlo neram|duration|how long/i.test(lower)) {
    return `⏱️ *Service Duration (தோராயமான நேரம்):*\n\n` +
      `• *Bathroom Deep Clean:* 1.5 முதல் 2 மணி நேரம்\n` +
      `• *Kitchen Deep Clean:* 3 முதல் 4 மணி நேரம்\n` +
      `• *Sofa Shampooing:* 1 முதல் 1.5 மணி நேரம்\n` +
      `• *Full Home Deep Clean:* 5 முதல் 7 மணி நேரம்\n\n` +
      `எங்கள் ஸ்பெஷலிஸ்ட் ஒவ்வொரு இடத்தையும் நுணுக்கமாக கிளீன் செய்து தருவார்! ✨`;
  }

  // General Cancellation Request without Active Booking
  if (/cancel|vendaam|close order|venda/i.test(lower)) {
    return `✅ *VS Home Cleaning Cancellation Policy — 100% Zero Fee!*\n\n` +
      `எங்கள் சேவையில் எந்தவிதமான முன்பணமும் இல்லை, கேன்சலேஷன் கட்டணமும் இல்லை (100% Zero Cancellation Fee). நீங்கள் எப்போது வேண்டுமானாலும் ரத்து செய்யலாம் அல்லது நேரத்தை மாற்றிக்கொள்ளலாம்!\n\n` +
      `உதவிக்கு எங்கள் 24/7 ஹெல்ப்லைனை அழைக்கலாம்: 07971851000. Have a great day! 🌸✨`;
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
  saveBookingToFirebase,
  getSession
};
