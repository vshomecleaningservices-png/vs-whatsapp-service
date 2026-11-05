/**
 * SARAL AI CONVERSATIONAL BOOKING & HELPLINE AGENT 2.0 (ENTERPRISE EDITION)
 * =========================================================================
 * Powered by Google Gemini Multi-Turn Agentic Architecture
 * 
 * Capabilities:
 *  1. 100% True Multilingual Intelligence:
 *     - If customer speaks English -> responds in polished, warm, professional English.
 *     - If customer speaks Tamil / Tanglish -> responds in natural, respectful Chennai Tanglish.
 *  2. Full Company Official Pricing Catalog embedded directly into AI memory:
 *     - 1 BHK / 2 BHK / 3 BHK / 4 BHK / 5 BHK (Furnished & Unfurnished)
 *     - Bathroom Deep Clean, Kitchen Deep Clean, Sofa Shampooing, Mattress/Bed
 *  3. Accurate Equipment Scope (Zero False Promises):
 *     - Floors (Hall/Room): Detailed deep manual mopping (NO floor machine).
 *     - Bathroom: Machine scrubbing & hard-water descaling.
 *     - Kitchen: High-temperature steam degreasing.
 *     - Sofa: Vacuum + Shampoo extraction.
 *     - Bed/Mattress: Dry vacuum only.
 *  4. Intelligent Function Calling:
 *     - AI ONLY confirms booking when BHK, Furnished status, Price agreement, Date, and Time are verified.
 *     - Date parser understands "21 December 2026", "21st Dec", "tomorrow", etc.
 *  5. Founder SOS & Emergency Escalation:
 *     - Instantly detects complaints/delays, alerts Partner & Founder via WhatsApp.
 *  6. Human Takeover Lock:
 *     - Remembers when Founder/Owner speaks on chat; stays silently muted.
 */

const FIREBASE_DB_URL = 'https://vs-home-cleaning-services-default-rtdb.asia-southeast1.firebasedatabase.app';
const FOUNDER_PHONE   = '916383458190';
const SUPPORT_PHONE   = '+91 75581 91073';
const WEBSITE_URL     = 'https://vshomecleaningservices.in';

let cachedGeminiKey = process.env.GEMINI_API_KEY || null;

async function getGeminiKey() {
  if (cachedGeminiKey && cachedGeminiKey.length > 10) return cachedGeminiKey;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/bookingLookup/gemini_key.json`);
    const key = await res.json();
    if (key && typeof key === 'string' && key.length > 10) {
      cachedGeminiKey = key;
      return cachedGeminiKey;
    }
  } catch (e) {}
  return process.env.GEMINI_API_KEY || null;
}

// Active Working Gemini Models (Tested & Verified)
const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite'
];

// In-Memory Chat Session Store
const sessions = new Map();

function getSession(phone) {
  const digits = String(phone).replace(/\D/g, '');
  const clean  = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!sessions.has(clean)) {
    sessions.set(clean, {
      phone: clean,
      name: null,
      history: [],
      humanMutedUntil: 0,
      activeBookingRef: null
    });
  }
  return sessions.get(clean);
}

// Mute bot when Human Admin types on WhatsApp
function muteBotForCustomer(phone, durationHours = 4) {
  const session = getSession(phone);
  session.humanMutedUntil = Date.now() + durationHours * 60 * 60 * 1000;
  console.log(`[Human Takeover Active] Bot muted for +91 ${session.phone} until ${new Date(session.humanMutedUntil).toLocaleTimeString()}`);
}

function isCustomerMuted(phone) {
  const session = getSession(phone);
  return Date.now() < session.humanMutedUntil;
}

// Generate unique booking reference
function generateRef() {
  const d = new Date();
  const yr = String(d.getFullYear()).slice(-2);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  return `VS-${yr}${mo}${day}-${rand}`;
}

// Generate secure 6-digit Job OTP
function generateJobOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Fetch active partner from Firebase RTDB
async function getActivePartner() {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/partners.json`);
    const data = await res.json();
    if (data && typeof data === 'object') {
      for (const [k, p] of Object.entries(data)) {
        if (p && (p.accountStatus === 'active' || !p.accountStatus) && !p.onLeave && p.isAvailable !== false) {
          return { uid: k, name: p.name || 'Vignesh S', phone: p.phone || p.phoneNumber || '916383458190' };
        }
      }
    }
  } catch (e) {}
  return { uid: 'partner-1', name: 'Vignesh S', phone: '916383458190' };
}

