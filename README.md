# ZEC PRINTER backend (Railway)

Express API. Handles X login, tasks, referrals, leaderboard and WL status for the website.
Full setup order is in START-HERE.md. This file is the backend-only reference.

## Deploy (PowerShell)

```powershell
cd zec-printer-backend
npm install -g @railway/cli
railway login
railway init          # create a new project
railway up            # upload and deploy
railway domain        # prints your backend URL
```

The first deploy crashes until the variables below are added. That is expected.

## Variables (Railway -> your service -> Variables -> Raw Editor, paste and edit)

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
X_AUTH_MODE=oauth1
X_CONSUMER_KEY=your-consumer-key
X_CONSUMER_SECRET=your-consumer-secret
X_CLIENT_ID=your-client-id
X_CLIENT_SECRET=your-client-secret
X_REDIRECT_URI=https://YOUR-BACKEND.up.railway.app/auth/x/callback
FRONTEND_URL=https://YOUR-SITE.netlify.app
SESSION_SECRET=paste-a-long-random-string
```

Make SESSION_SECRET in PowerShell:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Optional: `SESSION_DAYS` (default 7), `VERIFY_JOB_MINUTES` (default 5).

## Check it

```powershell
Invoke-RestMethod https://YOUR-BACKEND.up.railway.app/health
```

## Routes

| Route | Used by |
|---|---|
| `GET /auth/x/login`, `GET /auth/x/callback`, `POST /auth/exchange` | X login |
| `GET /api/me`, `GET /api/tasks`, `POST /api/tasks/:id/submit`, `POST /api/referral/apply` | Website (logged in) |
| `GET /api/leaderboard` | Website (public, cached 30s) |
| `GET /api/status` | Website: WL registration open or closed (public, cached 30s) |

The admin panel does not use the backend. It talks to Supabase directly.

## X login modes

`X_AUTH_MODE=oauth1` (default) uses "Log in with X". X returns the account id and username during the login itself, so no profile is read and no X API credits are used. Needs `X_CONSUMER_KEY` and `X_CONSUMER_SECRET`.

`X_AUTH_MODE=oauth2` is the backup. It makes one paid profile read per login (about $0.01) and needs X API credits. Needs `X_CLIENT_ID` and `X_CLIENT_SECRET`.

Either way, only the X account id and username are saved.
