(function () {
var db = null; // set once PLEI_DB exists
var state = { roles: [], candidates: [], comments: [], activeRole: null, openCandidateId: null, session: null, isAdmin: false, openRows: {}, openCols: {}, colShowAll: {} };
var COL_PAGE_SIZE = 6; // candidates shown per column before "Show more"

function esc(s) {
return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
});
}
function $(id) { return document.getElementById(id); }

// ---------------------------------------------------------------- auth --
function showLogin(errMsg) {
$("loginScreen").style.display = "block";
$("appScreen").style.display = "none";
$("loginErr").textContent = errMsg || "";
}
function showApp() {
$("loginScreen").style.display = "none";
$("appScreen").style.display = "block";
$("whoami").textContent = (state.session && state.session.user && state.session.user.email) || "";
$("teamAccessBtn").style.display = state.isAdmin ? "" : "none";
}

// Client-side half of the domain restriction: kicks out any session whose
// email isn't on window.PLEI_WORKSPACE_DOMAIN (set in config.js), right
// after sign-in, so someone who reaches the OAuth screen with the wrong
// account never sees the board. This is a UX nicety, not the real
// boundary — the RLS policies in supabase/schema.sql reject non-domain
// emails at the database itself even if this check is somehow bypassed.
function isAllowedEmail(email) {
var domain = window.PLEI_WORKSPACE_DOMAIN;
if (!domain) return true;
email = (email || "").toLowerCase();
return email.slice(-(domain.length + 1)) === ("@" + domain.toLowerCase());
}

async function boot() {
db = window.PLEI_DB;
var suppressNextClear = false; // true while a signOut we triggered ourselves is in flight

// Two gates a signed-in session has to clear before it sees the board:
// 1. the domain check above (client-side convenience, same as before).
// 2. being individually added to staff_members by an admin (see
// supabase/schema.sql and the "Team access" screen below) — this is what
// lets us restrict access to specific people instead of everyone on the
// @plei.com domain. Both are re-checked server-side by RLS regardless.
async function checkAccess(session) {
if (!session) return true;
if (!isAllowedEmail(session.user && session.user.email)) {
suppressNextClear = true;
showLogin("Only @" + window.PLEI_WORKSPACE_DOMAIN + " accounts can sign in.");
db.signOut();
return false;
}
if (!(await db.isAuthorizedStaff())) {
suppressNextClear = true;
showLogin("Your account isn't authorized yet. Ask a Plei admin to add you under Team access.");
db.signOut();
return false;
}
return true;
}

db.onAuthChange(async function (session) {
if (!session && suppressNextClear) { suppressNextClear = false; return; }
if (!(await checkAccess(session))) return;
state.session = session;
if (session) {
state.isAdmin = await db.isAdmin();
showApp();
loadAll();
} else {
showLogin();
}
});
var session = await db.getSession();
if (await checkAccess(session)) {
state.session = session;
if (session) {
state.isAdmin = await db.isAdmin();
showApp();
await loadAll();
db.subscribeToChanges(function () { loadAll(); });
} else {
showLogin();
}
}

$("loginForm").addEventListener("submit", async function (e) {
e.preventDefault();
try {
await db.signIn($("loginEmail").value.trim(), $("loginPassword").value);
} catch (err) {
showLogin(err.message || "Could not sign in.");
}
});
$("googleSignInBtn").addEventListener("click", async function () {
try {
await db.signInWithGoogle();
} catch (err) {
showLogin(err.message || "Could not sign in with Google.");
}
});
$("signOutBtn").addEventListener("click", async function () { await db.signOut(); });
}

// ---------------------------------------------------------------- data --
async function loadAll() {
state.roles = await db.listRoles();
state.candidates = await db.listCandidates();
render();
}

function candidatesForActiveRole() {
if (!state.activeRole) return state.candidates;
return state.candidates.filter(function (c) { return c.role_title === state.activeRole; });
}

// ---------------------------------------------------------------- render --
function render() {
renderRoleTabs();
renderStats();
renderBoard();
}