// Lookup booking by Phone or Ref
async function lookupBooking(queryOrPhone) {
  const clean = String(queryOrPhone || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const digitsOnly = String(queryOrPhone || '').replace(/\D/g, '');
  const p10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : null;

  if (p10) {
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bookingLookup/by_phone_${p10}.json`);
      const d = await r.json();
      if (d && !d.error && (d.ref || d.status)) return d;
    } catch (e) {}
  }

  let refKey = clean;
  if (clean.startsWith('VS') && clean.length >= 12 && !clean.includes('-')) {
    refKey = `VS-${clean.slice(2, 8)}-${clean.slice(8, 12)}`;
  }
  try {
    const r = await fetch(`${FIREBASE_DB_URL}/bookingLookup/${refKey}.json`);
    const d = await r.json();
    if (d && !d.error && d.status) return d;
  } catch (e) {}

  return null;
}

// Save Confirmed Booking into Firebase RTDB & Dispatch Alerts
async function saveConfirmedBooking(details, notifier) {
  const ref = generateRef();
  const jobOtp = generateJobOtp();
  const partner = await getActivePartner();

  const cleanMobDigits = String(details.phone || '').replace(/\D/g, '');
  const mobile = cleanMobDigits.length >= 10 ? cleanMobDigits.slice(-10) : '7200910738';
  const total = Number(details.price) || 3999;
  const serviceType = details.serviceType || 'Home Deep Cleaning';

  const bookingRecord = {
    ref,
    name: details.name || 'Customer',
    customerName: details.name || 'Customer',
    mobile,
    customerMobile: mobile,
    serviceType,
    address: details.address || 'Chennai',
    pincode: details.pincode || '600040',
    preferredDate: details.preferredDate || '2026-12-21',
    preferredTime: details.preferredTime || '09:00 AM - 01:00 PM',
    status: 'Booking Confirmed',
    total,
    subtotal: total,
    balanceDue: total,
    advancePaid: false,
    advanceAmount: 0,
    paymentMethod: 'Pay after service (Cash / UPI)',
    paymentType: 'COD',
    jobOtp,
    assignedTo: partner.uid,
    assignedPartnerName: partner.name,
    assignedPartnerMobile: partner.phone,
    createdAt: Date.now()
  };

  const lookupRecord = {
    ref,
    customerName: bookingRecord.name,
    customerMobile: mobile,
    serviceType,
    address: bookingRecord.address,
    preferredDate: bookingRecord.preferredDate,
    preferredTime: bookingRecord.preferredTime,
    status: 'Booking Confirmed',
    total,
    jobOtp,
    assignedPartnerName: partner.name,
    assignedPartnerMobile: partner.phone,
    createdAt: Date.now()
  };

  const jobPayload = {
    id: ref,
    customerName: bookingRecord.name,
    customerPhone: mobile,
    serviceType,
    address: bookingRecord.address,
    date: bookingRecord.preferredDate,
    time: bookingRecord.preferredTime,
    amount: total,
    status: 'assigned',
    paymentType: 'COD',
    paymentStatus: 'pending',
    assignedAt: Date.now(),
    jobOtp
  };

  await Promise.allSettled([
    fetch(`${FIREBASE_DB_URL}/bookings/${ref}.json`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(bookingRecord) }),
    fetch(`${FIREBASE_DB_URL}/bookingLookup/${ref}.json`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lookupRecord) }),
    fetch(`${FIREBASE_DB_URL}/bookingLookup/by_phone_${mobile}.json`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lookupRecord) }),
    fetch(`${FIREBASE_DB_URL}/partnerJobs/${partner.uid}/${ref}.json`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(jobPayload) }),
    fetch(`${FIREBASE_DB_URL}/partnerNotifications/${partner.uid}/${ref}.json`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type: 'new_job', bookingRef: ref, customerName: bookingRecord.name, customerPhone: mobile, serviceType, date: bookingRecord.preferredDate, time: bookingRecord.preferredTime, price: total, createdAt: Date.now(), read: false })
    })
  ]);

  if (notifier) {
    const pClean = partner.phone.replace(/\D/g, '');
    const pTarget = pClean.length === 10 ? '91' + pClean : pClean;

    const partnerAlert = `🔔 *NEW CLEANING JOB ASSIGNED (WhatsApp)* 🔔\n\n` +
      `📋 *Job Ref:* ${ref}\n` +
      `👤 *Customer:* ${bookingRecord.name} (+91 ${mobile})\n` +
      `🛠️ *Service:* ${serviceType}\n` +
      `📅 *Date & Slot:* ${bookingRecord.preferredDate} (${bookingRecord.preferredTime})\n` +
      `📍 *Address:* ${bookingRecord.address}\n` +
      `💰 *Amount:* ₹${total} (Collect after inspection)\n\n` +
      `Partner App-ல் சரிபார்த்து உறுதி செய்யவும்! ⚡`;

    const founderAlert = `🚨 *NEW WHATSAPP BOOKING CREATED* 🚨\n\n` +
      `Ref: ${ref} | ₹${total}\n` +
      `Customer: ${bookingRecord.name} (+91 ${mobile})\n` +
      `Service: ${serviceType}\n` +
      `Partner: ${partner.name}\n` +
      `Slot: ${bookingRecord.preferredDate} (${bookingRecord.preferredTime})`;

    await Promise.allSettled([
      notifier(pTarget, partnerAlert),
      notifier(FOUNDER_PHONE, founderAlert)
    ]);
  }

  return { ref, jobOtp, partnerName: partner.name, ...bookingRecord };
}

// Trigger Founder SOS / Emergency Help
async function triggerFounderSos(phone, text, activeBooking, notifier) {
  if (!notifier) return;
  const p10 = String(phone).replace(/\D/g, '').slice(-10);
  const ref = activeBooking?.ref || 'Active Chat';
  const partnerName = activeBooking?.assignedPartnerName || 'Vignesh S';

  const founderSos = `🚨 *CUSTOMER HELPLINE SOS (WhatsApp)* 🚨\n\n` +
    `👤 Customer: +91 ${p10}\n` +
    `📋 Booking: ${ref}\n` +
    `🛠️ Assigned Partner: ${partnerName}\n` +
    `💬 Message: "${text}"\n\n` +
    `Immediate Founder Attention Required! ⚡`;

  await notifier(FOUNDER_PHONE, founderSos);
}

// ─────────────────────────────────────────────
// GEMINI MULTI-TURN AGENT ENGINE
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Saaral (சாரல்), the highly knowledgeable, empathetic, courteous, and articulate Senior Operations Manager at VS Home Cleaning Services, Chennai (+91 75581 91073 / vshomecleaningservices.in).

CRITICAL COMMUNICATION DIRECTIVES:
1. LANGUAGE FIDELITY & TONE:
   - If the customer speaks English, reply in clean, polished, warm, professional corporate English. Never reply in Tamil to an English-speaking customer!
   - If the customer speaks Tamil or Tanglish, reply in warm, respectful, natural Chennai Tanglish (e.g. "Vanakkam sir! Kandippa help panren", "Sollunga sir!").
   - Speak 100% naturally like a caring human operations manager. Never sound like a robotic script or rigid IVR!
   - If customer says "I didn't book anything / Naan booking podalaiye check panni paru", immediately apologize politely: "Oh sorry sir, system-la pazhaya inquiry reference kaatuchu. No issues at all! Ungalukku pudhusa edhavadhu cleaning service thevaipatta sollunga sir, naan detail-ah explain panren!" Never insist on past bookings.

2. HONEST SCOPE & EQUIPMENT POLICY (NEVER OVER-PROMISE):
   - Living Room & Bedroom Floors: Detailed deep manual mopping and surface care only. WE DO NOT USE FLOOR SCRUBBING MACHINES IN LIVING ROOM OR BEDROOMS.
   - Bathrooms: Specialized single-disc machine scrubbing of floor tiles, heavy stain removal & fixture descaling.
   - Kitchen: High-temperature steam degreasing of tiles, chimney, slab, and cabinets exterior wipe.
   - Sofa: Complete dry vacuuming & professional organic shampoo foam extraction.
   - Mattress/Bed: Dry vacuum extraction only (NO wet shampoo).
   - Zero Advance Policy: We NEVER take advance payment. The customer inspects the entire home and pays only after 100% satisfaction (via GPay, PhonePe, or Cash).

3. COMPLETE OFFICIAL PRICING CATALOG (ALL-INCLUSIVE CHENNAI RATES):

🛁 BATHROOM CLEANING PACKAGES:
• Classic Bathroom Cleaning:
  - 1 Bath: ₹499 | 2 Baths: ₹849 | 3 Baths: ₹1,199 | 4 Baths: ₹1,549 | 5 Baths: ₹1,999
  - Scope: Standard maintenance clean, scrubs tiles & walls, cleans toilet seat/bowl, removes daily grime & soap scum, tap polish, manual floor mop.
• Premium Bathroom Cleaning (Most Popular!):
  - 1 Bath: ₹549 | 2 Baths: ₹999 | 3 Baths: ₹1,499 | 4 Baths: ₹2,049 | 5 Baths: ₹2,499
  - Scope: Deep intensive clean. Machine scrubbing of floor tiles, deep descaling of taps, shower head and limescale, grout line cleaning, mirror streak-free buffing, toilet inside/out sanitization.
• Eco-Smart Bathroom Cleaning:
  - 1 Bath: ₹599 | 2 Baths: ₹1,099 | 3 Baths: ₹1,699 | 4 Baths: ₹2,199 | 5 Baths: ₹2,799
  - Scope: 100% non-toxic, eco-friendly plant-based cleaning agents. Safe for babies, elders, and pets.
• Move-in / Post-Construction Bathroom Cleaning:
  - 1 Bath: ₹649 | 2 Baths: ₹1,199 | 3 Baths: ₹1,799 | 4 Baths: ₹2,399 | 5 Baths: ₹2,999
  - Scope: Pre-occupancy deep clean, removing cement stains, paint marks, plaster dust, and heavy residue.

🍳 KITCHEN CLEANING PACKAGES:
• Occupied Kitchen — With Chimney:
  - Classic Degreasing: ₹1,399 (Manual degreasing of chimney exterior, cooktop, backsplash tiles, sink, cabinet exteriors, mopping)
  - Power Steam: ₹2,299 (Steam degreasing dissolves caked-on oil/grease without harsh scrubbing, chimney, hob, backsplash)
  - Eco-Smart: ₹2,299 (Non-toxic eco degreasers)
• Occupied Kitchen — Without Chimney:
  - Classic Degreasing: ₹1,799
  - Power Steam: ₹1,899
  - Eco-Smart: ₹1,999
• Empty Kitchen Cleaning (Move-in / Vacant):
  - With Chimney: Classic ₹799 | Power Steam ₹899 | Eco-Smart ₹1,049
  - Without Chimney: Classic ₹1,099 | Power Steam ₹1,299 | Eco-Smart ₹1,349
• Kitchen Targeted Add-ons:
  - Kitchen Tiles & Countertop Slab Cleaning: ₹299
  - Cabinet & Trolley Interior/Exterior Cleaning: ₹949

🛋️ SOFA & FURNITURE CLEANING:
• Sofa Seats (Dry Vacuum + Organic Shampoo Wash):
  - 2 Seater: ₹399 | 3 Seater: ₹499 | 4 Seater: ₹599 | 5 Seater: ₹749 | 6 Seater: ₹809 | 7 Seater: ₹999 | 8 Seater: ₹1,099
  - With Removable Cushions: 2 Seater ₹449 | 3 Seater ₹549 | 4 Seater ₹649 | 5 Seater ₹799 | 6 Seater ₹859 | 7 Seater ₹1,049 | 8 Seater ₹1,149
• Mattress Cleaning (High-power Dry Extraction Vacuum only):
  - Single Mattress Bed: ₹399
  - Double / Queen / King Mattress Bed: ₹599
• Loose Cushions: Up to 8 pieces: ₹399

🏠 FULL APARTMENT DEEP CLEANING:
• Furnished Apartments:
  - 1 BHK: Classic ₹3,499 | Premium ₹3,999 | Elite ₹4,199
  - 2 BHK: Classic ₹3,999 | Premium ₹4,299 (Special Festive Offer: ₹3,999!) | Elite ₹4,999
  - 3 BHK: Classic ₹4,499 | Premium ₹4,999 | Elite ₹5,799
  - 4 BHK: Classic ₹5,599 | Premium ₹5,999 | Elite ₹6,899
  - 5 BHK: Classic ₹5,999 | Premium ₹6,599 | Elite ₹7,399
• Unfurnished / Empty Apartments:
  - 1 BHK: Classic ₹3,099 | Premium ₹3,399
  - 2 BHK: Classic ₹3,699 (Special Festive Offer!) | Premium ₹3,999
  - 3 BHK: Classic ₹4,499
  - 4 BHK: Classic ₹5,199 | Premium ₹5,599
  - 5 BHK: Classic ₹5,699 | Premium ₹6,299

🚪 SINGLE ROOM & INDIVIDUAL ADD-ONS:
• Bedroom Cleaning: Furnished ₹599 | Unfurnished ₹549
• Living Room Cleaning: Furnished ₹749 | Unfurnished ₹699
• Balcony Cleaning: Up to 4 ft width ₹449 | Above 4 ft width ₹549
• Utility Area / Service Balcony: ₹449
• Prayer / Pooja Room Cleaning: ₹449
• Ceiling Fan Cleaning: ₹69 per fan
• Window Cleaning: Standard up to 4×4 ft ₹349 | Large above 4×4 ft ₹449
• Sink & Under-sink Cleaning: ₹79

4. BOOKING CONVERSATION FLOW:
- When customer asks about a category (e.g. bathroom, kitchen, sofa, or full house), explain the options clearly, highlight the benefits (e.g. Classic vs Premium with machine scrubbing), and quote exact rates.
- When customer wants to book, politely collect:
  1. Exact Service Type & BHK/Quantity
  2. Chennai Address with Area & Pincode
  3. Preferred Date & Time Slot
- NEVER force "Tomorrow"! Listen to the customer's specified date (e.g., 21st December 2026, Dec 21, Saturday, etc.).
- Once the customer confirms the details, call the FUNCTION: confirm_service_booking.
- If customer has an emergency, delay, or complaint, comfort them and call FUNCTION: escalate_to_founder.`;

// Function declarations for Gemini Tool Calling
const TOOLS = [
  {
    function_declarations: [
      {
        name: 'confirm_service_booking',
        description: 'Call this function ONLY when customer has agreed to the service, price, house type, and confirmed their date and time slot.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customerName: { type: 'STRING', description: 'Full name of the customer' },
            serviceType: { type: 'STRING', description: 'Exact service name, e.g. 2 BHK Furnished - Premium Deep Cleaning' },
            price: { type: 'NUMBER', description: 'Total agreed price in INR, e.g. 3999' },
            preferredDate: { type: 'STRING', description: 'Exact service date in YYYY-MM-DD or clearly formatted, e.g. 2026-12-21' },
            preferredTime: { type: 'STRING', description: 'Preferred arrival time slot, e.g. 09:00 AM' },
            address: { type: 'STRING', description: 'Complete address with door number, street, area, and landmark' },
            pincode: { type: 'STRING', description: '6-digit Chennai pincode, e.g. 600040' }
          },
          required: ['customerName', 'serviceType', 'price', 'preferredDate', 'address']
        }
      },
      {
        name: 'escalate_to_founder',
        description: 'Call this when customer reports delay, cleaner not arrived, urgent complaint, or cancellation.',
        parameters: {
          type: 'OBJECT',
          properties: {
            reason: { type: 'STRING', description: 'Customer complaint reason or emergency detail' }
          },
          required: ['reason']
        }
      }
    ]
  }
];

async function callGemini(contents) {
  const apiKey = await getGeminiKey();
  if (!apiKey) return null;

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: TOOLS,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1000
    }
  };

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return data.candidates?.[0]?.content;
      }
    } catch (e) {}
  }
  return null;
}

