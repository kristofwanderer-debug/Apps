# Remote Viewing Monitor

A blind session monitor for remote-viewing practice. Fetches a real target
photo plus N control photos from public sources, hides them server-side,
issues a coordinate, silently logs your staged impressions (sketch, voice,
or typed), then blind-grades your session against the target and every
control before revealing the image.

This doc is the complete, exact path from "I have this code" to "I have a
working Android app on my phone." Follow it in order.

---

## 0. What you're getting

```
Apps/                              <- your GitHub repo
├── .github/workflows/build-apk.yml   <- builds the Android APK automatically
├── render.yaml                       <- one-click backend hosting config
└── remote-viewing-monitor/
    ├── server/                       <- Node/Express backend (the "brain")
    └── client/                       <- React frontend, also packaged into the Android app
```

The **backend** must run somewhere on the internet with an HTTPS URL (it
holds your Anthropic API key and does all the image fetching/grading - it
must never run only on your phone). The **Android app** is the frontend,
built to call that backend URL.

---

## 1. Get an Anthropic API key

1. Go to <https://console.anthropic.com/settings/keys> and create a key.
2. Keep it somewhere safe. You'll paste it into Render in step 3, never into
   any file you commit to GitHub.

(Optional) An Unsplash API key as a fallback image source: free at
<https://unsplash.com/developers> - only needed if Wikimedia Commons keeps
returning unusable candidates, which should be rare.

---

## 2. Push this code to your GitHub repo

You already have `https://github.com/kristofwanderer-debug/Apps.git` (currently
empty). I can't push to it myself from this sandbox (no GitHub credentials
here), so run this on your own machine, in a terminal, once you've downloaded
the project files I sent you:

```bash
# 1. Unzip the project archive I sent you, then cd into it
cd rv-monitor          # the unzipped folder (already a git repo)

# 2. Point it at your GitHub repo
git remote add origin https://github.com/kristofwanderer-debug/Apps.git
git branch -M main

# 3. Commit and push
git add -A
git commit -m "Add Remote Viewing Monitor app"
git push -u origin main
```

If `git push` asks for a password, GitHub no longer accepts your account
password there - use a Personal Access Token instead
(<https://github.com/settings/tokens> -> "Generate new token (classic)",
scope `repo`) as the password when prompted, or set up the GitHub CLI
(`gh auth login`) first and it'll handle this for you.

---

## 3. Deploy the backend (Render, free tier)

1. Go to <https://dashboard.render.com> and sign up/log in (GitHub login is
   easiest).
2. **New -> Blueprint**, connect your `Apps` repo. Render will detect
   `render.yaml` at the repo root automatically and propose a service named
   `rv-monitor-api`.
3. Before it deploys, it'll ask you to fill in the environment variables
   marked `sync: false`:
   - `ANTHROPIC_API_KEY` - paste the key from step 1.
   - `UNSPLASH_ACCESS_KEY` - optional, can leave blank.
4. Click **Apply / Create**. Wait for the first deploy to finish (a few
   minutes). Render will give you a URL like
   `https://rv-monitor-api.onrender.com` - **copy this**, you need it next.
5. Sanity-check it: open `https://rv-monitor-api.onrender.com/api/health` in
   a browser. You should see `{"ok":true,"hasApiKey":true}`. If
   `hasApiKey` is `false`, go to the service's **Environment** tab on Render
   and confirm `ANTHROPIC_API_KEY` is actually set, then it'll redeploy.

**Important - free tier behavior:**
- Render's free web services spin down after ~15 minutes of no traffic. The
  first request after that takes 30-50 seconds to wake back up (starting a
  session will just look slow the first time) - this is normal.
- Render's free tier has an **ephemeral filesystem**: your session history
  (the SQLite database) will be wiped whenever the service restarts or you
  redeploy. This is fine for trying things out. If you want history to
  persist long-term, upgrade that Render service to a paid instance type,
  add a **Disk** (Render dashboard -> your service -> Disks -> Add Disk,
  mount path e.g. `/var/data`), and set the `DATA_DIR` environment variable
  to that same path (`/var/data`). Until then, use "Export CSV/JSON" in the
  History screen regularly if you want a durable copy.

