/* =========================================================================
   VS Home Cleaning Services — Client-Side Auto-Assignment Engine
   -------------------------------------------------------------------------
   Runs on Firebase Spark (Free Tier) without Cloud Functions.
   Used by booking.html and admin.html.
   ========================================================================= */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VSAutoAssign = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------------
     1. Hub Area Map — Chennai 7 Hubs (Owner Source of Truth)
     --------------------------------------------------------------------- */
  var HUBS = [
    {
      hubId: "1",
      name: "Georgetown / Central",
      pincodes: ["600001", "600104", "600108", "600003", "600009", "600079"],
      localities: ["Georgetown", "Sowcarpet", "Mannady", "Central Station", "Park Town", "Fort St. George"]
    },
    {
      hubId: "2",
      name: "Perambur / Vepery",
      pincodes: ["600013", "600021", "600081", "600019", "600057", "600103"],
      localities: ["Vepery", "Perambur", "Sembium", "Pulianthope", "Choolai", "Kosapet"]
    },
    {
      hubId: "3",
      name: "Royapuram / Thiruvottiyur",
      pincodes: ["600007", "600012", "600112", "600010", "600084", "600031"],
      localities: ["Royapuram", "Kasimode", "Thiruvottiyur", "Kaladipet", "Washermanpet", "Korukkupet"]
    },
    {
      hubId: "4",
      name: "Ayanavaram / Vyasarpady",
      pincodes: ["600011", "600039", "600038", "600023", "600082", "600099"],
      localities: ["Ayanavaram", "ICF Colony", "Vyasarpady", "MKB Nagar"]
    },
    {
      hubId: "5",
      name: "Tondiarpet / Mint",
      pincodes: ["600051", "600060", "600118", "600068", "600052", "600066"],
      localities: ["Bullion Market", "Mint", "Tondiarpet", "Choolai", "Ashtabujam Road"]
    },
    {
      hubId: "6",
      name: "Madhavaram / Kolathur",
      pincodes: ["600040", "600102", "600101", "600030", "600029", "600106"],
      localities: ["Madhavaram", "Moolakadai", "Kolathur", "Kodungaiyur", "Erukkancheri"]
    },
    {
      hubId: "7",
      name: "Ennore / Manali",
      pincodes: ["600049", "600050", "600080", "600053", "600058", "600076", "600054", "600055", "600065"],
      localities: ["Ennore", "Ernavur", "Manali", "Manali New Town"]
    }
  ];

  /* ---------------------------------------------------------------------
     2. PIN & Locality Extraction
     --------------------------------------------------------------------- */
  function extractPin(text) {
    if (!text) return null;
    var m = String(text).match(/(?:^|[^0-9])([1-9][0-9]{5})(?:[^0-9]|$)/);
    return m ? m[1] : null;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function containsLocality(haystackLowered, locality) {
    var needle = escapeRegex(locality.toLowerCase());
    return new RegExp("(^|[^a-z0-9])" + needle + "([^a-z0-9]|$)").test(haystackLowered);
  }

  function resolveHub(address) {
    if (!address || !address.trim()) {
      return { ok: false, code: 'missing-address', message: 'Booking has no address.' };
    }
    var pin = extractPin(address);
    if (pin) {
      for (var i = 0; i < HUBS.length; i++) {
        if (HUBS[i].pincodes.indexOf(pin) !== -1) {
          return { ok: true, hubId: HUBS[i].hubId, hubName: HUBS[i].name, method: 'pin', pin: pin };
        }
      }
    }
    // Locality fallback
    var lowered = address.toLowerCase();
    var matched = [];
    for (var j = 0; j < HUBS.length; j++) {
      for (var k = 0; k < HUBS[j].localities.length; k++) {
        var loc = HUBS[j].localities[k];
        if (containsLocality(lowered, loc)) {
          matched.push({ hubId: HUBS[j].hubId, hubName: HUBS[j].name, locality: loc });
          break;
        }
      }
    }
    if (matched.length === 1) {
      return { ok: true, hubId: matched[0].hubId, hubName: matched[0].hubName, method: 'locality', matchedLocality: matched[0].locality };
    }
    if (matched.length > 1) {
      return { ok: false, code: 'ambiguous-hub', message: 'Address matches multiple hubs (' + matched.map(function(m){ return 'Hub ' + m.hubId; }).join(', ') + ') without exact PIN.' };
    }
    return { ok: false, code: 'unknown-area', message: (pin ? 'PIN ' + pin : 'Address area') + ' not covered by Hubs 1-7.' };
  }

  /* ---------------------------------------------------------------------
     3. Service Skill Resolution
     --------------------------------------------------------------------- */
  function resolveSkillRequirement(serviceType) {
    var st = (serviceType || '').toLowerCase().trim();
    if (!st) {
      return { ok: false, code: 'unsupported-service', message: 'No service type specified.' };
    }
    if (st.indexOf('bathroom') !== -1) {
      return { ok: true, skills: ['Bathroom Deep Cleaning'], mode: 'all' };
    }
    if (st.indexOf('kitchen') !== -1) {
      return { ok: true, skills: ['Kitchen Deep Cleaning'], mode: 'all' };
    }
    if (st.indexOf('sofa') !== -1 || st.indexOf('furniture') !== -1) {
      return { ok: true, skills: ['Sofa & Carpet Shampooing'], mode: 'all' };
    }
    if (st.indexOf('room') !== -1 || st.indexOf('bedroom') !== -1) {
      return { ok: true, skills: ['Bedroom Cleaning', 'Living Room Cleaning'], mode: 'any' };
    }
    if (st.indexOf('full') !== -1 || st.indexOf('apartment') !== -1 || st.indexOf('house') !== -1) {
      // Lenient skill requirement for full apartment
      return { ok: true, skills: ['Floor Cleaning / Scrubbing', 'Bathroom Deep Cleaning', 'Deep Cleaning'], mode: 'any' };
    }
    // Generic cleaning fallback
    return { ok: true, skills: ['Deep Cleaning', 'Floor Cleaning / Scrubbing'], mode: 'any' };
  }

  /* ---------------------------------------------------------------------
     4. Schedule & Slot Translation
     --------------------------------------------------------------------- */
  var SIX_SLOT_STARTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];
  var DAYPART_SLOTS = {
    "morning (8 am - 12 pm)": ["08:00", "10:00"],
    "afternoon (12 pm - 4 pm)": ["12:00", "14:00"],
    "evening (4 pm - 8 pm)": ["16:00", "18:00"]
  };

  function dateKey(dateStr) {
    return (dateStr || '').replace(/[^0-9]/g, '');
  }

  function startsForTimeValue(val) {
    var v = (val || '').trim().toLowerCase();
    if (!v) return SIX_SLOT_STARTS.slice();
    if (DAYPART_SLOTS[v]) return DAYPART_SLOTS[v].slice();
    // Check 2-hour strings like "8:00 AM - 10:00 AM" or "10:00 AM"
    var m = v.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (m) {
      var hour = parseInt(m[1], 10);
      var ampm = m[3] ? m[3].toLowerCase() : null;
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      if (hour >= 8 && hour < 20) {
        var startHour = 8 + Math.floor((hour - 8) / 2) * 2;
        var startStr = (startHour < 10 ? '0' : '') + startHour + ':00';
        return [startStr];
      }
    }
    return SIX_SLOT_STARTS.slice();
  }

  function startsIntersect(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (b.indexOf(a[i]) !== -1) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------------
     5. Commission & Helpers
     --------------------------------------------------------------------- */
  var TIER_COMMISSION = { Silver: 30, Gold: 20, Platinum: 15 };

  function getCommissionPercent(tier) {
    return (tier && TIER_COMMISSION[tier]) ? TIER_COMMISSION[tier] : 30;
  }

  function istClockLabel() {
    var iso = new Date(Date.now() + 330 * 60 * 1000).toISOString();
    var hour = parseInt(iso.slice(11, 13), 10);
    var minute = iso.slice(14, 16);
    var ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return (hour < 10 ? '0' : '') + hour + ':' + minute + ' ' + ampm;
  }

  function mapCategory(serviceType) {
    var s = (serviceType || '').toLowerCase();
    if (s.indexOf('bathroom') !== -1) return 'Bathroom Cleaning';
    if (s.indexOf('kitchen') !== -1) return 'Kitchen Cleaning';
    if (s.indexOf('sofa') !== -1 || s.indexOf('furniture') !== -1) return 'Sofa Shampooing';
    if (s.indexOf('full') !== -1 || s.indexOf('apartment') !== -1) return 'Full House Cleaning';
    return 'Deep Cleaning';
  }

  function extractArea(address) {
    if (!address) return '';
    var parts = address.split(',');
    if (parts.length >= 2) return parts.slice(0, 2).join(',').trim();
    return address.trim();
  }

  function resolvePaymentType(booking) {
    var direct = booking && booking.paymentType ? String(booking.paymentType).trim() : '';
    if (direct === 'FULL_PAYMENT' || direct === 'ONLINE_PAYMENT' || direct === 'COD') return direct;
    var mode = (booking && (booking.paymentMethod || booking.paymentMode)) || direct;
    if (mode) {
      var upper = String(mode).toUpperCase().replace(/[\s-]/g, '');
      if (upper === 'COD') return 'COD';
      if (upper === 'ONLINE' || upper === 'ONLINEPAYMENT' || upper === 'UPI' || upper === 'CARD') return 'ONLINE_PAYMENT';
      if (upper === 'FULLPAYMENT') return 'FULL_PAYMENT';
    }
    return 'COD';
  }

  /* ---------------------------------------------------------------------
     6. Partner Eligibility Check
     --------------------------------------------------------------------- */
  function partnerHasHub(partner, hubId) {
    if (!partner) return false;
    if (Array.isArray(partner.hubs) && partner.hubs.length > 0) {
      return partner.hubs.indexOf(hubId) !== -1 || partner.hubs.indexOf(parseInt(hubId, 10)) !== -1;
    }
    if (partner.hub) {
      return String(partner.hub) === String(hubId);
    }
    // If no hubs are configured on partner yet, we treat as universal/fallback so partners aren't starved
    return true;
  }

  function partnerHasSkill(partner, req) {
    if (!partner) return false;
    var services = partner.services || partner.specialty || partner.role || '';
    var list = [];
    if (Array.isArray(services)) {
      list = services.map(function(s){ return String(s).toLowerCase(); });
    } else if (typeof services === 'object') {
      Object.keys(services).forEach(function(k){ if (services[k]) list.push(k.toLowerCase()); });
    } else {
      list = [String(services).toLowerCase()];
    }
    // If partner has no services configured, treat them as general Deep Cleaning
    if (list.length === 0 || (list.length === 1 && !list[0])) {
      return true;
    }
    for (var i = 0; i < req.skills.length; i++) {
      var needed = req.skills[i].toLowerCase();
      var found = list.some(function(item){
        return item.indexOf(needed) !== -1 || needed.indexOf(item) !== -1 || item.indexOf('deep cleaning') !== -1;
      });
      if (req.mode === 'all' && !found) return false;
      if (req.mode === 'any' && found) return true;
    }
    return req.mode === 'all';
  }

  /* ---------------------------------------------------------------------
     7. Main Auto-Assignment Execution
     --------------------------------------------------------------------- */
  function autoAssignBooking(bookingRef, booking, partners, dbHelpers) {
    /* dbHelpers: { vsRef, vsSet, vsUpdate, vsGet } */
    if (!bookingRef || !booking) {
      return Promise.reject(new Error('Missing booking reference or data'));
    }

    // 1. Resolve Hub
    var hub = resolveHub(booking.address);
    if (!hub.ok) {
      var stateReview = {
        state: 'review',
        code: hub.code,
        message: hub.message,
        at: Date.now()
      };
      if (dbHelpers && dbHelpers.vsSet && dbHelpers.vsRef) {
        return dbHelpers.vsSet(dbHelpers.vsRef('bookings/' + bookingRef + '/autoAssignment'), stateReview)
          .then(function() { return stateReview; });
      }
      return Promise.resolve(stateReview);
    }

    // 2. Resolve Service Skill
    var skill = resolveSkillRequirement(booking.serviceType);

    // 3. Find Candidates
    var partnerKeys = Object.keys(partners || {});
    var candidates = [];

    for (var i = 0; i < partnerKeys.length; i++) {
      var uid = partnerKeys[i];
      var p = partners[uid];
      if (!p) continue;
      // Active check
      var isActive = (p.accountStatus === 'active' || !p.accountStatus);
      if (!isActive) continue;
      // Rejection check: skip partner if they already declined this booking
      if (booking.declinedPartners && booking.declinedPartners[uid]) continue;
      if (booking.declinedBy && (booking.declinedBy[uid] || (Array.isArray(booking.declinedBy) && booking.declinedBy.indexOf(uid) !== -1))) continue;
      // Hub check
      if (!partnerHasHub(p, hub.hubId)) continue;
      // Skill check
      if (skill.ok && !partnerHasSkill(p, skill)) continue;

      candidates.push({
        uid: uid,
        name: p.name || 'Partner',
        rating: typeof p.rating === 'number' ? p.rating : 0,
        totalJobsCompleted: typeof p.totalJobsCompleted === 'number' ? p.totalJobsCompleted : 0,
        tier: p.tier || 'Silver'
      });
    }

    if (candidates.length === 0) {
      var noPartnerState = {
        state: 'review',
        code: 'no-eligible-partner',
        message: 'No eligible partner available in Hub ' + hub.hubId + ' (' + hub.hubName + ') for ' + (booking.serviceType || 'Service'),
        hubId: hub.hubId,
        at: Date.now()
      };
      if (dbHelpers && dbHelpers.vsSet && dbHelpers.vsRef) {
        return dbHelpers.vsSet(dbHelpers.vsRef('bookings/' + bookingRef + '/autoAssignment'), noPartnerState)
          .then(function() { return noPartnerState; });
      }
      return Promise.resolve(noPartnerState);
    }

    // Sort candidates: Highest rating, then most completed jobs
    candidates.sort(function(a, b) {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.totalJobsCompleted !== a.totalJobsCompleted) return b.totalJobsCompleted - a.totalJobsCompleted;
      return a.uid < b.uid ? -1 : 1;
    });

    var chosen = candidates[0];
    var subtotal = booking.subtotal || booking.total || 0;
    var commPercent = getCommissionPercent(chosen.tier);
    var commission = Math.round((subtotal * commPercent) / 100);
    var netEarnings = subtotal - commission;

    var jobData = {
      bookingRef: bookingRef,
      serviceType: booking.serviceType || 'Cleaning Service',
      category: mapCategory(booking.serviceType),
      customerName: booking.name || '',
      customerPhone: booking.mobile || '',
      customerEmail: booking.email || '',
      customerAvatar: '',
      address: booking.address || '',
      area: extractArea(booking.address),
      distance: '',
      date: booking.preferredDate || '',
      time: booking.preferredTime || '',
      price: booking.total || 0,
      serviceValue: subtotal,
      tax: booking.tax || 0,
      commission: commission,
      netEarnings: netEarnings,
      status: 'pending',
      scheduledTimeGroup: 'upcoming',
      customerNote: booking.notes || '',
      items: booking.items || [],
      paymentType: resolvePaymentType(booking),
      latitude: booking.latitude != null ? booking.latitude : null,
      longitude: booking.longitude != null ? booking.longitude : null,
      location: booking.location || null,
      assignedPartnerId: chosen.uid,
      createdAt: Date.now()
    };

    var notifKey = 'auto-' + bookingRef + '-' + Date.now();
    var notification = {
      title: 'New Job Assigned',
      description: (booking.serviceType || 'Cleaning') + ' in ' + extractArea(booking.address) + ' — ' + bookingRef,
      time: istClockLabel(),
      category: 'Jobs',
      unread: true,
      actionScreen: 'job-details',
      actionJobId: bookingRef,
      jobId: bookingRef,
      icon: 'cleaning_services',
      iconBg: 'bg-primary/10 text-primary',
      createdAt: Date.now()
    };

    var assignedState = {
      state: 'assigned',
      hubId: hub.hubId,
      hubName: hub.hubName,
      partnerUid: chosen.uid,
      partnerName: chosen.name,
      message: 'Assigned automatically to ' + chosen.name + ' (Hub ' + hub.hubId + ': ' + hub.hubName + ')',
      at: Date.now()
    };

    if (!dbHelpers || !dbHelpers.vsSet || !dbHelpers.vsRef) {
      return Promise.resolve(assignedState);
    }

    var writes = [
      dbHelpers.vsSet(dbHelpers.vsRef('partnerJobs/' + chosen.uid + '/' + bookingRef), jobData),
      dbHelpers.vsSet(dbHelpers.vsRef('partnerNotifications/' + chosen.uid + '/' + notifKey), notification),
      dbHelpers.vsSet(dbHelpers.vsRef('bookings/' + bookingRef + '/assignedTo'), chosen.uid),
      dbHelpers.vsSet(dbHelpers.vsRef('bookings/' + bookingRef + '/assignedPartnerName'), chosen.name),
      dbHelpers.vsSet(dbHelpers.vsRef('bookings/' + bookingRef + '/status'), 'Team Assigned'),
      dbHelpers.vsSet(dbHelpers.vsRef('bookingLookup/' + bookingRef + '/status'), 'Team Assigned'),
      dbHelpers.vsSet(dbHelpers.vsRef('bookings/' + bookingRef + '/autoAssignment'), assignedState)
    ];

    return Promise.all(writes).then(function() {
      return assignedState;
    });
  }

  return {
    HUBS: HUBS,
    extractPin: extractPin,
    resolveHub: resolveHub,
    resolveSkillRequirement: resolveSkillRequirement,
    startsForTimeValue: startsForTimeValue,
    startsIntersect: startsIntersect,
    autoAssignBooking: autoAssignBooking
  };
}));
