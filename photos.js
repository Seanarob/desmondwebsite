// Visual photo manager: every photo on the site, grouped the way the site is,
// with replace / delete / add. No JSON, no nested forms.
//
// Each photo carries a "ref" describing where it lives in content.json, so a
// swap is a small edit to the content object followed by one commit.

import { loadContent, saveContent } from './gitstore.js';

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.86;

let content = null;      // working copy
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

// ---------- mapping content.json to a flat, groupable list ----------

function collectGroups(c) {
  const groups = [];

  groups.push({
    key: 'hero',
    label: 'Home screen',
    note: 'The big photo behind the sticker.',
    fixed: true, // exactly one photo, replace only
    photos: c.hero.image ? [{ src: c.hero.image, ref: { type: 'hero' } }] : []
  });

  (c.sections || []).forEach((section, si) => {
    (section.categories || []).forEach((cat, ci) => {
      const photos = [];
      (cat.projects || []).forEach((project, pi) => {
        (project.images || []).forEach((src, ii) => {
          photos.push({ src, ref: { type: 'project', si, ci, pi, ii } });
        });
      });
      groups.push({
        key: `s${si}c${ci}`,
        label: cat.name ? `${section.heading} · ${cat.name}` : section.heading,
        note: 'Tap a photo to replace or remove it.',
        addTo: { si, ci },
        photos
      });
    });
  });

  const fit = c.fitOfTheWeek;
  if (fit) {
    const photos = [];
    if (fit.currentWinner && fit.currentWinner.image) {
      photos.push({ src: fit.currentWinner.image, ref: { type: 'fitCurrent' }, badge: 'This week' });
    }
    (fit.pastWinners || []).forEach((w, i) => {
      if (w.image) photos.push({ src: w.image, ref: { type: 'fitPast', i }, badge: w.week || w.name || '' });
    });
    groups.push({
      key: 'fit',
      label: 'Fit Check winners',
      note: 'Set the weekly winner in Edit site — this is just their photos.',
      noAdd: true,
      photos
    });
  }

  groups.push({
    key: 'about',
    label: 'About portrait',
    note: 'Needs a see-through background (PNG cutout).',
    fixed: true,
    photos: c.about.photo ? [{ src: c.about.photo, ref: { type: 'about' } }] : []
  });

  return groups;
}

function setPhoto(ref, path) {
  if (ref.type === 'hero') content.hero.image = path;
  else if (ref.type === 'about') content.about.photo = path;
  else if (ref.type === 'fitCurrent') content.fitOfTheWeek.currentWinner.image = path;
  else if (ref.type === 'fitPast') content.fitOfTheWeek.pastWinners[ref.i].image = path;
  else content.sections[ref.si].categories[ref.ci].projects[ref.pi].images[ref.ii] = path;
}

function removePhoto(ref) {
  if (ref.type === 'hero') content.hero.image = '';
  else if (ref.type === 'about') content.about.photo = '';
  else if (ref.type === 'fitCurrent') content.fitOfTheWeek.currentWinner.image = '';
  else if (ref.type === 'fitPast') content.fitOfTheWeek.pastWinners.splice(ref.i, 1);
  else {
    const projects = content.sections[ref.si].categories[ref.ci].projects;
    projects[ref.pi].images.splice(ref.ii, 1);
    // A tile with no photos left would render as an empty box — drop it.
    if (!projects[ref.pi].images.length) projects.splice(ref.pi, 1);
  }
}

function addPhotos(target, paths) {
  const projects = content.sections[target.si].categories[target.ci].projects;
  paths.forEach(path => projects.push({ span: 1, images: [path] }));
}

// ---------- rendering ----------

function render() {
  const view = root();
  view.innerHTML = '';

  const groups = collectGroups(content);
  const total = groups.reduce((n, g) => n + g.photos.length, 0);

  const intro = document.createElement('p');
  intro.className = 'photos-intro';
  intro.textContent = `${total} photos on the site. Changes go live about a minute after you save.`;
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
    count.textContent = group.photos.length + (group.photos.length === 1 ? ' photo' : ' photos');
    head.append(h, count);

    if (group.addTo) {
      const add = document.createElement('button');
      add.className = 'photo-add';
      add.textContent = '+ Add photos';
      add.addEventListener('click', () => pickFiles(true, files => doAdd(group.addTo, files)));
      head.appendChild(add);
    }
    section.appendChild(head);

    if (group.note) {
      const note = document.createElement('p');
      note.className = 'photo-note';
      note.textContent = group.note;
      section.appendChild(note);
    }

    if (!group.photos.length) {
      const empty = document.createElement('p');
      empty.className = 'photo-empty';
      empty.textContent = 'No photo here yet.';
      section.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.className = 'photo-grid';
      group.photos.forEach(photo => grid.appendChild(buildTile(photo, group)));
      section.appendChild(grid);
    }

    view.appendChild(section);
  });
}

function buildTile(photo, group) {
  const tile = document.createElement('figure');
  tile.className = 'photo-tile';

  const img = document.createElement('img');
  img.src = photo.src + (photo.src.startsWith('http') ? '' : '?v=' + Date.now());
  img.alt = '';
  img.loading = 'lazy';
  tile.appendChild(img);

  if (photo.badge) {
    const badge = document.createElement('span');
    badge.className = 'photo-badge';
    badge.textContent = photo.badge;
    tile.appendChild(badge);
  }

  const actions = document.createElement('div');
  actions.className = 'photo-actions';

  const replace = document.createElement('button');
  replace.className = 'photo-btn';
  replace.textContent = 'Replace';
  replace.addEventListener('click', () => pickFiles(false, files => doReplace(photo.ref, files[0])));
  actions.appendChild(replace);

  if (!group.fixed) {
    const del = document.createElement('button');
    del.className = 'photo-btn photo-btn-danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => doDelete(photo));
    actions.appendChild(del);
  }

  tile.appendChild(actions);
  return tile;
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

async function doAdd(target, files) {
  await withBusy(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`, async () => {
    const prepared = [];
    for (const file of files) prepared.push(await prepare(file));
    addPhotos(target, prepared.map(p => p.path));
    await saveContent(content, prepared, 'Add photos from the dashboard');
  });
}

async function doDelete(photo) {
  const ok = confirm('Remove this photo from the site?\n\nIt stops showing on the site. This can be undone by re-uploading it.');
  if (!ok) return;
  await withBusy('Removing photo…', async () => {
    removePhoto(photo.ref);
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