---

## 4. Build the Android APK (GitHub Actions - fully automatic)

Once your code is pushed (step 2) and your backend is live (step 3):

1. On GitHub, go to your repo -> **Settings -> Secrets and variables ->
   Actions -> Variables tab -> New repository variable**:
   - Name: `API_BASE_URL`
   - Value: your Render URL from step 3, e.g.
     `https://rv-monitor-api.onrender.com` (no trailing slash)
2. Go to the **Actions** tab -> "Build Remote Viewing Monitor APK" -> **Run
   workflow** (or just push any change to `remote-viewing-monitor/**` and it
   runs automatically).
3. Wait for it to go green (5-10 minutes - it's installing an Android SDK
   from scratch each time).
4. Get the APK either way:
   - **Releases** (right sidebar of your repo, or
     `github.com/kristofwanderer-debug/Apps/releases`) -> a release tagged
     `latest-apk` always has the newest build attached. This is the
     easiest link to bookmark and re-download from your phone.
   - Or the workflow run's **Artifacts** section (`rv-monitor-debug-apk.zip`).
5. On your Android phone, open that link in Chrome, download the `.apk`,
   tap it. Android will ask to allow installing from this source the first
   time - allow it, then install.

This is a **debug-signed APK** (fine for installing on your own device;
not intended for the Play Store as-is).

---

## 5. (Optional) Build/run it yourself in Android Studio

Since you're installing Android Studio anyway, this gives you a local
build/run loop (emulator or USB-connected phone) without waiting on CI:

```bash
cd remote-viewing-monitor/client
npm install
echo "VITE_API_BASE_URL=https://rv-monitor-api.onrender.com" > .env.production
npm run build
npx cap add android      # first time only - generates the android/ folder
npx cap sync android      # re-run this after any change to client/
npx cap open android      # opens Android Studio
```

Then just hit Run in Android Studio. Re-run `npm run build && npx cap sync
android` any time you change frontend code, before running again.

Note: the `android/` folder is intentionally **not** committed to git (it's
generated fresh both by you here and by the GitHub Actions workflow) - this
keeps the repo small and avoids committing machine-specific build files.

---

## 6. Using the app

1. **New Session** - pick how many control images (1-5), tap it. The
   backend fetches and screens a target + controls from Wikimedia Commons
   (falling back to Unsplash), rejecting anything graphic/violent/sexual,
   text-heavy, or a diagram/logo/scan - and rejects controls too similar to
   the target's subject/setting.
2. **Coordinate** appears - tap **Begin Session**.
3. **Listening phase** - three stages (Gestalts & Sketch, Sensory,
   Dimensional), each with its own sketch canvas and/or quick-tag fields,
   plus Free Notes throughout. Speak or type - your mic stays live and logs
   continuously without interrupting you. Saying "session complete" out
   loud ends the session early, same as tapping **Finished**.
4. **Analysis** - blind grading runs (the AI never knows which image is the
   target while grading).
5. **Reveal** - hit/miss breakdown, control comparison, then the actual
   target image with credit/license. Toggle **Show Controls** to see the
   controls and their scores too.
6. **History** - trend chart, per-stage hit rates, first-place-vs-chance
   rate with a p-value (informational only - small sample sizes prove
   nothing), and full session detail/export/delete.

---

## Known limitations / things to test on a real device

- **Voice input in the packaged app** uses the phone's native speech
  recognizer (Android's WebView doesn't support the browser's Web Speech
  API the way Chrome does), via the
  `@capacitor-community/speech-recognition` plugin. This needs the
  microphone permission (you'll be prompted on first use) and should be
  tested on a real device after your first build - typed input is always
  available as a full fallback if it needs tuning.
- Each session makes several Anthropic vision API calls (screening each
  candidate image, then one grading call per image against your
  impressions) - with the default of 3 controls that's roughly 4-8 calls
  per session, which has a small API cost per session.
- Image screening rejects candidates and retries automatically, silently,
  up to 20 times per image slot before giving up with an error - extremely
  unusual source material (or a misconfigured/expired API key) can surface
  as "Could not find a suitable target image."
