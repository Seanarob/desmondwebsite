const GRID_ROW = 10; // must match grid-auto-rows in styles.css
const GRID_GAP = 4;  // must match gap in styles.css

// Masonry sizes tiles async, so restored scroll positions land in the wrong
// place after refresh — always start at the top instead.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

async function init() {
  // no-store so content.json edits (photo swaps, casting posts) show up
  // immediately instead of being served from the browser cache
  const res = await fetch('content.json', { cache: 'no-store' });
  const content = await res.json();

  document.title = content.siteTitle;

  // Hero
  const heroBg = document.getElementById('hero-bg');
  // Tint the empty hero to match the photo so the wait reads as intentional
  // instead of as a broken gray screen on a slow phone connection.
  if (content.hero.placeholderColor) {
    document.querySelector('.hero').style.backgroundColor = content.hero.placeholderColor;
  }
  heroBg.style.backgroundImage = `url('${content.hero.image}')`;
  revealHeroWhenReady(heroBg, content.hero.image);
  document.getElementById('sticker-line-1').textContent = content.hero.stickerLine1;
  document.getElementById('sticker-line-2').textContent = content.hero.stickerLine2;
  document.getElementById('scroll-arrow').addEventListener('click', () => {
    smoothScrollTo('#work');
  });

  // Work sections
  const work = document.getElementById('work');
  content.sections.forEach(section => {
    work.appendChild(buildMarquee(section.heading));

    const header = document.createElement('div');
    header.className = 'section-header';
    header.id = section.heading.toLowerCase();
    const sticker = document.createElement('span');
    sticker.className = 'sticker sticker-section reveal-sticker';
    sticker.textContent = section.heading;
    header.appendChild(sticker);
    work.appendChild(header);

    section.categories.forEach(category => {
      if (category.name) {
        const label = document.createElement('h3');
        label.className = 'category-label reveal-label';
        label.textContent = category.name;
        work.appendChild(label);
      }
      const grid = document.createElement('div');
      grid.className = 'grid' + (category.projects.length < 3 ? ' cols-2' : '');
      category.projects.forEach((project, i) => {
        const tile = buildTile(project);
        tile.classList.add('reveal');
        tile.style.transitionDelay = `${Math.min(i % 3, 2) * 110}ms`;
        grid.appendChild(tile);
      });
      work.appendChild(grid);
    });
  });

  // Casting
  renderCasting(content.casting);

  // Fit of the week
  renderFitWeek(content.fitOfTheWeek);

  // About
  const about = content.about;
  document.getElementById('about-banner').style.background = about.bannerColor;
  document.getElementById('about-title').textContent = about.title;
  document.getElementById('about-subtitle').textContent = about.subtitle;
  document.getElementById('about-photo').src = about.photo;

  const bio = document.getElementById('bio');
  about.bio.forEach(text => {
    const p = document.createElement('p');
    p.textContent = text;
    bio.appendChild(p);
  });

  const featured = document.getElementById('featured');
  if (about.featuredIn && about.featuredIn.length) {
    const h = document.createElement('h4');
    h.textContent = 'Featured In';
    const ul = document.createElement('ul');
    about.featuredIn.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    featured.append(h, ul);
  }

  const email = document.getElementById('contact-email');
  email.textContent = about.email;
  email.href = 'mailto:' + about.email;

  const igWrap = document.getElementById('contact-igs');
  about.instagrams.forEach(ig => {
    const p = document.createElement('p');
    p.className = 'contact-ig';
    p.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';
    const a = document.createElement('a');
    a.href = 'https://instagram.com/' + ig.handle;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '@' + ig.handle;
    p.appendChild(a);
    if (ig.label) {
      const tag = document.createElement('span');
      tag.className = 'ig-label';
      tag.textContent = ig.label;
      p.appendChild(tag);
    }
    igWrap.appendChild(p);
  });

  // Bind on the hidden form-name input, NOT on [data-netlify]: Netlify strips
  // data-netlify and netlify-honeypot from the HTML it serves, so a selector
  // built on those matches locally and silently matches nothing once deployed.
  // form-name is what Netlify requires, so it always survives.
  document.querySelectorAll('form input[name="form-name"]').forEach(input => setupFormSubmit(input.form));
  buildMenu(content);
  setupReveals();
  setupParallax(heroBg);
  absolutizeSocialImage();
  document.body.classList.add('loaded');
}

