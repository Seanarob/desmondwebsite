// Reading and writing the site's content through Netlify Git Gateway.
//
// Git Gateway proxies a GitHub-shaped API at /.netlify/git/github, authorised
// by the same Netlify Identity token the dashboard already holds. That means
// no extra credentials: if you can log in, you can save. This is the same
// mechanism Decap CMS uses internally.
//
// Writes go through the git trees API rather than the simpler contents API so
// a photo swap (new image file + updated content.json) lands as ONE commit,
// and therefore one deploy, instead of two.

const GIT = '/.netlify/git/github';
const BRANCH = 'main';

async function authHeader() {
  const user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
  if (!user) throw new Error('Not logged in.');
  const token = await user.jwt(); // refreshes if close to expiry
  return { Authorization: 'Bearer ' + token };
}

async function git(path, options = {}) {
  const headers = Object.assign(await authHeader(), options.headers || {});
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(GIT + path, Object.assign({}, options, { headers }));
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* not json */ }
    const err = new Error(detail || ('Git Gateway ' + res.status));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Read content.json straight from the branch, so the editor always works from
// what's actually committed rather than a CDN-cached copy.
export async function loadContent() {
  const file = await git(`/contents/content.json?ref=${BRANCH}`);
  const json = decodeURIComponent(escape(atob(file.content.replace(/\s/g, ''))));
  return JSON.parse(json);
}

function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Commit a content.json update plus any new image files as a single commit.
 * @param {object} content     the updated content object
 * @param {Array}  uploads     [{ path, bytes: Uint8Array }]
 * @param {string} message     commit message
 */
export async function saveContent(content, uploads, message) {
  // 1. where the branch currently points
  const ref = await git(`/git/refs/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const headCommit = await git(`/git/commits/${headSha}`);

  // 2. upload each new image as a blob
  const tree = [];
  for (const file of uploads) {
    const blob = await git('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: toBase64(file.bytes), encoding: 'base64' })
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 3. content.json goes in as plain text
  tree.push({
    path: 'content.json',
    mode: '100644',
    type: 'blob',
    content: JSON.stringify(content, null, 2) + '\n'
  });

  // 4. build a tree on top of the current one, commit it, move the branch
  const newTree = await git('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree })
  });
  const commit = await git('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] })
  });
  await git(`/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha })
  });

  return commit.sha;
}