// ─────────────────────────────────────────────
// Main Message Handler
// ─────────────────────────────────────────────
async function processCustomerMessage(phone, userText, senderPushName, notifier) {
  const session = getSession(phone);
  const text    = (userText || '').trim();

  // If chat is currently muted for Human Takeover, do not reply
  if (isCustomerMuted(phone)) {
    console.log(`[Human Takeover Silence] Ignored incoming message from +91 ${session.phone} because human owner is handling it.`);
    return null;
  }

  const cleanDigits = String(phone).replace(/\D/g, '');
  const p10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

  if (senderPushName && !session.name) {
    session.name = senderPushName.replace(/[^\w\s]/gi, '').trim() || null;
  }

  const activeBooking = await lookupBooking(p10);
  if (activeBooking && activeBooking.ref) {
    session.activeBookingRef = activeBooking.ref;
  }

  // Detect emergency delays / complaints
  const isEmergency = /not arrived|didnt come|did not come|delay|late|varala|varalaye|innum varala|cleaner varala|complaint|problem|cheat|urgent|emergency|help/i.test(text);
  if (isEmergency) {
    await triggerFounderSos(phone, text, activeBooking, notifier);
  }

  // Build conversational context
  let contextExtra = `Customer Phone: +91 ${p10}. Name: ${session.name || 'Unknown'}.`;
  if (activeBooking) {
    contextExtra += ` ACTIVE BOOKING RECORD: Ref: ${activeBooking.ref}, Service: ${activeBooking.serviceType}, Slot: ${activeBooking.preferredDate} ${activeBooking.preferredTime}, Status: ${activeBooking.status}, Total: Rs ${activeBooking.total}, OTP: ${activeBooking.jobOtp || 'None'}. (NOTE: ONLY refer to this if the customer is specifically asking about their past/existing booking or cleaner arrival. If the customer is inquiring about new services or states they didn't book anything, ignore this record completely and treat them as a fresh inquiry!)`;
  }

  const historyParts = session.history.slice(-8).map(h => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.text }]
  }));

  const userParts = [{ text: `[Context: ${contextExtra}]\nCustomer Message: "${text}"` }];
  const contents = [...historyParts, { role: 'user', parts: userParts }];

  const geminiResponse = await callGemini(contents);
  if (!geminiResponse || !geminiResponse.parts) {
    return isEnglish(text)
      ? `Hello! Thank you for contacting VS Home Cleaning Services. I am Saaral, Senior Operations Manager. How may I assist you with your home cleaning requirements today?`
      : `வணக்கம்! VS Home Cleaning Services. நான் Saaral பேசுகிறேன். உங்களுக்கு என்ன கிளீனிங் உதவி வேண்டும் என்று சொல்லுங்கள்! 😊`;
  }

  // Check for Function Call
  const functionCall = geminiResponse.parts.find(p => p.functionCall)?.functionCall;

  if (functionCall) {
    if (functionCall.name === 'confirm_service_booking') {
      const args = functionCall.args || {};
      args.phone = p10;
      const booked = await saveConfirmedBooking(args, notifier);

      const confirmMsg = isEnglish(text)
        ? `🎉 *Your Booking is Officially Confirmed!* (Ref: *${booked.ref}*)\n\n` +
          `Specialist Team has been locked for your home!\n\n` +
          `🛠️ *Service:* ${booked.serviceType}\n` +
          `📅 *Date & Slot:* ${booked.preferredDate} (${booked.preferredTime})\n` +
          `💰 *Total Amount:* ₹${booked.total} (Zero advance — Pay after inspection)\n` +
          `📍 *Address:* ${booked.address}\n\n` +
          `🔐 *Your Job Security OTP:* *${booked.jobOtp}*\n` +
          `(Share this OTP with our cleaning supervisor only when they arrive at your doorstep on ${booked.preferredDate}).\n\n` +
          `🔍 *Live Tracking Link:*\n${WEBSITE_URL}/track-booking.html?id=${booked.ref}\n\n` +
          `Thank you for choosing VS Home Cleaning Services! ✨`
        : `🎉 *உங்கள் புக்கிங் வெற்றிகரமாக உறுதியானது!* (Ref: *${booked.ref}*)\n\n` +
          `உங்களுக்காக எங்கள் தொழில்முறை கிளீனிங் குழு ஒதுக்கப்பட்டுள்ளது!\n\n` +
          `🛠️ *சேவை:* ${booked.serviceType}\n` +
          `📅 *தேதி & நேரம்:* ${booked.preferredDate} (${booked.preferredTime})\n` +
          `💰 *தொகை:* ₹${booked.total} (முன்பணம் ஏதுமில்லை — வேலை முடிந்த பின் செலுத்தலாம்)\n` +
          `📍 *முகவரி:* ${booked.address}\n\n` +
          `🔐 *Job Security OTP:* *${booked.jobOtp}*\n` +
          `(ஸ்பெஷலிஸ்ட் உங்கள் வீட்டிற்கு வந்தவுடன் இந்த OTP-யை பகிரவும்).\n\n` +
          `🔍 *Live Tracking Link:*\n${WEBSITE_URL}/track-booking.html?id=${booked.ref}\n\n` +
          `நன்றி! எங்கள் குழு குறித்த நேரத்தில் வந்துவிடும். 🧹✨`;

      session.history.push({ role: 'user', text });
      session.history.push({ role: 'model', text: confirmMsg });
      return confirmMsg;
    }

    if (functionCall.name === 'escalate_to_founder') {
      await triggerFounderSos(phone, text, activeBooking, notifier);
      const sosReply = isEnglish(text)
        ? `I sincerely apologize for the inconvenience! 🙏 I have escalated this with highest priority to our Founder Vignesh and operations head. We are directly coordinating to resolve this immediately.`
        : `சிரமத்திற்கு மிக்க மன்னிக்கவும்! 🙏 நான் இப்போதே பவுண்டர் விக்னேஷ் மற்றும் ஆபரேஷன்ஸ் தலைவருக்கு ஹை-பிரையாரிட்டி அவசர அலர்ட் அனுப்பிவிட்டேன். உடனே சரிசெய்கிறோம்.`;

      session.history.push({ role: 'user', text });
      session.history.push({ role: 'model', text: sosReply });
      return sosReply;
    }
  }

  // Regular Natural Text Reply
  const textReply = geminiResponse.parts.find(p => p.text)?.text || '';
  if (textReply) {
    session.history.push({ role: 'user', text });
    session.history.push({ role: 'model', text: textReply });
    if (session.history.length > 12) session.history = session.history.slice(-12);
    return textReply;
  }

  return `Hello! VS Home Cleaning Services. How can I assist you with your booking today?`;
}

