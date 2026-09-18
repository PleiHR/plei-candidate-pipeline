// The 13-stage pipeline, same shape/labels as the original hiring-pipeline.html
// (Plei Home Base repo), grouped into the same three rows.
window.STAGES = [
  { key: "new",             label: "New Application",       cat: "notstarted" },
  { key: "reached_out",     label: "Reached Out",           cat: "notstarted" },
  { key: "move_interviews", label: "Move to Interviews",    cat: "notstarted" },
  { key: "on_hold",         label: "On Hold",               cat: "notstarted" },
  { key: "not_moving",      label: "Not Moving Forward",    cat: "notstarted" },
  { key: "barrier1",        label: "Barrier 1",             cat: "active" },
  { key: "barrier2",        label: "Barrier 2",             cat: "active" },
  { key: "barrier3",        label: "Barrier 3",             cat: "active" },
  { key: "barrier4",        label: "Barrier 4",             cat: "active" },
  { key: "passed",          label: "Passed",                cat: "active" },
  { key: "offer_sent",      label: "Offer Sent",            cat: "done" },
  { key: "send_offer",      label: "Send Offer",            cat: "done" },
  { key: "rejected",        label: "Rejected",              cat: "closed" },
];

window.STAGE_ROWS = [
  { title: "Not started",             cat: "notstarted" },
  { title: "Active — the Barriers",   cat: "active" },
  { title: "Done",                    cat: "done" },
];
// "Rejected" (cat closed) is shown as its own compact row at the end, same
// convention as hiring-pipeline.html.

window.stageByKey = function stageByKey(key) {
  return window.STAGES.filter(function (s) { return s.key === key; })[0] || null;
};

// A candidate is considered to have "reached" barrier N once they are at
// barrier N or anywhere later in the pipeline (through Offer). Rejected
// candidates are counted separately, since a rejection doesn't record which
// barrier it happened at — same disclosed limitation as the original app.
window.BARRIER_ORDER = ["barrier1", "barrier2", "barrier3", "barrier4", "passed", "offer_sent", "send_offer"];
window.reachedBarrier = function reachedBarrier(candidateStatus, barrierKey) {
  var ci = window.BARRIER_ORDER.indexOf(candidateStatus);
  var bi = window.BARRIER_ORDER.indexOf(barrierKey);
  if (ci === -1 || bi === -1) return false;
  return ci >= bi;
};