function renderRoleTabs() {
var counts = {};
state.candidates.forEach(function (c) {
if (!c.role_title) return;
counts[c.role_title] = (counts[c.role_title] || 0) + 1;
});
var roleTitles = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
var html = '<button data-role="" class="' + (!state.activeRole ? "active" : "") + '">All roles</button>';
html += roleTitles
.map(function (t) {
return '<button data-role="' + esc(t) + '" class="' + (state.activeRole === t ? "active" : "") + '">' + esc(t) + " (" + counts[t] + ")</button>";
})
.join("");
$("roleTabs").innerHTML = html;
$("roleHint").textContent = state.activeRole ? "Showing only candidates applying for " + state.activeRole + "." : "";
}

function renderStats() {
var list = candidatesForActiveRole();
if (!state.activeRole) {
var active = list.filter(function (c) { var s = window.stageByKey(c.status); return s && (s.cat === "notstarted" || s.cat === "active"); }).length;
var offers = list.filter(function (c) { return c.status === "offer_sent" || c.status === "send_offer"; }).length;
var reachedB1 = list.filter(function (c) { return window.reachedBarrier(c.status, "barrier1"); }).length;
var offerPct = reachedB1 ? Math.round((offers / reachedB1) * 100) : 0;
$("stats").innerHTML =
stat(list.length, "Total candidates") +
stat(active, "In active pipeline") +
stat(offers, "Offers out") +
stat(offerPct + "%", "Barrier 1 → offer");
} else {
var rejected = list.filter(function (c) { return c.status === "rejected"; }).length;
var b1 = list.filter(function (c) { return window.reachedBarrier(c.status, "barrier1"); }).length;
var b2 = list.filter(function (c) { return window.reachedBarrier(c.status, "barrier2"); }).length;
var b3 = list.filter(function (c) { return window.reachedBarrier(c.status, "barrier3"); }).length;
var b4 = list.filter(function (c) { return window.reachedBarrier(c.status, "barrier4"); }).length;
var offers2 = list.filter(function (c) { return c.status === "offer_sent" || c.status === "send_offer"; }).length;
var pct = b1 ? Math.round((offers2 / b1) * 100) : 0;
$("stats").innerHTML =
stat(list.length, "Applicants") +
stat(rejected, "Rejected") +
stat(b1, "Reached Barrier 1") +
stat(b2, "Reached Barrier 2") +
stat(b3, "Reached Barrier 3") +
stat(b4, "Reached Barrier 4") +
stat(offers2, "Offers out") +
stat(pct + "%", "Barrier 1 → offer");
}
}
function stat(n, l) { return '<div class="stat"><p class="n">' + esc(n) + '</p><p class="l">' + esc(l) + "</p></div>"; }

function renderBoard() {
var list = candidatesForActiveRole();
var byStatus = {};
list.forEach(function (c) { (byStatus[c.status] = byStatus[c.status] || []).push(c); });

var rowsHtml = window.STAGE_ROWS.map(function (row) {
var stagesInRow = window.STAGES.filter(function (s) { return s.cat === row.cat; });
var rowTotal = stagesInRow.reduce(function (sum, s) { return sum + (byStatus[s.key] || []).length; }, 0);
var colsHtml = stagesInRow
.map(function (s) {
var cards = byStatus[s.key] || [];
return colHtml(s.label, cards, "stage:" + s.key);
})
.join("");
return rowHtml(row.title, row.cat, rowTotal, colsHtml);
}).join("");

var rejected = byStatus["rejected"] || [];
var rejectedHtml = rowHtml("Rejected", "closed", rejected.length, colHtml("Rejected", rejected, "rejected"));

$("board").innerHTML = rowsHtml + rejectedHtml;
}

// Renders one top-level accordion row (Not started / Active — the Barriers /
// Done / Rejected). Collapsed by default; open/closed state persists per
// row (keyed by rowKey) across re-renders until the user toggles it again.
function rowHtml(title, rowKey, count, innerColsHtml) {
var open = !!state.openRows[rowKey];
return (
'<details class="boardrow"' + (open ? " open" : "") + ' data-rowkey="' + esc(rowKey) + '">' +
'<summary class="boardrowhead"><span class="rowtitle"><span class="dot ' + esc(rowKey) + '"></span>' + esc(title) + '</span>' +
'<span class="rowheadright"><span class="rowcount">' + count + (count === 1 ? " candidate" : " candidates") + '</span><span class="rowarrow">▸</span></span></summary>' +
'<div class="accbody"><div class="cols">' + innerColsHtml + "</div></div></details>"
);
}