// Hold the hero fade until the photo is decoded and ready to paint. Reveals
// regardless of what happens — a missing or broken photo shows the tinted
// placeholder rather than leaving the screen blank forever.
async function revealHeroWhenReady(heroBg, src) {
  try {
    const img = new Image();
    img.src = src;
    await Promise.race([
      img.decode(),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);
  } catch {
    /* broken or missing hero photo — fall through and reveal anyway */
  }
  heroBg.classList.add('ready');
}

// og:image is authored relative so it survives the move from *.netlify.app to
// the custom domain; scrapers that run JS get the absolute URL they want.
function absolutizeSocialImage() {
  const tag = document.querySelector('meta[property="og:image"]');
  if (tag) tag.setAttribute('content', new URL(tag.getAttribute('content'), location.href).href);
}

// Chrome cancels/ignores native smooth scrolls on this page (long distances
// plus animating content), so drive the scroll ourselves frame-by-frame.
function smoothScrollTo(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  // Reveal transitions shift layout while we scroll, so re-measure the target
  // element's position every frame instead of aiming at a stale offset.
  const liveTo = () => Math.min(
    window.scrollY + el.getBoundingClientRect().top - 20,
    document.documentElement.scrollHeight - window.innerHeight
  );
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo({ top: liveTo(), behavior: 'instant' });
    return;
  }
  const from = window.scrollY;
  const duration = Math.min(900, Math.max(450, Math.abs(liveTo() - from) * 0.06));
  const t0 = performance.now();
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let done = false;
  (function step(now) {
    if (done) return;
    const t = Math.min(1, (now - t0) / duration);
    window.scrollTo({ top: from + (liveTo() - from) * ease(t), behavior: 'instant' });
    if (t < 1) requestAnimationFrame(step);
    else done = true;
  })(t0);
  // Watchdog: if frames stall (background tab etc.), land at the target anyway.
  setTimeout(() => {
    if (!done) {
      done = true;
      window.scrollTo({ top: liveTo(), behavior: 'instant' });
    }
  }, duration + 300);
}

function buildMenu(content) {
  const overlay = document.getElementById('menu-overlay');
  const toggle = document.getElementById('nav-toggle');
  const list = document.getElementById('menu-links');

  const items = [
    ['Home', '#hero'],
    ...content.sections.map(s => [s.heading, '#' + s.heading.toLowerCase()]),
    [content.casting.heading, '#casting'],
    ...(content.fitOfTheWeek && content.fitOfTheWeek.enabled !== false
      ? [[content.fitOfTheWeek.heading, '#fit']]
      : []),
    ['Bookings', '#booking-form'],
    ['About', '#about']
  ];

  items.forEach(([label, target], i) => {
    const li = document.createElement('li');
    li.style.transitionDelay = `${80 + i * 60}ms`;
    const a = document.createElement('a');
    a.href = target;
    a.textContent = label;
    a.addEventListener('click', e => {
      e.preventDefault();
      setMenuOpen(false);
      smoothScrollTo(target);
    });
    li.appendChild(a);
    list.appendChild(li);
  });

  const contact = document.getElementById('menu-contact');
  const email = document.createElement('a');
  email.href = 'mailto:' + content.about.email;
  email.textContent = content.about.email;
  contact.appendChild(email);
  content.about.instagrams.forEach(ig => {
    const a = document.createElement('a');
    a.href = 'https://instagram.com/' + ig.handle;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '@' + ig.handle + (ig.label ? ' · ' + ig.label : '');
    contact.appendChild(a);
  });

  addStaffLink(contact);

  function setMenuOpen(open) {
    overlay.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    overlay.setAttribute('aria-hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  toggle.addEventListener('click', () => setMenuOpen(!overlay.classList.contains('open')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setMenuOpen(false);
  });
}

// Small staff link at the bottom of the menu. It's just a link — the dashboard
// handles its own login, and the data behind it is gated server-side, so this
// being visible gives a visitor nothing.
function addStaffLink(container) {
  const link = document.createElement('a');
  link.className = 'menu-staff';
  link.href = '/dashboard.html';
  link.textContent = 'Log in';
  container.appendChild(link);

  const identity = window.netlifyIdentity;
  if (!identity) return;
  const sync = user => { link.textContent = user ? 'Dashboard' : 'Log in'; };
  identity.on('init', sync);
  identity.on('login', () => sync(true));
  identity.on('logout', () => sync(null));
}

