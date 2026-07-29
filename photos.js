// Visual photo manager: every photo on the site, grouped the way the site is.
//
// The unit here is the TILE, not the photo — because that's what the site
// actually renders. A tile holding several photos becomes a click-through
// carousel on the site, so the editor has to show that stacking plainly and
// let it be built, added to, and taken apart.

import { loadContent, saveContent } from './gitstore.js';

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.86;

let content = null;
let busy = false;

const root = () => document.getElementById('photos-view');

export async function openPhotos() {
  const view = root();
  view.innerHTML = '<p class="dash-loading">Loading photos…</p>';
  try {
    content = await loadContent();
    render();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(errorBox(
      err.status === 401 || err.status === 403
        ? 'Not allowed to read the site content. Check that Git Gateway is enabled under Identity → Services.'
        : (err.message || 'Could not load the site content.')
    ));
  }
}

// ---------- content.json -> groups of tiles ----------

function collectGroups(c) {
  const groups = [];

  groups.push({
    key: 'hero',
    label: 'Home screen',
    note: 'The big photo behind the sticker.',
    single: true,
    tiles: c.hero.image ? [{ images: [{ src: c.hero.image, ref: { type: 'hero' } }] }] : []
  });

  (c.sections || []).forEach((section, si) => {
    (section.categories || []).forEach((cat, ci) => {
      const tiles = (cat.projects || []).map((project, pi) => ({
        ref: { si, ci, pi },
        span: project.span || 1,
        images: (project.images || []).map((src, ii) => ({
          src, ref: { type: 'project', si, ci, pi, ii }
        }))
      }));
      groups.push({
        key: `s${si}c${ci}`,
        label: cat.name ? `${section.heading} · ${cat.name}` : section.heading,
        target: { si, ci },
        stackable: true,
        tiles
      });
    });
  });

  const fit = c.fitOfTheWeek;
  if (fit) {
    const tiles = [];
    if (fit.currentWinner && fit.currentWinner.image) {
      tiles.push({ badge: 'This week', images: [{ src: fit.currentWinner.image, ref: { type: 'fitCurrent' } }] });
    }
    (fit.pastWinners || []).forEach((w, i) => {
      if (w.image) tiles.push({ badge: w.week || w.name || '', images: [{ src: w.image, ref: { type: 'fitPast', i } }] });
    });
    groups.push({
      key: 'fit',
      label: 'Fit Check winners',
      note: 'Names and weeks are set in Edit site — this is just their photos.',
      tiles
    });
  }

  groups.push({
    key: 'about',
    label: 'About portrait',
    note: 'Needs a see-through background (PNG cutout).',
    single: true,
    tiles: c.about.photo ? [{ images: [{ src: c.about.photo, ref: { type: 'about' } }] }] : []
  });

  return groups;
}

// ---------- mutations ----------

const projectsOf = ref => content.sections[ref.si].categories[ref.ci].projects;

function setPhoto(ref, path) {
  if (ref.type === 'hero') content.hero.image = path;
  else if (ref.type === 'about') content.about.photo = path;
  else if (ref.type === 'fitCurrent') content.fitOfTheWeek.currentWinner.image = path;
  else if (ref.type === 'fitPast') content.fitOfTheWeek.pastWinners[ref.i].image = path;
  else projectsOf(ref)[ref.pi].images[ref.ii] = path;
}

function removePhoto(ref) {
  if (ref.type === 'hero') content.hero.image = '';
  else if (ref.type === 'about') content.about.photo = '';
  else if (ref.type === 'fitCurrent') content.fitOfTheWeek.currentWinner.image = '';
  else if (ref.type === 'fitPast') content.fitOfTheWeek.pastWinners.splice(ref.i, 1);
  else {
    const projects = projectsOf(ref);
    projects[ref.pi].images.splice(ref.ii, 1);
    // A tile with nothing left in it would render as an empty box.
    if (!projects[ref.pi].images.length) projects.splice(ref.pi, 1);
  }
}

// Each photo becomes its own tile.
function addSeparateTiles(target, paths) {
  const projects = content.sections[target.si].categories[target.ci].projects;
  paths.forEach(path => projects.push({ span: 1, images: [path] }));
}

// All the photos become ONE tile — a click-through stack on the site.
function addAsStack(target, paths) {
  const projects = content.sections[target.si].categories[target.ci].projects;
  projects.push({ span: 1, images: paths.slice() });
}

function addToStack(tileRef, paths) {
  projectsOf(tileRef)[tileRef.pi].images.push(...paths);
}

