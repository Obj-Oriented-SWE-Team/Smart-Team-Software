const PREFIX = "stc_proto_v1_";

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** @typedef {{ id: string, name: string, role: 'manager'|'member' }} User */
/** @typedef {{ O: number, C: number, E: number, A: number, N: number }} BigFive */
/** @typedef {{ userId: string, traits: BigFive, skills: string[], experience: number, completed: boolean, updatedAt: string }} Assessment */
/** @typedef {{ id: string, name: string, managerId: string, teamSize: number, tasks: string[], requiredSkills: string[], memberIds: string[], teams: TeamResult[]|null, finalizedAt: string|null }} Project */
/** @typedef {{ id: string, name: string, members: TeamMemberAssignment[], compatibilityScore: number, delayRisk: string, skillCoverage: number }} TeamResult */
/** @typedef {{ userId: string, name: string, role: string, tasks: string[] }} TeamMemberAssignment */

export function getUsers() {
  return load("users", []);
}

export function setUsers(users) {
  save("users", users);
}

export function getProjects() {
  return load("projects", []);
}

export function setProjects(projects) {
  save("projects", projects);
}

export function getAssessments() {
  return load("assessments", []);
}

export function setAssessments(list) {
  save("assessments", list);
}

export function findUserById(id) {
  return getUsers().find((u) => u.id === id) || null;
}

export function findAssessment(userId) {
  return getAssessments().find((a) => a.userId === userId) || null;
}