function renderCasting(casting) {
  const header = document.getElementById('casting-header');
  header.appendChild(buildMarquee(casting.heading));
  const headerWrap = document.createElement('div');
  headerWrap.className = 'section-header';
  const sticker = document.createElement('span');
  sticker.className = 'sticker sticker-section reveal-sticker';
  sticker.textContent = casting.heading;
  headerWrap.appendChild(sticker);
  header.appendChild(headerWrap);

  const openShoots = (casting.shoots || []).filter(s => s.open);
  document.getElementById('casting-intro').textContent = openShoots.length
    ? casting.intro
    : 'No open castings right now — send a general application and get contacted first for future shoots.';

  const cards = document.getElementById('shoot-cards');
  const select = document.getElementById('shoot-select');
  openShoots.forEach((shoot, i) => {
    const option = document.createElement('option');
    option.value = option.textContent = `${shoot.title} (${shoot.date})`;
    select.insertBefore(option, select.firstChild);

    const card = document.createElement('article');
    card.className = 'shoot-card reveal';
    card.style.transitionDelay = `${(i % 3) * 110}ms`;

    const title = document.createElement('h3');
    title.textContent = shoot.title;
    const meta = document.createElement('p');
    meta.className = 'shoot-meta';
    meta.textContent = `${shoot.date} · ${shoot.location}`;
    const desc = document.createElement('p');
    desc.className = 'shoot-desc';
    desc.textContent = shoot.description;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'form-submit shoot-apply';
    btn.textContent = 'Apply';
    btn.addEventListener('click', () => {
      select.value = option.value;
      smoothScrollTo('#application-form');
    });

    card.append(title, meta, desc, btn);
    cards.appendChild(card);
  });
  if (openShoots.length) select.selectedIndex = 0;
}

function renderFitWeek(fit) {
  const section = document.getElementById('fit');
  if (!section) return;
  // Pulling the section entirely is how the client switches the contest off.
  if (!fit || fit.enabled === false) {
    section.remove();
    return;
  }

  const header = document.getElementById('fit-header');
  header.appendChild(buildMarquee(fit.heading));
  const headerWrap = document.createElement('div');
  headerWrap.className = 'section-header';
  const sticker = document.createElement('span');
  sticker.className = 'sticker sticker-section reveal-sticker';
  sticker.textContent = fit.heading;
  headerWrap.appendChild(sticker);
  header.appendChild(headerWrap);

  document.getElementById('fit-tagline').textContent = fit.tagline || '';
  document.getElementById('fit-intro').textContent = fit.intro || '';

  const winner = fit.currentWinner;
  const wrap = document.getElementById('fit-winner');
  if (winner && winner.image) {
    wrap.appendChild(buildWinnerCard(winner, fit.deadlineNote));
  } else {
    // Pre-launch state: no winner picked yet, so sell the prize instead.
    const empty = document.createElement('div');
    empty.className = 'fit-empty reveal';
    const h = document.createElement('h3');
    h.textContent = 'First winner drops soon';
    const p = document.createElement('p');
    p.textContent = fit.deadlineNote || '';
    empty.append(h, p);
    wrap.appendChild(empty);
  }

  const past = (fit.pastWinners || []).filter(w => w.image);
  if (past.length) {
    const pastWrap = document.getElementById('fit-past');
    const label = document.createElement('h3');
    label.className = 'category-label reveal-label';
    label.textContent = 'PAST WINNERS';
    const row = document.createElement('div');
    row.className = 'fit-past-row';
    past.forEach((w, i) => {
      const card = document.createElement('figure');
      card.className = 'fit-past-card reveal';
      card.style.transitionDelay = `${Math.min(i % 4, 3) * 90}ms`;
      const img = document.createElement('img');
      img.src = w.image;
      img.alt = w.name ? `Fit of the week winner ${w.name}` : 'Past fit of the week winner';
      img.loading = 'lazy';
      const cap = document.createElement('figcaption');
      cap.textContent = [w.name, w.week].filter(Boolean).join(' · ');
      card.append(img, cap);
      row.appendChild(card);
    });
    pastWrap.append(label, row);
  }

  setupPhotoPicker();
}

function buildWinnerCard(winner, deadlineNote) {
  const card = document.createElement('div');
  card.className = 'fit-winner reveal';

  const img = document.createElement('img');
  img.className = 'fit-winner-photo';
  img.src = winner.image;
  img.alt = winner.name ? `Fit of the week winner ${winner.name}` : 'Fit of the week winner';

  const info = document.createElement('div');
  info.className = 'fit-winner-info';

  const badge = document.createElement('span');
  badge.className = 'fit-badge';
  badge.textContent = winner.week ? `WINNER · ${winner.week}` : 'THIS WEEK’S WINNER';

  const name = document.createElement('h3');
  name.textContent = winner.name || '';
  info.append(badge, name);

  if (winner.instagram) {
    const handle = winner.instagram.replace(/^@/, '');
    const a = document.createElement('a');
    a.className = 'fit-winner-ig';
    a.href = 'https://instagram.com/' + handle;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '@' + handle;
    info.appendChild(a);
  }
  if (winner.note) {
    const note = document.createElement('p');
    note.className = 'fit-winner-note';
    note.textContent = winner.note;
    info.appendChild(note);
  }
  if (deadlineNote) {
    const next = document.createElement('p');
    next.className = 'fit-winner-next';
    next.textContent = deadlineNote;
    info.appendChild(next);
  }

  card.append(img, info);
  return card;
}

