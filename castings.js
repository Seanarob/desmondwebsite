// Castings editor: create, edit, open/close and delete casting calls without
// touching the CMS.
//
// Edits are held locally until Save, so typing doesn't fire a commit (and a
// deploy) per keystroke. The Save bar only appears once something is dirty.

import { loadContent, commitUpdate } from './gitstore.js';

let draft = null;    // { intro, shoots: [...] } being edited
let clean = null;    // JSON snapshot of the last saved state, to detect changes
let busy = false;

const root = () => document.getElementById('castings-view');

const blankShoot = () => ({
  title: '',
  date: '',
  location: '',
  description: '',
  open: true
});

export async function openCastings() {
  const view = root();
  view.innerHTML = '<p class="dash-loading">Loading castings…</p>';
  try {
    const content = await loadContent();
    adopt(content);
    render();
  } catch (err) {
    view.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'dash-error';
    const h = document.createElement('h3');
    h.textContent = err.status === 401 || err.status === 403
      ? 'Not allowed to read the site content. Check that Git Gateway is enabled under Identity → Services.'
      : (err.message || 'Could not load the castings.');
    box.appendChild(h);
    view.appendChild(box);
  }
}

function adopt(content) {
  const casting = content.casting || {};
  draft = {
    intro: casting.intro || '',
    shoots: (casting.shoots || []).map(s => ({
      title: s.title || '',
      date: s.date || '',
      location: s.location || '',
      description: s.description || '',
      open: s.open !== false
    }))
  };
  clean = JSON.stringify(draft);
}

const isDirty = () => JSON.stringify(draft) !== clean;

// ---------- rendering ----------

function render() {
  const view = root();
  view.innerHTML = '';

  const openCount = draft.shoots.filter(s => s.open).length;

  const intro = document.createElement('p');
  intro.className = 'photos-intro';
  const n = draft.shoots.length;
  intro.textContent = n
    ? `${n} casting${n === 1 ? '' : 's'} · ${openCount} showing on the site. Closed ones stay here but come off the site.`
    : 'No castings yet. Add one and it appears on the site with an Apply button.';
  view.appendChild(intro);

  const newBtn = document.createElement('button');
  newBtn.className = 'photo-add cast-new';
  newBtn.textContent = '+ New casting';
  newBtn.addEventListener('click', () => {
    draft.shoots.unshift(blankShoot());
    render();
    const first = root().querySelector('.cast-card input');
    if (first) first.focus();
  });
  view.appendChild(newBtn);

  // The blurb above the casting cards on the site
  const introCard = document.createElement('div');
  introCard.className = 'cast-card cast-card-intro';
  introCard.appendChild(field('Intro text on the site', 'textarea', draft.intro, value => {
    draft.intro = value;
    refreshSaveBar();
  }, 'Shown above the casting cards.'));
  view.appendChild(introCard);

  if (!draft.shoots.length) {
    const empty = document.createElement('p');
    empty.className = 'photo-empty';
    empty.textContent = 'No castings yet.';
    view.appendChild(empty);
  }

  draft.shoots.forEach((shoot, i) => view.appendChild(buildShootCard(shoot, i)));

  view.appendChild(buildSaveBar());
  refreshSaveBar();
}

