# Running MediVerify AI locally

The frontend is a Vite + React SPA with **no data of its own** — every screen is a
live call to the FastAPI backend. Nothing renders meaningfully until that backend
is up and seeded, so start there.

Two repos, expected as siblings:

```
dynamisch/
├── POC_Frontend/                                        ← you are here
└── AI-Healthcare-Compliance-and-Credential-Verification/ ← the API
```

---

## 1. Start the backend

Full detail is in the backend's own guide — `docs/DEVELOPER_GUIDE.md` in that
repo. The short version:

```bash
cd ../AI-Healthcare-Compliance-and-Credential-Verification
docker compose up -d          # postgres, redis, api, migrate, worker, beat
curl http://localhost:8000/health
```

Then seed it. **An empty database has no organizations and no logins** — the app
will render, fail every call, and look broken:

```bash
docker compose exec api python -m app.db.seed all
```

Interactive API docs, useful when a screen misbehaves: <http://localhost:8000/docs>

## 2. Start the frontend

```bash
cd POC_Frontend
npm install
npm run dev          # http://localhost:5173
```

Node 20.19+ or 22+ (Vite 8). Developed on Node 20.20.2 / npm 10.8.2.

**There is no `.env` and no API URL to configure.** `API_BASE` is `""`
([src/services/api.ts:6](src/services/api.ts#L6)), so every request is a relative
path, and [vite.config.ts](vite.config.ts) proxies those paths to
`http://localhost:8000`:

```
/auth  /chat  /clinicians  /credentials  /documents  /document-checks
/orgs  /organizations  /policies  /reports  /admin  /agent-runs  /api  /health
```

Two consequences worth knowing before you debug something:

- **A new backend route needs its prefix added to that proxy list.** Miss it and
  the request returns Vite's `index.html` instead of JSON — which surfaces as a
  confusing JSON parse error, not a 404.
- **Backend on a different port?** Change `apiProxy.target` in `vite.config.ts`.
  Setting `API_PORT` in the backend's `.env` changes only its side.

## 3. Log in

Five seeded logins, all password `12345678`:

| Email | Role | What it can reach |
|---|---|---|
| `org_1_admin@example.com` | admin | everything in the org |
| `org_1_compliance@example.com` | compliance_officer | + report approval, policy publishing |
| `org_1_hr@example.com` | hr | roster, dashboard, uploads — no report approval |
| `org_1_nurse@example.com` | clinician | own record only |
| `org_1_nurse_2@example.com` | clinician | own record only |

The super admin (`/onboardOrg`, `/costManagement`) is a separate platform-level
account that lives in the `admins` table, not in any org.

> **Gotcha — the app signs you in by itself.** With no stored token,
> [AuthContext.tsx:81](src/context/AuthContext.tsx#L81) auto-logs-in as
> `org_1_compliance@example.com` so the app is immediately usable. You will
> rarely see the login page. To test a different role, sign out from the sidebar
> and log in as someone else on the page it drops you on — but **do not reload
> while signed out**, or the auto-login puts you straight back in as the
> compliance officer. Only a 401 suppresses it (see `sessionExpired` in
> [api.ts](src/services/api.ts)); a manual sign-out does not. This is a POC demo
> affordance and must be deleted before production, along with `ROLE_ACCOUNTS`,
> which ships all five passwords in the bundle.

Tokens live in `localStorage` (`mediverify_token`). A 401 anywhere hard-redirects
to `/login` and clears in-memory state; refresh is automatic and de-duplicated,
so concurrent 401s trigger only one `/auth/refresh`.

## 4. What to click, and what it exercises

| Page | Backend it drives |
|---|---|
| Dashboard `/` | `GET /orgs/{id}/dashboard` — one round trip for the whole roster |
| Clinicians `/clinicians` | same roster; a row opens `GET /clinicians/{id}/compliance-status` (live-computed gaps + citations) |
| Documents `/documents` | `POST /documents/upload` → OCR + verification; the review queue is `GET /document-checks/review-queue` |
| Documents → Policies tab | `POST /policies/upload` → chunk/embed/extract, then review and publish |
| AI Chat `/chat` | `POST /chat` → a background job; progress arrives over SSE |
| Reports `/reports` | `GET /reports`, and approval is `POST /reports/{id}/approve` |

**A worthwhile end-to-end pass**, in order — each step feeds the next:

1. **Documents → Policies**, upload a policy PDF. Watch the ingestion steps
   stream. When it finishes, click the row to see every extracted requirement
   with its citation, tick the good ones, publish. Those become the rules the
   compliance engine enforces.
2. **Clinicians**, open anyone. Their gaps are computed against the rules you
   just published — nothing is cached, so a newly published policy shows up
   immediately.
3. **Upload Document** from that clinician's page. It deep-links to the upload
   form with them preselected and the credential-type dropdown already narrowed
   to what their role and jurisdiction require.
4. **Documents**, resolve anything the AI escalated into the review queue. A
   pending check pins a requirement at PENDING, so an unreviewed check is what
   keeps a clinician non-compliant.
5. **AI Chat**, ask `Draft a compliance report for <clinician name>`. It drafts
   and stops at `pending_approval`.
6. **Reports**, open the draft and approve it. That gate is deliberately human —
   no agent can reach it.

Long-running work (chat, policy ingestion) runs as a Celery job and streams
progress over `GET /chat/stream/{job_id}` via
[useJobStream](src/hooks/useJobStream.ts), which is domain-agnostic — the same
hook drives both. **If steps never appear, the worker is down**:
`docker compose logs -f worker`.

## 5. Roles, and why a button might be missing

The backend authorizes on **scopes**, never role names, and refuses anything
else. [src/auth/scopes.ts](src/auth/scopes.ts) is a hand-maintained mirror of
`app/d5_security/scopes.py` in the backend, and exists only so the UI stops
offering actions that would 403.

**When the two disagree, `scopes.py` wins — update the mirror.** The backend
table is documented in `docs/permissions.md` over there.

So a missing button is usually correct behavior. Sign in as `admin` to see
everything an org has. Known deliberate exclusions: HR cannot approve reports, a
clinician cannot clear their own rejected credential.

## 6. Checks

```bash
npm run build        # tsc -b && vite build — the real typecheck
npx tsc --noEmit     # typecheck only, faster
npm run lint         # oxlint
npm test             # tsc -p tsconfig.test.json && node --test
```

Tests are plain `node:test` — no framework. Note that `npm test` currently points
only at `.tmp-test/features/admin/`, so `src/auth/scopes.test.ts` compiles but
never runs; widen the path in `package.json` if you touch the scope table.

## 7. When something looks broken

| Symptom | Cause |
|---|---|
| Every screen empty, console full of failures | Backend down, or database never seeded (§1) |
| A call returns HTML / "Unexpected token '<'" | Route prefix missing from the Vite proxy (§2) |
| Dashboard 403s | Signed in as a clinician — that endpoint is HR and above |
| Progress steps never arrive | Celery worker down — `docker compose logs -f worker` |
| Signed out, reloaded, back in as compliance officer | The demo auto-login (§3) |
| Empty review queue that seems wrong | Requires `documents:update`; a clinician genuinely has none |

## Reading further

Design and domain model live in the backend repo, not here:
`architecture.md` (the five domains and how a request flows through them),
`docs/DEVELOPER_GUIDE.md` (backend setup, smoke tests, gotchas),
`docs/APIs.md` (full endpoint list), `docs/permissions.md` (the scope matrix).
