# Plei Candidate Pipeline

A standalone candidate-pipeline app for Plei's HR team — the same 13-stage
board, role tabs/stats, candidate details, and public application form as
`hiring-pipeline.html` in the Plei Home Base site, but built as its own app
with a real shared database instead of per-browser `localStorage`.

**Why a separate app:** the Plei Home Base site (`PleiHomeBase` repo) keeps
everything in each browser's own `localStorage` — reliable for a single
person, but two HR staff editing candidates at the same time never see each
other's changes, and clearing browser data loses everything. This app uses
[Supabase](https://supabase.com) (a free-tier hosted Postgres database with
built-in login and real-time updates) so every signed-in staff member reads
and writes the same live data, and public applicants can submit without ever
being able to read anyone else's data back.

This app does **not** touch the `PleiHomeBase` repo or site. `careers.html`
and `hiring.html` there are unchanged. Linking from `careers.html`'s role
pages to this app's public apply page instead of the old one is a natural
next step, but hasn't been done yet — see "Possible follow-ups" below.

## One-time setup (about 15 minutes, needs your own Google/email account)

You only need to do this once. After it's done, you and your team just open
the site and sign in.

### 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free — no credit
   card required for the free tier).
2. Click **New project**. Pick any name (e.g. "plei-hiring"), set a database
   password (save it somewhere safe — you likely won't need it again), and
   choose the region closest to your team.
3. Wait a minute or two for the project to finish setting up.

### 2. Set up the database

1. In your new Supabase project, open the **SQL Editor** (left sidebar).
2. Open the file `supabase/schema.sql` from this repository, copy its
   entire contents, and paste it into the SQL Editor.
3. Click **Run**. This creates the three tables the app needs (`roles`,
   `candidates`, `comments`), sets up the privacy rules described below, and
   seeds three example open roles you can edit or delete afterward from the
   app itself.

### 3. Create staff accounts

Each HR staff member who needs to sign in gets their own account:

1. In Supabase, go to **Authentication → Users**.
2. Click **Add user → Create new user**.
3. Enter their email and a temporary password, and make sure **Auto Confirm
   User** is checked (so they don't need to click an email link).
4. Share that email/password with them — they can sign in with it right
   away, and there's no in-app way to change a password yet, so if someone
   needs a new one, reset it from this same Supabase screen.

Repeat for everyone on HR who needs access. There's no separate "admin"
role — anyone signed in has full access to every candidate, the same as
everyone did with the old shared board.

### 4. Connect the app to your project

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key (not the
   `service_role` key — that one must never be shared or put in this app).
3. Open `config.js` in this repository and replace the placeholder values:

   ```js
   window.SUPABASE_CONFIG = {
     url: "https://your-project-id.supabase.co",
     anonKey: "your-anon-public-key",
   };
   ```

4. Commit that change (see "Publishing changes" below).

### 5. Turn on GitHub Pages

1. In this repository on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   branch `main`, folder `/ (root)`, then **Save**.
3. GitHub will give you a URL like
   `https://pleihr.github.io/plei-candidate-pipeline/` — that's the staff
   board. Add `/apply.html` to the end of it for the public application
   page (e.g. to link from job postings or `careers.html`).

That's it — the app is live.

## Using the app day-to-day

- **Staff board** (`index.html`, the root URL): sign in with the email/
  password Supabase set up for you. You'll see the same 13-stage board,
  role tabs, and stats as the old `hiring-pipeline.html`, except every
  change is shared with everyone else signed in, live.
- **Public apply page** (`apply.html`): anyone with the link can fill it
  out, no account needed. Submissions always start at the "New Application"
  stage and only staff who are signed in can see them — an applicant can
  never read back other applicants' data (see "How privacy works" below).
- Roles are managed the same way as before: from the "Job role" dropdown in
  a candidate's detail view, or by adding rows directly in Supabase's
  **Table Editor → roles** if you want a dedicated roles-admin screen later
  (not built yet — see "Possible follow-ups").

## Publishing changes

This is a static site with no build step, same as `PleiHomeBase`: any edit
to `index.html`, `app.js`, `styles.css`, etc. just needs to be committed and
pushed to the `main` branch, and GitHub Pages picks it up automatically
within a minute or two.

## How privacy works (Row Level Security)

The database rules (set up by `supabase/schema.sql`) are what keeps
applicant data private:

- Anyone, signed in or not, can **submit** a new application (insert a
  candidate row) and can only ever see which roles are marked "open" — never
  read the candidate list, comments, or closed/internal roles.
- Only a signed-in staff account (created in Supabase, step 3 above) can
  **read or edit** candidates, comments, and the full roles list.

This is enforced by the database itself, not just by the app's UI, so it
holds even if someone inspects the page's network traffic directly.

## Testing changes locally

`tests/mock-db.js` is a small in-memory stand-in for the real database,
used only by the local test suite — it's never deployed. `index.test.html`
and `apply.test.html` at the repo root are copies of the real pages wired to
that mock instead of Supabase, so app logic (board rendering, candidate
CRUD, comments, role tabs/stats, the public apply flow) can be verified
without touching a real Supabase project. They aren't linked from anywhere
and are safe to leave in the deployed site.

## Possible follow-ups (not built, flagged for later)

- Linking `careers.html`'s "Apply now" buttons on the Plei Home Base site
  to this app's `apply.html` instead of the old per-browser apply form —
  would need a `?role=` query param to preselect the role, which
  `apply.html` here already supports.
- A dedicated in-app screen for adding/editing/closing open roles (today
  that's either through a candidate's role dropdown or directly in
  Supabase's Table Editor).
- Password reset / "forgot password" from inside the app itself, rather
  than a staff member asking you to reset it from the Supabase dashboard.