function setupPhotoPicker() {
  const input = document.getElementById('fit-photo');
  if (!input) return;
  const preview = document.getElementById('fit-preview');
  const text = document.getElementById('fit-drop-text');
  const form = input.form;

  const status = form.querySelector('.form-status');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    // Phones let you pick videos and other junk even with accept="image/*".
    // Say so now rather than failing after they've filled the whole form in.
    if (!file.type.startsWith('image/')) {
      input.value = '';
      preview.hidden = true;
      preview.removeAttribute('src');
      status.textContent = 'That’s not a photo — pick an image from your camera roll.';
      status.classList.add('is-error');
      return;
    }

    status.textContent = '';
    status.classList.remove('is-error');
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.hidden = false;
    preview.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    text.textContent = 'Tap to change photo';
  });

  // form.reset() after a successful send fires this, clearing the thumbnail too.
  form.addEventListener('reset', () => {
    preview.hidden = true;
    preview.removeAttribute('src');
    text.innerHTML = 'Tap to add your photo<small>straight from your camera roll · full-body works best</small>';
  });
}

// Netlify caps a whole form request at 8MB, and a straight-off-the-phone photo
// can eat most of that. Re-encode to a sane size in the browser first.
const MAX_EDGE = 1600;
const SAFE_BYTES = 6 * 1024 * 1024;
// Hard ceiling for the whole POST. Netlify's limit is 8MB; the rest of the
// fields are tiny, so this leaves comfortable headroom.
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) return file;
  let bitmap;
  try {
    // from-image so portrait phone shots don't arrive rotated
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // format the browser can't decode — let it upload as-is
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SAFE_BYTES) {
    bitmap.close();
    return file;
  }

  // Step down until it fits. Modern phone cameras (48MP+) can still land over
  // the cap at 1600px, so one pass isn't always enough.
  let out = file;
  for (const [edge, quality] of [[MAX_EDGE, 0.85], [1200, 0.8], [900, 0.75]]) {
    const s = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * s);
    canvas.height = Math.round(bitmap.height * s);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) break;
    out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    if (out.size <= MAX_UPLOAD_BYTES) break;
  }
  bitmap.close();
  return out.size < file.size ? out : file;
}

function setupFormSubmit(form) {
  const status = form.querySelector('.form-status');
  const fileInput = form.querySelector('input[type="file"]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const button = form.querySelector('.form-submit');
    button.disabled = true;
    status.textContent = fileInput && fileInput.files[0] ? 'Uploading photo…' : 'Sending…';
    status.classList.remove('is-error');
    try {
      let res;
      if (fileInput) {
        const data = new FormData(form);
        const file = fileInput.files[0];
        if (file) {
          const prepared = await shrinkImage(file);
          // A format we couldn't decode (so couldn't shrink) can still be huge.
          // Better to say why than to let the POST fail with a generic error.
          if (prepared.size > MAX_UPLOAD_BYTES) {
            status.textContent = 'That photo’s too big to send. Try a different one from your camera roll.';
            status.classList.add('is-error');
            button.disabled = false;
            return;
          }
          data.set(fileInput.name, prepared);
        }
        // Multipart: no Content-Type header, the browser sets its own boundary.
        res = await fetch('/', { method: 'POST', body: data });
      } else {
        res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form))
        });
      }
      if (!res.ok) throw new Error(res.status);
      form.reset();
      status.textContent = 'Sent! You’ll hear back soon ✓';
    } catch {
      status.textContent = 'Something went wrong — email instead and it’ll get seen just as fast.';
      status.classList.add('is-error');
    }
    button.disabled = false;
  });
}

function buildMarquee(text) {
  const marquee = document.createElement('div');
  marquee.className = 'marquee';
  marquee.setAttribute('aria-hidden', 'true');
  const track = document.createElement('div');
  track.className = 'marquee-track';
  for (let i = 0; i < 2; i++) {
    const span = document.createElement('span');
    span.className = 'marquee-text';
    span.textContent = (text + ' ✦ ').repeat(6);
    track.appendChild(span);
  }
  marquee.appendChild(track);
  return marquee;
}

