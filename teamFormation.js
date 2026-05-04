/**
 * Team formation + scoring aligned with SRS DR-3–DR-5 and REQ-10–23 (simplified prototype).
 */

const ROLE_KEYS = ["Leader", "Developer", "Tester", "Analyst"];

const VARIANCE_THRESHOLD = 120; // scale-dependent; trait 0–100 => variance up to ~2500

function meanTrait(teamProfiles, k) {
  const keys = ["O", "C", "E", "A", "N"];
  const idx = keys.indexOf(k);
  if (idx < 0) return 0;
  const sum = teamProfiles.reduce((s, p) => s + p.traits[k], 0);
  return sum / teamProfiles.length;
}

function varianceTrait(teamProfiles, k) {
  const mu = meanTrait(teamProfiles, k);
  const n = teamProfiles.length;
  if (n <= 1) return 0;
  const s = teamProfiles.reduce((acc, p) => {
    const d = p.traits[k] - mu;
    return acc + d * d;
  }, 0);
  return s / n;
}

function personalityAggregate(teamProfiles) {
  const keys = ["O", "C", "E", "A", "N"];
  let sumVar = 0;
  for (const k of keys) {
    sumVar += varianceTrait(teamProfiles, k);
  }
  return sumVar / 5;
}

function homogeneityPenalty(teamProfiles) {
  const keys = ["O", "C", "E", "A", "N"];
  let penalty = 0;
  for (const k of keys) {
    const v = varianceTrait(teamProfiles, k);
    if (v < VARIANCE_THRESHOLD) {
      penalty += VARIANCE_THRESHOLD - v;
    }
  }
  return penalty;
}

function skillCoverageTeam(teamProfiles, requiredSkills) {
  if (!requiredSkills.length) return 1;
  const have = new Set();
  for (const p of teamProfiles) {
    for (const s of p.skills) have.add(s.toLowerCase());
  }
  let hit = 0;
  for (const r of requiredSkills) {
    if (have.has(r.toLowerCase().trim())) hit++;
  }
  return hit / requiredSkills.length;
}

function experienceScore(teamProfiles) {
  if (!teamProfiles.length) return 0;
  const avg =
    teamProfiles.reduce((s, p) => s + (p.experience || 0), 0) / teamProfiles.length;
  return Math.min(1, avg / 10);
}

/**
 * Weighted performance-like score (DR-10 style): α·Skill + β·Personality + γ·Experience, normalized.
 */
function teamPerformanceScore(teamProfiles, requiredSkills, alpha = 0.45, beta = 0.35, gamma = 0.2) {
  const skill = skillCoverageTeam(teamProfiles, requiredSkills);
  const pers = Math.min(1, personalityAggregate(teamProfiles) / 800);
  const exp = experienceScore(teamProfiles);
  return alpha * skill + beta * pers + gamma * exp;
}

function compatibilityScore(teamProfiles, requiredSkills) {
  const base = teamPerformanceScore(teamProfiles, requiredSkills) * 100;
  const pen = homogeneityPenalty(teamProfiles) / 50;
  return Math.max(0, Math.round((base - pen) * 10) / 10);
}

function roleFit(profile, role) {
  const { O, C, E, A, N } = profile.traits;
  const skills = profile.skills.map((s) => s.toLowerCase());
  let score = 0;
  switch (role) {
    case "Leader":
      score = 0.35 * E + 0.35 * C + 0.2 * A - 0.1 * N;
      break;
    case "Developer":
      score =
        (skills.some((s) => s.includes("dev") || s.includes("code")) ? 25 : 0) +
        0.2 * C +
        0.15 * O;
      break;
    case "Tester":
      score =
        (skills.some((s) => s.includes("test") || s.includes("qa")) ? 25 : 0) +
        0.25 * C +
        0.15 * A;
      break;
    case "Analyst":
      score =
        (skills.some((s) => s.includes("analys") || s.includes("design")) ? 20 : 0) +
        0.3 * O +
        0.2 * C;
      break;
    default:
      score = 50;
  }
  return score;
}

