// Dashboard for Desmond: casting applications, bookings, and Fit Check entries.
//
// The login here controls what's *shown*. What actually protects the data is
// the Netlify Function, which refuses to return anything without a valid
// Identity token. See netlify/functions/submissions.js.

// Friendly labels for the raw Netlify form names.
const FORM_LABELS = {
  'fit-of-the-week': 'Fit Checks',
  'model-application': 'Casting applications',
  'booking': 'Bookings'
};
// Tab order — Fit Checks first, it's the weekly job.
const FORM_ORDER = ['fit-of-the-week', 'model-application', 'booking'];

const identity = window.netlifyIdentity;
const gate = document.getElementById('gate');
const gateText = document.getElementById('gate-text');
const main = document.getElementById('main');
const logoutBtn = document.getElementById('logout');

document.getElementById('login').addEventListener('click', () => identity.open('login'));
logoutBtn.addEventListener('click', () => identity.logout());

identity.on('init', user => user ? onLogin(user) : showGate());
identity.on('login', user => { identity.close(); onLogin(user); });
identity.on('logout', () => { main.hidden = true; logoutBtn.hidden = true; showGate(); });
identity.init();

function showGate(message) {
  gate.hidden = false;
  if (message) gateText.textContent = message;
}

async function onLogin(user) {
  gate.hidden = true;
  main.hidden = false;
  logoutBtn.hidden = false;
  document.getElementById('who').textContent = 'Signed in as ' + user.email;

  const panels = document.getElementById('panels');
  panels.innerHTML = '<p class="dash-loading">Loading submissions…</p>';

  try {
    // The Identity JWT is what the function checks. jwt() refreshes it if stale.
    const token = await user.jwt();
    const res = await fetch('/.netlify/functions/submissions', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const payload = await res.json();

    if (!res.ok) {
      panels.innerHTML = '';
      panels.appendChild(errorCard(payload));
      return;
    }
    render(payload.forms);
  } catch {
    panels.innerHTML = '';
    panels.appendChild(errorCard({ error: 'Could not load submissions. Check your connection and try again.' }));
  }
}

function errorCard(payload) {
  const box = document.createElement('div');
  box.className = 'dash-error';
  const h = document.createElement('h3');
  h.textContent = payload.error || 'Something went wrong.';
  box.appendChild(h);
  if (payload.help) {
    const p = document.createElement('p');
    p.textContent = payload.help;
    box.appendChild(p);
  }
  if (payload.envNamesSeen && payload.envNamesSeen.length) {
    const p = document.createElement('p');
    p.className = 'dash-error-detail';
    p.textContent = 'Variables found: ' + payload.envNamesSeen.join(', ');
    box.appendChild(p);
  }
  return box;
}

function render(forms) {
  const tabs = document.getElementById('tabs');
  const panels = document.getElementById('panels');
  tabs.innerHTML = '';
  panels.innerHTML = '';

  const sorted = [...forms].sort((a, b) => {
    const ai = FORM_ORDER.indexOf(a.name), bi = FORM_ORDER.indexOf(b.name);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  if (!sorted.length) {
    panels.innerHTML = '<p class="dash-loading">No forms found yet. Submissions appear here once people start sending them in.</p>';
    return;
  }

  sorted.forEach((form, i) => {
    const label = FORM_LABELS[form.name] || form.name;

    const tab = document.createElement('button');
    tab.className = 'dash-tab' + (i === 0 ? ' active' : '');
    tab.textContent = label;
    const badge = document.createElement('span');
    badge.className = 'dash-badge';
    badge.textContent = form.count;
    tab.appendChild(badge);
    tabs.appendChild(tab);

    const panel = document.createElement('section');
    panel.className = 'dash-panel';
    panel.hidden = i !== 0;

    if (!form.submissions.length) {
      panel.innerHTML = '<p class="dash-loading">Nothing here yet.</p>';
    } else if (form.name === 'fit-of-the-week') {
      panel.appendChild(buildFitGrid(form.submissions));
    } else {
      panel.appendChild(buildList(form.submissions));
    }
    panels.appendChild(panel);

    tab.addEventListener('click', () => {
      [...tabs.children].forEach(t => t.classList.remove('active'));
      [...panels.children].forEach(p => p.hidden = true);
      tab.classList.add('active');
      panel.hidden = false;
    });
  });
}

// Fit Checks as a photo grid — the whole reason this page exists. Picking a
// winner means comparing fits at a glance, which a list can't do.
function buildFitGrid(subs) {
  const grid = document.createElement('div');
  grid.className = 'fitgrid';

  subs.forEach(s => {
    const d = s.data;
    const card = document.createElement('figure');
    card.className = 'fitgrid-card';

    const photo = findPhotoUrl(d);
    if (photo) {
      const a = document.createElement('a');
      a.href = photo;
      a.target = '_blank';
      a.rel = 'noopener';
      const img = document.createElement('img');
      img.src = photo;
      img.alt = d.name ? 'Fit from ' + d.name : 'Fit submission';
      img.loading = 'lazy';
      a.appendChild(img);
      card.appendChild(a);
    } else {
      const missing = document.createElement('div');
      missing.className = 'fitgrid-nophoto';
      missing.textContent = 'No photo';
      card.appendChild(missing);
    }

    const cap = document.createElement('figcaption');
    const name = document.createElement('strong');
    name.textContent = d.name || 'No name';
    cap.appendChild(name);

    if (d.instagram) {
      const handle = String(d.instagram).replace(/^@/, '');
      const ig = document.createElement('a');
      ig.className = 'fitgrid-ig';
      ig.href = 'https://instagram.com/' + handle;
      ig.target = '_blank';
      ig.rel = 'noopener';
      ig.textContent = '@' + handle;
      cap.appendChild(ig);
    }
    if (d.city) {
      const city = document.createElement('span');
      city.className = 'fitgrid-meta';
      city.textContent = d.city;
      cap.appendChild(city);
    }
    if (d.message) {
      const note = document.createElement('p');
      note.className = 'fitgrid-note';
      note.textContent = d.message;
      cap.appendChild(note);
    }
    const when = document.createElement('span');
    when.className = 'fitgrid-meta';
    when.textContent = formatDate(s.createdAt);
    cap.appendChild(when);

    if (d.email) {
      const mail = document.createElement('a');
      mail.className = 'fitgrid-ig';
      mail.href = 'mailto:' + d.email;
      mail.textContent = d.email;
      cap.appendChild(mail);
    }

    card.appendChild(cap);
    grid.appendChild(card);
  });

  return grid;
}

// Netlify returns uploaded files as URLs on the submission's data object.
function findPhotoUrl(data) {
  // 'photo' is our file field, so trust any non-empty value rather than
  // insisting on an absolute URL — failing that check renders "No photo"
  // over a submission that actually has one.
  const direct = data.photo;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (direct && typeof direct === 'object' && direct.url) return direct.url;
  for (const value of Object.values(data)) {
    if (typeof value === 'string' && /^https?:\/\/.*\.(jpe?g|png|webp|heic)/i.test(value)) return value;
    if (value && typeof value === 'object' && typeof value.url === 'string') return value.url;
  }
  return null;
}

function buildList(subs) {
  const list = document.createElement('div');
  list.className = 'dash-list';

  subs.forEach(s => {
    const card = document.createElement('article');
    card.className = 'dash-card';

    const head = document.createElement('div');
    head.className = 'dash-card-head';
    const name = document.createElement('h3');
    name.textContent = s.data.name || 'No name';
    const when = document.createElement('span');
    when.className = 'fitgrid-meta';
    when.textContent = formatDate(s.createdAt);
    head.append(name, when);
    card.appendChild(head);

    const dl = document.createElement('dl');
    dl.className = 'dash-fields';
    Object.entries(s.data).forEach(([key, value]) => {
      if (key === 'name' || !value || typeof value === 'object') return;
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      if (key === 'email') {
        const a = document.createElement('a');
        a.href = 'mailto:' + value;
        a.textContent = value;
        dd.appendChild(a);
      } else if (key === 'instagram') {
        const handle = String(value).replace(/^@/, '');
        const a = document.createElement('a');
        a.href = 'https://instagram.com/' + handle;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = '@' + handle;
        dd.appendChild(a);
      } else {
        dd.textContent = value;
      }
      dl.append(dt, dd);
    });
    card.appendChild(dl);
    list.appendChild(card);
  });

  return list;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
