/**
 * Textbook setups: the standard problems every AP Physics C course drills —
 * an Atwood machine, a block on an incline, a ball rolling down a ramp, an RC
 * circuit charging, a charge circling in a magnetic field.
 *
 * Each rule recognizes one such setup by its phrasing AND by exactly the
 * quantities it needs, then applies the equation for it. The brain consults
 * these before the general topic circuits, so every rule has to be narrow: a
 * rule that fires on a problem it doesn't understand takes the answer away
 * from a circuit that might have. When in doubt a rule declines (returns
 * nothing) and the circuits carry on as before.
 */
import { takeAll } from "./extract";
import type { SolveCtx } from "./extract";
import type { SolveResult } from "./topics/index";
import { EPS0, E_CHARGE, G, G_ACC, K_E, M_EARTH, MU0, R_EARTH } from "./constants";

export interface TextbookAnswer extends SolveResult {
  /** the equation the rule applied, for the thought timeline */
  equation: string;
}

/** [charge, mass] of the particles a problem can name instead of describing. */
const PARTICLES: Array<[RegExp, number, number]> = [
  [/\belectron/, E_CHARGE, 9.11e-31],
  [/\bproton/, E_CHARGE, 1.67e-27],
  [/\balpha particle/, 2 * E_CHARGE, 6.64e-27],
];

/** Rolling shapes: I = βMR². */
const SHAPE_BETA: Array<[RegExp, number]> = [
  [/hollow sphere|spherical shell/, 2 / 3],
  [/solid sphere|sphere|ball|marble/, 2 / 5],
  [/hoop|ring|hollow cylinder|thin-walled/, 1],
  [/disk|disc|solid cylinder|cylinder|wheel/, 1 / 2],
];

function ans(value: number, unit: string, equation: string, displayScale?: number): TextbookAnswer | undefined {
  if (!Number.isFinite(value)) return undefined;
  return displayScale ? { value, unit, equation, displayScale } : { value, unit, equation };
}

/** Capacitances print in μF, or pF when they are tiny (a bare plate pair). */
function capacitance(farads: number, equation: string): TextbookAnswer | undefined {
  return farads < 1e-9 ? ans(farads, "pF", equation, 1e-12) : ans(farads, "μF", equation, 1e-6);
}

/**
 * The answer to a standard setup, or undefined when the problem isn't one.
 * `question` is the final sentence, lowercased — what is actually being asked.
 */
