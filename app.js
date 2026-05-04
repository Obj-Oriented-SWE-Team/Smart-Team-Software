import {
  uid,
  load,
  save,
  getUsers,
  setUsers,
  getProjects,
  setProjects,
  getAssessments,
  setAssessments,
  findUserById,
  findAssessment,
} from "./storage.js";
import { generateTeams, SKILLS_OPTIONS } from "./teamFormation.js";

const TRAIT_LABELS = [
  { key: "O", label: "Openness" },
  { key: "C", label: "Conscientiousness" },
  { key: "E", label: "Extraversion" },
  { key: "A", label: "Agreeableness" },
  { key: "N", label: "Neuroticism" },
];

function $(id) {
  return document.getElementById(id);
}

function showOnly(...ids) {
  document.querySelectorAll("main .panel").forEach((el) => {
    el.classList.add("hidden");
  });
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  });
}

function getSession() {
  return load("session", null);
}

function setSession(s) {
  save("session", s);
}

function clearSession() {
  save("session", null);
}

function parseSkillsCsv(s) {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function renderTraitSliders() {
  const box = $("trait-sliders");
  box.innerHTML = "";
  TRAIT_LABELS.forEach(({ key, label }) => {
    const row = document.createElement("div");
    row.className = "trait-row";
    row.innerHTML = `
      <span>${label}</span>
      <input type="range" min="0" max="100" value="50" data-trait="${key}" />
      <span class="trait-val">50</span>
    `;
    const input = row.querySelector("input");
    const valSpan = row.querySelector(".trait-val");
    input.addEventListener("input", () => {
      valSpan.textContent = input.value;
    });
    box.appendChild(row);
  });
}

function renderSkillChecks() {
  const box = $("skill-checks");
  box.innerHTML = "";
  SKILLS_OPTIONS.forEach((skill) => {
    const id = `sk_${skill.replace(/\W+/g, "_")}`;
    const lab = document.createElement("label");
    lab.innerHTML = `<input type="checkbox" value="${skill}" id="${id}" /> ${skill}`;
    box.appendChild(lab);
  });
}

function readAssessmentForm() {
  const traits = {};
  document.querySelectorAll("#trait-sliders input[data-trait]").forEach((inp) => {
    traits[inp.dataset.trait] = Number(inp.value);
  });
  const skills = [];
  document.querySelectorAll("#skill-checks input:checked").forEach((cb) => {
    skills.push(cb.value);
  });
  const experience = Number($("exp-years").value) || 0;
  return { traits, skills, experience };
}

function fillAssessmentForm(a) {
  if (!a) return;
  TRAIT_LABELS.forEach(({ key }) => {
    const inp = document.querySelector(`#trait-sliders input[data-trait="${key}"]`);
    if (inp) {
      inp.value = a.traits[key];
      inp.dispatchEvent(new Event("input"));
    }
  });
  document.querySelectorAll("#skill-checks input").forEach((cb) => {
    cb.checked = a.skills.includes(cb.value);
  });
  $("exp-years").value = a.experience ?? 0;
}

function upsertAssessment(userId, data, completed) {
  const list = getAssessments();
  const i = list.findIndex((x) => x.userId === userId);
  const row = {
    userId,
    traits: data.traits,
    skills: data.skills,
    experience: data.experience,
    completed,
    updatedAt: new Date().toISOString(),
  };
  if (i >= 0) list[i] = row;
  else list.push(row);
  setAssessments(list);
}

function login(name, role) {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    alert("Please enter a display name.");
    return;
  }
  let users = getUsers();
  let user = users.find((u) => u.name.toLowerCase() === trimmed.toLowerCase() && u.role === role);
  if (!user) {
    user = { id: uid("user"), name: trimmed, role };
    users.push(user);
    setUsers(users);
  }
  setSession({ userId: user.id });
  refreshUI();
}

function logout() {
  clearSession();
  showOnly("view-login");
  $("session-bar").classList.add("hidden");
}

function currentUser() {
  const s = getSession();
  if (!s?.userId) return null;
  return findUserById(s.userId);
}

function refreshSessionBar() {
  const bar = $("session-bar");
  const u = currentUser();
  if (!u) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  bar.textContent = `${u.name} (${u.role})`;
}

