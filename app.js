(function () {
  var db = null; // set once PLEI_DB exists
  var state = { roles: [], candidates: [], comments: [], activeRole: null, openCandidateId: null, session: null };

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
  }

  async function boot() {
    db = window.PLEI_DB;
    db.onAuthChange(function (session) {
      state.session = session;
      if (session) { showApp(); loadAll(); } else { showLogin(); }
    });
    var session = await db.getSession();
    state.session = session;
    if (session) { showApp(); await loadAll(); db.subscribeToChanges(function () { loadAll(); }); }
    else { showLogin(); }

    $("loginForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      try {
        await db.signIn($("loginEmail").value.trim(), $("loginPassword").value);
      } catch (err) {
        showLogin(err.message || "Could not sign in.");
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
      var colsHtml = stagesInRow
        .map(function (s) {
          var cards = byStatus[s.key] || [];
          var cardsHtml = cards.length
            ? cards.map(cardHtml).join("")
            : '<p class="colempty">No candidates</p>';
          return (
            '<div class="col"><div class="colhead"><span>' + esc(s.label) + '</span><span class="colcount">' + cards.length + "</span></div>" + cardsHtml + "</div>"
          );
        })
        .join("");
      return (
        '<div class="boardrow"><h4><span class="dot ' + row.cat + '"></span>' + esc(row.title) + '</h4><div class="cols">' + colsHtml + "</div></div>"
      );
    }).join("");

    var rejected = byStatus["rejected"] || [];
    var rejectedHtml =
      '<div class="boardrow"><h4><span class="dot closed"></span>Rejected</h4><div class="cols"><div class="col"><div class="colhead"><span>Rejected</span><span class="colcount">' +
      rejected.length +
      '</span></div>' +
      (rejected.length ? rejected.map(cardHtml).join("") : '<p class="colempty">No candidates</p>') +
      "</div></div></div>";

    $("board").innerHTML = rowsHtml + rejectedHtml;
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
      var card = e.target.closest(".ccard");
      if (!card) return;
      openCandidate(card.getAttribute("data-id"));
    });
    $("addBtn").addEventListener("click", quickAdd);
    $("addName").addEventListener("keydown", function (e) { if (e.key === "Enter") quickAdd(); });

    $("cmClose").onclick = closeCandidate;
    $("candidateModal").addEventListener("click", function (e) { if (e.target.id === "candidateModal") closeCandidate(); });
    [
      ["cmName", "name"], ["cmEmail", "email"], ["cmPhone", "phone"], ["cmLocation", "location"],
      ["cmLinkedin", "linkedin"], ["cmReferral", "referral"], ["cmSalary", "salary"], ["cmResume", "resume_url"],
      ["cmDue", "due_date"], ["cmAssignee", "assignee"], ["cmB1", "barrier1_notes"], ["cmB2", "barrier2_notes"], ["cmB3", "barrier3_notes"],
    ].forEach(function (pair) {
      $(pair[0]).addEventListener("input", function (e) { saveField(pair[1], e.target.value); });
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
  }

  document.addEventListener("DOMContentLoaded", function () { wire(); boot(); });
})();