function assignRolesForTeam(members) {
  const rolesLeft = [...ROLE_KEYS];
  const assigned = [];
  const pool = members.map((m) => ({ ...m, _roles: [] }));
  while (rolesLeft.length && pool.length) {
    let best = -Infinity;
    let bestPair = null;
    for (const m of pool) {
      for (const r of rolesLeft) {
        const f = roleFit(m, r);
        if (f > best) {
          best = f;
          bestPair = { m, r };
        }
      }
    }
    if (!bestPair) break;
    const { m, r } = bestPair;
    assigned.push({ profile: m, role: r });
    rolesLeft.splice(rolesLeft.indexOf(r), 1);
    const idx = pool.indexOf(m);
    if (idx >= 0) pool.splice(idx, 1);
  }
  for (const m of pool) {
    assigned.push({ profile: m, role: "Contributor" });
  }
  return assigned;
}

function distributeTasks(tasks, roleAssignments) {
  const list = tasks.length ? tasks : ["General task"];
  const buckets = roleAssignments.map(() => []);
  list.forEach((t, i) => {
    buckets[i % buckets.length].push(t);
  });
  return buckets;
}

function delayRiskLabel(teamProfiles, compatibility, skillCov) {
  if (skillCov < 0.5) return "High — missing required skills";
  if (compatibility < 40) return "Medium — low compatibility / diversity";
  if (compatibility < 60) return "Low–Medium";
  return "Low";
}

/**
 * Greedy partition: try random restarts to maximize sum of team scores.
 */
export function generateTeams(memberProfiles, teamSize, projectTasks, requiredSkills) {
  if (teamSize < 2) throw new Error("Team size must be at least 2");
  const n = memberProfiles.length;
  if (n < teamSize) throw new Error("Not enough members to form one team");
  let bestPartition = null;
  let bestSum = -Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const shuffled = shuffle([...memberProfiles]);
    const teams = [];
    for (let i = 0; i < shuffled.length; i += teamSize) {
      const chunk = shuffled.slice(i, i + teamSize);
      if (chunk.length === teamSize) teams.push(chunk);
    }
    if (!teams.length) continue;
    let sum = 0;
    for (const t of teams) {
      sum += teamPerformanceScore(t, requiredSkills);
    }
    const leftover = n % teamSize;
    if (leftover > 0) sum -= leftover * 10;
    if (sum > bestSum) {
      bestSum = sum;
      bestPartition = teams;
    }
  }
  if (!bestPartition) {
    throw new Error("Could not partition teams");
  }
  const results = bestPartition.map((profiles, idx) => {
    const roleAssignments = assignRolesForTeam(profiles);
    const taskBuckets = distributeTasks(projectTasks, roleAssignments);
    const cov = skillCoverageTeam(profiles, requiredSkills);
    const comp = compatibilityScore(profiles, requiredSkills);
    const members = roleAssignments.map((ra, i) => ({
      userId: ra.profile.userId,
      name: ra.profile.name,
      role: ra.role,
      tasks: taskBuckets[i] || [],
      explanation: explainRole(ra.profile, ra.role),
    }));
    return {
      id: `team_${idx + 1}`,
      name: `Team ${idx + 1}`,
      members,
      compatibilityScore: comp,
      skillCoverage: Math.round(cov * 1000) / 10,
      delayRisk: delayRiskLabel(profiles, comp, cov),
    };
  });
  return { teams: results };
}

function explainRole(profile, role) {
  const { O, C, E } = profile.traits;
  const bits = [];
  if (role === "Leader" && E > 60) bits.push("high extraversion supports coordination");
  if (role === "Developer" && C > 65) bits.push("conscientiousness fits delivery");
  if (role === "Tester" && C > 60) bits.push("detail orientation for quality");
  if (role === "Analyst" && O > 60) bits.push("openness supports exploration");
  if (!bits.length) bits.push("best available fit given team constraints");
  return `${role}: ${bits.join("; ")}.`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const SKILLS_OPTIONS = [
  "JavaScript",
  "Python",
  "Testing / QA",
  "Design / UX",
  "DevOps",
  "Documentation",
  "Analysis",
  "Project management",
];