function refreshUI() {
  refreshSessionBar();
  const u = currentUser();
  if (!u) {
    showOnly("view-login");
    return;
  }
  if (u.role === "manager") {
    showOnly("view-manager");
    renderManagerProjects();
  } else {
    showOnly("view-member");
    refreshMemberView();
  }
}

function renderManagerProjects() {
  const u = currentUser();
  const ul = $("manager-project-list");
  ul.innerHTML = "";
  const projects = getProjects().filter((p) => p.managerId === u.id);
  if (!projects.length) {
    ul.innerHTML = '<li class="muted">No projects yet. Create one.</li>';
    return;
  }
  projects.forEach((p) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${escapeHtml(p.name)}</strong> <span class="muted">— ID: <code>${escapeHtml(p.id)}</code></span></span>`;
    const open = document.createElement("button");
    open.className = "btn primary";
    open.textContent = "Open";
    open.type = "button";
    open.addEventListener("click", () => openProjectDetail(p.id));
    li.appendChild(open);
    ul.appendChild(li);
  });
}

let editingProjectId = null;

function openProjectForm(existing) {
  editingProjectId = existing?.id || null;
  $("project-form-title").textContent = existing ? "Edit project" : "New project";
  $("pf-name").value = existing?.name || "";
  $("pf-team-size").value = existing?.teamSize || 3;
  $("pf-tasks").value = (existing?.tasks || []).join("\n");
  $("pf-skills").value = (existing?.requiredSkills || []).join(", ");
  showOnly("view-project-form");
}

function saveProjectForm() {
  const u = currentUser();
  const name = $("pf-name").value.trim();
  const teamSize = Number($("pf-team-size").value);
  const tasks = $("pf-tasks").value
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  const requiredSkills = parseSkillsCsv($("pf-skills").value);
  if (!name) {
    alert("Project name required.");
    return;
  }
  if (teamSize < 2) {
    alert("Team size must be at least 2.");
    return;
  }
  let projects = getProjects();
  if (editingProjectId) {
    projects = projects.map((p) =>
      p.id === editingProjectId
        ? { ...p, name, teamSize, tasks, requiredSkills }
        : p
    );
  } else {
    projects.push({
      id: uid("proj"),
      name,
      managerId: u.id,
      teamSize,
      tasks,
      requiredSkills,
      memberIds: [],
      teams: null,
      finalizedAt: null,
    });
  }
  setProjects(projects);
  editingProjectId = null;
  refreshUI();
}

let detailProjectId = null;

function openProjectDetail(projectId) {
  detailProjectId = projectId;
  const p = getProjects().find((x) => x.id === projectId);
  if (!p) return;
  $("pd-title").textContent = p.name;
  $("pd-meta").textContent = `Project ID: ${p.id} · Team size: ${p.teamSize} · Enrolled: ${p.memberIds.length}`;
  $("generate-msg").textContent = "";
  $("generate-msg").className = "msg";
  renderEnrollUI(p);
  renderGenerateResults(p);
  showOnly("view-project-detail");
}

function renderEnrollUI(project) {
  const box = $("pd-enroll");
  const users = getUsers().filter((u) => u.role === "member");
  const eligible = users.filter((u) => {
    const a = findAssessment(u.id);
    return a?.completed;
  });
  const select = document.createElement("select");
  select.id = "enroll-select";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Select member…";
  select.appendChild(opt0);
  eligible.forEach((u) => {
    const already = project.memberIds.includes(u.id);
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `${u.name}${already ? " (already enrolled)" : ""}`;
    if (already) opt.disabled = true;
    select.appendChild(opt);
  });
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn primary";
  btn.textContent = "Add to project";
  btn.addEventListener("click", () => {
    const uidSel = select.value;
    if (!uidSel) return;
    enrollMember(project.id, uidSel);
  });
  box.innerHTML = "";
  box.appendChild(select);
  box.appendChild(btn);
}

function enrollMember(projectId, memberUserId) {
  let projects = getProjects();
  const p = projects.find((x) => x.id === projectId);
  if (!p) return;
  if (p.memberIds.includes(memberUserId)) {
    alert("This member is already enrolled in this project (duplicate enrollment blocked).");
    return;
  }
  const a = findAssessment(memberUserId);
  if (!a?.completed) {
    alert("Assessment not complete.");
    return;
  }
  p.memberIds = [...p.memberIds, memberUserId];
  setProjects(projects);
  openProjectDetail(projectId);
}

function memberProfilesForProject(project) {
  return project.memberIds.map((id) => {
    const user = findUserById(id);
    const a = findAssessment(id);
    return {
      userId: id,
      name: user?.name || id,
      traits: a.traits,
      skills: a.skills || [],
      experience: a.experience ?? 0,
    };
  });
}

function runGenerate() {
  const msg = $("generate-msg");
  msg.textContent = "";
  msg.className = "msg";
  const projects = getProjects();
  const p = projects.find((x) => x.id === detailProjectId);
  if (!p) return;
  const profiles = memberProfilesForProject(p);
  const incomplete = p.memberIds.filter((id) => !findAssessment(id)?.completed);
  if (incomplete.length) {
    msg.textContent =
      "One or more members did not complete the assessment. Cannot generate teams until everyone completes it.";
    msg.classList.add("err");
    msg.classList.remove("ok", "neutral");
    return;
  }
  const n = profiles.length;
  if (n < p.teamSize) {
    msg.textContent = `Need at least ${p.teamSize} enrolled members with completed assessments. Currently: ${n}.`;
    msg.classList.add("err");
    return;
  }
  if (n % p.teamSize !== 0) {
    msg.textContent = `Total members (${n}) must be divisible by team size (${p.teamSize}) for this prototype. Add or remove enrollments.`;
    msg.classList.add("err");
    return;
  }
  try {
    const { teams } = generateTeams(profiles, p.teamSize, p.tasks, p.requiredSkills || []);
    const idx = projects.findIndex((x) => x.id === p.id);
    projects[idx] = {
      ...p,
      teams,
      finalizedAt: new Date().toISOString(),
    };
    setProjects(projects);
    msg.textContent = `Generated ${teams.length} team(s). Compatibility and risk estimates shown below.`;
    msg.classList.add("ok");
    msg.classList.remove("err", "neutral");
    renderGenerateResults(projects[idx]);
  } catch (e) {
    msg.textContent = e.message || String(e);
    msg.classList.add("err");
  }
}

function renderGenerateResults(project) {
  const wrap = $("pd-results");
  if (!project.teams?.length) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  wrap.innerHTML = "";
  project.teams.forEach((t) => {
    const card = document.createElement("div");
    card.className = "team-card";
    const pred =
      project.memberIds.length > 0
        ? Math.min(
            95,
            Math.round(
              t.compatibilityScore * 0.65 + (t.skillCoverage || 50) * 0.35
            )
          )
        : 0;
    card.innerHTML = `
      <h3><span>${escapeHtml(t.name)}</span> <span class="badge">Compatibility ${t.compatibilityScore}</span></h3>
      <div class="stats-row">
        <span>Skill coverage (required): <strong>${t.skillCoverage ?? "—"}%</strong></span>
        <span>Delay risk: <strong>${escapeHtml(t.delayRisk)}</strong></span>
        <span>Predicted performance index: <strong>${pred}</strong> (demo formula)</span>
      </div>
    `;
    t.members.forEach((m) => {
      const line = document.createElement("div");
      line.className = "member-line";
      const tasks = (m.tasks || []).map(escapeHtml).join("; ") || "—";
      line.innerHTML = `<strong>${escapeHtml(m.name)}</strong> — ${escapeHtml(m.role)}<br/>
        <span class="muted small">${escapeHtml(m.explanation)}</span><br/>
        Tasks: ${tasks}`;
      card.appendChild(line);
    });
    wrap.appendChild(card);
  });
}

function refreshMemberView() {
  const u = currentUser();
  const a = findAssessment(u.id);
  const st = $("member-assessment-status");
  if (a?.completed) {
    st.textContent = "Assessment: complete. You can enroll in projects.";
    st.className = "msg ok";
  } else {
    st.textContent = "Assessment: not complete. Finish before team formation.";
    st.className = "msg err";
  }
  const ul = $("member-enrollments");
  ul.innerHTML = "";
  getProjects().forEach((p) => {
    if (!p.memberIds.includes(u.id)) return;
    const li = document.createElement("li");
    const hasTeams = p.teams?.length > 0;
    li.innerHTML = `<span>${escapeHtml(p.name)} <span class="muted">(${escapeHtml(p.id)})</span></span>`;
    if (hasTeams) {
      const b = document.createElement("button");
      b.className = "btn primary";
      b.type = "button";
      b.textContent = "View my team";
      b.addEventListener("click", () => showMemberTeam(p.id));
      li.appendChild(b);
    } else {
      const span = document.createElement("span");
      span.className = "muted";
      span.textContent = "Teams not generated yet";
      li.appendChild(span);
    }
    ul.appendChild(li);
  });
}

function showMemberTeam(projectId) {
  const u = currentUser();
  const p = getProjects().find((x) => x.id === projectId);
  if (!p?.teams) return;
  let myTeam = null;
  for (const t of p.teams) {
    if (t.members.some((m) => m.userId === u.id)) myTeam = t;
  }
  const box = $("member-dash-content");
  if (!myTeam) {
    box.innerHTML = "<p>Not assigned to a team.</p>";
  } else {
    const me = myTeam.members.find((m) => m.userId === u.id);
    box.innerHTML = `
      <div class="team-card">
        <h3>${escapeHtml(myTeam.name)}</h3>
        <p>Your role: <strong>${escapeHtml(me?.role)}</strong></p>
        <p class="muted">${escapeHtml(me?.explanation || "")}</p>
        <p>Tasks: ${(me?.tasks || []).map(escapeHtml).join("; ") || "—"}</p>
        <hr style="border-color:var(--border)" />
        <p><strong>Team</strong> (compatibility ${myTeam.compatibilityScore})</p>
        ${myTeam.members
          .map(
            (m) =>
              `<div class="member-line">${escapeHtml(m.name)} — ${escapeHtml(m.role)}</div>`
          )
          .join("")}
      </div>
    `;
  }
  showOnly("view-member-dash");
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bind() {
  $("btn-login").addEventListener("click", () => {
    const name = $("login-name").value;
    const role = document.querySelector('input[name="login-role"]:checked')?.value || "member";
    login(name, role);
  });

  $("btn-logout-m").addEventListener("click", logout);
  $("btn-logout-me").addEventListener("click", logout);

  $("btn-new-project").addEventListener("click", () => openProjectForm(null));
  $("pf-save").addEventListener("click", saveProjectForm);
  $("pf-cancel").addEventListener("click", () => refreshUI());

  $("btn-back-list").addEventListener("click", () => refreshUI());

  $("btn-generate").addEventListener("click", runGenerate);

  $("btn-assessment").addEventListener("click", () => {
    const u = currentUser();
    fillAssessmentForm(findAssessment(u.id));
    showOnly("view-assessment");
  });

  $("btn-save-assessment").addEventListener("click", () => {
    const u = currentUser();
    const data = readAssessmentForm();
    upsertAssessment(u.id, data, true);
    refreshMemberView();
    showOnly("view-member");
  });

  $("btn-cancel-assessment").addEventListener("click", () => refreshUI());

  $("btn-join").addEventListener("click", () => {
    const raw = $("join-project-id").value.trim();
    const msg = $("join-msg");
    msg.className = "msg";
    const u = currentUser();
    const a = findAssessment(u.id);
    if (!a?.completed) {
      msg.textContent = "Complete your assessment before enrolling.";
      msg.classList.add("err");
      return;
    }
    const projects = getProjects();
    const p = projects.find((x) => x.id === raw);
    if (!p) {
      msg.textContent = "Project ID not found.";
      msg.classList.add("err");
      return;
    }
    if (p.memberIds.includes(u.id)) {
      msg.textContent = "Already enrolled.";
      msg.classList.add("neutral");
      return;
    }
    p.memberIds = [...p.memberIds, u.id];
    setProjects(projects);
    msg.textContent = "Enrolled successfully.";
    msg.classList.add("ok");
    $("join-project-id").value = "";
    refreshMemberView();
  });

  $("btn-member-dash-back").addEventListener("click", () => {
    showOnly("view-member");
    refreshMemberView();
  });
}

renderTraitSliders();
renderSkillChecks();
bind();

const s = getSession();
if (s?.userId && findUserById(s.userId)) {
  refreshUI();
} else {
  showOnly("view-login");
}