function buildShootCard(shoot, index) {
  const card = document.createElement('div');
  card.className = 'cast-card' + (shoot.open ? '' : ' is-closed');

  const head = document.createElement('div');
  head.className = 'cast-head';

  const status = document.createElement('span');
  status.className = 'cast-status' + (shoot.open ? ' is-open' : '');
  status.textContent = shoot.open ? 'Showing on site' : 'Hidden';
  head.appendChild(status);

  const del = document.createElement('button');
  del.className = 'photo-btn photo-btn-danger cast-delete';
  del.textContent = 'Delete';
  del.addEventListener('click', () => {
    if (!confirm(`Delete "${shoot.title || 'this casting'}"?\n\nIt disappears from the site once you save.`)) return;
    draft.shoots.splice(index, 1);
    render();
  });
  head.appendChild(del);
  card.appendChild(head);

  card.appendChild(field('Shoot name', 'text', shoot.title, v => { shoot.title = v; refreshSaveBar(); }, 'e.g. Streetwear Editorial'));

  const row = document.createElement('div');
  row.className = 'cast-row';
  row.appendChild(field('When', 'text', shoot.date, v => { shoot.date = v; refreshSaveBar(); }, 'e.g. August 2026'));
  row.appendChild(field('Where', 'text', shoot.location, v => { shoot.location = v; refreshSaveBar(); }, 'e.g. Sacramento, CA'));
  card.appendChild(row);

  card.appendChild(field('Details', 'textarea', shoot.description,
    v => { shoot.description = v; refreshSaveBar(); },
    'Who you\'re looking for, what the shoot is, anything they should know.'));

  // Open/closed toggle
  const toggle = document.createElement('label');
  toggle.className = 'cast-toggle';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = shoot.open;
  box.addEventListener('change', () => {
    shoot.open = box.checked;
    card.classList.toggle('is-closed', !shoot.open);
    status.textContent = shoot.open ? 'Showing on site' : 'Hidden';
    status.classList.toggle('is-open', shoot.open);
    refreshSaveBar();
  });
  const label = document.createElement('span');
  label.textContent = 'Accepting applications';
  const hint = document.createElement('small');
  hint.textContent = 'Turn off when the shoot is cast — it comes off the site but stays here.';
  toggle.append(box, label, hint);
  card.appendChild(toggle);

  return card;
}

function field(labelText, kind, value, onInput, hint) {
  const wrap = document.createElement('label');
  wrap.className = 'cast-field';

  const label = document.createElement('span');
  label.className = 'cast-label';
  label.textContent = labelText;
  wrap.appendChild(label);

  const input = kind === 'textarea'
    ? document.createElement('textarea')
    : document.createElement('input');
  if (kind !== 'textarea') input.type = 'text';
  else input.rows = 3;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);

  if (hint) {
    const small = document.createElement('small');
    small.className = 'cast-hint';
    small.textContent = hint;
    wrap.appendChild(small);
  }
  return wrap;
}

// ---------- save ----------

function buildSaveBar() {
  const bar = document.createElement('div');
  bar.className = 'cast-savebar';
  bar.id = 'cast-savebar';

  const text = document.createElement('span');
  text.textContent = 'You have unsaved changes.';
  bar.appendChild(text);

  const discard = document.createElement('button');
  discard.className = 'photo-btn';
  discard.textContent = 'Discard';
  discard.addEventListener('click', () => {
    draft = JSON.parse(clean);
    render();
  });

  const save = document.createElement('button');
  save.className = 'photo-add';
  save.textContent = 'Save changes';
  save.addEventListener('click', doSave);

  bar.append(discard, save);
  return bar;
}

function refreshSaveBar() {
  const bar = document.getElementById('cast-savebar');
  if (bar) bar.classList.toggle('visible', isDirty());
}

async function doSave() {
  if (busy) return;

  const bad = draft.shoots.findIndex(s => !s.title.trim());
  if (bad !== -1) {
    showToast('Every casting needs a name before it can be saved.', 'error');
    const inputs = root().querySelectorAll('.cast-card:not(.cast-card-intro) input[type="text"]');
    if (inputs[bad * 2]) inputs[bad * 2].focus();
    return;
  }

  busy = true;
  showToast('Saving castings…', 'working');
  const snapshot = JSON.parse(JSON.stringify(draft));
  try {
    await commitUpdate(c => {
      c.casting = c.casting || {};
      c.casting.intro = snapshot.intro;
      c.casting.shoots = snapshot.shoots;
    }, 'Update castings from the dashboard');
    clean = JSON.stringify(snapshot);
    showToast('Saved — live in about a minute.', 'ok');
    refreshSaveBar();
  } catch (err) {
    showToast(err.message || 'Could not save. Nothing was changed.', 'error');
  }
  busy = false;
}

function showToast(message, kind) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = 'toast toast-' + kind;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  if (kind !== 'working') {
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
}
