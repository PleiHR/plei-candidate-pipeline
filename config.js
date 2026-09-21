// Fill these in after creating your Supabase project (see README.md, Step 1).
// Dashboard → Project Settings → API → "Project URL" and "anon public" key.
// The anon key is meant to be public/client-side — it's safe to commit here;
// what actually protects the data is the Row Level Security policies in
// supabase/schema.sql, not secrecy of this key.
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY",
};

// Google Workspace domain allowed to sign in to the staff board. Used both
// as a UI hint to Google's account chooser (db-supabase.js) and, client-side,
// to immediately sign out and reject any session whose email doesn't match
// (app.js). The real, unbypassable enforcement is server-side, in the RLS
// policies in supabase/schema.sql — this constant is not itself security,
// just what keeps the two client-side checks in sync with each other.
window.PLEI_WORKSPACE_DOMAIN = "plei.com";
