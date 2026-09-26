const protocolEl = document.querySelector("#protocol");
const blurbEl = document.querySelector("#blurb");
const fieldsEl = document.querySelector("#fields");
const heuristicEl = document.querySelector("#heuristic");
const theoryEl = document.querySelector("#theory");
const labelEl = document.querySelector("#theory-label");
const statusEl = document.querySelector("#status");
const lemmasEl = document.querySelector("#lemmas");
const noteEl = document.querySelector("#note");
const attemptsEl = document.querySelector("#attempts");
const logEl = document.querySelector("#log");
const mlStatusEl = document.querySelector("#ml-status");
const mlTheoryEl = document.querySelector("#ml-theory");
const mlLemmaEl = document.querySelector("#ml-lemma");
const mlListEl = document.querySelector("#ml-list");

let catalog = null;
let mlTheories = [];

async function api(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || res.statusText);
  }
  return data;
}

function currentProtocol() {
  return catalog.protocols.find((item) => item.id === protocolEl.value);
}

function readOptions() {
  const options = {};
  for (const field of currentProtocol().fields) {
    const node = document.querySelector(`[data-key="${field.key}"]`);
    options[field.key] = field.kind === "bool" ? node.checked : node.value;
  }
  return options;
}

function payload() {
  return {
    protocol: protocolEl.value,
    options: readOptions(),
    heuristic: heuristicEl.value,
  };
}

function renderFields() {
  const protocol = currentProtocol();
  blurbEl.textContent = protocol.blurb;
  fieldsEl.replaceChildren();
  for (const field of protocol.fields) {
    if (field.kind === "bool") {
      const row = document.createElement("label");
      row.className = "bool-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.key = field.key;
      input.checked = Boolean(field.default);
      row.append(input, document.createTextNode(field.label));
      fieldsEl.append(row);
      continue;
    }
    const label = document.createElement("label");
    label.textContent = field.label;
    const select = document.createElement("select");
    select.dataset.key = field.key;
    for (const opt of field.options) {
      const node = document.createElement("option");
      node.value = opt.id;
      node.textContent = opt.label;
      if (opt.id === field.default) node.selected = true;
      select.append(node);
    }
    fieldsEl.append(label, select);
  }
}

function setBusy(busy) {
  for (const id of ["load", "verify", "search", "ml-methods"]) {
    document.querySelector(`#${id}`).disabled = busy;
  }
}

function lemmaClass(row) {
  if (!row) return "wait";
  if (row.verified) return "ok";
  if (String(row.status).includes("falsified")) return "bad";
  return "wait";
}

function renderLemmas(rows) {
  lemmasEl.replaceChildren();
  for (const row of rows || []) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    const status = document.createElement("td");
    const steps = document.createElement("td");
    name.textContent = row.name;
    status.textContent = row.status;
    status.className = lemmaClass(row);
    steps.textContent = row.steps ?? "";
    tr.append(name, status, steps);
    lemmasEl.append(tr);
  }
}

function renderAttempts(rows) {
  attemptsEl.replaceChildren();
  for (const row of rows || []) {
    const tr = document.createElement("tr");
    const cells = [
      row.abstraction,
      row.heuristic,
      row.timed_out ? "timed out" : (row.verified || []).join(", ") || "none",
    ];
    cells.forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    });
    attemptsEl.append(tr);
  }
}

