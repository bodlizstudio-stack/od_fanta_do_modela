(function () {
  "use strict";

  /* ==========================================================================
     1. STRIPE CHECKOUT KONFIGURACIJA IN NAKUPNI TOK
     ========================================================================== */
  // STRIPE PAYMENT LINK:
  // Nastavljena je delujoča povezava do varne blagajne Stripe za "Od Fanta do Modela" (24,99 € oz. 21,24 € s kodo GLOW-UP15).
  var PAY_URL = "https://buy.stripe.com/test_aFabJ10tuc7ceUm8yW0ZW00";

  var buyDialog = document.getElementById("buy");
  var buyForm = document.getElementById("bf");
  var emailInput = document.getElementById("em");
  var statusMsg = document.getElementById("bm");
  var closeBuyBtn = document.getElementById("bx");
  var directStripeBtn = document.getElementById("direct-stripe-btn");
  var paySubmitBtn = document.getElementById("pay-submit-btn");

  var promoInput = document.getElementById("promo-input");
  var applyPromoBtn = document.getElementById("apply-promo-btn");
  var promoFeedback = document.getElementById("promo-feedback");
  var dialogPriceDisplay = document.getElementById("dialog-price-display");
  var appliedPromoCode = "";

  function applyDiscountCode(code) {
    var clean = (code || "").trim().toUpperCase();
    if (clean === "GLOW-UP15" || clean === "GLOWUP15") {
      appliedPromoCode = "GLOW-UP15";
      if (promoFeedback) {
        promoFeedback.className = "promo-feedback success";
        promoFeedback.innerHTML = "✓ Koda <strong>GLOW-UP15</strong> uveljavljena! -15 % popust (prihranek 3,75&nbsp;€)";
      }
      if (dialogPriceDisplay) {
        dialogPriceDisplay.innerHTML = "<del style=\"opacity:0.6;font-size:0.85em;margin-right:6px;\">24,99&nbsp;€</del> <span style=\"color:var(--green);font-weight:800;\">21,24&nbsp;€</span> <small>enkratno plačilo</small>";
      }
      if (paySubmitBtn) {
        paySubmitBtn.innerHTML = "<span>Nadaljuj na varno plačilo (21,24&nbsp;€)</span><span class=\"btn-arrow\" aria-hidden=\"true\">&rarr;</span>";
      }
      return true;
    } else if (clean.length > 0) {
      appliedPromoCode = "";
      if (promoFeedback) {
        promoFeedback.className = "promo-feedback error";
        promoFeedback.textContent = "Koda ni veljavna. Vpiši GLOW-UP15 za 15 % popust.";
      }
      if (dialogPriceDisplay) {
        dialogPriceDisplay.innerHTML = "24,99&nbsp;€ <small>enkratno plačilo</small>";
      }
      if (paySubmitBtn) {
        paySubmitBtn.innerHTML = "<span>Nadaljuj na varno plačilo (24,99&nbsp;€)</span><span class=\"btn-arrow\" aria-hidden=\"true\">&rarr;</span>";
      }
      return false;
    }
    return false;
  }

  if (applyPromoBtn && promoInput) {
    applyPromoBtn.addEventListener("click", function () {
      applyDiscountCode(promoInput.value);
    });
    promoInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        applyDiscountCode(promoInput.value);
      }
    });
  }

  if (directStripeBtn && PAY_URL) {
    directStripeBtn.href = PAY_URL;
  }

  function openCheckoutModal(e) {
    if (e) e.preventDefault();
    closeMobileMenu();
    if (!buyDialog) return;

    statusMsg.textContent = "";
    statusMsg.className = "msg";

    if (!appliedPromoCode) {
      if (paySubmitBtn) {
        paySubmitBtn.disabled = false;
        paySubmitBtn.innerHTML = "<span>Nadaljuj na varno plačilo (24,99&nbsp;€)</span><span class=\"btn-arrow\" aria-hidden=\"true\">&rarr;</span>";
      }
      if (dialogPriceDisplay) {
        dialogPriceDisplay.innerHTML = "24,99&nbsp;€ <small>enkratno plačilo</small>";
      }
    } else {
      if (paySubmitBtn) {
        paySubmitBtn.disabled = false;
        paySubmitBtn.innerHTML = "<span>Nadaljuj na varno plačilo (21,24&nbsp;€)</span><span class=\"btn-arrow\" aria-hidden=\"true\">&rarr;</span>";
      }
    }

    if (typeof buyDialog.showModal === "function") {
      buyDialog.showModal();
    } else {
      buyDialog.setAttribute("open", "");
    }

    setTimeout(function () {
      if (emailInput) emailInput.focus();
    }, 60);
  }

  function closeCheckoutModal() {
    if (!buyDialog) return;
    if (typeof buyDialog.close === "function") {
      buyDialog.close();
    } else {
      buyDialog.removeAttribute("open");
    }
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-buy]");
    if (trigger) {
      openCheckoutModal(e);
    }
  });

  if (closeBuyBtn) {
    closeBuyBtn.addEventListener("click", closeCheckoutModal);
  }

  if (buyDialog) {
    buyDialog.addEventListener("click", function (e) {
      if (e.target === buyDialog) closeCheckoutModal();
    });
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  if (buyForm) {
    buyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var emailValue = emailInput ? emailInput.value.trim() : "";

      if (!isValidEmail(emailValue)) {
        statusMsg.className = "msg err";
        statusMsg.textContent = "Prosimo, vpiši veljaven e-naslov (npr. ime@primer.si).";
        if (emailInput) emailInput.focus();
        return;
      }

      if (!PAY_URL) {
        statusMsg.className = "msg";
        statusMsg.textContent = "Povezava do blagajne se pripravlja.";
        return;
      }

      var separator = PAY_URL.indexOf("?") > -1 ? "&" : "?";
      var checkoutUrl = PAY_URL + separator + "prefilled_email=" + encodeURIComponent(emailValue);

      if (appliedPromoCode) {
        checkoutUrl += "&prefilled_promo_code=" + encodeURIComponent(appliedPromoCode);
      }

      if (paySubmitBtn) {
        paySubmitBtn.disabled = true;
        paySubmitBtn.innerHTML = "<span>Preusmerjam na Stripe &hellip;</span>";
      }

      statusMsg.className = "msg";
      statusMsg.innerHTML = "Preusmerjam na varno blagajno Stripe &hellip;<br><a href=\"" + checkoutUrl + "\" style=\"color:var(--green);text-decoration:underline;display:inline-block;margin-top:8px;font-size:0.86rem;\">Če se stran ne naloži samodejno v nekaj sekundah, klikni tukaj &rarr;</a>";

      // Zanesljiva preusmeritev brez blokiranja pojavnih oken (podprto na iOS, Android in desktop)
      setTimeout(function () {
        window.location.href = checkoutUrl;
      }, 350);
    });
  }

  /* ==========================================================================
     2. MOBILNA NAVIGACIJA
     ========================================================================== */
  var menuToggle = document.querySelector(".menu-toggle");
  var mobileMenu = document.getElementById("mobile-menu");

  function closeMobileMenu() {
    if (!menuToggle || !mobileMenu) return;
    menuToggle.setAttribute("aria-expanded", "false");
    mobileMenu.hidden = true;
  }

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", function () {
      var isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!isExpanded));
      mobileMenu.hidden = isExpanded;
    });

    document.querySelectorAll("[data-nav-close]").forEach(function (link) {
      link.addEventListener("click", closeMobileMenu);
    });
  }

  /* ==========================================================================
     3. INTERAKTIVNI PREGLEDOVALNIK POGLAVIJ PRODUKTA (SEKCIJA 4)
     ========================================================================== */
  var chapterTabs = document.querySelectorAll(".chapter-tab");
  var spreadPanels = document.querySelectorAll(".spread-content");

  function activateTab(selectedTab) {
    var targetId = selectedTab.getAttribute("data-tab");

    chapterTabs.forEach(function (tab) {
      var isMatch = tab === selectedTab;
      tab.classList.toggle("active", isMatch);
      tab.setAttribute("aria-selected", String(isMatch));
    });

    spreadPanels.forEach(function (panel) {
      var isMatch = panel.id === "panel-" + targetId;
      panel.classList.toggle("active", isMatch);
      panel.hidden = !isMatch;
    });
  }

  chapterTabs.forEach(function (tab, idx) {
    tab.addEventListener("click", function () {
      activateTab(tab);
    });

    tab.addEventListener("keydown", function (e) {
      var nextIndex = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        nextIndex = (idx + 1) % chapterTabs.length;
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        nextIndex = (idx - 1 + chapterTabs.length) % chapterTabs.length;
      }
      if (nextIndex !== null) {
        e.preventDefault();
        chapterTabs[nextIndex].focus();
        activateTab(chapterTabs[nextIndex]);
      }
    });
  });

  /* ==========================================================================
     4. SUBTILNE ANIMACIJE OB POMIKANJU (SCROLL REVEAL)
     ========================================================================== */
  var revealElements = document.querySelectorAll(".reveal");
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealElements.forEach(function (el) {
      el.classList.add("in-view");
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var delay = parseInt(entry.target.getAttribute("data-delay") || "0", 10);
            setTimeout(function () {
              entry.target.classList.add("in-view");
            }, delay);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ==========================================================================
     5. PAMETNA MOBILNA VRSTICA ZA NAKUP (STICKY MOBILE CTA)
     ========================================================================== */
  var stickyCta = document.getElementById("mobile-sticky-cta");
  var pricingSection = document.getElementById("ponudba");
  var isPricingVisible = false;

  if (stickyCta && pricingSection && "IntersectionObserver" in window) {
    var pricingObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          isPricingVisible = entry.isIntersecting;
          updateStickyCta();
        });
      },
      { threshold: 0.2 }
    );
    pricingObserver.observe(pricingSection);
  }

  function updateStickyCta() {
    if (!stickyCta) return;
    var scrolledPastHero = window.scrollY > 560;
    var shouldShow = scrolledPastHero && !isPricingVisible;
    stickyCta.classList.toggle("visible", shouldShow);
    stickyCta.setAttribute("aria-hidden", String(!shouldShow));
  }

  window.addEventListener("scroll", updateStickyCta, { passive: true });
  updateStickyCta();

  /* ==========================================================================
     6. PRAVNE INFORMACIJE MODAL (POGOJI NAKUPA, ZASEBNOST, ODGOVORNOST)
     ========================================================================== */
  var legalDialog = document.getElementById("legal-dialog");
  var legalTitle = document.getElementById("legal-title");
  var legalContent = document.getElementById("legal-content");
  var legalClose = document.getElementById("legal-close");

  var legalDocs = {
    terms: {
      title: "Splošni pogoji nakupa",
      html:
        "<p><strong>1. Ponudnik in predmet prodaje:</strong> Predmet prodaje je digitalni vodič »Od Fanta do Modela« v obliki PDF e-knjige (94 strani). Pred javno objavo strani tukaj vnesi polne podatke izdajatelja/podjetja (Naziv, naslov, matična in davčna številka, kontaktni e-naslov).</p>" +
        "<p><strong>2. Cena in plačilo:</strong> Redna cena digitalnega programa znaša 24,99 € (ob uporabi promocijske kode GLOW-UP15 se obračuna 15 % popust na 21,24 €) in predstavlja enkratno plačilo brez naročnine. Plačilo se izvede prek varnega plačilnega sistema Stripe.</p>" +
        "<p><strong>3. Dostava digitalne vsebine:</strong> Po uspešno zaključenem plačilu kupec prejme dostop do digitalne e-knjige v PDF formatu na posredovani e-naslov.</p>" +
        "<p><strong>4. Pravica do odstopa pri digitalni vsebini:</strong> V skladu z Zakonom o varstvu potrošnikov (ZVPot-1) kupec pri nakupu digitalne vsebine, ki se ne dobavi naotipljivem nosilcu podatkov, po začetku prenosa/dostopa nima pravice do odstopa od pogodbe, če je predhodno podal izrecno soglasje za takojšnjo dobavo.</p>" +
        "<p><strong>5. Avtorske pravice:</strong> E-knjiga je namenjena izključno osebni uporabi kupca. Kopiranje, deljenje ali nadaljnja prodaja datoteke tretjim osebam ni dovoljena.</p>"
    },
    privacy: {
      title: "Politika zasebnosti",
      html:
        "<p><strong>1. Upravljavec podatkov:</strong> [Vnesi naziv podjetja/s.p. in kontaktni e-naslov].</p>" +
        "<p><strong>2. Katere podatke zbiramo:</strong> Ob nakupu zbiramo vaš e-naslov (za namen dostave digitalnega produkta in potrditve naročila) ter podatke o transakciji, ki jih varno obdeluje ponudnik plačilnih storitev Stripe.</p>" +
        "<p><strong>3. Namen obdelave:</strong> Vaš e-naslov uporabljamo izključno za izvedbo naročila, dostavo digitalnega vodiča in morebitno podporo kupcem. Brez vaše izrecne privolitve vam ne pošiljamo neželenih promocijskih sporočil.</p>" +
        "<p><strong>4. Vaše pravice:</strong> Kadarkoli lahko zahtevate vpogled, popravek ali izbris svojih osebnih podatkov s sporočilom na naš kontaktni e-naslov.</p>"
    },
    disclaimer: {
      title: "Omejitev odgovornosti",
      html:
        "<p><strong>Izobraževalna narava vsebine:</strong> Digitalni program »Od Fanta do Modela« je namenjen izključno splošnemu informiranju, izobraževanju in osebni motivaciji.</p>" +
        "<p><strong>Zdravstveno opozorilo:</strong> Informacije o vadbi, prehrani, spanju in negi kože v tem vodiču ne predstavljajo zdravniškega, fizioterapevtskega ali kliničnega prehranskega svetovanja. Pred začetkom novega vadbenega ali prehranskega režima se v primeru zdravstvenih posebnosti posvetujte z zdravnikom.</p>" +
        "<p><strong>Individualni rezultati:</strong> Osebni napredek pri telesni pripravljenosti, videzu in počutju je odvisen od posameznikovega izhodišča, doslednosti in življenjskega sloga, zato konkretnih rezultatov ni mogoče vnaprej jamčiti.</p>"
    }
  };

  document.querySelectorAll("[data-legal-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.getAttribute("data-legal-open");
      var doc = legalDocs[key];
      if (!doc || !legalDialog) return;

      legalTitle.textContent = doc.title;
      legalContent.innerHTML = doc.html;

      if (typeof legalDialog.showModal === "function") {
        legalDialog.showModal();
      } else {
        legalDialog.setAttribute("open", "");
      }
    });
  });

  if (legalClose && legalDialog) {
    legalClose.addEventListener("click", function () {
      if (typeof legalDialog.close === "function") {
        legalDialog.close();
      } else {
        legalDialog.removeAttribute("open");
      }
    });

    legalDialog.addEventListener("click", function (e) {
      if (e.target === legalDialog) {
        if (typeof legalDialog.close === "function") {
          legalDialog.close();
        } else {
          legalDialog.removeAttribute("open");
        }
      }
    });
  }
})();
