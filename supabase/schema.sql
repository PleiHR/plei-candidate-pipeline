-- Plei Candidate Pipeline — Supabase schema
-- Run this once in your Supabase project's SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- roles: the open-roles list. Same idea as hiring.html's state.openRoles,
-- now shared and live instead of per-browser localStorage.
-- ---------------------------------------------------------------------------
create table if not exists roles (
id uuid primary key default gen_random_uuid(),
title text not null unique,
team text,
location text,
type text,
status text not null default 'open' check (status in ('open','closed')),
created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- candidates: one row per applicant, moving through the pipeline.
-- `status` is one of the 13 stage keys below (kept as plain text, validated
-- in the app + a check constraint, so relabeling a stage later is a one-line
-- change and never an enum migration).
-- ---------------------------------------------------------------------------
create table if not exists candidates (
id uuid primary key default gen_random_uuid(),
name text not null,
email text,
phone text,
location text,
linkedin text,
role_id uuid references roles(id) on delete set null,
role_title text, -- snapshot of the role's title at apply time, so stats/history
-- survive a role being renamed or removed later
referral text,
salary text,
resume_url text,
status text not null default 'new' check (status in (
'new','reached_out','move_interviews','on_hold','not_moving',
'barrier1','barrier2','barrier3','barrier4','passed',
'offer_sent','send_offer','rejected'
)),
barrier1_notes text,
barrier2_notes text,
barrier3_notes text,
priority text not null default 'normal' check (priority in ('urgent','high','normal','low')),
due_date date,
assignee text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

create index if not exists candidates_status_idx on candidates(status);
create index if not exists candidates_role_idx on candidates(role_id);

-- ---------------------------------------------------------------------------
-- comments: internal notes on a candidate (staff-only, never shown publicly).
-- ---------------------------------------------------------------------------
create table if not exists comments (
id uuid primary key default gen_random_uuid(),
candidate_id uuid not null references candidates(id) on delete cascade,
author text not null,
body text not null,
created_at timestamptz not null default now()
);

create index if not exists comments_candidate_idx on comments(candidate_id);

-- ---------------------------------------------------------------------------
-- staff_members: the allow-list of individual people permitted to sign in as
-- staff, on top of the @plei.com domain check. Being a Workspace account is
-- no longer enough by itself — an admin must also add the person's email
-- here. `role` distinguishes admins (who can manage this list, from the
-- "Team access" screen in the app) from regular staff (same board access as
-- everyone else — viewing/editing candidates — just no ability to add or
-- remove people).
-- ---------------------------------------------------------------------------
create table if not exists staff_members (
  email text primary key,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  added_by text,
  created_at timestamptz not null default now()
);

alter table staff_members enable row level security;

-- keep updated_at current on every edit
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
new.updated_at = now();
return new;
end;
$$;

drop trigger if exists candidates_set_updated_at on candidates;
create trigger candidates_set_updated_at
before update on candidates
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Trust model:
-- anon (no login, the public apply page) -> can INSERT a candidate row and
-- can SELECT open roles only (to
-- populate the Job Role dropdown,
-- same info already public on
-- the careers page). Cannot read
-- back candidates or comments —
-- this is what keeps submissions
-- private to HR.
-- authenticated (a staff login you create in Supabase Auth) -> full read/
-- write on everything.
-- ---------------------------------------------------------------------------
alter table roles enable row level security;
alter table candidates enable row level security;
alter table comments enable row level security;

-- Restricts every `authenticated` policy below to a single Google Workspace
-- domain. Staff sign in with "Continue with Google" (see db-supabase.js);
-- Google's account chooser is hinted to only show @plei.com accounts, but
-- that hint is client-side and not itself a security boundary — this
-- function is the real, unbypassable check, enforced by Postgres on every
-- query regardless of what the browser does. If the Workspace domain ever
-- changes, this is the one place to update it (and window.PLEI_WORKSPACE_DOMAIN
-- in config.js, kept in sync for the client-side UX check in app.js).
create or replace function is_staff_domain()
returns boolean language sql stable as $$
select coalesce((auth.jwt() ->> 'email') ilike '%@plei.com', false);
$$;

-- The real access-control check used everywhere below: on the Workspace
-- domain AND explicitly added to staff_members by an admin. Being a
-- @plei.com account is necessary but no longer sufficient — this replaces
-- is_staff_domain() as the gate on roles/candidates/comments.
-- security definer: lets this read staff_members regardless of the caller's
-- own RLS on that table (otherwise a non-admin's lookup here would itself be
-- blocked by the staff_members policy below, and nobody could ever pass).
create or replace function is_authorized_staff()
returns boolean language sql stable security definer set search_path = public as $$
select is_staff_domain() and exists (
select 1 from staff_members
where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
$$;

-- Is the signed-in user an admin, i.e. can they manage the staff_members
-- list themselves from the "Team access" screen?
create or replace function is_staff_admin()
returns boolean language sql stable security definer set search_path = public as $$
select exists (
select 1 from staff_members
where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
and role = 'admin'
);
$$;

grant execute on function is_authorized_staff() to authenticated, anon;
grant execute on function is_staff_admin() to authenticated, anon;

-- roles: anyone can see OPEN roles (needed for the public apply form's
-- dropdown); only logged-in staff on the Workspace domain can see/add/edit/
-- close roles.
drop policy if exists roles_public_select_open on roles;
create policy roles_public_select_open
on roles for select
to anon
using (status = 'open');

drop policy if exists roles_staff_all on roles;
create policy roles_staff_all
on roles for all
to authenticated
using (is_authorized_staff())
with check (is_authorized_staff());

-- candidates: the public can only ever INSERT (submit an application) and
-- can never select/update/delete — that's what keeps applicant data private.
drop policy if exists candidates_public_insert on candidates;
create policy candidates_public_insert
on candidates for insert
to anon
with check (status = 'new');

drop policy if exists candidates_staff_all on candidates;
create policy candidates_staff_all
on candidates for all
to authenticated
using (is_authorized_staff())
with check (is_authorized_staff());

-- comments: staff-only, both directions. The public apply page never
-- touches this table at all.
drop policy if exists comments_staff_all on comments;
create policy comments_staff_all
on comments for all
to authenticated
using (is_authorized_staff())
with check (is_authorized_staff());

-- staff_members: only admins can see or change the allow-list itself.
-- Regular staff never need to query this table directly — the app only
-- shows the "Team access" screen to admins (client-side), and this is the
-- real, server-side version of that same restriction.
drop policy if exists staff_members_admin_all on staff_members;
create policy staff_members_admin_all
on staff_members for all
to authenticated
using (is_staff_admin())
with check (is_staff_admin());

-- ---------------------------------------------------------------------------
-- Realtime: turn on change broadcasts so two staff members editing the same
-- candidate at once each see the other's update live, without a refresh.
-- (In the Supabase dashboard this is also toggleable under Database → Replication;
-- running this is the SQL equivalent.)
-- ---------------------------------------------------------------------------
do $$
begin
begin
alter publication supabase_realtime add table candidates;
exception when duplicate_object then null;
end;
begin
alter publication supabase_realtime add table comments;
exception when duplicate_object then null;
end;
begin
alter publication supabase_realtime add table roles;
exception when duplicate_object then null;
end;
end $$;

-- ---------------------------------------------------------------------------
-- Optional: seed the same 11 roles hiring.html already has, so the new app
-- isn't empty on day one. Safe to skip or edit before running.
-- ---------------------------------------------------------------------------
insert into roles (title, team, location, type, status) values
('Business Intelligence Engineer', 'Engineering', 'LatAm (remote)', 'Intl contractor', 'open'),
('QA Engineer', 'Engineering', 'LatAm (remote)', 'Intl contractor', 'open'),
('Frontend Engineer', 'Engineering', 'LatAm (remote)', 'Intl contractor', 'open'),
('Backend Engineer', 'Engineering', 'LatAm (remote)', 'Intl contractor', 'open'),
('Full-Stack Engineer', 'Engineering', 'LatAm (remote)', 'Intl contractor', 'open'),
('DevOps Engineer', 'Engineering', 'LatAm (remote)', 'Intl contractor', 'open'),
('AI Lead', 'Engineering', 'LatAm (remote)', 'Intl contractor', 'open'),
('Senior Product Designer', 'Product', 'LatAm (remote)', 'Intl contractor', 'open'),
('Organizer Success Manager', 'Growth', 'United States', 'W2', 'open'),
('HR Operations Manager', 'Operations', 'Miami (hybrid)', 'Full-time', 'open'),
('Booking Agent', 'Magic', 'LatAm (remote)', 'Intl contractor', 'open')
on conflict (title) do nothing;

-- ---------------------------------------------------------------------------
-- Seed the first admin, so the "Team access" screen isn't locked to nobody
-- on day one. Safe to re-run (on conflict do nothing). Add or remove
-- everyone else from the "Team access" screen in the app itself, not by
-- editing this file — this line only ever needs to run once.
-- ---------------------------------------------------------------------------
insert into staff_members (email, role, added_by) values
('priscila@plei.com', 'admin', 'schema seed')
on conflict (email) do nothing;