async function loadTheory() {
  setBusy(true);
  statusEl.textContent = "Assembling the theory.";
  try {
    const data = await api("/api/assemble", payload());
    theoryEl.value = data.theory;
    labelEl.textContent = data.label;
    statusEl.textContent = "Theory loaded. Verify checks this text, including edits.";
  } catch (err) {
    statusEl.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

async function verify() {
  setBusy(true);
  statusEl.textContent = "Running Tamarin.";
  logEl.textContent = "";
  try {
    const body = payload();
    if (theoryEl.value.trim()) body.theory = theoryEl.value;
    const data = await api("/api/verify", body);
    labelEl.textContent = data.label || "";
    renderLemmas(data.lemmas);
    logEl.textContent = data.log || "";
    if (data.timed_out) statusEl.textContent = "Tamarin hit the time limit.";
    else if (data.warning) statusEl.textContent = "Tamarin rejected the theory.";
    else if (data.cached) statusEl.textContent = `Cached result from a ${data.seconds ?? "?"}s run.`;
    else statusEl.textContent = `Finished in ${data.seconds ?? "?"}s.`;
  } catch (err) {
    statusEl.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

async function search() {
  setBusy(true);
  statusEl.textContent = "Searching abstractions. The QKD search checks two executability models and needs about 25 seconds.";
  try {
    const data = await api("/api/learn", payload());
    noteEl.textContent = data.note || "";
    renderAttempts(data.attempts);
    if (data.best && data.best.options) {
      applyOptions(data.best.options);
      const loaded = await api("/api/assemble", {
        protocol: protocolEl.value,
        options: data.best.options,
      });
      theoryEl.value = loaded.theory;
      labelEl.textContent = loaded.label;
      renderLemmas(data.best.lemmas);
    }
    statusEl.textContent = "Search finished.";
  } catch (err) {
    statusEl.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

function applyOptions(options) {
  for (const [key, value] of Object.entries(options)) {
    const node = document.querySelector(`[data-key="${key}"]`);
    if (!node) continue;
    if (node.type === "checkbox") node.checked = Boolean(value);
    else node.value = value;
  }
}

function applyPreset(name) {
  if (name === "qkd") {
    protocolEl.value = "qkd";
    renderFields();
    applyOptions({ type: "PM", adv: "Network", er: "FEC", bo: "SeqA", exec: true, secrecy: false, auth: false });
  } else {
    protocolEl.value = "qsend";
    renderFields();
    applyOptions({ leak_key: name === "leak" });
  }
  heuristicEl.value = "S";
  loadTheory();
}

async function refreshMl() {
  try {
    const data = await api("/api/ml");
    mlTheories = data.theories || [];
    mlTheoryEl.replaceChildren();
    if (!data.up) {
      mlStatusEl.textContent = "Proof-method queries need the Tamarin ML API server, tamarin-prover-json, on port 3001. That server is not running. This page searches with Tamarin's S and C heuristics.";
      return;
    }
    mlStatusEl.textContent = `ML API is up with ${mlTheories.length} loaded theories.`;
    for (const theory of mlTheories) {
      const opt = document.createElement("option");
      opt.value = theory.name;
      opt.textContent = theory.name;
      mlTheoryEl.append(opt);
    }
  } catch (err) {
    mlStatusEl.textContent = err.message;
  }
}

async function fetchMethods() {
  const selected = mlTheories.find((item) => item.name === mlTheoryEl.value);
  if (!selected) {
    mlStatusEl.textContent = "No ML API theory is loaded.";
    return;
  }
  setBusy(true);
  try {
    const data = await api("/api/ml/methods", {
      theoryKind: selected.theoryKind,
      theoryIndex: selected.theoryIndex,
      lemma: mlLemmaEl.value.trim(),
    });
    mlListEl.replaceChildren();
    for (const method of data.methods || []) {
      const li = document.createElement("li");
      li.textContent = method;
      mlListEl.append(li);
    }
    if (!(data.methods || []).length) {
      mlStatusEl.textContent = data.detail || data.status || "No proof methods returned.";
    }
  } catch (err) {
    mlStatusEl.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

async function init() {
  catalog = await api("/api/catalog");
  for (const protocol of catalog.protocols) {
    const opt = document.createElement("option");
    opt.value = protocol.id;
    opt.textContent = protocol.name;
    protocolEl.append(opt);
  }
  for (const heuristic of catalog.heuristics) {
    const opt = document.createElement("option");
    opt.value = heuristic;
    opt.textContent = heuristic;
    heuristicEl.append(opt);
  }
  renderFields();
  protocolEl.addEventListener("change", renderFields);
  document.querySelector("#load").addEventListener("click", loadTheory);
  document.querySelector("#verify").addEventListener("click", verify);
  document.querySelector("#search").addEventListener("click", search);
  document.querySelector("#ml-methods").addEventListener("click", fetchMethods);
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  }
  refreshMl();
}

init();