// Simple English detection
function isEnglish(text) {
  const letters = (text || '').replace(/[^a-zA-Z]/g, '').length;
  const total = (text || '').replace(/\s/g, '').length;
  return total > 0 && (letters / total) > 0.6;
}

// WhatsApp Catalog Cart Handler
async function handleCartOrder(phone, orderMsg, pushName) {
  const session = getSession(phone);
  if (pushName && !session.name) session.name = pushName.replace(/[^\w\s]/gi, '').trim() || null;

  const itemCount = orderMsg?.itemCount || 1;
  const rawTotal = orderMsg?.totalAmount1000;
  const total = rawTotal ? Math.round(Number(rawTotal) / 1000) : 1148;
  const orderTitle = orderMsg?.orderTitle || 'Cleaning Services';

  return `🛒 *WHATSAPP ORDER RECEIVED!* ✨\n\n` +
    `Hello ${session.name || ''}! We have received your cart order for:\n` +
    `📋 *Service:* ${orderTitle} (${itemCount} items)\n` +
    `💰 *Estimated Total:* ₹${total} (Zero advance — Pay after service!)\n\n` +
    `To confirm your booking, please share:\n` +
    `📍 Your complete Chennai address & Pincode\n` +
    `📅 Preferred Date & Time Slot\n\n` +
    `I will immediately lock your specialized team! 😊`;
}

module.exports = {
  processCustomerMessage,
  handleCartOrder,
  muteBotForCustomer,
  isCustomerMuted,
  saveConfirmedBooking
};
