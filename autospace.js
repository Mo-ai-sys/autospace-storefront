/* AutoSpace storefront additions for the Zid Growth theme.
 * Loaded by a one-line loader in Zid's custom JS editor; served from jsDelivr.
 *   1. Car picker under the homepage hero (#as-car): make, model, year, and a VIN reader.
 *   2. Car chip in the header: the saved car, one tap back to its parts.
 *   3. Product pages: "fits your car" check against the fitment table in the description,
 *      and a WhatsApp link that carries the part number and the car.
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
  function carLabel(car, V) {
    var md = car && V.modelById[car.md];
    if (!md) return "";
    return md.ar + (car.yr ? " " + car.yr : "");
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
        '<div class="as-head"><h2 id="as-car-title">اختر سيارتك</h2>' +
        '<p>نعرض لك القطع التي تناسبها.</p></div>' +
        '<div class="as-fields">' +
          '<label class="as-field"><span>الشركة</span><select data-f="mk"></select></label>' +
          '<label class="as-field"><span>الموديل</span><select data-f="md" disabled></select></label>' +
          '<label class="as-field"><span>السنة</span><select data-f="yr" disabled></select></label>' +
          '<button type="button" class="as-btn" data-go disabled>اعرض القطع</button>' +
        "</div>" +
        '<form class="as-vin" novalidate>' +
          '<label for="as-vin-input">عندك رقم الهيكل (VIN)؟</label>' +
          '<div class="as-vin-row"><input id="as-vin-input" maxlength="20" dir="ltr" autocomplete="off" ' +
            'spellcheck="false" placeholder="17 خانة" inputmode="latin">' +
          '<button type="submit" class="as-btn-ghost">اقرأ الرقم</button></div>' +
          '<p class="as-vin-out" role="status" aria-live="polite"></p>' +
        "</form>" +
      "</div>");
    hero.parentNode.insertBefore(sec, hero.nextSibling);

    var sMk = sec.querySelector('[data-f="mk"]'), sMd = sec.querySelector('[data-f="md"]'),
      sYr = sec.querySelector('[data-f="yr"]'), go = sec.querySelector("[data-go]");

    function fillMakes(sel) {
      sMk.innerHTML = '<option value="">اختر الشركة</option>' + V.makes.map(function (mk) {
        return '<option value="' + mk.id + '"' + (mk.id === sel ? " selected" : "") + ">" + esc(mk.ar) + "</option>";
      }).join("");
    }
    function fillModels(mkId, sel) {
      var mk = V.makeById[mkId];
      sMd.disabled = !mk;
      sMd.innerHTML = '<option value="">اختر الموديل</option>' + (mk ? mk.models.map(function (md) {
        var short = md.ar.indexOf(mk.ar + " ") === 0 ? md.ar.slice(mk.ar.length + 1) : md.ar;
        return '<option value="' + md.id + '"' + (md.id === sel ? " selected" : "") + ">" + esc(short) + "</option>";
      }).join("") : "");
    }
    function fillYears(mdId, sel) {
      var ys = yearsFor(V.modelById[mdId]);
      sYr.disabled = !ys.length;
      sYr.innerHTML = '<option value="">كل السنوات</option>' + ys.map(function (y) {
        return '<option value="' + y + '"' + (y === sel ? " selected" : "") + ">" + y + "</option>";
      }).join("");
    }
    function sync(car) {
      fillMakes(car && car.mk); fillModels(car && car.mk, car && car.md); fillYears(car && car.md, car && car.yr);
      go.disabled = !(car && car.md);
    }
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
      location.href = "/categories/" + car.md;
    });

    // VIN reader
    var form = sec.querySelector(".as-vin"), input = sec.querySelector("#as-vin-input"),
      out = sec.querySelector(".as-vin-out");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      out.className = "as-vin-out"; out.textContent = "نقرأ رقم الهيكل...";
      vinDecoder().then(function (MoVIN) {
        if (!MoVIN) { out.textContent = "تعذر قراءة الرقم الآن. اختر سيارتك من القوائم."; return; }
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
        out.textContent = "رقم الهيكل 17 خانة، ولا يحتوي على الحروف I و O و Q.";
        return;
      }
      store.set("vin", d.vin);
      var mk = d.make && matchMake(d.make);
      if (!mk) {
        out.innerHTML = (d.make ? "سيارتك " + esc(d.make) + "، وهذه الشركة غير موجودة في المتجر حالياً. " : "ما قدرنا نحدد الشركة من هذا الرقم. ") +
          '<a href="' + wa("السلام عليكم، أبحث عن قطعة لسيارتي. رقم الهيكل: " + d.vin) + '" target="_blank" rel="noopener">اطلب عبر واتساب</a>';
        return;
      }
      var md = d.model ? matchModel(mk, d.model) : null;
      var ys = md ? yearsFor(md) : [];
      var yr = d.year && d.yearSure && ys.indexOf(d.year) >= 0 ? d.year : null;
      sync({ mk: mk.id, md: md ? md.id : null, yr: yr });
      if (md) setCar({ mk: mk.id, md: md.id, yr: yr });
      var parts = [mk.ar, md ? md.ar.replace(mk.ar + " ", "") : null, yr].filter(Boolean).join("، ");
      out.innerHTML = "قرأنا من رقم الهيكل: <b>" + esc(parts) + "</b>. " +
        (!md ? "اختر الموديل من القائمة." : !yr ? "اختر السنة، أو اعرض القطع لكل السنوات." : "سيارتك جاهزة.");
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
      chip = el("a", { class: "as-chip" });
      if (window.matchMedia("(max-width: 767px)").matches) {
        // phones: the header has no room, so the chip sits in a slim bar under it
        var bar = el("div", { class: "as-chip-bar" });
        bar.appendChild(chip);
        header.parentNode.insertBefore(bar, header.nextSibling);
      } else {
        var nav = header.querySelector("nav") || header;
        nav.insertBefore(chip, nav.firstChild);
      }
    }
    var car = getCar(), label = car && carLabel(car, chipV);
    chip.href = label ? "/categories/" + car.md : "/#as-car";
    chip.textContent = label || "اختر سيارتك";
    chip.classList.toggle("is-set", !!label);
    chip.setAttribute("aria-label", label ? "سيارتك: " + label : "اختر سيارتك");
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

    var verdict = "none";
    if (md) {
      var shorts = md.short.map(norm), mkName = norm(md.make.ar);
      rows.forEach(function (r) {
        if (norm(r.make) !== mkName || shorts.indexOf(norm(r.model)) < 0) return;
        if (car.yr && r.from && (car.yr < r.from || car.yr > r.to)) return;
        verdict = "yes"; r.tr.classList.add("is-match");
      });
      if (verdict !== "yes") verdict = "no";
    }

    var ask = wa("السلام عليكم، أبي أتأكد من القطعة: " + title.trim() + (sku ? " رقم " + sku : "") +
      (label ? " لسيارتي " + label : "") + ". رقم الهيكل: " + (store.get("vin", "") || ""));
    var box = el("div", { class: "as-fit as-fit--" + verdict, role: "status" });
    if (verdict === "yes") {
      box.innerHTML = "<b>تناسب سيارتك</b> " + esc(label) + '<span class="as-fit-note">نتحقق من القطعة برقم الهيكل (VIN) مع طلبك.</span>';
    } else if (verdict === "no") {
      box.innerHTML = "سيارتك " + esc(label) + " غير موجودة في جدول التوافق لهذه القطعة. " +
        '<a href="' + ask + '" target="_blank" rel="noopener">اطلب عبر واتساب</a> ونتأكد لك برقم الهيكل.';
    } else {
      box.innerHTML = '<a href="/#as-car">اختر سيارتك</a> ونبين لك إذا القطعة تناسبها، أو ' +
        '<a href="' + ask + '" target="_blank" rel="noopener">اطلب عبر واتساب</a> مع رقم الهيكل.';
    }
    var h1 = document.querySelector("h1");
    var anchor = h1 && h1.offsetParent !== null ? h1 : table;
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }

  // ---------- logo ----------
  // Zid serves the uploaded logo as a 200px PNG, soft on high-density screens. Swap in the vector lockup
  // wherever that same image appears (header, menu drawer, footer).
  function sharpLogo() {
    var icon = el("link", { rel: "icon", type: "image/svg+xml", href: asset("logo/autospace-symbol.svg") });
    document.head.appendChild(icon);
    var head = document.querySelector('header a[href="/"] img');
    if (!head) return;
    var png = head.getAttribute("src");
    [].forEach.call(document.querySelectorAll("img"), function (img) {
      if (img.getAttribute("src") !== png) return;
      img.src = asset("logo/autospace-lockup.svg");
      img.removeAttribute("srcset");
    });
  }

  // ---------- category pages ----------
  // Parent categories (a make, a part group) hold their products in the subcategories, so the theme
  // shows "no products" under the subcategory tiles. Hide that box when tiles are there to pick from.
  function tidyCategoryPage() {
    if (!/^\/categories\//.test(location.pathname)) return;
    var box = document.querySelector("#products-content > .bg-secondary");
    var here = location.pathname.split("/")[2];
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
        p.textContent = "قطع غيار لـ 30 شركة سيارات، أصلي أو تجاري. نتحقق من القطعة برقم الهيكل (VIN).";
    });
    [].forEach.call(f.querySelectorAll("h3"), function (h) {
      var next = h.nextElementSibling;
      if (h.textContent.trim() === "تابعنا" && !(next && next.querySelector("a"))) {
        h.hidden = true;
        if (next) next.hidden = true;
      }
    });
    var tel = f.querySelector('a[href^="tel:"]');
    if (tel && !f.querySelector(".as-foot-wa")) {
      var wa = el("a", { href: "https://wa.me/" + WHATSAPP, class: "as-foot-wa", target: "_blank", rel: "noopener" }, "اطلب عبر واتساب");
      tel.parentElement.parentElement.appendChild(wa);
    }
  }

  // ---------- WhatsApp links ----------
  // Theme links (menu, homepage block) open an empty chat; start it with the request and the saved car.
  function prefillWhatsApp(V) {
    var car = getCar();
    var label = car ? carLabel(car, V) : "";
    var text = "السلام عليكم، أبحث عن قطعة" + (label ? " لسيارتي " + label : " لسيارتي") + ". رقم الهيكل (VIN): ";
    [].forEach.call(document.querySelectorAll('a[href*="wa.me/"]'), function (a) {
      if (a.href.indexOf("text=") === -1) a.href = wa(text);
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

  // ---------- boot ----------
  function boot() {
    arabicSearchPrices();
    loadCss();
    sharpLogo();
    tidyCategoryPage();
    tidyFooter();
    vehicles().then(function (V) {
      chipV = V;
      renderChip();
      buildPicker(V);
      productCheck(V);
      prefillWhatsApp(V);
    }).catch(function () { /* data unavailable: the store works without these extras */ });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
