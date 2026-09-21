// Real Supabase-backed implementation of the PLEI_DB interface the app uses.
// A test harness can skip this file entirely and set window.PLEI_DB itself
// (see tests/mock-db.js) before app.js runs.
(function () {
  if (window.PLEI_DB) return; // already provided (e.g. by a test harness)

  var cfg = window.SUPABASE_CONFIG || {};
  var client = window.supabase.createClient(cfg.url, cfg.anonKey, {
    realtime: { params: { eventsPerSecond: 5 } },
  });

  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  window.PLEI_DB = {
    // ---- auth ----
    async signIn(email, password) {
      var r = await client.auth.signInWithPassword({ email: email, password: password });
      if (r.error) throw r.error;
      return r.data.session;
    },
    async signInWithGoogle() {
      // `hd` (hosted domain) hints Google's account chooser to only show
      // accounts on our Workspace domain. It's a UI convenience, not a
      // security boundary: someone could still reach the OAuth screen with a
      // different account, which is why app.js double-checks the signed-in
      // email client-side and, more importantly, the RLS policies in
      // supabase/schema.sql reject non-domain emails at the database itself.
      var domain = window.PLEI_WORKSPACE_DOMAIN || "";
      var r = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          queryParams: domain ? { hd: domain } : {},
        },
      });
      if (r.error) throw r.error;
      return r.data;
    },
    async signOut() {
      await client.auth.signOut();
    },
    async getSession() {
      var r = await client.auth.getSession();
      return r.data.session;
    },
    onAuthChange(cb) {
      client.auth.onAuthStateChange(function (_event, session) { cb(session); });
    },

    // ---- roles ----
    async listRoles() {
      return unwrap(await client.from("roles").select("*").order("created_at", { ascending: true }));
    },
    async listOpenRoles() {
      return unwrap(await client.from("roles").select("*").eq("status", "open").order("title"));
    },
    async upsertRole(role) {
      return unwrap(await client.from("roles").upsert(role).select());
    },

    // ---- candidates ----
    async listCandidates() {
      return unwrap(await client.from("candidates").select("*").order("created_at", { ascending: false }));
    },
    async insertCandidate(candidate) {
      // Callers set `status` themselves. The public apply page always sends
      // status:"new" (the only value RLS allows from an anon/unauthenticated
      // request); a logged-in staff member can insert at any stage.
      return unwrap(await client.from("candidates").insert(candidate).select());
    },
    async updateCandidate(id, patch) {
      return unwrap(await client.from("candidates").update(patch).eq("id", id).select());
    },
    async deleteCandidate(id) {
      return unwrap(await client.from("candidates").delete().eq("id", id));
    },

    // ---- comments ----
    async listComments(candidateId) {
      return unwrap(
        await client.from("comments").select("*").eq("candidate_id", candidateId).order("created_at", { ascending: true })
      );
    },
    async addComment(candidateId, author, body) {
      return unwrap(
        await client.from("comments").insert({ candidate_id: candidateId, author: author, body: body }).select()
      );
    },

    // ---- realtime: fire `onChange` whenever anything relevant changes ----
    subscribeToChanges(onChange) {
      var channel = client
        .channel("pipeline-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "roles" }, onChange)
        .subscribe();
      return function unsubscribe() { client.removeChannel(channel); };
    },
  };
})();
