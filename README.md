# Neharika's Retail Therapy

A personal shopping-link board that syncs between your phone and laptop.
Tap a card's link to open the site in a new tab. Tap the rest of the card
to write comments and a store location.

## Setup — copy, paste, done

### 1. Push these 5 files to a GitHub repo (public is fine)
`index.html`, `style.css`, `app.js`, `firebase-config.js`, `README.md` —
all exactly as given, in the same folder (repo root).

### 2. Turn on syncing (~5 minutes, free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com),
   sign in with any Google account, click **Add project**, name it anything,
   finish the wizard (skip Analytics).
2. Left sidebar → **Build → Firestore Database** → **Create database** →
   pick any region → start in test mode → **Enable**.
3. Click the **Rules** tab (next to "Data") and replace whatever is there
   with this, then click **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   This makes the app work indefinitely with no login — test mode alone
   would quietly stop working after 30 days.
4. Gear icon → **Project settings** → scroll to **Your apps** → click the
   **</>** web icon → give it any nickname → skip Hosting → **Register app**.
5. Copy the six values Firebase shows you (`apiKey`, `authDomain`, etc.)
   into `firebase-config.js`, replacing the `YOUR_...` placeholders.
6. Push that updated `firebase-config.js` to GitHub too.

### 3. Turn on GitHub Pages

Repo → **Settings → Pages** → **Source: Deploy from a branch** → pick your
branch and `/ (root)` → **Save**. GitHub gives you a live URL in a minute
or two. Open it on your phone, add it to your home screen, and you're set —
same list, live, on both devices.

## Using it

- **+ button** (bottom right) — add a link, name it, pick or create a category.
- **Link on each card** — tap it to open that site in a new tab.
- **Rest of the card** — tap to add comments and a store location.
- **Category chips** up top — tap to filter.