// Split a stack back into individual tiles, in place.
function unstack(tileRef) {
  const projects = projectsOf(tileRef);
  const tile = projects[tileRef.pi];
  const singles = tile.images.map(src => ({ span: tile.span || 1, images: [src] }));
  projects.splice(tileRef.pi, 1, ...singles);
}

// ---------- rendering ----------

function render() {
  const view = root();
  view.innerHTML = '';

  const groups = collectGroups(content);
  const photoCount = groups.reduce((n, g) => n + g.tiles.reduce((m, t) => m + t.images.length, 0), 0);
  const stackCount = groups.reduce((n, g) => n + g.tiles.filter(t => t.images.length > 1).length, 0);

  const intro = document.createElement('p');
  intro.className = 'photos-intro';
  intro.textContent = `${photoCount} photos on the site` +
    (stackCount ? `, ${stackCount} of them in click-through stacks. ` : '. ') +
    'Changes go live about a minute after you save.';
  view.appendChild(intro);

  groups.forEach(group => {
    const section = document.createElement('section');
    section.className = 'photo-group';

    const head = document.createElement('div');
    head.className = 'photo-group-head';
    const h = document.createElement('h2');
    h.textContent = group.label;
    const count = document.createElement('span');
    count.className = 'photo-count';
    const n = group.tiles.reduce((m, t) => m + t.images.length, 0);
    count.textContent = n + (n === 1 ? ' photo' : ' photos');
    head.append(h, count);

    if (group.target) {
      const addBtn = document.createElement('button');
      addBtn.className = 'photo-add';
      addBtn.textContent = '+ Add photos';
      addBtn.title = 'Each photo becomes its own tile on the site';
      addBtn.addEventListener('click', () =>
        pickFiles(true, files => doAdd(group.target, files, false)));

      const stackBtn = document.createElement('button');
      stackBtn.className = 'photo-add photo-add-ghost';
      stackBtn.textContent = '+ Add as stack';
      stackBtn.title = 'All the photos you pick become ONE tile that visitors click through';
      stackBtn.addEventListener('click', () =>
        pickFiles(true, files => doAdd(group.target, files, true)));

      const wrap = document.createElement('div');
      wrap.className = 'photo-add-group';
      wrap.append(addBtn, stackBtn);
      head.appendChild(wrap);
    }
    section.appendChild(head);

    if (group.note) {
      const note = document.createElement('p');
      note.className = 'photo-note';
      note.textContent = group.note;
      section.appendChild(note);
    }

    if (!group.tiles.length) {
      const empty = document.createElement('p');
      empty.className = 'photo-empty';
      empty.textContent = 'No photo here yet.';
      section.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.className = 'tile-grid';
      group.tiles.forEach(tile => grid.appendChild(buildTileCard(tile, group)));
      section.appendChild(grid);
    }

    view.appendChild(section);
  });
}

function buildTileCard(tile, group) {
  const stacked = tile.images.length > 1;
  const card = document.createElement('figure');
  card.className = 'tile-card' + (stacked ? ' is-stacked' : '');

  if (stacked) {
    const badge = document.createElement('span');
    badge.className = 'stack-badge';
    badge.textContent = `Stack · ${tile.images.length}`;
    badge.title = 'Visitors click through these on the site';
    card.appendChild(badge);
  } else if (tile.badge) {
    const badge = document.createElement('span');
    badge.className = 'stack-badge stack-badge-plain';
    badge.textContent = tile.badge;
    card.appendChild(badge);
  }

  const shots = document.createElement('div');
  shots.className = 'tile-shots' + (stacked ? ' many' : '');

  tile.images.forEach((photo, idx) => {
    const shot = document.createElement('div');
    shot.className = 'tile-shot';

    const img = document.createElement('img');
    img.src = photo.src + (photo.src.startsWith('http') ? '' : '?v=' + Date.now());
    img.alt = '';
    img.loading = 'lazy';
    shot.appendChild(img);

    if (stacked) {
      const order = document.createElement('span');
      order.className = 'shot-order';
      order.textContent = idx + 1;
      order.title = idx === 0 ? 'Shown first on the site' : `Click ${idx} to reach this one`;
      shot.appendChild(order);
    }

    const acts = document.createElement('div');
    acts.className = 'shot-actions';

    const replace = document.createElement('button');
    replace.className = 'photo-btn';
    replace.textContent = 'Replace';
    replace.addEventListener('click', () => pickFiles(false, files => doReplace(photo.ref, files[0])));
    acts.appendChild(replace);

    if (!group.single) {
      const del = document.createElement('button');
      del.className = 'photo-btn photo-btn-danger';
      del.textContent = 'Delete';
      del.addEventListener('click', () => doDelete(photo.ref, stacked));
      acts.appendChild(del);
    }

    shot.appendChild(acts);
    shots.appendChild(shot);
  });

  card.appendChild(shots);

  // Stack controls only make sense for the portfolio grids.
  if (group.stackable && tile.ref) {
    const foot = document.createElement('div');
    foot.className = 'tile-foot';

    const addTo = document.createElement('button');
    addTo.className = 'tile-foot-btn';
    addTo.textContent = stacked ? '+ Add to stack' : '+ Stack a photo on this';
    addTo.addEventListener('click', () => pickFiles(true, files => doAddToStack(tile.ref, files)));
    foot.appendChild(addTo);

    if (stacked) {
      const split = document.createElement('button');
      split.className = 'tile-foot-btn';
      split.textContent = 'Unstack';
      split.title = 'Split these into separate tiles';
      split.addEventListener('click', () => doUnstack(tile.ref, tile.images.length));
      foot.appendChild(split);
    }
    card.appendChild(foot);
  }

  return card;
}