// Renders one column (stage) as its own nested accordion inside a row.
// Collapsed by default; open/closed state persists per column (keyed by
// colKey) across re-renders. The candidate list inside is further capped
// at COL_PAGE_SIZE via colBodyHtml's own "Show more" toggle.
function colHtml(label, cards, colKey) {
var open = !!state.openCols[colKey];
return (
'<details class="col"' + (open ? " open" : "") + ' data-colkey="' + esc(colKey) + '">' +
'<summary class="colhead"><span>' + esc(label) + '</span><span class="colheadright"><span class="colcount">' + cards.length + '</span><span class="colarrow">▸</span></span></summary>' +
'<div class="accbody">' + colBodyHtml(cards, colKey) + "</div></details>"
);
}

// Renders a column's candidate list, capped at COL_PAGE_SIZE with a
// "Show more" / "Show less" toggle so a busy stage doesn't dump hundreds
// of cards on screen at once. Expanded state persists per column (keyed
// by colKey) across re-renders until the user collapses it again.
function colBodyHtml(cards, colKey) {
if (!cards.length) return '<p class="colempty">No candidates</p>';
var expanded = !!state.colShowAll[colKey];
var visible = expanded ? cards : cards.slice(0, COL_PAGE_SIZE);
var html = visible.map(cardHtml).join("");
var remaining = cards.length - visible.length;
if (remaining > 0) {
html += '<button class="colmore" type="button" data-colmore="' + esc(colKey) + '">Show ' + remaining + " more ▾</button>";
} else if (expanded && cards.length > COL_PAGE_SIZE) {
html += '<button class="colmore" type="button" data-colless="' + esc(colKey) + '">Show less ▴</button>';
}
return html;
}

function cardHtml(c) {
var meta = [c.role_title, c.location].filter(Boolean).join(" · ");
return (
'<div class="ccard pri-' + esc(c.priority || "normal") + '" data-id="' + esc(c.id) + '">' +
'<p class="cname">' + esc(c.name || "Untitled") + "</p>" +
'<p class="cmeta">' + esc(meta) + "</p>" +
"</div>"
);
}

// ---------------------------------------------------------------- candidate modal --
function findCandidate(id) { return state.candidates.filter(function (c) { return c.id === id; })[0]; }

async function openCandidate(id) {
var c = findCandidate(id);
if (!c) return;
state.openCandidateId = id;
$("cmTitle").textContent = c.name || "Untitled";
$("cmName").value = c.name || "";
$("cmEmail").value = c.email || "";
$("cmPhone").value = c.phone || "";
$("cmLocation").value = c.location || "";
$("cmLinkedin").value = c.linkedin || "";
$("cmRole").innerHTML = roleOptionsHtml(c.role_title);
$("cmReferral").value = c.referral || "";
$("cmSalary").value = c.salary || "";
$("cmResume").value = c.resume_url || "";
$("cmStatus").innerHTML = window.STAGES.map(function (s) { return '<option value="' + s.key + '"' + (c.status === s.key ? " selected" : "") + ">" + esc(s.label) + "</option>"; }).join("");
$("cmPriority").value = c.priority || "normal";
$("cmDue").value = c.due_date || "";
$("cmAssignee").value = c.assignee || "";
$("cmB1").value = c.barrier1_notes || "";
$("cmB2").value = c.barrier2_notes || "";
$("cmB3").value = c.barrier3_notes || "";
var filledBarriers = [c.barrier1_notes, c.barrier2_notes, c.barrier3_notes].filter(Boolean).length;
$("accBarriersCount").textContent = filledBarriers ? " (" + filledBarriers + "/3)" : "";
await refreshComments(id);
$("candidateModal").classList.add("show");
}
function closeCandidate() {
$("candidateModal").classList.remove("show");
state.openCandidateId = null;
}