function setupReveals() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('.reveal, .reveal-sticker, .reveal-label, .reveal-banner')
    .forEach(el => observer.observe(el));
}

function setupParallax(heroBg) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const pin = document.getElementById('hero-pin');
  // How far the hero photo pans (as % of its own height) over the pinned range.
  const PAN_PERCENT = 16;

  // About section convergence: the cutout figure starts high and lowers while
  // the banner rises from below, meeting in the seated composition at rest.
  const aboutHero = document.getElementById('about-hero');
  const aboutPhoto = document.getElementById('about-photo');
  const aboutBanner = document.getElementById('about-banner');
  const FIGURE_DROP = 0.16;  // ×viewport height
  const BANNER_RISE = 0.26;  // ×viewport height
  const smooth = t => t * t * (3 - 2 * t);

  let lastHero = -1, lastAbout = -1;
  // Polled every frame rather than on 'scroll' — programmatic scrollTo (used by
  // our menu links and Apply buttons) doesn't reliably dispatch scroll events.
  (function loop() {
    const vh = window.innerHeight;

    const pinRange = pin.offsetHeight - vh;
    const scrolledIntoPin = Math.min(Math.max(-pin.getBoundingClientRect().top, 0), pinRange);
    const heroP = pinRange > 0 ? scrolledIntoPin / pinRange : 0;
    if (heroP !== lastHero) {
      heroBg.style.transform = `translateY(${-heroP * PAN_PERCENT}%) scale(1.32)`;
      lastHero = heroP;
    }

    // 0 when the About section top enters the viewport bottom → 1 once it
    // has scrolled 85% of a viewport up (its resting composition).
    const aboutTop = aboutHero.getBoundingClientRect().top;
    const aboutP = Math.min(Math.max((vh - aboutTop) / (vh * 0.85), 0), 1);
    if (aboutP !== lastAbout) {
      const e = smooth(aboutP);
      // Zoom-out: figure starts ~2.3x oversized and shrinks into the seat
      const scale = 2.3 - 1.3 * e;
      aboutPhoto.style.transform = `translateY(${-(1 - e) * FIGURE_DROP * vh}px) scale(${scale})`;
      aboutPhoto.style.opacity = Math.min(1, e * 1.6);
      aboutBanner.style.transform = `translateY(${(1 - e) * BANNER_RISE * vh}px)`;
      lastAbout = aboutP;
    }

    requestAnimationFrame(loop);
  })();
}

function buildTile(project) {
  const tile = document.createElement('div');
  tile.className = 'tile' + (project.span === 2 ? ' span-2' : '');

  const img = document.createElement('img');
  img.src = project.images[0];
  img.alt = '';
  tile.appendChild(img);

  let index = 0;
  if (project.images.length > 1) {
    const counter = document.createElement('span');
    counter.className = 'counter';
    counter.textContent = `1/${project.images.length}`;
    tile.appendChild(counter);

    const prev = document.createElement('span');
    prev.className = 'nav-hint nav-prev';
    prev.textContent = '‹';
    const next = document.createElement('span');
    next.className = 'nav-hint nav-next';
    next.textContent = '›';
    tile.append(prev, next);

    tile.addEventListener('click', e => {
      const rect = tile.getBoundingClientRect();
      const goBack = (e.clientX - rect.left) < rect.width / 2;
      index = (index + (goBack ? -1 : 1) + project.images.length) % project.images.length;
      img.src = project.images[index];
      counter.textContent = `${index + 1}/${project.images.length}`;
    });
  }

  // Masonry: size the tile from the first image's aspect ratio
  if (img.complete) {
    requestAnimationFrame(() => sizeTile(tile, img));
  } else {
    img.addEventListener('load', () => sizeTile(tile, img), { once: true });
  }
  return tile;
}

function sizeTile(tile, img) {
  const width = tile.getBoundingClientRect().width;
  // Fallback aspect for images whose natural size isn't reported (some SVGs)
  const aspect = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1.25;
  const height = width * aspect;
  const span = Math.ceil((height + GRID_GAP) / (GRID_ROW + GRID_GAP));
  tile.style.gridRowEnd = `span ${span}`;
}

function resizeAll() {
  document.querySelectorAll('.tile').forEach(tile => {
    const img = tile.querySelector('img');
    if (img && img.naturalWidth) sizeTile(tile, img);
  });
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeAll, 150);
});

init();
