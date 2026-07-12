/* Ferienhaus Saaler Bodden – Frontend-Logik */
(function () {
  'use strict';

  // ---------- Mobile Navigation ----------
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (toggle) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));
  }

  // ---------- Jahr im Footer ----------
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Lightbox ----------
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    const lbImg = lightbox.querySelector('img');
    document.querySelectorAll('#galleryGrid a').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        lbImg.src = a.href;
        lightbox.classList.add('open');
      });
    });
    lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
  }

  // ---------- Belegungskalender (Monatsansicht) ----------
  const calDays = document.getElementById('calDays');
  const calTitle = document.getElementById('calTitle');
  let bookings = [];
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function iso(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function statusFor(dateStr) {
    // Nacht belegt/angefragt: start <= tag < end (Abreisetag ist wieder frei)
    const b = bookings.find((x) => dateStr >= x.start && dateStr < x.end);
    return b ? (b.status === 'angefragt' ? 'req' : 'booked') : 'free';
  }

  function renderCalendar() {
    if (!calDays) return;
    calDays.innerHTML = '';
    calTitle.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    const todayStr = iso(today.getFullYear(), today.getMonth(), today.getDate());
    const first = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstWeekday = (first.getDay() + 6) % 7; // Montag = 0

    for (let e = 0; e < firstWeekday; e++) {
      calDays.insertAdjacentHTML('beforeend', '<span class="empty"></span>');
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = iso(viewYear, viewMonth, day);
      const cls = ds < todayStr ? 'past' : statusFor(ds);
      calDays.insertAdjacentHTML('beforeend', `<span class="${cls}">${day}</span>`);
    }
  }

  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    // nicht weiter als 24 Monate in die Zukunft, nicht in die Vergangenheit
    const min = new Date(today.getFullYear(), today.getMonth(), 1);
    const max = new Date(today.getFullYear(), today.getMonth() + 24, 1);
    if (d < min || d > max) return;
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    renderCalendar();
  }

  const prev = document.getElementById('calPrev');
  const next = document.getElementById('calNext');
  if (prev) prev.addEventListener('click', () => shiftMonth(-1));
  if (next) next.addEventListener('click', () => shiftMonth(1));

  fetch('/api/bookings')
    .then((r) => r.json())
    .then((data) => { bookings = data; renderCalendar(); })
    .catch(() => renderCalendar());

  // ---------- Kontakt / Anfrage ----------
  let bookingEmail = 'info@ferienhaus-saaler-bodden.de';
  const mailLink = document.getElementById('mailLink');
  const mailText = document.getElementById('mailText');
  function applyMail() {
    if (mailLink) {
      mailLink.textContent = bookingEmail;
      mailLink.href = 'mailto:' + bookingEmail;
    }
    if (mailText) mailText.textContent = bookingEmail;
  }
  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => { if (cfg.bookingEmail) bookingEmail = cfg.bookingEmail; applyMail(); })
    .catch(applyMail);

  const form = document.getElementById('inquiryForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const fmt = (s) => (s ? new Date(s).toLocaleDateString('de-DE') : '–');
      const subject = `Buchungsanfrage ${fmt(f.get('from'))} – ${fmt(f.get('to'))}`;
      const body = [
        'Guten Tag,',
        '',
        'hiermit sende ich Ihnen eine unverbindliche Buchungsanfrage:',
        '',
        `Anreise: ${fmt(f.get('from'))}`,
        `Abreise: ${fmt(f.get('to'))}`,
        `Personen: ${f.get('persons')}`,
        '',
        'Mit freundlichen Grüßen',
      ].join('\n');
      window.location.href = `mailto:${bookingEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }
})();