function roleOptionsHtml(currentTitle) {
var opts = state.roles.map(function (r) { return r.title; });
if (currentTitle && opts.indexOf(currentTitle) === -1) opts.push(currentTitle);
opts.push("Other / not listed");
return opts.map(function (t) { return '<option value="' + esc(t) + '"' + (t === currentTitle ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
}

async function saveField(field, val) {
if (!state.openCandidateId) return;
var patch = {};
patch[field] = val;
if (field === "role_title") {
var role = state.roles.filter(function (r) { return r.title === val; })[0];
patch.role_id = role ? role.id : null;
}
await db.updateCandidate(state.openCandidateId, patch);
var c = findCandidate(state.openCandidateId);
if (c) Object.assign(c, patch);
if (field === "name") $("cmTitle").textContent = val || "Untitled";
renderBoard();
renderStats();
renderRoleTabs();
}

async function refreshComments(candidateId) {
state.comments = await db.listComments(candidateId);
$("commentList").innerHTML = state.comments
.map(function (cm) {
return '<div class="comment"><span class="ca">' + esc(cm.author) + '</span><span class="ct">' + new Date(cm.created_at).toLocaleString() + "</span><div>" + esc(cm.body) + "</div></div>";
})
.join("") || '<p class="colempty">No comments yet.</p>';
$("accCommentsCount").textContent = state.comments.length ? " (" + state.comments.length + ")" : "";
}

// ---------------------------------------------------------------- team access (admin only) --
function myEmail() {
return ((state.session && state.session.user && state.session.user.email) || "").toLowerCase();
}

async function openTeamAccess() {
$("taEmail").value = "";
$("taRole").value = "staff";
$("taErr").textContent = "";
await refreshStaffList();
$("teamAccessModal").classList.add("show");
}
function closeTeamAccess() {
$("teamAccessModal").classList.remove("show");
}

async function refreshStaffList() {
var staff = await db.listStaff();
var me = myEmail();
$("staffList").innerHTML =
staff
.map(function (s) {
var isMe = s.email.toLowerCase() === me;
return (
'<div class="staffrow">' +
'<span class="se">' + esc(s.email) + (isMe ? " <span class=\"m\">(you)</span>" : "") + "</span>" +
'<select class="taRoleSelect" data-email="' + esc(s.email) + '">' +
'<option value="staff"' + (s.role === "staff" ? " selected" : "") + ">Staff</option>" +
'<option value="admin"' + (s.role === "admin" ? " selected" : "") + ">Admin</option>" +
"</select>" +
'<button class="linklike" data-remove="' + esc(s.email) + '" style="color:#f6a9a2">Remove</button>' +
"</div>"
);
})
.join("") || '<p class="colempty">Nobody added yet.</p>';
}

// ---------------------------------------------------------------- add candidate --
async function quickAdd() {
var name = $("addName").value.trim();
if (!name) return;
var candidate = {
name: name,
status: "new",
priority: "normal",
};
if (state.activeRole) {
var role = state.roles.filter(function (r) { return r.title === state.activeRole; })[0];
candidate.role_title = state.activeRole;
candidate.role_id = role ? role.id : null;
}
var rows = await db.insertCandidate(candidate);
$("addName").value = "";
await loadAll();
if (rows && rows[0]) openCandidate(rows[0].id);
}

// ---------------------------------------------------------------- wire up --
function wire() {
$("roleTabs").addEventListener("click", function (e) {
var btn = e.target.closest("button[data-role]");
if (!btn) return;
state.activeRole = btn.getAttribute("data-role") || null;
render();
});
$("board").addEventListener("click", function (e) {
var more = e.target.closest("[data-colmore]");
if (more) { state.colShowAll[more.getAttribute("data-colmore")] = true; renderBoard(); return; }
var less = e.target.closest("[data-colless]");
if (less) { delete state.colShowAll[less.getAttribute("data-colless")]; renderBoard(); return; }
var card = e.target.closest(".ccard");
if (!card) return;
openCandidate(card.getAttribute("data-id"));
});
// Rows and columns are native <details> elements; capture their toggle
// events (capture phase so both nesting levels are caught reliably) and
// persist the open/closed state so it survives the next renderBoard().
$("board").addEventListener("toggle", function (e) {
var el = e.target;
if (!el || el.tagName !== "DETAILS") return;
if (el.hasAttribute("data-rowkey")) {
state.openRows[el.getAttribute("data-rowkey")] = el.open;
} else if (el.hasAttribute("data-colkey")) {
state.openCols[el.getAttribute("data-colkey")] = el.open;
}
}, true);
$("addBtn").addEventListener("click", quickAdd);
$("addName").addEventListener("keydown", function (e) { if (e.key === "Enter") quickAdd(); });

$("cmClose").onclick = closeCandidate;
$("candidateModal").addEventListener("click", function (e) { if (e.target.id === "candidateModal") closeCandidate(); });
[
["cmName", "name"], ["cmEmail", "email"], ["cmPhone", "phone"], ["cmLocation", "location"],
["cmLinkedin", "linkedin"], ["cmReferral", "referral"], ["cmSalary", "salary"], ["cmResume", "resume_url"],
["cmDue", "due_date"], ["cmAssignee", "assignee"], ["cmB1", "barrier1_notes"], ["cmB2", "barrier2_notes"], ["cmB3", "barrier3_notes"],
].forEach(function (pair) {
$(pair[0]).addEventListener("input", function (e) {
saveField(pair[1], e.target.value);
if (pair[0] === "cmB1" || pair[0] === "cmB2" || pair[0] === "cmB3") {
var n = [$("cmB1").value, $("cmB2").value, $("cmB3").value].filter(Boolean).length;
$("accBarriersCount").textContent = n ? " (" + n + "/3)" : "";
}
});
});
["cmRole", "cmStatus", "cmPriority"].forEach(function (id) {
var field = id === "cmRole" ? "role_title" : id === "cmStatus" ? "status" : "priority";
$(id).addEventListener("change", function (e) { saveField(field, e.target.value); });
});
$("cmDelete").addEventListener("click", async function () {
if (!state.openCandidateId) return;
if (!confirm("Remove this candidate? This can't be undone.")) return;
await db.deleteCandidate(state.openCandidateId);
closeCandidate();
await loadAll();
});
$("commentForm").addEventListener("submit", async function (e) {
e.preventDefault();
var body = $("commentBody").value.trim();
if (!body || !state.openCandidateId) return;
var author = (state.session && state.session.user && state.session.user.email) || "Staff";
await db.addComment(state.openCandidateId, author, body);
$("commentBody").value = "";
await refreshComments(state.openCandidateId);
});

$("teamAccessBtn").addEventListener("click", openTeamAccess);
$("taClose").onclick = closeTeamAccess;
$("teamAccessModal").addEventListener("click", function (e) { if (e.target.id === "teamAccessModal") closeTeamAccess(); });
$("teamAccessForm").addEventListener("submit", async function (e) {
e.preventDefault();
var email = $("taEmail").value.trim().toLowerCase();
var role = $("taRole").value;
if (!email) return;
$("taErr").textContent = "";
try {
await db.addStaff(email, role, myEmail());
$("taEmail").value = "";
await refreshStaffList();
} catch (err) {
$("taErr").textContent = err.message || "Could not add that person.";
}
});
$("staffList").addEventListener("click", async function (e) {
var btn = e.target.closest("button[data-remove]");
if (!btn) return;
var email = btn.getAttribute("data-remove");
if (email.toLowerCase() === myEmail()) { alert("You can't remove your own access."); return; }
if (!confirm("Remove " + email + "'s access to the pipeline?")) return;
await db.removeStaff(email);
await refreshStaffList();
});
$("staffList").addEventListener("change", async function (e) {
var sel = e.target.closest("select.taRoleSelect");
if (!sel) return;
var email = sel.getAttribute("data-email");
if (email.toLowerCase() === myEmail() && sel.value !== "admin") {
alert("You can't remove your own admin access.");
await refreshStaffList();
return;
}
await db.setStaffRole(email, sel.value);
await refreshStaffList();
});
}

document.addEventListener("DOMContentLoaded", function () { wire(); boot(); });
})();
