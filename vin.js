/* Mo Auto: free VIN decoder (no paid services).
 *
 * What a VIN can tell us for free, and how sure we are:
 *   make + factory country  chars 1-3 (WMI), standard codes            -> reliable
 *   model year              char 10, standard year letters             -> reliable only on
 *                           North American builds; usually right on Korean/Chinese builds;
 *                           often NOT a year on Japanese export cars (GCC Toyota, Nissan)
 *   model / engine          chars 4-8, manufacturer specific, differs by market
 *                           -> only from (1) patterns learned from confirmed orders,
 *                              (2) the free US decoder (NHTSA vPIC) for US-market cars
 * No guessed model rules: a wrong car is worse than asking the customer.
 */
(function (global) {
  "use strict";

  // World manufacturer identifiers (chars 1-3). Standard public assignments.
  const WMI = {
    // Toyota / Lexus
    JTD: "Toyota", JTE: "Toyota", JTM: "Toyota", JTN: "Toyota", JTK: "Toyota", JTL: "Toyota", JTG: "Toyota",
    JTF: "Toyota", JTB: "Toyota", JT2: "Toyota", JT3: "Toyota", JT4: "Toyota", JT5: "Toyota",
    JTH: "Lexus", JTJ: "Lexus", "2T2": "Lexus", "58A": "Lexus",
    "4T1": "Toyota", "4T3": "Toyota", "4T4": "Toyota", "5TD": "Toyota", "5TF": "Toyota", "5TE": "Toyota",
    "5TB": "Toyota", "5TN": "Toyota", "2T1": "Toyota", "2T3": "Toyota", "3TM": "Toyota", "3TY": "Toyota",
    MR0: "Toyota", MR1: "Toyota", MR2: "Toyota", MHF: "Toyota", MBJ: "Toyota", AHT: "Toyota",
    NMT: "Toyota", SB1: "Toyota", VNK: "Toyota", "6T1": "Toyota", "8AJ": "Toyota", "9BR": "Toyota",
    // Nissan / Infiniti
    JN1: "Nissan", JN3: "Nissan", JN6: "Nissan", JN8: "Nissan", JNA: "Nissan", "1N4": "Nissan", "1N6": "Nissan",
    "3N1": "Nissan", "3N6": "Nissan", "5N1": "Nissan", "5N3": "Nissan", MNT: "Nissan", MDH: "Nissan",
    VSK: "Nissan", SJN: "Nissan", "94D": "Nissan",
    JNK: "Infiniti", JNR: "Infiniti", "5N3A": "Infiniti",
    // Hyundai / Kia
    KMH: "Hyundai", KMF: "Hyundai", KMJ: "Hyundai", KMC: "Hyundai", "5NP": "Hyundai", "5NM": "Hyundai",
    "5NT": "Hyundai", MAL: "Hyundai", NLH: "Hyundai", TMA: "Hyundai", "9BH": "Hyundai",
    KNA: "Kia", KNB: "Kia", KNC: "Kia", KND: "Kia", KNE: "Kia", KNM: "Kia", "5XY": "Kia", "3KP": "Kia",
    "5XX": "Kia", U5Y: "Kia", U6Y: "Kia", MZB: "Kia",
    // Honda
    JHM: "Honda", JHL: "Honda", JHG: "Honda", "1HG": "Honda", "2HG": "Honda", "2HK": "Honda", "5FN": "Honda",
    "5J6": "Honda", "19X": "Honda", SHH: "Honda", SHS: "Honda", MRH: "Honda", MAK: "Honda",
    // Others in the catalog
    JM1: "Mazda", JM3: "Mazda", JM7: "Mazda", "4F2": "Mazda", "3MZ": "Mazda", MM0: "Mazda", MM6: "Mazda",
    JA3: "Mitsubishi", JA4: "Mitsubishi", JMB: "Mitsubishi", JMY: "Mitsubishi", MMB: "Mitsubishi",
    MMC: "Mitsubishi", ML3: "Mitsubishi", "4A3": "Mitsubishi",
    JS2: "Suzuki", JS3: "Suzuki", JSA: "Suzuki", MA3: "Suzuki", TSM: "Suzuki",
    JAA: "Isuzu", JAL: "Isuzu", MPA: "Isuzu", "4S2": "Isuzu",
    "1FA": "Ford", "1FB": "Ford", "1FM": "Ford", "1FT": "Ford", "1FD": "Ford", "2FM": "Ford", "3FA": "Ford",
    "3FM": "Ford", MAJ: "Ford", MNB: "Ford", WF0: "Ford", "6FP": "Ford",
    "1G1": "Chevrolet", "1GN": "Chevrolet", "1GC": "Chevrolet", "2G1": "Chevrolet", "3G1": "Chevrolet",
    "3GN": "Chevrolet", KL1: "Chevrolet", KL7: "Chevrolet", "1GB": "Chevrolet",
    "1GT": "GMC", "1GK": "GMC", "2GT": "GMC", "3GT": "GMC", "1GD": "GMC",
    "1G6": "Cadillac", "1GY": "Cadillac",
    "1LN": "Lincoln", "5LM": "Lincoln", "2LM": "Lincoln", "1ME": "Mercury", "2ME": "Mercury",
    "1C3": "Chrysler", "2C3": "Chrysler", "2C4": "Chrysler", "1C4": "Jeep", "1J4": "Jeep", "1J8": "Jeep",
    "1B3": "Dodge", "2B3": "Dodge", "1D7": "Dodge", "2D3": "Dodge", "3D7": "Dodge", "1C6": "Dodge",
    WDB: "Mercedes", WDD: "Mercedes", WDC: "Mercedes", W1K: "Mercedes", W1N: "Mercedes", "4JG": "Mercedes",
    WBA: "BMW", WBS: "BMW", WBX: "BMW", "5UX": "BMW", "5YM": "BMW",
    LS5: "Changan", LS4: "Changan", LS7: "Changan",
    L6T: "Geely", LB3: "Geely", LB2: "Geely",
    LSJ: "MG", SAR: "MG",
    ZFA: "Fiat", ZFF: "Ferrari", VF1: "Renault", VF3: "Peugeot", KLA: "Daewoo", "5GR": "Hummer",
  };

  const REGION = [
    [/^[1-5]/, "North America", "high"],
    [/^K[L-R]/, "Korea", "medium"],
    [/^L/, "China", "medium"],
    [/^J/, "Japan", "low"],
    [/^M[A-E]/, "India", "low"], [/^M[F-K]/, "Indonesia", "low"], [/^M[L-R]/, "Thailand", "low"],
    [/^P[A-E]/, "Philippines", "low"], [/^P[L-R]/, "Malaysia", "low"],
    [/^N[L-R]/, "Turkey", "low"], [/^S/, "United Kingdom", "low"], [/^V[F-R]/, "France", "low"],
    [/^V[S-W]/, "Spain", "low"], [/^W/, "Germany", "low"], [/^Z/, "Italy", "low"],
    [/^6/, "Australia", "low"], [/^9/, "Brazil", "low"], [/^A[A-H]/, "South Africa", "low"],
  ];

  // Year letters for character 10 (the 30-year cycle; I, O, Q, U, Z and 0 are never years)
  const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

  const TRANSLIT = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  function clean(v) {
    return String(v || "").toUpperCase().replace(/[\s\-_.]/g, "");
  }

  function checkDigitOk(vin) {
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const c = vin[i];
      const n = /\d/.test(c) ? Number(c) : TRANSLIT[c];
      if (n === undefined) return false;
      sum += n * WEIGHTS[i];
    }
    const r = sum % 11;
    return vin[8] === (r === 10 ? "X" : String(r));
  }

  function region(vin) {
    for (const [re, name, conf] of REGION) if (re.test(vin)) return { name, yearConfidence: conf };
    return { name: "", yearConfidence: "low" };
  }

  function yearFromCode(code, now = new Date().getFullYear()) {
    const i = YEAR_CODES.indexOf(code);
    if (i < 0) return null;
    // two cycles share each letter (e.g. J = 1988 or 2018): take the newest that is not in the future
    const candidates = [1980 + i, 2010 + i, 2040 + i].filter((y) => y <= now + 1);
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  // ---------- learned patterns ----------
  // Rules come from confirmed orders: key = first 8 characters (maker + model code),
  // optionally + character 10 for the year. Shared file + this browser's own confirmations.
  let shared = { rules: {} };
  const LOCAL_KEY = "mo.vinLearned";

  function localRules() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch { return {}; }
  }

  async function loadShared(url) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (r.ok) shared = await r.json();
    } catch { /* offline or file missing: decoding still works without it */ }
  }

  function learnedFor(vin) {
    const rules = { ...(shared.rules || {}), ...localRules() };
    return rules[vin.slice(0, 8) + "|" + vin[9]] || rules[vin.slice(0, 8)] || null;
  }

  /** Save "this VIN is this car" in this browser (the staff tool adds it to the shared file). */
  function remember(vin, car) {
    vin = clean(vin);
    if (vin.length !== 17 || !car || !car.make || !car.model) return;
    const rules = localRules();
    const base = { make: car.make, model: car.model, engine: car.engine || "" };
    rules[vin.slice(0, 8)] = base;
    if (car.year) rules[vin.slice(0, 8) + "|" + vin[9]] = { ...base, year: car.year };
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rules)); } catch { /* storage unavailable */ }
  }

  // ---------- free US decoder (NHTSA vPIC) ----------
  async function vpic(vin, timeoutMs = 7000) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`,
        ctrl ? { signal: ctrl.signal } : {});
      const row = (await r.json()).Results[0];
      if (!row || !row.Make || !row.Model) return null;
      const engine = [row.DisplacementL && `${Number(row.DisplacementL).toFixed(1)}L`, row.EngineModel]
        .filter(Boolean).join(" ");
      return { make: row.Make, model: row.Model, year: Number(row.ModelYear) || null, engine,
        trim: row.Trim || row.Series || "" };
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Decode a VIN. Returns what we know and how sure we are:
   * { vin, valid, errors[], make, country, year, yearSure, model, engine, source, checkDigitOk }
   * source: "learned" | "vpic" | "vin" (make/year from the VIN itself only)
   */
  async function decode(input, { useOnline = true } = {}) {
    const vin = clean(input);
    const out = { vin, valid: false, errors: [], make: null, country: "", year: null, yearSure: false,
      model: null, engine: "", source: "vin", checkDigitOk: false };
    if (vin.length !== 17) out.errors.push("length");
    if (/[IOQ]/.test(vin)) out.errors.push("ioq");
    if (/[^A-Z0-9]/.test(vin)) out.errors.push("chars");
    if (out.errors.length) return out;
    out.valid = true;
    out.checkDigitOk = checkDigitOk(vin);

    out.make = WMI[vin.slice(0, 3)] || WMI[vin.slice(0, 4)] || null;
    const reg = region(vin);
    out.country = reg.name;
    const y = yearFromCode(vin[9]);
    const trust = (shared.year_trust || {})[vin.slice(0, 3)];
    if (y && trust && trust.total >= 3) {
      // Measured on real cars for this maker code: does character 10 match the model year?
      out.year = y;
      out.yearSure = trust.agree / trust.total >= 0.8;
    } else if (y && reg.yearConfidence !== "low") {
      out.year = y;
      out.yearSure = reg.yearConfidence === "high" || (reg.yearConfidence === "medium" && out.checkDigitOk);
    } else if (y) {
      out.year = y;            // shown as "likely" only
      out.yearSure = false;
    }

    const learned = learnedFor(vin);
    if (learned) {
      Object.assign(out, { make: learned.make || out.make, model: learned.model, engine: learned.engine || "",
        source: "learned" });
      if (learned.year) Object.assign(out, { year: learned.year, yearSure: true });
      return out;
    }
    if (useOnline) {
      const v = await vpic(vin);
      if (v) {
        Object.assign(out, { make: out.make || v.make, model: v.model, engine: v.engine, source: "vpic" });
        if (v.year) Object.assign(out, { year: v.year, yearSure: true });
      }
    }
    return out;
  }

  global.MoVIN = { decode, remember, loadShared, clean, checkDigitOk, yearFromCode, WMI };
})(typeof window !== "undefined" ? window : globalThis);
