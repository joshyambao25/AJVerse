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

- **Home:** month balance, who spent what (You / Partner / Shared), partner's location, battery and latest mood, bills due this week, days-together counter.
- **Money → Activity:** income and expenses per month, category chart, filter by You / Partner / Shared.
- **Money → Budgets:** monthly limits per category (personal or shared). Turns amber at 80% and red when over.
- **Money → Goals:** savings goals. Tap one to add or withdraw savings.
- **Money → Bills:** recurring bills. Tick them as paid each month, with the option to log each as an expense.
- **Places:** map of you both, location sharing on/off, battery, directions to your partner, one-tap check-ins.
- **Updates:** private feed with moods and notes. Tap ♥ to react.
- **Lists:** shared grocery and to-do lists.
- **Settings:** name, invite code, anniversary, currency, location privacy, sign out.

## Good to know
- **Offline:** you can add and edit anything with no signal, and a yellow banner shows you're offline. Two things need internet: first sign-in on a phone, and pairing with the code.
- **Location:** a web app can only read GPS while it's open on screen. Your partner sees where you were when you last had OurNest open, and check-ins always send your current spot.
- **Notifications:** not included in this version.
