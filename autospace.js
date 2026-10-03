/* AutoSpace storefront additions for the Zid Growth theme.
 * Loaded by a one-line loader in Zid's custom JS editor; served from jsDelivr.
 *   1. Car picker under the homepage hero (#as-car): make, model, year, and a VIN reader.
 *   2. Car chip in the header: the saved car, one tap back to its parts.
 *   3. Product pages: "fits your car" check against the fitment table in the description,
 *      and a WhatsApp link that carries the part number and the car.
 *   4. Product cards: "fits your car" badge for the saved car, and the part number.
 *   5. Search: "part + car" goes to the car's page filtered by the part.
 * Brand rules: orange = action, green = verified fit only, no emoji, no long dashes.
 */
(function () {
  "use strict";
  if (window.__autospace) return;
  window.__autospace = true;

  var script = document.currentScript;
  var SRC = script && script.src ? script.src : "https://cdn.jsdelivr.net/gh/Mo-ai-sys/autospace-storefront@main/autospace.js";
  var VERSION = (SRC.split("?")[1] || "");            // the loader adds ?v=<date> so browsers refetch daily
  var BASE = SRC.split("?")[0].replace(/[^/]+$/, "");
  function asset(path) { return BASE + path + (VERSION ? "?" + VERSION : ""); }
  var WHATSAPP = "966598929096";

  // ---------- language ----------
  // Zid serves English under /en with the same theme. PATH is the path without that prefix, so page
  // checks work in both languages; PRE goes in front of every link we build.
  var EN = /^\/en(\/|$)/.test(location.pathname) || (document.documentElement.lang || "").indexOf("en") === 0;
  var PRE = EN ? "/en" : "";
  var PATH = EN ? (location.pathname.replace(/^\/en/, "") || "/") : location.pathname;
  function T(ar, en) { return EN ? en : ar; }
  function nm(o) { return EN ? (o.en || o.ar) : o.ar; }          // make or model name in the page language

  // ---------- small helpers ----------
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("as." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("as." + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
  function norm(s) {
    return String(s || "").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
      .replace(/ة/g, "ه").replace(/\s+/g, "").toLowerCase();
  }
  function simple(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function wa(text) { return "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(text); }

  function loadCss() {
    if (document.querySelector("link[data-autospace]")) return;
    var l = el("link", { rel: "stylesheet", href: asset("autospace.css"), "data-autospace": "1" });
    document.head.appendChild(l);
  }

  var vehiclesPromise;
  function vehicles() {
    if (!vehiclesPromise) {
      vehiclesPromise = fetch(asset("data/vehicles.json")).then(function (r) { return r.json(); })
        .then(function (d) {
          d.makeById = {}; d.modelById = {};
          d.makes.forEach(function (mk) {
            d.makeById[mk.id] = mk;
            mk.models.forEach(function (md) { md.make = mk; d.modelById[md.id] = md; });
          });
          return d;
        });
    }
    return vehiclesPromise;
  }

  var vinPromise;
  function vinDecoder() {
    if (!vinPromise) {
      vinPromise = new Promise(function (resolve) {
        var s = el("script", { src: asset("vin.js") });
        s.onload = function () {
          window.MoVIN.loadShared(asset("data/vin_learned.json")).then(function () { resolve(window.MoVIN); });
        };
        s.onerror = function () { resolve(null); };
        document.head.appendChild(s);
      });
    }
    return vinPromise;
  }

  // ---------- saved car ----------
  function getCar() { return store.get("car", null); }
  function setCar(car) { store.set("car", car); renderChip(); }
  function clearCar() {
    store.set("car", null);
    renderChip();
    if (document.querySelector(".as-fit, .as-card-fit")) location.reload();   // fit badges go back to neutral
  }
  function carLabel(car, V) {
    var md = car && V.modelById[car.md];
    if (!md) return "";
    return nm(md) + (car.yr ? " " + car.yr : "");
  }
  function modelShort(md) {                                      // "Toyota Camry" -> "Camry"
    var full = nm(md), mk = nm(md.make);
    return full.indexOf(mk + " ") === 0 ? full.slice(mk.length + 1) : full;
  }

  // per-model fitment index (mo-auto/tools/build_fit_index.py): product id[:12] -> [[from, to], ...]
  var fitCache = {};
  function fitIndex(mdId) {
    if (!fitCache[mdId]) {
      fitCache[mdId] = fetch(asset("data/fit/" + mdId + ".json"))
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    return fitCache[mdId];
  }
  // true/false for a product and the saved car; null when there's no index to answer from
  function fitsCar(fit, productId, car) {
    if (!fit || !productId) return null;
    var spans = fit[productId.slice(0, 12)] || [];               // not in the index = not listed for this model
    var known = spans.filter(function (s) { return s[0]; });     // [0, 0] = years unknown
    return spans.length > 0 && (!car.yr || !known.length ||
      known.some(function (s) { return car.yr >= s[0] && car.yr <= s[1]; }));
  }

  // ---------- 1. car picker ----------
  function yearsFor(md) {
    if (!md || !md.y) return [];
    var out = [], top = Math.min(md.y[1], new Date().getFullYear() + 1);
    for (var y = top; y >= md.y[0]; y--) out.push(y);
    return out;
  }

  function buildPicker(V) {
    var hero = document.querySelector(".section-hero");
    if (!hero || document.getElementById("as-car")) return;
    var sec = el("section", { id: "as-car", class: "as-picker", "aria-labelledby": "as-car-title" },
      '<div class="as-wrap">' +
        '<div class="as-head"><h2 id="as-car-title">' + T("اختر سيارتك", "Choose your car") + "</h2>" +
        "<p>" + T("نعرض لك القطع التي تناسبها.", "We show you the parts that fit it.") + "</p>" +
        '<button type="button" class="as-clear" data-clear hidden>' + T("إزالة السيارة", "Remove car") + "</button></div>" +
        '<div class="as-fields">' +
          '<label class="as-field"><span>' + T("الشركة", "Make") + '</span><select data-f="mk"></select></label>' +
          '<label class="as-field"><span>' + T("الموديل", "Model") + '</span><select data-f="md" disabled></select></label>' +
          '<label class="as-field"><span>' + T("السنة", "Year") + '</span><select data-f="yr" disabled></select></label>' +
          '<button type="button" class="as-btn" data-go disabled>' + T("اعرض القطع", "Show parts") + "</button>" +
        "</div>" +
        '<form class="as-vin" novalidate>' +
          '<label for="as-vin-input">' + T("عندك رقم الهيكل (VIN)؟", "Have your VIN?") + "</label>" +
          '<div class="as-vin-row"><div class="as-plate"><input id="as-vin-input" maxlength="17" dir="ltr" autocomplete="off" ' +
            'spellcheck="false" placeholder="JTDBR32E720000000" inputmode="latin" aria-describedby="as-vin-count">' +
            '<span class="as-vin-count" id="as-vin-count" dir="ltr">0/17</span></div>' +
          '<button type="submit" class="as-btn-ghost">' + T("اقرأ الرقم", "Read VIN") + "</button></div>" +
          '<p class="as-vin-out" role="status" aria-live="polite"></p>' +
        "</form>" +
      "</div>");
    // the picker is the hero's job: it sits inside the hero instead of a scroll-to button below it
    var heroBox = hero.querySelector(".theme-container") || hero;
    heroBox.appendChild(sec);
    document.documentElement.classList.add("as-has-picker");

    var sMk = sec.querySelector('[data-f="mk"]'), sMd = sec.querySelector('[data-f="md"]'),
      sYr = sec.querySelector('[data-f="yr"]'), go = sec.querySelector("[data-go]");

    function fillMakes(sel) {
      sMk.innerHTML = '<option value="">' + T("اختر الشركة", "Choose make") + "</option>" + V.makes.map(function (mk) {
        return '<option value="' + mk.id + '"' + (mk.id === sel ? " selected" : "") + ">" + esc(nm(mk)) + "</option>";
      }).join("");
    }
    function fillModels(mkId, sel) {
      var mk = V.makeById[mkId];
      sMd.disabled = !mk;
      sMd.innerHTML = '<option value="">' + T("اختر الموديل", "Choose model") + "</option>" + (mk ? mk.models.map(function (md) {
        return '<option value="' + md.id + '"' + (md.id === sel ? " selected" : "") + ">" + esc(modelShort(md)) + "</option>";
      }).join("") : "");
    }
    function fillYears(mdId, sel) {
      var ys = yearsFor(V.modelById[mdId]);
      sYr.disabled = !ys.length;
      sYr.innerHTML = '<option value="">' + T("كل السنوات", "All years") + "</option>" + ys.map(function (y) {
        return '<option value="' + y + '"' + (y === sel ? " selected" : "") + ">" + y + "</option>";
      }).join("");
    }
    function sync(car) {
      fillMakes(car && car.mk); fillModels(car && car.mk, car && car.md); fillYears(car && car.md, car && car.yr);
      go.disabled = !(car && car.md);
      clear.hidden = !(getCar());
    }
    var clear = sec.querySelector("[data-clear]");
    clear.addEventListener("click", function () { clearCar(); sync(null); sMk.focus(); });
    sync(getCar());

    sMk.addEventListener("change", function () {
      var mk = Number(sMk.value) || null;
      fillModels(mk, null); fillYears(null, null); go.disabled = true;
    });
    sMd.addEventListener("change", function () {
      var md = Number(sMd.value) || null;
      fillYears(md, null); go.disabled = !md;
    });
    go.addEventListener("click", function () {
      var car = { mk: Number(sMk.value), md: Number(sMd.value), yr: Number(sYr.value) || null };
      if (!car.md) return;
      setCar(car);
      location.href = PRE + "/categories/" + car.md;
    });

    // VIN reader
    var form = sec.querySelector(".as-vin"), input = sec.querySelector("#as-vin-input"),
      out = sec.querySelector(".as-vin-out"), count = sec.querySelector(".as-vin-count");
    input.addEventListener("input", function () {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      count.textContent = input.value.length + "/17";
      count.classList.toggle("is-full", input.value.length === 17);
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      out.className = "as-vin-out"; out.textContent = T("نقرأ رقم الهيكل...", "Reading your VIN...");
      vinDecoder().then(function (MoVIN) {
        if (!MoVIN) {
          out.textContent = T("تعذر قراءة الرقم الآن. اختر سيارتك من القوائم.", "We can't read the VIN right now. Choose your car from the lists.");
          return;
        }
        return MoVIN.decode(input.value).then(function (d) { showVin(d); });
      });
    });

    function matchMake(name) {
      var key = simple(name), alias = { mercedesbenz: "mercedes", chevy: "chevrolet" };
      key = alias[key] || key;
      for (var i = 0; i < V.makes.length; i++) if (simple(V.makes[i].en) === key) return V.makes[i];
      return null;
    }
    function matchModel(mk, name) {
      var key = simple(name);
      if (!key) return null;
      var best = null;
      mk.models.forEach(function (md) {
        var m = simple(md.en.replace(mk.en, ""));
        if (!m) return;
        if (m === key) best = md;
        else if (!best && m.length >= 3 && (key.indexOf(m) >= 0 || m.indexOf(key) >= 0)) best = md;
      });
      return best;
    }
    function showVin(d) {
      if (!d.valid) {
        out.className = "as-vin-out is-bad";
        out.textContent = T("رقم الهيكل 17 خانة، ولا يحتوي على الحروف I و O و Q.",
          "A VIN has 17 characters and never contains the letters I, O or Q.");
        return;
      }
      store.set("vin", d.vin);
      var mk = d.make && matchMake(d.make);
      if (!mk) {
        out.innerHTML = (d.make
            ? T("سيارتك " + esc(d.make) + "، وهذه الشركة غير موجودة في المتجر حالياً. ",
                "Your car is a " + esc(d.make) + ", a make we don't stock yet. ")
            : T("ما قدرنا نحدد الشركة من هذا الرقم. ", "We couldn't tell the make from this VIN. ")) +
          '<a href="' + wa(T("السلام عليكم، أبحث عن قطعة لسيارتي. رقم الهيكل: ", "Hello, I'm looking for a part for my car. VIN: ") + d.vin) +
          '" target="_blank" rel="noopener">' + T("اطلب عبر واتساب", "Order on WhatsApp") + "</a>";
        return;
      }
      var md = d.model ? matchModel(mk, d.model) : null;
      var ys = md ? yearsFor(md) : [];
      var yr = d.year && d.yearSure && ys.indexOf(d.year) >= 0 ? d.year : null;
      sync({ mk: mk.id, md: md ? md.id : null, yr: yr });
      if (md) setCar({ mk: mk.id, md: md.id, yr: yr });
      var parts = [nm(mk), md ? modelShort(md) : null, yr].filter(Boolean).join(T("، ", ", "));
      out.innerHTML = T("قرأنا من رقم الهيكل: ", "From your VIN: ") + "<b>" + esc(parts) + "</b>. " +
        (!md ? T("اختر الموديل من القائمة.", "Choose the model from the list.")
          : !yr ? T("اختر السنة، أو اعرض القطع لكل السنوات.", "Choose the year, or show parts for all years.")
          : T("سيارتك جاهزة.", "Your car is set."));
      (md ? go : sMd).focus();
    }
  }

  // ---------- 2. header chip ----------
  var chipV = null;
  function renderChip() {
    if (!chipV) return;
    var header = document.querySelector("header");
    if (!header) return;
    var chip = document.querySelector(".as-chip");
    if (!chip) {
      var wrap = el("span", { class: "as-chip-wrap" });
      chip = el("a", { class: "as-chip" });
      var x = el("button", { type: "button", class: "as-chip-x", "aria-label": T("إزالة السيارة", "Remove car") }, "&times;");
      x.addEventListener("click", function (e) { e.preventDefault(); clearCar(); });
      wrap.appendChild(chip); wrap.appendChild(x);
      if (window.matchMedia("(max-width: 767px)").matches) {
        // phones: the header has no room, so the chip sits in a slim bar under it
        var bar = el("div", { class: "as-chip-bar" });
        bar.appendChild(wrap);
        header.parentNode.insertBefore(bar, header.nextSibling);
      } else {
        var nav = header.querySelector("nav") || header;
        nav.insertBefore(wrap, nav.firstChild);
      }
    }
    var car = getCar(), label = car && carLabel(car, chipV);
    chip.href = label ? PRE + "/categories/" + car.md : PRE + "/#as-car";
    chip.innerHTML = label ? '<span class="as-chip-k">' + T("سيارتي", "My car") + "</span> <b>" + esc(label) + "</b>"
      : T("اختر سيارتك", "Choose your car");
    chip.parentNode.classList.toggle("is-set", !!label);
    chip.setAttribute("aria-label", label ? T("سيارتك: ", "Your car: ") + label : T("اختر سيارتك", "Choose your car"));
  }

  // ---------- 3. product page ----------
  function fitmentTable() {
    var tables = document.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      var th = tables[i].querySelector("th:last-child");
      if (th && /سنوات الصنع|Years/.test(th.textContent)) return tables[i];
    }
    return null;
  }

  function productCheck(V) {
    var table = fitmentTable();
    if (!table) return;
    table.classList.add("as-fit-table");
    if (document.querySelector(".as-fit")) return;

    var rows = [].map.call(table.querySelectorAll("tbody tr"), function (tr) {
      var td = tr.querySelectorAll("td");
      var yrs = (td[2] && td[2].textContent.match(/\d{4}/g)) || [];
      return { make: td[0] && td[0].textContent.trim(), model: td[1] && td[1].textContent.trim(),
        from: yrs[0] ? +yrs[0] : null, to: yrs[1] ? +yrs[1] : yrs[0] ? +yrs[0] : null, tr: tr };
    });
    var skuMatch = (table.parentNode.textContent.match(/(?:رقم القطعة|Part number):\s*([A-Za-z0-9.\- ]+)/) || [])[1];
    var sku = skuMatch ? skuMatch.trim() : "";
    var title = (document.querySelector("h1") || {}).textContent || "";
    var car = getCar(), md = car && V.modelById[car.md], label = car ? carLabel(car, V) : "";

    // highlight the table rows for the saved car. Arabic rows match the model's short names; English
    // rows use catalogue spellings ("Camry", "ES350"), so they match loosely on make + model.
    var rowMatch = false;
    if (md) {
      var shorts = md.short.map(norm), mkAr = norm(md.make.ar), mkEn = simple(md.make.en);
      var mdEn = simple(md.en.replace(md.make.en, ""));
      rows.forEach(function (r) {
        var en = simple(r.model);
        var same = norm(r.make) === mkAr ? shorts.indexOf(norm(r.model)) >= 0
          : simple(r.make) === mkEn && !!en && !!mdEn && (en === mdEn || en.indexOf(mdEn) === 0 || mdEn.indexOf(en) === 0);
        if (!same || (car.yr && r.from && (car.yr < r.from || car.yr > r.to))) return;
        rowMatch = true; r.tr.classList.add("is-match");
      });
    }

    var meta = document.querySelector('meta[property="product:retailer_item_id"]');
    var productId = meta && meta.getAttribute("content");
    (md ? fitIndex(car.md) : Promise.resolve(null)).then(function (fit) {
      // the fitment index decides when it can (same answer as the product cards); otherwise the table rows
      var fits = md ? fitsCar(fit, productId, car) : null;
      var verdict = !md ? "none" : (fits === null ? rowMatch : fits) ? "yes" : "no";
      if (document.querySelector(".as-fit")) return;

      var ask = wa(T("السلام عليكم، أبي أتأكد من القطعة: ", "Hello, I'd like to confirm this part: ") + title.trim() +
        (sku ? T(" رقم ", ", part number ") + sku : "") + (label ? T(" لسيارتي ", " for my car ") + label : "") +
        T(". رقم الهيكل: ", ". VIN: ") + (store.get("vin", "") || ""));
      var order = '<a href="' + ask + '" target="_blank" rel="noopener">' + T("اطلب عبر واتساب", "Order on WhatsApp") + "</a>";
      var box = el("div", { class: "as-fit as-fit--" + verdict, role: "status" });
      if (verdict === "yes") {
        box.innerHTML = "<b>" + T("تناسب سيارتك", "Fits your car") + "</b> " + esc(label) + '<span class="as-fit-note">' +
          T("نتحقق من القطعة برقم الهيكل (VIN) مع طلبك.", "We check the part against your VIN with your order.") + "</span>";
      } else if (verdict === "no") {
        box.innerHTML = T("سيارتك " + esc(label) + " غير موجودة في جدول التوافق لهذه القطعة. ",
          "Your " + esc(label) + " isn't in this part's fitment table. ") +
          order + T(" ونتأكد لك برقم الهيكل.", " and we'll check it by VIN.");
      } else {
        box.innerHTML = '<a href="' + PRE + '/#as-car">' + T("اختر سيارتك", "Choose your car") + "</a>" +
          T(" ونبين لك إذا القطعة تناسبها، أو ", " to see if this part fits it, or ") + order +
          T(" مع رقم الهيكل.", " with your VIN.");
      }
      var h1 = document.querySelector("h1");
      var anchor = h1 && h1.offsetParent !== null ? h1 : table;
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
    });
  }

  // ---------- 4. product cards: does this part fit the saved car? ----------
  // A model category lists the model's parts for every year, so a 2016 RAV4 also sees 2006 parts.
  // data/fit/<model id>.json (mo-auto/tools/build_fit_index.py) maps product id -> year spans for
  // that model; each card says "fits your car" (green) or "does not fit your car" (neutral).
  var CARD = "[data-wishlist-btn][data-product-id]";
  // The theme renders product cards after load, and again on paging. Call fn(id, card, title) once
  // per card as cards appear; `key` marks the cards fn has already seen.
  function watchCards(key, fn) {
    var queued = false;
    function onChange() {
      if (queued || !document.querySelector(CARD)) return;
      queued = true;
      setTimeout(function () {                                   // batches bursts; still runs in background tabs
        queued = false;
        [].forEach.call(document.querySelectorAll(CARD), function (btn) {
          if (btn.hasAttribute(key)) return;
          var card = btn;
          while (card.parentElement && !card.querySelector("h3, h2")) card = card.parentElement;
          var title = card && card.querySelector("h3, h2");
          if (!title) return;
          btn.setAttribute(key, "");
          fn(btn.getAttribute("data-product-id"), card, title);
        });
      }, 50);
    }
    new MutationObserver(onChange).observe(document.body, { childList: true, subtree: true });
    onChange();
  }

  function cardBadges() {
    var car = getCar();
    if (!car || !car.md) return;
    watchCards("data-as-fit", function (id, card, title) {
      fitIndex(car.md).then(function (fit) {
        if (!fit) return;
        var fits = fitsCar(fit, id, car);
        var tag = el("span", { class: "as-card-fit" + (fits ? " is-yes" : "") },
          fits ? T("يناسب سيارتك", "Fits your car") : T("لا يناسب سيارتك", "Doesn't fit your car"));
        title.parentNode.insertBefore(tag, title);
      });
    });
  }

  // ---------- 5. product cards: part number ----------
  // data/sku/<first 2 chars of id>.json (mo-auto/tools/build_sku_index.py): id[:12] -> part number
  var skuCache = {};
  function skuShard(id) {
    var p = id.slice(0, 2);
    if (!skuCache[p]) {
      skuCache[p] = fetch(asset("data/sku/" + p + ".json"))
        .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    }
    return skuCache[p];
  }
  function cardSkus() {
    watchCards("data-as-sku", function (id, card, title) {
      if (!id) return;
      skuShard(id).then(function (map) {
        var sku = map[id.slice(0, 12)];
        if (!sku || card.querySelector(".as-card-sku")) return;
        var line = el("p", { class: "as-card-sku" }, T("رقم القطعة ", "Part no. "));
        line.appendChild(el("bdi", { dir: "ltr" }, esc(sku)));
        title.parentNode.insertBefore(line, title.nextSibling);
      });
    });
  }

  // ---------- logo ----------
  // Zid serves the uploaded logo as a 200px PNG, soft on high-density screens. Swap in the vector lockup
  // wherever that same image appears (header, menu drawer, footer).
  function sharpLogo() {
    var icon = el("link", { rel: "icon", type: "image/svg+xml", href: asset("logo/autospace-symbol.svg") });
    document.head.appendChild(icon);
    var head = document.querySelector('header a[href="/"] img, header a[href="/en/"] img, header a[href="/en"] img');
    if (!head) return;
    var png = head.getAttribute("src");
    [].forEach.call(document.querySelectorAll("img"), function (img) {
      if (img.getAttribute("src") !== png) return;
      img.src = asset(img.closest("footer") ? "logo/autospace-lockup-reversed.svg" : "logo/autospace-lockup.svg");
      img.removeAttribute("srcset");
    });
  }

  // ---------- category pages ----------
  // Parent categories (a make, a part group) hold their products in the subcategories, so the theme
  // shows "no products" under the subcategory tiles. Hide that box when tiles are there to pick from.
  function tidyCategoryPage() {
    if (!/^\/categories\//.test(PATH)) return;
    var box = document.querySelector("#products-content > .bg-secondary");
    var here = PATH.split("/")[2];
    var tiles = [].filter.call(document.querySelectorAll('a[href*="/categories/"]'), function (a) {
      return a.querySelector("h4") && a.getAttribute("href").indexOf("/categories/" + here) === -1;
    });
    if (box && tiles.length && !document.querySelector("#products-content [data-grid-root] > *")) box.hidden = true;
  }

  // ---------- footer ----------
  // The theme prints an empty store description and a "follow us" heading with no accounts under it.
  function tidyFooter() {
    var f = document.querySelector("footer");
    if (!f) return;
    [].forEach.call(f.querySelectorAll("p"), function (p) {
      if (!p.textContent.trim() && p.previousElementSibling && p.previousElementSibling.tagName === "IMG")
        p.textContent = T("قطع غيار لـ 30 شركة سيارات، أصلي أو تجاري. نتحقق من القطعة برقم الهيكل (VIN).",
          "Parts for 30 car makes, genuine or aftermarket. We check every part against your VIN.");
    });
    [].forEach.call(f.querySelectorAll("h3"), function (h) {
      var next = h.nextElementSibling;
      if (/^(تابعنا|Follow us)$/.test(h.textContent.trim()) && !(next && next.querySelector("a"))) {
        h.hidden = true;
        if (next) next.hidden = true;
      }
    });
    var tel = f.querySelector('a[href^="tel:"]');
    // contact lines read as plain text: no phone or envelope icons
    [].forEach.call(f.querySelectorAll('a[href^="tel:"], a[href^="mailto:"], a[href*="email-protection"]'), function (a) {
      [].forEach.call(a.parentElement.querySelectorAll("svg"), function (svg) { svg.remove(); });
    });
    if (tel) {
      tel.textContent = "+966 59 892 9096";
      tel.setAttribute("dir", "ltr");
    }
    if (tel && !f.querySelector(".as-foot-wa")) {
      var wa = el("a", { href: "https://wa.me/" + WHATSAPP, class: "as-foot-wa", target: "_blank", rel: "noopener" },
        T("اطلب عبر واتساب", "Order on WhatsApp"));
      tel.parentElement.parentElement.appendChild(wa);
    }
    // the theme doesn't list custom pages, so the store policies get their own column
    var grid = f.querySelector(".theme-container > .grid");
    if (grid && !f.querySelector(".as-foot-pages")) {
      var ul = el("ul", { class: "mt-4 space-y-2" });
      [[T("سياسة الاستبدال والإرجاع", "Returns and exchanges"), 122800], [T("الشروط والأحكام", "Terms and conditions"), 122801],
        [T("سياسة الخصوصية", "Privacy policy"), 122802]].forEach(function (p) {
        var li = el("li", {});
        li.appendChild(el("a", { href: PRE + "/pages/" + p[1] }, p[0]));
        ul.appendChild(li);
      });
      var col = el("div", { class: "as-foot-pages" });
      col.appendChild(el("h3", {}, T("سياسات المتجر", "Store policies")));
      col.appendChild(ul);
      grid.appendChild(col);
    }
  }

  // ---------- policy pages ----------
  // The page editor saves plain lines; a short line with no bullet and no full stop is a section heading.
  function tidyPolicyPage() {
    if (PATH.indexOf("/pages/") !== 0) return;
    [].forEach.call(document.querySelectorAll(".prose > p"), function (p) {
      var t = p.textContent.trim();
      if (t && t.length < 40 && t.charAt(0) !== "•" && !/[.:،]$/.test(t)) p.classList.add("as-policy-h");
    });
  }

  // ---------- WhatsApp links ----------
  // Theme links (menu, homepage block) open an empty chat; start it with the request and the saved car.
  function prefillWhatsApp(V) {
    var car = getCar();
    var label = car ? carLabel(car, V) : "";
    var text = T("السلام عليكم، أبحث عن قطعة" + (label ? " لسيارتي " + label : " لسيارتي") + ". رقم الهيكل (VIN): ",
      "Hello, I'm looking for a part for my car" + (label ? " " + label : "") + ". VIN: ");
    [].forEach.call(document.querySelectorAll('a[href*="wa.me/"]'), function (a) {
      if (a.href.indexOf("text=") === -1) a.href = wa(text);
    });
  }

  // ---------- English links ----------
  // Menu items saved as full addresses (https://autospace.sa/categories/...) drop the /en prefix,
  // so an English visitor lands on the Arabic page. Keep them in English.
  function localizeLinks() {
    if (!EN) return;
    [].forEach.call(document.querySelectorAll('a[href^="https://autospace.sa/"], a[href^="http://autospace.sa/"]'), function (a) {
      var u = new URL(a.href);
      if (/^\/en(\/|$)/.test(u.pathname)) return;
      u.pathname = "/en" + u.pathname;
      a.href = u.toString();
    });
  }

  // ---------- search results ----------
  // The theme's live search prints "From 96.00" in English on the Arabic store.
  function arabicSearchPrices() {
    var box = document.getElementById("search-dialog");
    if (!box || document.documentElement.lang.indexOf("ar") !== 0) return;
    new MutationObserver(function () {
      [].forEach.call(box.querySelectorAll("p"), function (p) {
        var t = p.firstChild;
        if (t && t.nodeType === 3 && /^\s*From\s/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/From\s/, "من ");
      });
    }).observe(box, { childList: true, subtree: true });
  }

  // Zid's search matches the whole phrase, so "فحمات كامري" (part + car) finds nothing. When the query
  // names a model, search for the rest inside that model's category: /categories/<model>?q=<part>.
  function spaced(s) {                                           // norm() that keeps word breaks
    return " " + String(s || "").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
      .replace(/ة/g, "ه").toLowerCase().replace(/[^؀-ۿa-z0-9]+/g, " ").trim() + " ";
  }
  function carInQuery(q, V) {
    var text = spaced(q), best = null;
    V.makes.forEach(function (mk) {
      mk.models.forEach(function (md) {
        var en = md.en.indexOf(mk.en + " ") === 0 ? md.en.slice(mk.en.length + 1) : md.en;
        (md.short || []).concat([md.ar, md.en, en]).forEach(function (alias) {
          var a = spaced(alias);
          if (a.length < 5 || text.indexOf(a) === -1) return;    // 3+ letters, whole words only
          // longest alias wins; on a tie prefer the model whose make is also named
          var score = a.length * 10 + (text.indexOf(spaced(mk.ar)) > -1 || text.indexOf(spaced(mk.en)) > -1 ? 1 : 0);
          if (!best || score > best.score) best = { md: md, alias: a, score: score };
        });
      });
    });
    if (!best) return null;
    // drop the model, make and year words from the customer's own words (not the normalised copy,
    // which Zid's search may not match: "شمعه" vs "شمعة")
    var words = String(q).trim().split(/\s+/), keys = words.map(function (w) { return spaced(w).trim(); });
    [best.alias, spaced(best.md.make.ar), spaced(best.md.make.en)].forEach(function (a) {
      var t = a.trim().split(" ");
      for (var i = 0; i + t.length <= keys.length; i++) {
        if (t.every(function (x, j) { return keys[i + j] === x; })) { keys.splice(i, t.length); words.splice(i, t.length); return; }
      }
    });
    var part = words.filter(function (w, i) { return keys[i] && !/^(19|20)\d\d$/.test(keys[i]); }).join(" ");
    return { md: best.md, part: part };
  }
  function carSearchUrl(q, V) {
    var hit = q && carInQuery(q, V);
    if (!hit) return null;
    // page_size=100: every match on one page, so sortSearchCards() can put the closest matches first
    return PRE + "/categories/" + hit.md.id + (hit.part ? "?q=" + encodeURIComponent(hit.part) + "&page_size=100" : "");
  }
  // Zid lists search matches in catalogue order ("كلبسات فحمات" before "طقم فحمات فرامل"). Put names that
  // hold every searched word first, then the parts with the most listings (the common part, not an
  // accessory of it), keeping Zid's order otherwise.
  function sortSearchCards(q) {
    var want = spaced(q).trim().split(" ");
    var grid = document.querySelector("#products-content [data-grid-root]");
    if (!grid || grid.hasAttribute("data-as-sorted")) return;
    var items = [].slice.call(grid.children).map(function (item, i) {
      var h = item.querySelector("h3, h2");
      var name = h ? spaced(h.textContent) : "";
      return { item: item, i: i, name: name, all: want.every(function (w) { return name.indexOf(" " + w + " ") > -1; }) };
    });
    var count = {};
    items.forEach(function (x) { count[x.name] = (count[x.name] || 0) + 1; });
    items.sort(function (a, b) {
      return (b.all - a.all) || (count[b.name] - count[a.name]) || (a.i - b.i);
    });
    grid.setAttribute("data-as-sorted", "");
    items.forEach(function (x) { grid.appendChild(x.item); });
  }
  function carSearch(V) {
    // results page reached some other way (live search Enter, shared link): redirect once loaded
    var q = new URLSearchParams(location.search).get("q");
    if (PATH === "/products" && q) {
      var url = carSearchUrl(q, V);
      if (url) { location.replace(url); return true; }
    }
    // search box submit: go straight to the model page
    document.addEventListener("submit", function (e) {
      var input = e.target && e.target.querySelector && e.target.querySelector('input[name="q"]');
      var url = input && carSearchUrl(input.value, V);
      if (!url) return;
      e.preventDefault();
      location.href = url;
    }, true);
    // on the model page, say what the list is filtered by
    var m = PATH.match(/^\/categories\/(\d+)/), md = m && V.modelById[m[1]];
    if (md && q && !document.querySelector(".as-searchbar")) {
      var bar = el("div", { class: "as-searchbar" },
        "<p>" + T("نتائج «" + esc(q) + "» لسيارة " + esc(nm(md)), "Results for “" + esc(q) + "” on the " + esc(nm(md))) + "</p>");
      bar.appendChild(el("a", { href: PRE + "/categories/" + md.id }, T("كل قطع ", "All parts for ") + esc(modelShort(md))));
      var head = document.querySelector("main h1");
      if (head) head.parentNode.insertBefore(bar, head.nextSibling);
      sortSearchCards(q);
    }
    return false;
  }

  // Zid's search matches names only, not part numbers. When a search finds nothing,
  // offer to look the part up on WhatsApp with the query and the saved car already written.
  function emptySearch(V) {
    var q = new URLSearchParams(location.search).get("q");
    if (!q || PATH !== "/products") return;
    var h = [].filter.call(document.querySelectorAll("h3"), function (x) {
      return /^(لم يتم العثور على نتائج|No results found)$/.test(x.textContent.trim());
    })[0];
    if (!h || document.querySelector(".as-nofind")) return;
    var car = getCar();
    var label = car && V ? carLabel(car, V) : "";
    var isNumber = /\d{3}/.test(q) && /^[A-Za-z0-9\- ]+$/.test(q);
    var text = T("السلام عليكم، أبحث عن " + (isNumber ? "القطعة رقم " : "") + q.trim() +
        (label ? " لسيارتي " + label : "") + ". رقم الهيكل (VIN): ",
      "Hello, I'm looking for " + (isNumber ? "part number " : "") + q.trim() +
        (label ? " for my car " + label : "") + ". VIN: ");
    var box = el("div", { class: "as-nofind" },
      "<p>" + (isNumber ? T("ما ظهر رقم القطعة في البحث؟", "Part number not showing up?") : T("ما لقيت القطعة؟", "Can't find the part?")) +
      T(" أرسل طلبك عبر واتساب مع رقم الهيكل (VIN)، ونتحقق منها ونوفرها لك.",
        " Send your request on WhatsApp with your VIN, and we'll check the part and get it for you.") + "</p>");
    box.appendChild(el("a", { href: wa(text), class: "as-btn", target: "_blank", rel: "noopener" }, T("اطلب عبر واتساب", "Order on WhatsApp")));
    h.parentElement.appendChild(box);
  }

  // ---------- boot ----------
  function boot() {
    arabicSearchPrices();
    localizeLinks();
    loadCss();
    sharpLogo();
    tidyCategoryPage();
    tidyFooter();
    tidyPolicyPage();
    cardSkus();
    vehicles().then(function (V) {
      if (carSearch(V)) return;                                  // leaving for the model page
      chipV = V;
      renderChip();
      buildPicker(V);
      productCheck(V);
      cardBadges();
      prefillWhatsApp(V);
      emptySearch(V);
    }).catch(function (e) {
      // data unavailable or a theme change broke a step: the store works without the extras
      if (window.console) console.warn("autospace:", e);
      emptySearch(null);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
