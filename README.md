# OurNest 💙 (web app version)

A private app for the two of you: shared and personal budgeting, live location, and little daily updates.
It works offline — anything you add is saved on the phone and syncs when you're back online.

**No Flutter, no Android Studio, nothing to compile.** It's plain HTML + CSS + JavaScript that you edit in
VS Code. Each phone installs it from a link with "Add to Home screen", and it gets its own icon.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The page that loads everything |
| `styles.css` | Colours, spacing, look and feel |
| `app.js` | All the app's features |
| `firebase-config.js` | **Your** Firebase keys (step 2) |
| `firestore.rules` | Security rules — only you two can see your data |
| `sw.js`, `manifest.webmanifest`, `icons/` | Make it installable and open offline |

---

## Setup (about 20 minutes, once)

### 1. Create the free Firebase project
1. Go to https://console.firebase.google.com and click **Create a project**. Name it `ournest`. You can turn off Analytics.
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database.** For location, pick **asia-southeast1 (Singapore)**. Start in **production mode**.
4. In Firestore, open the **Rules** tab. Delete what's there, paste everything from `firestore.rules`, and click **Publish**.

### 2. Connect the app to your Firebase
1. In Firebase, click the **gear icon → Project settings**.
2. Under **Your apps**, click the **`</>`** (Web) button. Name it `OurNest web` and click **Register app**. You don't need Firebase Hosting.
3. Firebase shows a `firebaseConfig = { ... }` block. Copy the values into **`firebase-config.js`**, replacing the placeholders.

### 3. Try it on your computer (VS Code)
1. In VS Code, choose **File → Open Folder** and pick this `ournest-web` folder.
2. VS Code will suggest the **Live Server** extension. Install it, or search "Live Server" by Ritwick Dey in Extensions.
3. Right-click **`index.html` → Open with Live Server**. The app opens at `http://localhost:5500`.
4. Sign up and tap **Create**. To test both sides, open a private/incognito window, sign up with a second email, and **Join** with the code.

> Whenever you save a file, Live Server reloads the page so you see the change right away.

### 4. Put it online so both phones can use it (free)
The simplest option is **GitHub Pages**. You only need a browser.

1. Create a free account at https://github.com.
2. Click **+ → New repository**. Name it `ournest`, set it to **Public**, and click **Create repository**.
3. Click **"uploading an existing file"**. Drag in **everything inside** the `ournest-web` folder (the files and the `icons` folder). Then click **Commit changes**.
4. Go to **Settings → Pages**. Under "Branch", choose **main** and **/ (root)**, then click **Save**.
5. After about a minute, your app is live at `https://YOUR-USERNAME.github.io/ournest/`.
6. **Important:** in Firebase, go to **Authentication → Settings → Authorized domains → Add domain** and enter `YOUR-USERNAME.github.io`. If you skip this, sign-in shows "This website address is not allowed yet".

> About privacy: a Public repository shows your code and Firebase config. That's normal and safe. Firebase web keys are meant to be public, and `firestore.rules` makes sure only the two of you can read your data. Your actual money and messages are never in the repository.

### 5. Install it on both phones
- **Android (Chrome):** open your link, tap **⋮ → Add to Home screen** (or **Install app**), then tap **Install**.
- **iPhone (Safari):** open your link, tap **Share → Add to Home Screen**.

Open OurNest from the new icon. It runs full-screen like a normal app.

### 6. Pair up
1. You: **Sign up → Create** → tap the share icon to send the 6-letter code.
2. Your partner: **Sign up → Join** → enter the code.

---

## Changing things later

1. Edit the files in VS Code and check the result with Live Server.
2. On GitHub, open your `ournest` repository, click **Add file → Upload files**, drag in the files you changed, and click **Commit changes**.
3. Next time either phone opens OurNest with internet, it loads the new version. Nothing needs reinstalling.

Common things to change:

| What | Where |
|---|---|
| App colours | `styles.css`, the top `:root` section (e.g. `--primary`, `--me`, `--partner`) |
| Expense / income categories and their emojis | `app.js`, `EXPENSE_CATS` and `INCOME_CATS` near the top |
| Moods, goal emojis, check-in buttons | `app.js`, `MOODS`, `GOAL_EMOJIS`, `CHECKINS` near the top |
| Currencies | `app.js`, `CURRENCIES` |
| Grocery / To-do list names | `app.js`, `LISTS` |
| Where the map starts | `app.js`, `DEFAULT_MAP_CENTER` |
| Home screen cards | `app.js`, function `homeView()` |

If you change `sw.js`, also bump `CACHE = 'ournest-v1'` to `'ournest-v2'` so phones pick it up.

---

## Features

- **Home**
  - A Locket-style photo widget: your partner's latest snap, big. Tap 📷 to snap one back, or ⤓ to save it as your wallpaper.
  - Month money summary (or a mini dashboard, or hidden — your choice in Settings).
  - Coming-up plans, partner's location/battery/mood, bills due, days-together counter.
- **Money**
  - **Overview** dashboard: income, spent, saved %, average per day, 6-month chart, where it went, who spent, budget health, goals, biggest expenses.
  - **Activity**, **Budgets**, **Goals**, **Bills** — with the You / Partner / Shared filter.
- **Plan**
  - **Calendar** with events and to-dos. Each one is **Together** (both see it) or **Just me** (only you can see it).
  - Reminders (at the time, 15 min, 1 hour or 1 day before). Only the person who added it gets the reminder.
  - If you open the app late, a "You may have missed these" pop-up shows them, with **Done** and **Snooze 1h**.
  - **Lists**: shared grocery and to-do lists.
- **Chat:** private messenger with photos, "Seen ✓✓" and an unread badge.
- **Moments**
  - Facebook-style posts with mood, text and a photo; ❤️ love and comments.
  - **Stories** (photo or coloured text) that last 24 hours, with a full-screen viewer and "Seen by" for your own.
- **Places:** live map, location sharing on/off, battery, directions, one-tap check-ins.
- **Settings:** invite code (only shown here), **Light / Dark / Auto theme**, Money-on-Home option, notifications, install button, anniversary, currency, privacy.

## Good to know
- **After this update, publish the new `firestore.rules` again** (Firebase → Firestore → Rules → paste → Publish). The calendar's "Just me" privacy depends on it.
- **Offline:** you can add and edit anything with no signal. Two things need internet: first sign-in on a phone, and pairing with the code.
- **Photos** are shrunk on the phone (about 100–400 KB each) and saved in Firestore, so they work on the free Firebase plan. The free plan holds 1 GB — thousands of photos.
- **Notifications:** turn on "Reminders & messages" in Settings on each phone. A web app can alert you while OurNest is open or running in the background. It can't wake a fully closed app — when you open it, any missed reminders pop up. (Always-on push needs Firebase Cloud Functions on the paid Blaze plan; that can be added later.) On iPhone, notifications only work after adding OurNest to the Home Screen (iOS 16.4+).
- **Home-screen widget:** web apps can't place real widgets on the phone's home screen. Instead: on Android, press and hold the OurNest icon for shortcuts (📸 Snap, ➕ Expense, 📅 Plan, 💬 Chat) and drag one to your home screen; and you can save the latest moment photo and set it as your wallpaper.
- **Location:** a web app reads GPS only while it's open. Check-ins always send your current spot.