export function textbookAnswer(ctx: SolveCtx, question: string): TextbookAnswer | undefined {
  const t = ctx.text.toLowerCase();
  const q = question;
  const all = (family: string): number[] => takeAll(ctx.slots, family);
  const m = all("mass");
  const v = all("velocity");
  const len = all("length");
  const time = all("time");
  const acc = all("acceleration");
  const force = all("force");
  const angle = all("angle");
  const mu = all("mu-coeff");
  const k = all("spring-k");
  const power = all("power");
  const inertia = all("inertia");
  const omega = all("angular-vel");
  const alpha = all("angular-acc");
  const freq = all("frequency");
  const charge = all("charge");
  const volt = all("voltage");
  const res = all("resistance");
  const cap = all("capacitance");
  const cur = all("current");
  const ind = all("inductance");
  const fieldE = all("field-e");
  const fieldB = all("field-b");
  const flux = all("flux");
  const turns = all("turns");
  const area = all("area");

  const asksSpeed = /speed|velocity|how fast/.test(q) && !/angular/.test(q);
  const asksTime = /how long|how much time|what time|time of flight|time in the air/.test(q);
  const asksDistance = /how far|distance|displacement/.test(q);
  const asksAccel = /acceleration/.test(q) && !/angular/.test(q);
  const asksEmf = /emf|voltage|potential difference/.test(q);
  const asksField = /magnetic field/.test(q);
  const magnitude = /magnitude/.test(q);
  const fromRest = /from rest|at rest|starts? at rest|initially at rest/.test(t);
  const particle = PARTICLES.find(([re]) => re.test(t));
  const beta = SHAPE_BETA.find(([re]) => re.test(t))?.[1];

  // ── kinematics ──────────────────────────────────────────────────
  const dropped = /dropp?ed|falls? from rest|released from rest/.test(t);
  if (dropped && asksTime && len.length === 1 && !v.length && !time.length) {
    return ans(Math.sqrt((2 * len[0]) / G_ACC), "s", "t = √(2h/g)");
  }
  if (dropped && /how high|how deep|height|how tall/.test(q) && time.length === 1 && !len.length && !v.length) {
    return ans(0.5 * G_ACC * time[0] ** 2, "m", "h = ½gt²");
  }
  if (/horizontally/.test(t) && /cliff|table|building|roof|tower|ledge|bridge/.test(t)) {
    if (v.length === 1 && len.length === 1 && (asksDistance || /land/.test(q))) {
      return ans(v[0] * Math.sqrt((2 * len[0]) / G_ACC), "m", "x = v√(2h/g)");
    }
    // the height is the length attached to the cliff; the other is the range
    if (!v.length && len.length === 2 && asksSpeed) {
      return ans(len[1] / Math.sqrt((2 * len[0]) / G_ACC), "m/s", "v = x/√(2h/g)");
    }
  }
  if (/projectile|launched|kicked|fired|thrown|shot/.test(t) && /horizontal/.test(t) && v.length === 1 && angle.length === 1 && !len.length && !time.length) {
    const [v0, th] = [v[0], angle[0]];
    if (/range|how far/.test(q)) return ans((v0 ** 2 * Math.sin(2 * th)) / G_ACC, "m", "R = v² sin 2θ / g");
    if (/maximum height|how high|peak height/.test(q)) return ans((v0 * Math.sin(th)) ** 2 / (2 * G_ACC), "m", "h = (v sin θ)²/2g");
    if (asksTime || /in the air/.test(q)) return ans((2 * v0 * Math.sin(th)) / G_ACC, "s", "t = 2v sin θ / g");
  }
  if (/straight up|vertically upward|straight upward/.test(t) && v.length === 1 && !len.length && !time.length && asksTime) {
    const up = v[0] / G_ACC;
    return /highest|maximum height|peak|top/.test(q) ? ans(up, "s", "t = v/g") : ans(2 * up, "s", "t = 2v/g");
  }
  if (v.length === 2 && time.length === 1 && !len.length && asksDistance && /uniform|constant|accelerat|slows|decelerat/.test(t)) {
    return ans(0.5 * (v[0] + v[1]) * time[0], "m", "Δx = ½(v_i + v_f)t");
  }
  // a straight run only — on a curve the same givens describe a centripetal problem
  if (v.length === 2 && len.length === 1 && !time.length && asksAccel && !m.length && !/curve|radius|circle|circular/.test(t)) {
    return ans((v[1] ** 2 - v[0] ** 2) / (2 * len[0]), "m/s²", "a = (v_f² − v_i²)/2Δx");
  }
  if (/average (speed|velocity)/.test(q) && len.length === 1 && time.length === 1 && !v.length) {
    return ans(len[0] / time[0], "m/s", "v = Δx/Δt");
  }

  // ── Newton's laws ───────────────────────────────────────────────
  const incline = /incline|ramp|slope|hill/.test(t);
  const rolling = /\broll(s|ing|ed)?\b/.test(t); // not a roller coaster
  if (incline && !rolling && angle.length === 1) {
    if (asksAccel && /slid/.test(t) && !force.length && !v.length) {
      const friction = mu.length ? mu[0] * Math.cos(angle[0]) : 0;
      return ans(G_ACC * (Math.sin(angle[0]) - friction), "m/s²", mu.length ? "a = g(sin θ − μ cos θ)" : "a = g sin θ");
    }
    if (/normal force/.test(q) && m.length === 1 && !force.length) {
      return ans(m[0] * G_ACC * Math.cos(angle[0]), "N", "N = mg cos θ");
    }
  }
  if (/elevator/.test(t) && m.length === 1 && acc.length === 1 && /normal force|apparent weight|scale|tension/.test(q)) {
    const up = /upward|\bup\b/.test(t) && !/downward/.test(t);
    return ans(m[0] * (G_ACC + (up ? acc[0] : -acc[0])), "N", up ? "N = m(g + a)" : "N = m(g − a)");
  }
  if (/pulley/.test(t) && m.length === 2 && !force.length && !angle.length && !mu.length) {
    const total = m[0] + m[1];
    if (/table|horizontal surface|frictionless surface/.test(t)) {
      // the hanging mass drives both; the other only adds inertia
      const hung = t.match(/hanging\s+([\d.]+)\s*kg|([\d.]+)\s*kg\s+(?:mass|block|weight)?\s*(?:that\s+)?hang/);
      const hanging = hung ? parseFloat(hung[1] ?? hung[2]) : m[1];
      const a = (hanging * G_ACC) / total;
      if (asksAccel) return ans(a, "m/s²", "a = m₂g/(m₁ + m₂)");
      if (/tension/.test(q)) return ans((total - hanging) * a, "N", "T = m₁a");
    } else {
      if (asksAccel) return ans((Math.abs(m[0] - m[1]) * G_ACC) / total, "m/s²", "a = (m₂ − m₁)g/(m₁ + m₂)");
      if (/tension/.test(q)) return ans((2 * m[0] * m[1] * G_ACC) / total, "N", "T = 2m₁m₂g/(m₁ + m₂)");
    }
  }
  if (/drag|air resistance/.test(t) && m.length === 1 && force.length === 1 && asksAccel) {
    return ans((m[0] * G_ACC - force[0]) / m[0], "m/s²", "a = (mg − F_drag)/m");
  }
  if (/vertical circle|loop-the-loop|vertical loop/.test(t) && /minimum|slowest|least/.test(q) && /top/.test(q) && len.length === 1 && asksSpeed) {
    return ans(Math.sqrt(G_ACC * len[0]), "m/s", "v = √(gr)");
  }
  if (m.length === 1 && force.length === 1 && time.length === 1 && !v.length && !len.length && fromRest && asksSpeed) {
    return ans((force[0] * time[0]) / m[0], "m/s", "v = Ft/m");
  }

  // ── work and energy ─────────────────────────────────────────────
  if (/\bwork\b/.test(q) && force.length === 1 && len.length === 1 && angle.length === 1) {
    return ans(force[0] * len[0] * Math.cos(angle[0]), "J", "W = Fd cos θ");
  }
  if (k.length === 1 && m.length === 1 && !incline) {
    if (len.length === 1 && !v.length && asksSpeed && /launch|fired|shot|released|pushed|propel/.test(t) && /compress|stretch/.test(t)) {
      return ans(len[0] * Math.sqrt(k[0] / m[0]), "m/s", "½kx² = ½mv²");
    }
    if (v.length === 1 && !len.length && /compress/.test(q)) {
      return ans(v[0] * Math.sqrt(m[0] / k[0]), "m", "½mv² = ½kx²");
    }
  }
  if (len.length === 2 && !v.length && fromRest && asksSpeed && /height/.test(q) && !rolling && !k.length) {
    return ans(Math.sqrt(2 * G_ACC * Math.abs(len[0] - len[1])), "m/s", "v = √(2gΔh)");
  }
  if (power.length === 1 && v.length === 1 && !force.length && /force/.test(q)) {
    return ans(power[0] / v[0], "N", "F = P/v");
  }
  if (mu.length === 1 && v.length === 1 && !len.length && !angle.length && asksDistance && /to rest|to a stop|stops/.test(t)) {
    return ans(v[0] ** 2 / (2 * mu[0] * G_ACC), "m", "d = v²/2μg");
  }

  // ── momentum ────────────────────────────────────────────────────
  if (/impulse|change in momentum/.test(q) && m.length === 1 && v.length === 2 && /hit back|bounces? back|rebound|returns|reverse|opposite direction/.test(t)) {
    return ans(m[0] * (v[0] + v[1]), "kg·m/s", "J = m(v_f + v_i)");
  }
  const sticks = /embed|lodge|stick|stuck|couple|perfectly inelastic/.test(t);
  if (/ballistic pendulum/.test(t) && m.length === 2 && len.length === 1 && asksSpeed) {
    const bullet = Math.min(m[0], m[1]);
    return ans(((m[0] + m[1]) / bullet) * Math.sqrt(2 * G_ACC * len[0]), "m/s", "v = ((m + M)/m)√(2gh)");
  }
  if (sticks && m.length === 2 && v.length >= 1 && !len.length) {
    const second = v.length > 1 ? v[1] : 0;
    const vf = (m[0] * v[0] + m[1] * second) / (m[0] + m[1]);
    if (/embed|lodge/.test(t) && v.length === 1 && asksSpeed) return ans(vf, "m/s", "v_f = m₁v₁/(m₁ + m₂)");
    if (/energy/.test(q) && /lost|dissipat/.test(q)) {
      const before = 0.5 * m[0] * v[0] ** 2 + 0.5 * m[1] * second ** 2;
      return ans(before - 0.5 * (m[0] + m[1]) * vf ** 2, "J", "ΔK = K_i − ½(m₁ + m₂)v_f²");
    }
  }
  if (/recoil/.test(q) && m.length === 2 && v.length === 1 && asksSpeed) {
    // the thing thrown or fired is the lighter of the two
    return ans((Math.min(m[0], m[1]) * v[0]) / Math.max(m[0], m[1]), "m/s", "m₁v₁ = m₂v₂");
  }
  if (/force/.test(q) && /average|braking|stopping/.test(q) && m.length === 1 && time.length === 1 && !force.length && !len.length) {
    if (v.length === 2) return ans((m[0] * Math.abs(v[1] - v[0])) / time[0], "N", "F = mΔv/Δt");
    if (v.length === 1 && /to rest|to a stop|stops/.test(t)) return ans((m[0] * v[0]) / time[0], "N", "F = mΔv/Δt");
  }
  if (/center of mass/.test(q) && m.length === 2 && len.length === 2) {
    return ans((m[0] * len[0] + m[1] * len[1]) / (m[0] + m[1]), "m", "x_cm = (m₁x₁ + m₂x₂)/(m₁ + m₂)");
  }

  // ── rotation ────────────────────────────────────────────────────
  if (alpha.length === 1 && time.length === 1 && omega.length <= 1 && !inertia.length) {
    const w0 = omega[0] ?? 0;
    if (/angular (velocity|speed)/.test(q) && (fromRest || omega.length)) return ans(w0 + alpha[0] * time[0], "rad/s", "ω = ω₀ + αt");
    if (/angle|angular displacement|how many radians/.test(q)) return ans(w0 * time[0] + 0.5 * alpha[0] * time[0] ** 2, "rad", "θ = ω₀t + ½αt²");
  }
  if (/angular acceleration/.test(q) && omega.length >= 1 && time.length === 1 && !alpha.length && !inertia.length) {
    const toRest = /to rest|to a stop|stops/.test(t);
    if (omega.length === 2 || toRest) {
      const change = omega.length === 2 ? omega[1] - omega[0] : -omega[0];
      return ans((magnitude ? Math.abs(change) : change) / time[0], "rad/s²", "α = Δω/Δt");
    }
  }
  if (/moment of inertia|rotational inertia/.test(q) && m.length === 1 && len.length === 1 && !inertia.length) {
    if (/\brod\b|stick|bar\b/.test(t)) {
      return /about (one|its|an) end|through (one|its|an) end|pivoted at (one|its) end/.test(t)
        ? ans((m[0] * len[0] ** 2) / 3, "kg·m²", "I = ⅓ML²")
        : ans((m[0] * len[0] ** 2) / 12, "kg·m²", "I = (1/12)ML²");
    }
    if (/hollow sphere|spherical shell/.test(t)) return ans((2 / 3) * m[0] * len[0] ** 2, "kg·m²", "I = ⅔MR²");
    if (/sphere|ball/.test(t)) return ans(0.4 * m[0] * len[0] ** 2, "kg·m²", "I = ⅖MR²");
  }
  if (inertia.length === 1 && omega.length === 1) {
    if (/angular momentum/.test(q)) return ans(inertia[0] * omega[0], "kg·m²/s", "L = Iω");
    if (/torque/.test(q) && time.length === 1 && /to rest|to a stop|stops/.test(t)) {
      return ans((inertia[0] * omega[0]) / time[0], "N·m", "τ = IΔω/Δt");
    }
  }
  if (inertia.length === 2 && omega.length === 1 && /angular (velocity|speed)/.test(q)) {
    return ans((inertia[0] * omega[0]) / inertia[1], "rad/s", "I₁ω₁ = I₂ω₂");
  }
  if (rolling && /without slipping/.test(t) && beta !== undefined && !v.length) {
    if (asksSpeed && len.length === 1 && fromRest) {
      return ans(Math.sqrt((2 * G_ACC * len[0]) / (1 + beta)), "m/s", "mgh = ½mv² + ½Iω²");
    }
    if (asksAccel && angle.length === 1) {
      return ans((G_ACC * Math.sin(angle[0])) / (1 + beta), "m/s²", "a = g sin θ/(1 + I/MR²)");
    }
  }

  // ── oscillations ────────────────────────────────────────────────
  if (/pendulum/.test(t) && time.length === 1 && !len.length && /length|how long is/.test(q)) {
    return ans(G_ACC * (time[0] / (2 * Math.PI)) ** 2, "m", "L = g(T/2π)²");
  }
  if (/spring constant|force constant|stiffness/.test(q) && m.length === 1 && time.length === 1 && !k.length && /period/.test(t)) {
    return ans((4 * Math.PI ** 2 * m[0]) / time[0] ** 2, "N/m", "k = 4π²m/T²");
  }
  if (/angular frequency/.test(q)) {
    if (k.length === 1 && m.length === 1) return ans(Math.sqrt(k[0] / m[0]), "rad/s", "ω = √(k/m)");
    if (ind.length === 1 && cap.length === 1) return ans(1 / Math.sqrt(ind[0] * cap[0]), "rad/s", "ω = 1/√(LC)");
    if (freq.length === 1) return ans(2 * Math.PI * freq[0], "rad/s", "ω = 2πf");
  }
  if (k.length === 1 && m.length === 1 && /oscillat|vibrat|simple harmonic|attached to a spring|on a spring/.test(t)) {
    const w = Math.sqrt(k[0] / m[0]);
    if (/frequency/.test(q) && !/angular/.test(q)) return ans(w / (2 * Math.PI), "Hz", "f = (1/2π)√(k/m)");
    if (/amplitude/.test(t) && len.length === 1) {
      if (/max(imum)? (speed|velocity)/.test(q)) return ans(len[0] * w, "m/s", "v_max = A√(k/m)");
      if (/max(imum)? acceleration/.test(q)) return ans(len[0] * w * w, "m/s²", "a_max = Ak/m");
    }
    if (/amplitude/.test(t) && len.length === 2 && asksSpeed) {
      const [amp, x] = [Math.max(len[0], len[1]), Math.min(len[0], len[1])];
      return ans(w * Math.sqrt(amp ** 2 - x ** 2), "m/s", "v = ω√(A² − x²)");
    }
  }

  // ── gravitation ─────────────────────────────────────────────────
  const star = m.find((x) => x > 1e20);
  const central = star ?? (/earth/.test(t) ? M_EARTH : undefined);
  if (/orbit|satellite/.test(t) && central !== undefined && len.length === 1) {
    const r = /altitude|above (the |earth's )?surface/.test(t) ? R_EARTH + len[0] : len[0];
    const small = m.find((x) => x < 1e20);
    if (/period/.test(q) && !time.length && !v.length) {
      return ans(2 * Math.PI * Math.sqrt(r ** 3 / (G * central)), "s", "T = 2π√(r³/GM)");
    }
    if (small !== undefined && /potential energy/.test(q)) return ans((-G * central * small) / r, "J", "U = −GMm/r");
    if (small !== undefined && /total (mechanical )?energy/.test(q)) return ans((-G * central * small) / (2 * r), "J", "E = −GMm/2r");
  }

  // ── electrostatics ──────────────────────────────────────────────
  if (/potential energy/.test(q) && charge.length === 2 && len.length === 1) {
    return ans((K_E * charge[0] * charge[1]) / len[0], "J", "U = kq₁q₂/r");
  }
  if (/electric potential|\bpotential\b/.test(q) && !/energy|difference/.test(q) && charge.length === 1 && len.length === 1 && !volt.length) {
    return ans((K_E * charge[0]) / len[0], "V", "V = kq/r");
  }
  if (particle && volt.length === 1 && /accelerated|through a potential difference/.test(t) && !fieldB.length) {
    const [, qp, mp] = particle;
    if (/kinetic energy/.test(q)) return ans(qp * volt[0], "J", "K = qΔV");
    if (asksSpeed) return ans(Math.sqrt((2 * qp * volt[0]) / mp), "m/s", "qΔV = ½mv²");
  }
  if (particle && fieldE.length === 1 && !fieldB.length && !charge.length) {
    const [, qp, mp] = particle;
    if (asksAccel) return ans((qp * fieldE[0]) / mp, "m/s²", "a = qE/m");
    if (/force/.test(q)) return ans(qp * fieldE[0], "N", "F = qE");
  }
  if (/sphere|shell/.test(t) && /electric field/.test(q) && charge.length === 1 && len.length === 2) {
    const radius = parseFloat(t.match(/radius (?:of |r\s*=\s*)?([\d.]+)/)?.[1] ?? "");
    const distance = len.find((x) => Math.abs(x - radius) > 1e-12);
    // outside the sphere it acts as a point charge at its center
    if (distance !== undefined && distance > radius) return ans((K_E * charge[0]) / distance ** 2, "N/C", "E = kq/r²");
  }

  // ── capacitors ──────────────────────────────────────────────────
  if (/capacitance/.test(q)) {
    const kappa = parseFloat(t.match(/dielectric (?:of |with )?(?:a )?constant (?:of |κ\s*=\s*)?([\d.]+)/)?.[1] ?? "1");
    if (/parallel[- ]plate/.test(t) && area.length === 1 && len.length === 1 && !cap.length) {
      return capacitance((kappa * EPS0 * area[0]) / len[0], "C = κε₀A/d");
    }
    if (/dielectric/.test(t) && cap.length === 1 && kappa !== 1) return capacitance(kappa * cap[0], "C = κC₀");
  }
  if (cap.length === 1 && charge.length === 1 && !volt.length && /energy/.test(q)) {
    return ans(charge[0] ** 2 / (2 * cap[0]), "J", "U = Q²/2C");
  }
  if (cap.length === 2 && volt.length === 1 && /series/.test(t) && /charge/.test(q)) {
    return ans(((cap[0] * cap[1]) / (cap[0] + cap[1])) * volt[0], "μC", "Q = C_eq·V", 1e-6);
  }

  // ── circuits ────────────────────────────────────────────────────
  if (/internal resistance/.test(t) && volt.length === 1 && res.length === 2) {
    const stated = parseFloat(t.match(/internal resistance (?:of |r\s*=\s*)?([\d.]+)/)?.[1] ?? "");
    const internal = res.find((x) => Math.abs(x - stated) < 1e-9) ?? Math.min(res[0], res[1]);
    const current = volt[0] / (res[0] + res[1]);
    if (/terminal voltage/.test(q)) return ans(volt[0] - current * internal, "V", "V = ε − Ir");
    if (/current/.test(q)) return ans(current, "A", "I = ε/(R + r)");
  }
  if (/time constant/.test(q) && res.length === 1) {
    if (cap.length === 1 && !ind.length) return ans(res[0] * cap[0], "s", "τ = RC");
    if (ind.length === 1 && !cap.length) return ans(ind[0] / res[0], "s", "τ = L/R");
  }
  if (cap.length === 1 && res.length === 1 && volt.length === 1 && time.length === 1 && !ind.length) {
    const decay = Math.exp(-time[0] / (res[0] * cap[0]));
    const discharging = /discharg/.test(t);
    if (/voltage|potential difference/.test(q)) {
      return discharging ? ans(volt[0] * decay, "V", "V = V₀e^(−t/RC)") : ans(volt[0] * (1 - decay), "V", "V = ε(1 − e^(−t/RC))");
    }
    if (/current/.test(q)) return ans((volt[0] / res[0]) * decay, "A", "I = (V/R)e^(−t/RC)");
  }
  if (ind.length === 1 && res.length === 1 && volt.length === 1 && time.length === 1 && !cap.length && /current/.test(q)) {
    return ans((volt[0] / res[0]) * (1 - Math.exp((-time[0] * res[0]) / ind[0])), "A", "I = (ε/R)(1 − e^(−Rt/L))");
  }
  if (power.length === 1 && volt.length === 1 && !res.length && !cur.length && !time.length) {
    if (/resistance/.test(q)) return ans(volt[0] ** 2 / power[0], "Ω", "R = V²/P");
    if (/current/.test(q)) return ans(power[0] / volt[0], "A", "I = P/V");
  }
  if (volt.length === 1 && res.length >= 2 && !cap.length && !ind.length && !cur.length) {
    const across = q.match(/voltage (?:drop )?across the ([\d.]+)\s*(?:Ω|ω|ohm)/);
    if (across && /series/.test(t)) {
      // the question names the resistor again, so it was counted twice
      const named = parseFloat(across[1]);
      const total = res.reduce((a, b) => a + b, 0) - named;
      return ans((volt[0] * named) / total, "V", "V₁ = εR₁/(R₁ + R₂)");
    }
    if (/parallel/.test(t) && /power/.test(q) && /total|battery|altogether/.test(q)) {
      return ans(res.reduce((sum, r) => sum + volt[0] ** 2 / r, 0), "W", "P = V²/R₁ + V²/R₂");
    }
  }

  // ── magnetism ───────────────────────────────────────────────────
  if (asksField && cur.length === 1 && !fieldB.length) {
    if (/solenoid/.test(t) && turns.length === 1) {
      const perMeter = /turns? per (meter|metre|m\b)|turns\/m/.test(t);
      if (perMeter) return ans(MU0 * turns[0] * cur[0], "T", "B = μ₀nI");
      if (len.length === 1) return ans((MU0 * turns[0] * cur[0]) / len[0], "T", "B = μ₀NI/L");
    }
    if (/center/.test(t) && /loop|coil|ring/.test(t) && len.length === 1) {
      return ans((MU0 * (turns[0] ?? 1) * cur[0]) / (2 * len[0]), "T", "B = μ₀I/2R");
    }
    if (/wire/.test(t) && !/loop|coil|solenoid/.test(t) && len.length === 1) {
      return ans((MU0 * cur[0]) / (2 * Math.PI * len[0]), "T", "B = μ₀I/2πr");
    }
  }
  if (/parallel/.test(t) && /wires/.test(t) && /per (unit )?(length|meter|metre)/.test(q) && cur.length >= 1 && len.length === 1) {
    return ans((MU0 * cur[0] * (cur[1] ?? cur[0])) / (2 * Math.PI * len[0]), "N/m", "F/L = μ₀I₁I₂/2πd");
  }
  if (fieldB.length === 1 && !fieldE.length) {
    const qp = particle?.[1] ?? (charge.length === 1 ? charge[0] : undefined);
    const mp = particle?.[2] ?? (m.length === 1 ? m[0] : undefined);
    if (qp !== undefined && mp !== undefined) {
      if (/radius/.test(q) && v.length === 1) return ans((mp * v[0]) / (qp * fieldB[0]), "m", "r = mv/qB");
      if (/period/.test(q)) return ans((2 * Math.PI * mp) / (qp * fieldB[0]), "s", "T = 2πm/qB");
      if (/frequency/.test(q) && !/angular/.test(q)) return ans((qp * fieldB[0]) / (2 * Math.PI * mp), "Hz", "f = qB/2πm");
    }
  }
  if (fieldE.length === 1 && fieldB.length === 1 && asksSpeed && !v.length) {
    return ans(fieldE[0] / fieldB[0], "m/s", "v = E/B");
  }
  if (/torque/.test(q) && turns.length === 1 && area.length === 1 && cur.length === 1 && fieldB.length === 1) {
    return ans(turns[0] * cur[0] * area[0] * fieldB[0], "N·m", "τ = NIAB");
  }

  // ── induction ───────────────────────────────────────────────────
  if (/transformer/.test(t) && volt.length === 1 && /secondary voltage|voltage (across|of|in) the secondary|output voltage/.test(q)) {
    const coil = (name: string): number =>
      parseFloat(
        (t.match(new RegExp(`([\\d.]+)[- ]?(?:turn )?${name}`)) ?? t.match(new RegExp(`${name}(?: coil| winding)? (?:has|with|of) ([\\d.]+)`)))?.[1] ?? "",
      );
    return ans((volt[0] * coil("secondary")) / coil("primary"), "V", "V_s/V_p = N_s/N_p");
  }
  if (/inductance/.test(q) && /solenoid/.test(t) && turns.length === 1 && len.length === 1 && area.length === 1) {
    return ans((MU0 * turns[0] ** 2 * area[0]) / len[0], "H", "L = μ₀N²A/ℓ");
  }
  if (asksEmf || /induced current/.test(q)) {
    const perR = /current/.test(q) ? (res.length === 1 ? res[0] : NaN) : 1;
    const unit = /current/.test(q) ? "A" : "V";
    if (turns.length === 1 && flux.length === 1 && time.length === 1 && !fieldB.length) {
      return ans((turns[0] * flux[0]) / time[0] / perR, unit, "ε = NΔΦ/Δt");
    }
    if (turns.length === 1 && area.length === 1 && fieldB.length === 2 && time.length === 1) {
      return ans((turns[0] * area[0] * Math.abs(fieldB[1] - fieldB[0])) / time[0] / perR, unit, "ε = NAΔB/Δt");
    }
    if (turns.length === 1 && area.length === 1 && fieldB.length === 1 && omega.length === 1 && /peak|maximum|amplitude/.test(q)) {
      return ans((turns[0] * area[0] * fieldB[0] * omega[0]) / perR, unit, "ε_max = NBAω");
    }
    if (fieldB.length === 1 && len.length === 1 && v.length === 1 && !turns.length && !area.length && /rod|bar|wire|rail|conductor/.test(t)) {
      return ans((fieldB[0] * len[0] * v[0]) / perR, unit, "ε = BLv");
    }
    if (ind.length === 1 && cur.length === 1 && !time.length && !res.length && /a\/s|amperes? per second|amps? per second/.test(t)) {
      return ans(ind[0] * cur[0], "V", "ε = L·dI/dt");
    }
  }

  return undefined;
}
