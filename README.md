# Desmond Flanagan — Portfolio Site

Single-page portfolio: full-screen hero, MODELING and PHOTOGRAPHY grids, CASTING calls with an
application form, FIT CHECK (the weekly fit contest), and an About section with a booking form.

Everything visible on the site comes from `content.json`. Desmond edits that file through the
admin panel at `/admin/` — he never touches code.

---

## Run it locally

```bash
python3 -m http.server 4173
```

Then open http://127.0.0.1:4173

Two things don't work locally, and that's expected:
- **Forms** only submit once deployed to Netlify.
- **The admin panel** needs Netlify Identity, so log in on the live site, not locally.

> If an edit doesn't show up, it's browser cache — `python3 -m http.server` sends no cache headers.
> Open it via `127.0.0.1` instead of `localhost` (or hard-reload). Netlify sends proper headers, so
> this only ever bites during local dev.

---

## 1. Put it on Netlify

The site needs to be on GitHub first, because the admin panel saves by committing to the repo.

```bash
git commit -m "Portfolio site with Fit Check, CMS, and forms"
```

Create an empty repo on github.com (no README, no .gitignore), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Then on [netlify.com](https://app.netlify.com): **Add new site → Import an existing project → GitHub**,
pick the repo, and deploy. There's no build step — `netlify.toml` tells it to publish the folder as-is.

You'll get a URL like `desmondflanagan.netlify.app`. Rename it under **Site configuration → Site details**.

---

## 2. Give Desmond the admin panel

This is what lets him swap photos and post castings himself.

1. **Site configuration → Identity → Enable Identity.**
2. Under **Registration**, set it to **Invite only**. (Important — otherwise anyone can sign up and edit the site.)
3. Scroll to **Services → Git Gateway → Enable Git Gateway.**
4. Go to the **Identity** tab → **Invite users** → enter Desmond's email.

He gets an email, clicks the link, sets a password, and lands in the editor. After that he just goes
to `yoursite.com/admin/` and logs in.

**What he can edit:** every photo and every piece of text — hero image, all portfolio grids, casting
calls, the Fit Check winner, bio, email, Instagram handles. Saving publishes it; the site rebuilds in
under a minute.

Photos he uploads go to `photos/uploads/`. The existing `photos/modeling/` and `photos/photography/`
files keep working exactly as they are.

---

## 3. Custom domain

Buy the domain first (Namecheap, Porkbun, and Cloudflare are all fine — roughly $10–15/year for a .com).

Then in Netlify: **Domain management → Add a domain**, type it in, and Netlify tells you which records
to set. Two ways to do it:

- **Easiest — point the nameservers at Netlify.** Copy the four nameservers Netlify shows you and paste
  them into your registrar's nameserver settings. Netlify then handles all DNS.
- **Or keep DNS at your registrar** and add these records:

  | Type  | Name  | Value                       |
  |-------|-------|-----------------------------|
  | A     | `@`   | `75.2.60.5`                 |
  | CNAME | `www` | `YOUR-SITE.netlify.app`     |

  (Netlify shows the exact values on that screen — use those, since the A record IP can change.)

DNS takes anywhere from a few minutes to a few hours. HTTPS turns itself on automatically once it
resolves — don't do anything for that.

Identity logins keep working across the domain change, so Desmond doesn't need re-inviting.

---

## 4. Forms — where submissions go

Three forms, all handled by Netlify. No backend, no third-party service.

| Form | Where it is | What it collects |
|------|-------------|------------------|
| `model-application` | Casting section | Name, email, phone, IG, age, height, which shoot, experience |
| `fit-of-the-week` | Fit Check section | Name, email, IG, city, **photo upload**, description |
| `booking` | About section | Name, email, service type, date, details |

**Netlify ships new sites with form detection turned OFF.** Until you turn it on, submitting returns
a 404 and the data is lost. Do this first:

1. **Forms → Enable form detection**
2. **Deploys → Trigger deploy → Deploy site**

The second step is required — Netlify only scans HTML for forms during a deploy, so flipping the
toggle does nothing to the build that's already live. All three forms register at once, since they're
all in the same `index.html`.

Submissions appear in the Netlify dashboard under **Forms**. Photos from Fit Check are downloadable
right from each submission.

**Turn on email notifications** (otherwise nobody knows a submission came in):
**Forms → Settings and usage → Form notifications → Add notification → Email notification.**
Do this once per form and send them to Desmond's email.

Spam is handled by a hidden honeypot field. If junk still gets through, enable reCAPTCHA in the same
settings area.

---

## 5. The weekly Fit Check routine

This is the feature Desmond asked for: people send in a fit each week, the flyest one gets a
guaranteed spot in a shoot.

**How it works for visitors:** they scroll to FIT CHECK, tap the box, pick a photo from their phone,
fill in name/email/IG, and submit. Their photo is *not* posted publicly — only the winner's is.

**Desmond's weekly loop:**
1. Open **Forms → fit-of-the-week** in Netlify and look through the week's entries.
2. Pick a winner, download their photo.
3. Go to `/admin/` → **Fit Check (weekly contest)**.
4. Move the old winner down into **Past winners**, then fill in **This week's winner** with the new
   name, IG, photo, and week (e.g. "WEEK OF JUL 20").
5. Publish. It's live in under a minute.

Before the first winner is picked, the section shows a "First winner drops soon" card automatically —
so it never looks broken or empty.

To pause the contest entirely, flip **Show this section on the site** off in the admin panel. The whole
section and its menu link disappear.

**Photo uploads:** Netlify caps a form submission at 8MB. The site shrinks every photo to 1600px in the
browser before uploading, so a straight-off-the-iPhone photo goes through fine. Rotation from portrait
phone shots is corrected too.

---

## 6. Editing content by hand (if you ever need to)

The admin panel is the normal way, but `content.json` is plain text and can be edited directly.

- `hero.image` — the big full-screen photo.
- `hero.stickerLine1` / `stickerLine2` — handwritten sticker text over the hero.
- `sections` — the portfolio grids. Each has a `heading` and `categories`; each category has a `name`
  (`""` for none) and `projects`. Each project is one tile:
  - `images` — one photo = plain tile; multiple = click-through carousel with a counter.
  - `span` — `1` normal, `2` double-wide.
- `casting.shoots` — add an entry per shoot; set `"open": false` when it's cast.
- `fitOfTheWeek` — `enabled`, the copy, `currentWinner`, and `pastWinners`.
- `about` — cutout photo, banner colour, bio paragraphs, Featured In, email, Instagram handles.

The About photo must be a **transparent-background PNG** — the figure sits on the ABOUT banner as you
scroll. On a Mac: right-click in Finder → Quick Actions → Remove Background.

Keep photos under ~2000px on the long edge so the site stays quick:

```bash
sips --resampleHeightWidthMax 1800 photo.jpg
```

---

## Notes for whoever works on this next

- **`overflow-anchor: none` is load-bearing.** Anything with an infinite CSS animation (the marquees)
  will cancel smooth scrolling site-wide in Chrome without it.
- **Scroll is driven manually** in `smoothScrollTo()` — Chrome ignores native smooth scrolls on this
  page because of the long distances and animating content.
- **The parallax loop polls every frame** rather than listening for `scroll`, because programmatic
  `scrollTo` doesn't reliably fire scroll events.
- **Tiles are sized from image aspect ratio after load** (`sizeTile`), so layout shifts as photos come
  in. `history.scrollRestoration` is set to `manual` for that reason.
- **Never bind JS to `data-netlify`.** Netlify strips `data-netlify` and `netlify-honeypot` from the
  HTML it serves, so any selector built on them works locally and silently breaks in production.
  `setupFormSubmit` binds on the hidden `form-name` input instead, which Netlify always keeps.
- **`admin/config.yml` must stay in sync with `content.json`.** If you add a field to one, add it to
  the other or it won't be editable in the CMS. The `branch:` in that file must match the repo's
  default branch (`main`).
