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

// Mirrors staff_members in supabase/schema.sql. The mock Google sign-in
// below always lands on this address, seeded here as an admin so the local
// test suite can exercise the "Team access" screen too.
var staffMembers = [
{ email: "staff@" + (window.PLEI_WORKSPACE_DOMAIN || "plei.com"), role: "admin", added_by: "mock seed", created_at: nowIso() },
];

function fireAuth() { authListeners.forEach(function (cb) { cb(session); }); }
function currentEmail() { return ((session && session.user && session.user.email) || "").toLowerCase(); }
function staffRow(email) { return staffMembers.filter(function (s) { return s.email.toLowerCase() === email.toLowerCase(); })[0]; }

window.PLEI_DB = {
async signIn(email, password) {
if (!email || !password) throw new Error("Email and password required.");
session = { user: { email: email } };
fireAuth();
return session;
},
async signInWithGoogle() {
// Test-only stand-in: real OAuth needs a browser redirect, so the mock
// just signs in as a fixed in-domain address for the local test suite.
session = { user: { email: "staff@" + (window.PLEI_WORKSPACE_DOMAIN || "plei.com") } };
fireAuth();
return session;
},
async signOut() { session = null; fireAuth(); },
async getSession() { return session; },
onAuthChange(cb) { authListeners.push(cb); },

async isAuthorizedStaff() { return !!staffRow(currentEmail()); },
async isAdmin() { var s = staffRow(currentEmail()); return !!(s && s.role === "admin"); },
async listStaff() { return staffMembers.slice(); },
async addStaff(email, role, addedBy) {
var row = { email: email.trim().toLowerCase(), role: role, added_by: addedBy || null, created_at: nowIso() };
staffMembers.push(row);
return [row];
},
async setStaffRole(email, role) {
var s = staffRow(email);
if (s) s.role = role;
return s ? [s] : [];
},
async removeStaff(email) {
staffMembers = staffMembers.filter(function (s) { return s.email.toLowerCase() !== email.toLowerCase(); });
},

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