// ---------- actions ----------

function pickFiles(multiple, onPick) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = multiple;
  input.addEventListener('change', () => {
    const files = [...input.files].filter(f => f.type.startsWith('image/'));
    if (files.length) onPick(files);
  });
  input.click();
}

async function doReplace(ref, file) {
  await withBusy('Uploading photo…', async () => {
    const prepared = await prepare(file);
    setPhoto(ref, prepared.path);
    await saveContent(content, [prepared], 'Replace a photo from the dashboard');
  });
}

async function doAdd(target, files, asStack) {
  const label = asStack
    ? `Uploading ${files.length} photo${files.length > 1 ? 's' : ''} as one stack…`
    : `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;
  await withBusy(label, async () => {
    const prepared = [];
    for (const file of files) prepared.push(await prepare(file));
    const paths = prepared.map(p => p.path);
    if (asStack) addAsStack(target, paths);
    else addSeparateTiles(target, paths);
    await saveContent(content, prepared, asStack ? 'Add a photo stack from the dashboard' : 'Add photos from the dashboard');
  });
}

async function doAddToStack(tileRef, files) {
  await withBusy(`Adding ${files.length} to the stack…`, async () => {
    const prepared = [];
    for (const file of files) prepared.push(await prepare(file));
    addToStack(tileRef, prepared.map(p => p.path));
    await saveContent(content, prepared, 'Add photos to a stack from the dashboard');
  });
}

async function doUnstack(tileRef, howMany) {
  if (!confirm(`Split this stack into ${howMany} separate tiles?\n\nThe photos stay on the site — they just stop being a click-through group.`)) return;
  await withBusy('Unstacking…', async () => {
    unstack(tileRef);
    await saveContent(content, [], 'Unstack photos from the dashboard');
  });
}

async function doDelete(ref, stacked) {
  const message = stacked
    ? 'Remove this photo from the stack?'
    : 'Remove this photo from the site?';
  if (!confirm(message + '\n\nIt stops showing on the site. This can be undone by re-uploading it.')) return;
  await withBusy('Removing photo…', async () => {
    removePhoto(ref);
    await saveContent(content, [], 'Remove a photo from the dashboard');
  });
}

async function withBusy(message, work) {
  if (busy) return;
  busy = true;
  showToast(message, 'working');
  try {
    await work();
    showToast('Saved — live in about a minute.', 'ok');
    render();
  } catch (err) {
    // Reload from the branch so the screen never shows a change that failed.
    showToast(err.message || 'Could not save. Nothing was changed.', 'error');
    try { content = await loadContent(); render(); } catch { /* keep what we have */ }
  }
  busy = false;
}

// Re-encode before upload: keeps the repo small and pages fast, and means
// Desmond can drag straight-off-the-camera files in without thinking about it.
async function prepare(file) {
  let bytes, ext = 'jpg';
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);

  if (!bitmap) {
    bytes = new Uint8Array(await file.arrayBuffer());
    ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  } else {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // PNGs may be transparent cutouts (the About portrait) — keep them PNG.
    const isPng = file.type === 'image/png';
    const blob = await new Promise(r => canvas.toBlob(r, isPng ? 'image/png' : 'image/jpeg', JPEG_QUALITY));
    bytes = new Uint8Array(await blob.arrayBuffer());
    ext = isPng ? 'png' : 'jpg';
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const clean = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40) || 'photo';
  const path = `photos/uploads/${stamp}-${clean}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  return { path, bytes };
}

// ---------- small UI helpers ----------

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

function errorBox(message) {
  const box = document.createElement('div');
  box.className = 'dash-error';
  const h = document.createElement('h3');
  h.textContent = message;
  box.appendChild(h);
  return box;
}
