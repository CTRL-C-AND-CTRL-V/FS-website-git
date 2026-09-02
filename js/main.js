/* ============================================================
   FlexiSpace — Main JavaScript
   Powered by Bill Buddy
   Mirrors the FlexiRates analytics + form pattern, adapted to
   the FlexiSpace single-page DOM.
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     Utility helpers
     ---------------------------------------------------------- */
  function $(selector, context) {
    return (context || document).querySelector(selector);
  }
  function $$(selector, context) {
    return Array.prototype.slice.call((context || document).querySelectorAll(selector));
  }

  /* Analytics helper — sends a custom event (with optional properties) to
     Plausible if it is loaded. Safe no-op if the script is blocked/absent. */
  function track(name, props) {
    try {
      if (typeof window.plausible === 'function') {
        window.plausible(name, props ? { props: props } : undefined);
      }
    } catch (e) { /* never let analytics break the page */ }
  }

  /* ----------------------------------------------------------
     1. Mobile nav toggle
     ---------------------------------------------------------- */
  function initMobileMenu() {
    var toggle = $('.nav-toggle');
    var navMenu = document.getElementById('nav-menu');
    if (!toggle || !navMenu) return;

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      navMenu.classList.toggle('nav-links--open', !open);
      if (!open) track('Menu Open', { page: window.location.pathname });
    });

    // Close when a link inside the menu is clicked
    $$('a', navMenu).forEach(function (a) {
      a.addEventListener('click', function () {
        toggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('nav-links--open');
      });
    });
  }

  /* ----------------------------------------------------------
     2. Contact / enquiry form — validation, Web3Forms submit,
        and conversion analytics.
     ---------------------------------------------------------- */
  function initContactForm() {
    var form = $('.contact-form');
    if (!form) return;

    var successMsg = $('#form-success');
    var formError = $('#form-error');
    var path = window.location.pathname;

    // Form-start event — fired once, on first interaction, for abandonment analysis.
    var formStarted = false;
    form.addEventListener('focusin', function () {
      if (!formStarted) {
        formStarted = true;
        track('Demo Form Start', { page: path });
      }
    });

    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Native required-field validation (with a friendlier email check)
      var isValid = true;
      $$('[required]', form).forEach(function (field) {
        field.classList.remove('error');
        if (!field.value.trim()) {
          field.classList.add('error');
          isValid = false;
        } else if (field.type === 'email' && !validateEmail(field.value.trim())) {
          field.classList.add('error');
          isValid = false;
        }
      });

      if (!isValid) {
        var firstError = form.querySelector('.error');
        if (firstError) firstError.focus();
        return;
      }

      var industry = (document.getElementById('f-industry') || {}).value || 'unknown';

      // Submit to Web3Forms — emails the submission to the address tied to the
      // access_key (sales@billbuddy.com). No backend of our own required.
      var submitBtn = form.querySelector('[type="submit"]');
      var originalLabel = submitBtn ? submitBtn.textContent : '';
      if (formError) { formError.style.display = 'none'; formError.textContent = ''; }
      if (submitBtn) { submitBtn.textContent = 'Sending…'; submitBtn.disabled = true; }

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.success) {
            // Conversion event — only on a confirmed successful send. No PII sent.
            track('Enquiry', { industry: industry, page: path });
            form.style.display = 'none';
            if (successMsg) successMsg.classList.add('visible');
          } else {
            throw new Error((result.data && result.data.message) || 'Submission failed');
          }
        })
        .catch(function () {
          track('Enquiry Error', { page: path });
          if (submitBtn) { submitBtn.textContent = originalLabel; submitBtn.disabled = false; }
          if (formError) {
            formError.textContent =
              'Sorry — something went wrong sending your enquiry. Please email sales@billbuddy.com or try again.';
            formError.style.display = 'block';
          }
        });
    });
  }

  /* ----------------------------------------------------------
     3. Analytics — CTA clicks, nav clicks, scroll depth
        (page views + outbound links + file downloads are handled
        by the Plausible script tag in the page <head>).
     ---------------------------------------------------------- */
  function initAnalytics() {
    var path = window.location.pathname;

    function locationOf(el) {
      if (el.closest('.site-header')) return 'nav';
      if (el.closest('.nav-links')) return 'mobile-nav';
      if (el.closest('.hero')) return 'hero';
      if (el.closest('.cta-band')) return 'final-cta';
      if (el.closest('.payments')) return 'payments';
      if (el.closest('.site-footer')) return 'footer';
      return 'body';
    }
    function labelOf(el) {
      return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    }
    function destOf(link) {
      var href = link.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) {
        return href;
      }
      try { return new URL(href, window.location.href).pathname; } catch (e) { return href; }
    }

    // Single delegated click handler with clear precedence (first match wins).
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      var loc = locationOf(link);

      // 1) Email / phone links (not covered by outbound-links)
      if (href.indexOf('mailto:') === 0) { track('Email Click', { location: loc, page: path }); return; }
      if (href.indexOf('tel:') === 0) { track('Phone Click', { location: loc, page: path }); return; }

      // 2) Merchant portal login
      if (/merchant/i.test(link.getAttribute('aria-label') || '') || /merchant login/i.test(labelOf(link))) {
        track('Merchant Login Click', { location: loc, page: path });
        return;
      }

      // 3) Primary conversion CTA — anything pointing at the contact section
      if (href === '#contact') {
        track('CTA: Contact', { location: loc, label: labelOf(link), page: path });
        return;
      }

      // 4) Secondary CTAs / buttons
      if (link.matches('.btn')) {
        track('CTA Click', { label: labelOf(link) || destOf(link), destination: destOf(link), location: loc, page: path });
        return;
      }

      // 5) Nav / footer wayfinding links
      if (link.closest('.site-header') || link.closest('.nav-links') || link.closest('.site-footer')) {
        track('Nav Click', { label: labelOf(link) || destOf(link), destination: destOf(link), location: loc, page: path });
        return;
      }
    });

    // Scroll depth — once per threshold per page load
    var thresholds = [25, 50, 75, 90];
    var fired = {};
    window.addEventListener('scroll', function () {
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      var pct = (window.scrollY / scrollable) * 100;
      thresholds.forEach(function (t) {
        if (pct >= t && !fired[t]) {
          fired[t] = true;
          track('Scroll Depth', { percent: String(t), page: path });
        }
      });
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     Init on DOMContentLoaded
     ---------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initMobileMenu();
    initContactForm();
    initAnalytics();
  });
})();
