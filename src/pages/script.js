/* ==========================================================================
   UNSTITCH — SHARED SCRIPT
   Handles the off-canvas menu sheet, opened from either the desktop header
   hamburger or the mobile bottom-nav "Menu" icon.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* ---- contact page: dynamic subject fields ----
     Reading ?category=xxx from the URL pre-selects that subject (so links
     like archive.html's "Become a Partner Today" land on the right one),
     and each subject reveals its own extra fields — everything else stays
     hidden so the form doesn't feel overwhelming. */
  const subjectSelect = document.querySelector('[data-subject-select]');
  if (subjectSelect) {
    const extraBlocks = Array.from(document.querySelectorAll('[data-subject-fields]'));

    const showFieldsFor = (value) => {
      extraBlocks.forEach((block) => {
        block.hidden = block.dataset.subjectFields !== value;
      });
    };

    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    if (category && [...subjectSelect.options].some((o) => o.value === category)) {
      subjectSelect.value = category;
      showFieldsFor(category);
    }

    subjectSelect.addEventListener('change', () => showFieldsFor(subjectSelect.value));

    const contactForm = document.getElementById('contact-form');
    contactForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = contactForm.querySelector('.form-feedback');
      const submitBtn = contactForm.querySelector('.contact-form__submit');
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      feedback.textContent = '';
      feedback.className = 'form-feedback';

      // Only the currently-visible subject block's fields go into
      // "details" — the other subjects' (hidden) inputs are ignored even
      // though they're still present in the DOM.
      const details = {};
      const activeBlock = extraBlocks.find((b) => !b.hidden);
      activeBlock?.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.name && el.value) details[el.name] = el.value;
      });

      const payload = {
        name: contactForm.querySelector('#cf-name')?.value.trim(),
        email: contactForm.querySelector('#cf-email')?.value.trim(),
        phone: contactForm.querySelector('#cf-phone')?.value.trim(),
        subject: subjectSelect.value,
        message: contactForm.querySelector('#cf-message')?.value.trim(),
        marketingOptIn: contactForm.querySelector('input[name="marketingOptIn"]')?.checked || false,
        details,
      };

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');

        contactForm.reset();
        showFieldsFor('');
        feedback.textContent = "Thanks — we'll be in touch soon.";
        feedback.classList.add('form-feedback--success');
      } catch (err) {
        feedback.textContent = err.message || 'Something went wrong. Please try again.';
        feedback.classList.add('form-feedback--error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  /* ---- generic hero carousel ----
     Works for any [data-carousel] container with [data-carousel-track],
     [data-carousel-slide] children, and optional prev/next/dots controls.
     Auto-advances, pauses on hover, no wraparound edge cases since it
     always loops (carousels are expected to loop, unlike the file modal). */
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
    if (slides.length < 2) return; // nothing to rotate
    const prevBtn = carousel.querySelector('[data-carousel-prev]');
    const nextBtn = carousel.querySelector('[data-carousel-next]');
    const dotsWrap = carousel.querySelector('[data-carousel-dots]');
    let index = Math.max(0, slides.findIndex((s) => s.classList.contains('is-active')));
    let timer = null;

    const dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel__dot';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap?.appendChild(dot);
      return dot;
    });

    const render = () => {
      slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    };

    const goTo = (i) => {
      index = (i + slides.length) % slides.length;
      render();
      resetTimer();
    };

    const resetTimer = () => {
      clearInterval(timer);
      timer = setInterval(() => goTo(index + 1), 6000);
    };

    prevBtn?.addEventListener('click', () => goTo(index - 1));
    nextBtn?.addEventListener('click', () => goTo(index + 1));
    carousel.addEventListener('mouseenter', () => clearInterval(timer));
    carousel.addEventListener('mouseleave', resetTimer);

    render();
    resetTimer();
  });

  /* ---- accordion (Learn page "Who is this for") ----
     One panel open at a time. Uses a CSS grid-template-rows 0fr->1fr
     transition rather than max-height, so it animates smoothly no matter
     how tall the content is — no JS height measurement needed. */
  document.querySelectorAll('[data-accordion-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const key = trigger.dataset.accordionTrigger;
      const panel = document.querySelector(`[data-accordion-panel="${key}"]`);
      const isOpen = panel?.classList.contains('is-open');
      const accordion = trigger.closest('.who-accordion');

      document.querySelectorAll('[data-accordion-panel]').forEach((p) => p.classList.remove('is-open'));
      document.querySelectorAll('[data-accordion-trigger]').forEach((t) => t.setAttribute('aria-expanded', 'false'));

      if (panel && !isOpen) {
        panel.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        accordion?.classList.add('is-any-open');
      } else {
        accordion?.classList.remove('is-any-open');
      }
    });
  });

  /* ---- ticker: clone the base phrase sequence until the track is wide
     enough for a seamless, gap-free loop at any viewport width ---- */
  const track = document.querySelector('[data-ticker-track]');
  if (track) {
    const baseHTML = track.innerHTML;
    const buildTicker = () => {
      track.innerHTML = baseHTML;
      const baseWidth = track.scrollWidth;
      const needed = window.innerWidth * 2.2; // comfortable safety margin
      let copies = 1;
      while (track.scrollWidth < needed || copies < 2) {
        track.insertAdjacentHTML('beforeend', baseHTML);
        copies++;
      }
      // must be an even number of copies so translateX(-50%) is a perfect loop
      if (copies % 2 !== 0) {
        track.insertAdjacentHTML('beforeend', baseHTML);
        copies++;
      }
      // keep the animation speed visually consistent regardless of length
      const pxPerSecond = 60;
      const totalWidth = track.scrollWidth / 2;
      track.style.animationDuration = `${totalWidth / pxPerSecond}s`;
    };
    buildTicker();
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(buildTicker, 200);
    });
  }

  /* ---- persistent/condensed header on scroll ----
     Below --header-scroll-threshold-- px, the header shows the full
     logo (mark + wordmark). Past it, it condenses: wordmark hides and
     the ABOUT/LEARN/CUSTOM/SHOP quick-links fade in on the left. */
  const header = document.querySelector('.site-header');
  const SCROLL_THRESHOLD = 80;
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > SCROLL_THRESHOLD);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- countdown timer ----
     Finds any element with [data-countdown][data-target="ISO-DATETIME"]
     and keeps its DD/HH/MM/SS digits updated every second.
     TO CHANGE THE DROP DATE: edit the data-target attribute in the HTML —
     nothing here needs to change. Example: data-target="2026-10-04T09:00:00+11:00" */
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const target = new Date(el.dataset.target).getTime();
    const daysEl = el.querySelector('[data-cd-days]');
    const hoursEl = el.querySelector('[data-cd-hours]');
    const minsEl = el.querySelector('[data-cd-mins]');
    const secsEl = el.querySelector('[data-cd-secs]');
    const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        daysEl.textContent = hoursEl.textContent = minsEl.textContent = secsEl.textContent = '00';
        el.classList.add('is-complete');
        clearInterval(timer);
        return;
      }
      const totalSeconds = Math.floor(diff / 1000);
      daysEl.textContent = pad(Math.floor(totalSeconds / 86400));
      hoursEl.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
      minsEl.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
      secsEl.textContent = pad(totalSeconds % 60);
    };
    tick();
    const timer = setInterval(tick, 1000);
  });

  /* ---- notify-me form: reveal email input when "Join the next drop" is clicked ----
     EASIEST WAY TO WIRE THIS UP FOR REAL: point the <form>'s action at a
     third-party email service's own form endpoint (Mailchimp, Klaviyo,
     ConvertKit all provide one) — no backend code needed. If you ever host
     on Netlify, add the attribute data-netlify="true" to the <form> instead
     and Netlify collects submissions for you automatically. */
  document.querySelectorAll('[data-notify-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.querySelector(btn.dataset.notifyToggle);
      if (!form) return;
      form.hidden = false;
      btn.hidden = true;
      form.querySelector('input')?.focus();
    });
  });

  /* ---- email signup forms: real submission to /api/subscribe ----
     Add data-subscribe-form to any <form> that should POST to the backend.
     Expects a Vercel Serverless Function at /api/subscribe (see that file
     for setup instructions) backed by Vercel Postgres. */
  document.querySelectorAll('[data-subscribe-form]').forEach((form) => {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.textContent : '';

    let feedback = form.nextElementSibling;
    if (!feedback || !feedback.classList.contains('form-feedback')) {
      feedback = document.createElement('p');
      feedback.className = 'form-feedback';
      feedback.setAttribute('role', 'status');
      form.insertAdjacentElement('afterend', feedback);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = form.querySelector('input[type="text"]');
      const emailInput = form.querySelector('input[type="email"]');
      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
      feedback.textContent = '';
      feedback.className = 'form-feedback';

      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, source: form.dataset.subscribeForm || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');

        form.reset();
        feedback.textContent = "You're on the list.";
        feedback.classList.add('form-feedback--success');
      } catch (err) {
        feedback.textContent = err.message || 'Something went wrong. Please try again.';
        feedback.classList.add('form-feedback--error');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
      }
    });
  });

  /* ---- material archive: file modal with prev/next navigation ----
     Each grid tile [data-open-material="00N"] opens the matching
     [data-material="00N"] panel inside the shared modal shell. Only one
     panel is visible at a time — prev/next just hide the current one and
     show its neighbour, keeping the overlay open throughout. No
     wraparound: prev/next disable themselves at the first/last file.
     Nav is a pair of hover zones built into each panel's own image row
     (see .material-modal__nav-zone), so there's no external fixed-
     position element to keep in sync with the card — hovering the left
     or right edge of the images reveals that direction's arrow. */
  const materialOverlay = document.querySelector('[data-material-overlay]');
  const materialShell = document.querySelector('[data-material-shell]');
  const materialScroll = document.querySelector('[data-material-scroll]');
  const materialClose = document.querySelector('[data-material-close]');
  const materialPrevZones = Array.from(document.querySelectorAll('[data-material-prev]'));
  const materialNextZones = Array.from(document.querySelectorAll('[data-material-next]'));
  const materialPanels = Array.from(document.querySelectorAll('.material-modal[data-material]'));

  if (materialShell && materialPanels.length) {
    let activeIndex = -1;
    let lastTrigger = null;

    const showPanel = (index) => {
      materialPanels.forEach((panel, i) => { panel.hidden = i !== index; });
      activeIndex = index;
      const atStart = index <= 0;
      const atEnd = index >= materialPanels.length - 1;
      materialPrevZones.forEach((btn) => { btn.disabled = atStart; });
      materialNextZones.forEach((btn) => { btn.disabled = atEnd; });
    };

    const openMaterial = (id, trigger) => {
      const index = materialPanels.findIndex((p) => p.dataset.material === id);
      if (index === -1) return;
      lastTrigger = trigger || null;
      showPanel(index);
      materialOverlay.hidden = false;
      materialShell.hidden = false;
      // next tick so the hidden->visible change doesn't eat the transition
      requestAnimationFrame(() => {
        materialOverlay.classList.add('is-open');
        materialShell.classList.add('is-open');
      });
      document.body.style.overflow = 'hidden';
      document.querySelector('.mobile-nav')?.classList.add('is-hidden-for-modal');
      document.querySelector('.mascot-btn')?.classList.add('is-hidden-for-modal');
      materialClose.focus();
    };

    const closeMaterial = () => {
      materialOverlay.classList.remove('is-open');
      materialShell.classList.remove('is-open');
      document.body.style.overflow = '';
      document.querySelector('.mobile-nav')?.classList.remove('is-hidden-for-modal');
      document.querySelector('.mascot-btn')?.classList.remove('is-hidden-for-modal');
      setTimeout(() => {
        materialOverlay.hidden = true;
        materialShell.hidden = true;
      }, 220);
      lastTrigger?.focus();
    };

    const step = (dir) => {
      const next = activeIndex + dir;
      if (next < 0 || next >= materialPanels.length) return;
      showPanel(next);
      materialScroll.scrollTop = 0;
    };

    document.querySelectorAll('[data-open-material]').forEach((tile) => {
      tile.addEventListener('click', () => openMaterial(tile.dataset.openMaterial, tile));
    });

    materialClose.addEventListener('click', closeMaterial);
    materialOverlay.addEventListener('click', closeMaterial);
    materialPrevZones.forEach((btn) => btn.addEventListener('click', () => step(-1)));
    materialNextZones.forEach((btn) => btn.addEventListener('click', () => step(1)));

    document.addEventListener('keydown', (e) => {
      if (materialShell.hidden) return;
      if (e.key === 'Escape') closeMaterial();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });

    /* ---- swipe gestures (mobile) ----
       Swipe left/right anywhere on the card to go to the next/previous
       file. Swipe down closes it — but only when the card's own content
       is scrolled to the top, so it never fights a normal scroll gesture,
       and only once it's clear the gesture is vertical rather than a
       horizontal swipe. */
    let touchStartX = null;
    let touchStartY = null;
    let dragging = false;
    let dragAxis = null; // 'x' | 'y', decided once the gesture is clear

    materialShell.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      dragging = true;
      dragAxis = null;
      materialShell.style.transition = 'none';
    }, { passive: true });

    materialShell.addEventListener('touchmove', (e) => {
      if (!dragging || touchStartX === null || touchStartY === null) return;
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      if (!dragAxis) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        dragAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }

      if (dragAxis === 'y') {
        if (materialScroll.scrollTop > 0 || dy <= 0) return;
        materialShell.style.setProperty('--drag-y', `${dy * 0.6}px`);
      }
    }, { passive: true });

    materialShell.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      materialShell.style.transition = '';
      const dx = e.changedTouches[0].clientX - (touchStartX ?? 0);
      const dy = e.changedTouches[0].clientY - (touchStartY ?? 0);
      materialShell.style.removeProperty('--drag-y');
      touchStartX = null;
      touchStartY = null;

      if (dragAxis === 'x') {
        if (dx < -60) step(1);
        else if (dx > 60) step(-1);
      } else if (dragAxis === 'y') {
        if (dy > 100) closeMaterial();
      }
      dragAxis = null;
    });
  }

  const overlay = document.querySelector('[data-menu-overlay]');
  const sheet = document.querySelector('[data-menu-sheet]');
  const openers = document.querySelectorAll('[data-menu-open]');
  const closers = document.querySelectorAll('[data-menu-close]');

  const openMenu = () => {
    overlay.classList.add('is-open');
    sheet.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  const closeMenu = () => {
    overlay.classList.remove('is-open');
    sheet.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  openers.forEach((btn) => btn.addEventListener('click', openMenu));
  closers.forEach((btn) => btn.addEventListener('click', closeMenu));
  overlay?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
});
