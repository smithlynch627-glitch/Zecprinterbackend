# ZEC PRINTER: start here

You have four pieces:

| File | What it is | Where it goes |
|---|---|---|
| `zec-printer-supabase.sql` | The whole database: tables, security, all functions | Supabase SQL Editor (run once) |
| `zec-printer-backend.zip` | API server: X login, tasks, points, referrals, wallets, WL ticket images | Railway |
| `zec-printer-frontend.zip` | The website: Home (with art gallery and FAQ) + OnBoard (WL) | Netlify |
| `zec-printer-admin-panel.html` | Admin panel, including Arts and mint wallets. Talks directly to Supabase. | Stays on your computer. Double-click to open. |

Everything is built and tested. What's left is creating the accounts and pasting your keys, which only you can do. Follow the steps in this order; it takes about 30 minutes.

**Already live?** Skip to [Updating your live setup](#updating-your-live-setup) at the end.

---

## Step 1: Supabase (database)

1. Create a project at supabase.com.
2. Left menu **SQL Editor → New query**. Paste the entire `zec-printer-supabase.sql`, press **Run**.
3. The result at the bottom shows `admin_panel_password`. **Copy it and save it somewhere safe.** It is shown only once.
4. **Project Settings → API**: copy three things:
   - **Project URL** (for Railway and the admin panel)
   - **service_role** key, secret (for Railway only)
   - **anon public** key (for the admin panel only; newer projects call it the **publishable** key)

Lost the admin password? Set a new one in the SQL Editor:
```sql
select app.admin_set_panel_password('a-new-password-at-least-12-chars');
```

---

## Step 2: Put the backend on Railway

Unzip `zec-printer-backend.zip`, then in PowerShell:

```powershell
cd zec-printer-backend
npm install -g @railway/cli
railway login
railway init
railway up
railway domain
```

`railway domain` prints your backend URL, like `https://zec-printer-production.up.railway.app`. Save it.
The deploy crashes until step 4. That is expected.

---

## Step 3: Set up X login

X is used only to log people in. Everything is on your app's **Keys & Tokens** page in console.x.com.

**A. Register the login.** Under **OAuth 2.0 Keys → User authentication settings**, press **Set up**:

- App permissions: **Read**
- Type of App: **Web App, Automated App or Bot**
- Callback URI / Redirect URL: `https://YOUR-BACKEND-URL/auth/x/callback` (your URL from step 2, exactly like this)
- Website URL: your backend URL for now. Change it to your Netlify URL after step 5.
- Press **Save**. X now shows a **Client ID** and **Client Secret** once. Copy both into a note. They're only for the backup mode below, but X won't show the secret again.

**B. Get the Consumer Key and Secret.** Under **OAuth 1.0 Keys → Consumer Key**, press **Regenerate**. X shows the **Consumer Key** (also called API Key) and the **Consumer Secret** (API Key Secret) once. Copy both. The eye icon only shows the key, never the secret, so regenerate if you don't have the secret saved.

You don't need the **Bearer Token** or the **Access Token** rows.

### Login modes

| Mode | Uses | Cost per login |
|---|---|---|
| `oauth1` (default) | Consumer Key + Secret | $0. X gives the user's id and username as part of the login itself. No profile is read. |
| `oauth2` (backup) | Client ID + Secret | About $0.01. X doesn't include the username in this kind of login, so the backend reads the profile once. Needs X API credits. |

Start with `oauth1`. X has an open issue where some Pay Per Use apps get an error on this login until X staff fix the app on their side. If you see "X login is not set up correctly yet" after checking the callback URL and keys, set `X_AUTH_MODE=oauth2` in Railway to keep going, and ask X to fix the app (see "If something goes wrong").

---

## Step 4: Give the backend its keys

Make a session secret in PowerShell:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Railway dashboard → your service → **Variables → Raw Editor**. Paste this, fill in your values, save:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
X_AUTH_MODE=oauth1
X_CONSUMER_KEY=your-consumer-key
X_CONSUMER_SECRET=your-consumer-secret
X_CLIENT_ID=your-client-id
X_CLIENT_SECRET=your-client-secret
X_REDIRECT_URI=https://YOUR-BACKEND-URL/auth/x/callback
FRONTEND_URL=https://placeholder.netlify.app
SESSION_SECRET=the-string-you-just-made
```

Where each value comes from:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (step 1) |
| `X_CONSUMER_KEY`, `X_CONSUMER_SECRET` | X → Keys & Tokens → OAuth 1.0 Keys → Consumer Key → Regenerate (step 3B) |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | Shown when you saved User authentication settings (step 3A). Only used by `oauth2`, but keeping them here makes switching instant. |
| `X_REDIRECT_URI` | Your backend URL + `/auth/x/callback`. Must match the Callback URI in X exactly. |
| `FRONTEND_URL` | Your Netlify URL. Use the placeholder until step 5, then replace it in step 6. Shared WL tickets send people here, so it must be your live site. |
| `SESSION_SECRET` | The PowerShell line above. |
| `PUBLIC_URL` (optional) | Leave it out. WL share links use the host of `X_REDIRECT_URI`, which is your backend. Only set it if you put the backend on a custom domain. |

Railway redeploys by itself. Check it:

```powershell
Invoke-RestMethod https://YOUR-BACKEND-URL/health
```

You should see `True` under `ok`. In Railway's logs, the line `X login mode: oauth1` confirms the mode.

---

## Step 5: Put the website on Netlify

Unzip `zec-printer-frontend.zip`, then in PowerShell:

```powershell
cd zec-printer-frontend
Set-Content .env "VITE_API_URL=https://YOUR-BACKEND-URL"
npm install
npm run build
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir dist
```

When asked, choose the option to create a new site (newer versions call it a project). It prints your site URL, like `https://zec-printer.netlify.app`.

---

## Step 6: Connect the two

1. Railway → Variables: change `FRONTEND_URL` to your Netlify URL (no slash at the end).
2. X app settings: set Website URL to your Netlify URL.

---

## Step 7: Open the admin panel

1. Double-click `zec-printer-admin-panel.html`. It opens in your browser.
2. Enter your **Supabase Project URL**, the **anon public** key, and the admin password from step 1.
3. A red bar tells you what is missing. In the **Tasks** tab, set:
   - **Main follow account**: your X handle
   - **Pinned post**: the link to your pinned post

Your WL is live.

The panel talks straight to Supabase. It doesn't need the backend, so it works even while Railway is down.

| Tab | What you can do |
|---|---|
| Reviews | Approve or reject posts from tasks checked by the team. Approving adds the points instantly. |
| Tasks | Create any task (follow, like/repost/reply, quote, daily, art, post about us, or custom with any link). Edit title, text, points, link, order, and how it's checked. Schedule a start time, set a timer (12/24/48/72 h or an exact end time), end it now, turn it off, or delete it. "Who did it" lists every user and their status. |
| Users | Search and filter (all, whitelisted, whitelisted without a wallet, not whitelisted, banned). Each row shows the user's mint wallet. Open any user to see everything: balance, rank, refer code, who referred them, who they invited, every task they did, where every point came from (with a check that the history adds up to the balance), and their wallet with its full change history. Set their WL status, adjust points, remove their wallet, ban or unban. |
| Whitelist | Open or close WL registration. Whitelist the top N as GTD or FCFS in one click. See how many users saved a wallet and how many whitelisted users still have none. Lock or open wallet changes. Download the whitelist or the top 1,000 as CSV (with wallet type and address). Remove WL from one user or everyone. |
| Arts | The NFT images in the home gallery and on WL tickets. Paste Cloudinary links (up to 200 at once), hide or show a piece, change the order, or remove it. Only `https://res.cloudinary.com/...` image links are accepted. Your 30 arts are already added. |
| Referrals | Top referrers and the latest refer code uses. |
| Points log | Every $PRINT ever added or removed, with the reason. Filter by user. |

The panel remembers the Supabase URL and key on your computer. It forgets the password when you close the tab.

### What users see on OnBoard (WL)

- **WL status check**, right under their $PRINT balance. Their X account is filled in and locked. Pressing **Check WL status** plays a short printing animation, then prints a ticket with a random ZEC PRINTER art piece, their @username, status and tier, stamped **Approved** or **Not approved**. The status is always read fresh from the database.
- **Approved** tickets get **Share on X** and **Save image**. The post links to a share page, and X shows the ticket as the post's large image. X doesn't let websites attach images to a post directly, so this link preview is how the ticket appears. On phones, Share on X can attach the image file itself through the phone's share menu.
- **Mint wallet**, below that: the user pastes their Noir **shielded** address (starts with u1) and saves. Transparent (t1) addresses are refused for now. They can edit it later. The address is checked, including its checksum, so a typo is caught. Each address can belong to one account only, each user can change it up to 5 times a day, and every change is recorded.
- **Task FAQ and task rules** at the bottom of the right column.
- When you **close WL registration**, tasks and refer codes pause, the site shows "WL registration closed", and users can still log in to check their status.

A typical finish: close registration → Whitelist tab → whitelist the top N → check "whitelisted users without a wallet" → lock wallet changes → download the whitelist CSV.

---

## Quick live test

1. Open your Netlify site. The printer animation plays on the home page.
2. OnBoard (WL) → **Connect X** → approve → your @username shows in the sidebar.
3. Do the Follow task → it shows a 24h countdown.
4. Submit an art link → it appears in the admin panel under Reviews → Approve → refresh the site, +100.
5. With a second X account, apply the first account's refer code → both get +30.
6. Save a wallet in **Mint wallet** → it appears in the admin panel next to your user.
7. Admin panel → whitelist yourself → site → **Check WL status** → Approved → **Share on X**. The post shows your ticket as its image. The first preview can take a few seconds while X fetches it.

---

## Security, in short

- The browser never talks to Supabase. All tables are locked. The backend key can only call the rule-checking functions, so points can't be edited directly, even if that key leaked.
- Every reward is paid at most once (append-only ledger with a unique key per reward).
- The admin panel uses the anon public key. That key can call exactly one database function, and that function refuses everything without the admin password. The password is checked inside the database (bcrypt), and 10 wrong tries lock the panel for 15 minutes.
- The website never uses the anon key, so it isn't published anywhere. Still, keep it and your admin password to yourself.
- Never put the service_role key in the admin panel. The panel refuses it if you try.
- Wallets: the backend verifies every address's checksum, the database checks the format again, an address can belong to one account only, users get 5 changes a day, every change is logged, and you can lock changes.
- WL share links use a random 12-character code per user and only work while that user is whitelisted and not banned, so nobody can make an "Approved" ticket for someone else. The backend only ever downloads art from Cloudinary, and ticket images are size-limited and cached.

Already ran an older version of the SQL? Just run the new `zec-printer-supabase.sql` again. It upgrades everything and keeps all users, points and your admin password.

Not checked, because X is only used for login: whether users really followed, liked, reposted or replied (these tasks use the 24h / 12h timer), whether a quote link is real, and account age. Your protection is the review queue, the ban button and a look at the top of the leaderboard before exporting the GTD list. To have the team review quote links too, run once in Supabase:
```sql
update app.tasks set review_mode = 'manual' where slug = 'quote-pinned';
```

---

## If something goes wrong

| What you see | Fix |
|---|---|
| Site says "X login is not set up correctly yet" | The Callback URI in X must exactly match `X_REDIRECT_URI`, and `X_CONSUMER_KEY` / `X_CONSUMER_SECRET` must be the latest pair (regenerating makes the old pair stop working). Railway logs show X's exact answer on the line `[auth] oauth1 request_token failed`. If everything matches, it's X's known Pay Per Use issue: post your App ID on devcommunity.x.com asking for a backend enrollment fix, and set `X_AUTH_MODE=oauth2` in the meantime. |
| Site says "X login is unavailable right now" | Only in `oauth2` mode: it needs X API credits. Add a few dollars, or switch back to `oauth1`. |
| Site says "X did not accept the connection" | The login took too long or was already used: press Connect X again. If it keeps happening, check the key pair for your mode (Consumer Key/Secret for `oauth1`, Client ID/Secret for `oauth2`). |
| Browser console shows a CORS error on the site | `FRONTEND_URL` on Railway must exactly match your Netlify URL (https, no slash at the end). |
| A shared WL post shows no ticket image | Open the share link from the post in a browser: it should jump to your site. Check that `X_REDIRECT_URI` uses your https Railway address (share links are built from it). X also caches previews, so a link shared before a fix can keep the old preview. Share again from the site to get a fresh link. |
| Shared link opens localhost | `FRONTEND_URL` on Railway still points to your computer. Set it to your Netlify URL. |
| Art doesn't load in the gallery | The link must be a public Cloudinary image link. The site asks Cloudinary for small versions first and falls back to the original file automatically. |
| Users see "Wallet changes are closed right now" | You locked them in Whitelist → Mint wallets. Press **Open wallet changes**. |

---

## Updating your live setup

Your users, points, WL statuses and admin password are all kept. Do these in order.

**1. Database.** Supabase → SQL Editor → paste all of the new `zec-printer-supabase.sql` → **Run**. It adds wallets, arts (with your 30 images), share codes and the new admin actions. Running it again later is safe.

**2. Backend.** Download the new `zec-printer-backend.zip`, then in PowerShell:

```powershell
Expand-Archive -Path "$HOME\Downloads\zec-printer-backend.zip" -DestinationPath "$HOME\Downloads\zp-new" -Force
Copy-Item "$HOME\Downloads\zp-new\zec-printer-backend\*" -Destination "D:\Project NFTs 2026\ZEC PRINTER\zec-printer-backend" -Recurse -Force
cd "D:\Project NFTs 2026\ZEC PRINTER\zec-printer-backend"
npm install
git add .
git status
git commit -m "WL ticket check, mint wallets, arts, share images"
git push
```

`git status` must not list `.env`. If Railway doesn't start a new deploy by itself, open the service and press Ctrl + K → **Deploy latest commit**. Check that `https://YOUR-BACKEND-URL/api/arts` shows your art links.

**3. Railway variables.** Make sure `FRONTEND_URL` is your Netlify URL, not localhost. Shared WL tickets send people there.

**4. Website.** Build the new `zec-printer-frontend.zip` with `VITE_API_URL=https://YOUR-BACKEND-URL` and deploy it to Netlify the same way as before.

**5. Admin panel.** Replace your old `zec-printer-admin-panel.html` with the new one. The new **Arts** tab and the wallet tools need the new SQL from step 1.
| Admin panel: "Could not reach Supabase" | Check the Project URL, like `https://abcdefgh.supabase.co`. |
| Admin panel: "Supabase rejected the key" | Use the **anon public** (or publishable) key from Project Settings → API. |
| Admin panel: "Admin function not found" | Run the latest `zec-printer-supabase.sql` again. It keeps all users and points. |
| Admin panel: "Wrong admin password" | Use the password from step 1, or set a new one with the SQL line in step 1. |
| Admin panel: "locked for 15 minutes" | Wait, or set the password again in SQL (that also unlocks it). |
| Site says "WL registration is closed" | You closed it in the Whitelist tab. Open it again there. |
| Railway logs: `permission denied for function` | You pasted the anon key. Use the **service_role** key. |
| Railway logs: `Could not find the function public.api_...` | The SQL file was not run in this Supabase project. |
| Railway logs: `Missing environment variables` | Add the listed variables in step 4. |
