// In-memory stand-in for db-supabase.js, used only by the local Playwright
// test suite (never shipped/committed to the real app). Implements the exact
// same window.PLEI_DB interface so app.js/apply.html don't know the difference.
(function () {
  var uid = 0;
  function nextId() { uid += 1; return "id" + uid; }
  function nowIso() { return new Date().toISOString(); }

  var roles = [
    { id: "r1", title: "DevOps Engineer", team: "Engineering", location: "LatAm (remote)", type: "Intl contractor", status: "open", created_at: nowIso() },
    { id: "r2", title: "AI Lead", team: "Engineering", location: "LatAm (remote)", type: "Intl contractor", status: "open", created_at: nowIso() },
    { id: "r3", title: "Booking Agent", team: "Magic", location: "LatAm (remote)", type: "Intl contractor", status: "closed", created_at: nowIso() },
  ];
  var candidates = [];
  var comments = [];
  var authListeners = [];
  var session = null; // start signed out, so the test can exercise the login gate

  function fireAuth() { authListeners.forEach(function (cb) { cb(session); }); }

  window.PLEI_DB = {
    async signIn(email, password) {
      if (!email || !password) throw new Error("Email and password required.");
      session = { user: { email: email } };
      fireAuth();
      return session;
    },
    async signOut() { session = null; fireAuth(); },
    async getSession() { return session; },
    onAuthChange(cb) { authListeners.push(cb); },

    async listRoles() { return roles.slice(); },
    async listOpenRoles() { return roles.filter(function (r) { return r.status === "open"; }); },
    async upsertRole(role) {
      if (role.id) { Object.assign(roles.filter(function (r) { return r.id === role.id; })[0], role); }
      else { role.id = nextId(); role.created_at = nowIso(); roles.push(role); }
      return [role];
    },

    async listCandidates() { return candidates.slice(); },
    async insertCandidate(c) {
      var row = Object.assign({ id: nextId(), created_at: nowIso(), updated_at: nowIso() }, c);
      candidates.push(row);
      return [row];
    },
    async updateCandidate(id, patch) {
      var c = candidates.filter(function (x) { return x.id === id; })[0];
      if (c) { Object.assign(c, patch, { updated_at: nowIso() }); }
      return c ? [c] : [];
    },
    async deleteCandidate(id) {
      candidates = candidates.filter(function (x) { return x.id !== id; });
    },

    async listComments(candidateId) {
      return comments.filter(function (c) { return c.candidate_id === candidateId; });
    },
    async addComment(candidateId, author, body) {
      var row = { id: nextId(), candidate_id: candidateId, author: author, body: body, created_at: nowIso() };
      comments.push(row);
      return [row];
    },

    subscribeToChanges(onChange) { return function unsubscribe() {}; },

    // test-only helper, not part of the real interface
    __seedCandidate(c) {
      var row = Object.assign({ id: nextId(), created_at: nowIso(), updated_at: nowIso(), priority: "normal", status: "new" }, c);
      candidates.push(row);
      return row;
    },
  };
})();
