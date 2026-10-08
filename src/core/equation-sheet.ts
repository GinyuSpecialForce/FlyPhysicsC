/**
 * The AP Physics C equation sheet, as data.
 *
 * Every entry is one *solvable direction* of an equation: a display string for
 * humans, a machine `form` the dimensional solver can evaluate, and the unit
 * family of every variable. Inverse directions ("given a_c and r, find v") are
 * written out explicitly rather than derived by symbolic algebra, so the
 * numbers are predictable and the citations are traceable.
 *
 * Three things read this file: the Reference tab (rendering), the citations the
 * thought timeline shows after a circuit solves something, and the dimensional
 * rescue solver in `dimension-solver.ts`, which solves phrasings no hand-written
 * circuit covers by searching these entries for one whose variables all bind.
 */
import type { Topic } from "./features";
import type { UnitFamily } from "./units";

export interface SheetEntry {
  /** how the equation reads, e.g. "a_c = v²/r" */
  display: string;
  /** the key this direction solves for */
  target: string;
  /** machine form: identifiers are variable keys, plus the constants below */
  form: string;
  /** every variable → its unit family */
  vars: Record<string, UnitFamily>;
  /**
   * Keys that may fall back to a tabulated constant when the problem does not
   * supply one — the central mass of an orbit is Earth's, not the satellite's.
   */
  defaults?: Record<string, string>;
  /**
   * Keys whose meaning is restricted: "central" means this mass is the body
   * being orbited, so a satellite's own mass must never be bound to it;
   * "height" means the length is a drop height, not a radius.
   */
  roles?: Record<string, "central" | "height">;
}

export interface SheetEquation {
  id: string;
  /** the heading it sits under on the printed sheet */
  section: string;
  topics: Topic[];
  /** phrasings a "which equation do I use…" question might use */
  aliases: string[];
  /**
   * Words the problem must contain for these directions to apply at all —
   * "v₂ = −(m₁/m₂)v₁′" describes fragments flying apart, not a collision.
   */
  requires?: string[];
  /** a tabulated default may only be assumed in a celestial context */
  celestial?: boolean;
  entries: SheetEntry[];
}

/**
 * Names available inside every `form`. They come from the constants table, so
 * a form like "G*M/r^2" is literally the fly citing the AP constants.
 */
export const FORM_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  G: 6.67e-11,
  g: 9.8,
  kE: 8.99e9,
  MU0: 4 * Math.PI * 1e-7,
  EPS0: 8.85e-12,
  E_CHARGE: 1.6e-19,
  M_earth: 5.97e24,
  R_earth: 6.37e6,
  M_moon: 7.342e22,
  d_moon: 3.844e8,
  M_sun: 1.989e30,
  d_earth_sun: 1.496e11,
};

// ── sections ────────────────────────────────────────────────────────

const KINEMATICS = "Kinematics";
const NEWTON = "Newton's laws of motion";
const WORK = "Work and energy";
const MOMENTUM = "Momentum and impulse";
const CIRCULAR = "Circular motion and rotation";
const OSCILLATIONS = "Oscillations";
const GRAVITATION = "Gravitation";
const ELECTROSTATICS = "Electrostatics";
const CAPACITORS = "Capacitors";
const CIRCUITS = "Circuits";
const MAGNETISM = "Magnetism";
const INDUCTION = "Electromagnetic induction";

const T_KIN = ["kinematics"] as Topic[];
const T_NEW = ["newton", "kinematics"] as Topic[];
const T_WORK = ["energy", "newton"] as Topic[];
const T_MOM = ["momentum", "energy"] as Topic[];
const T_CIRC = ["rotation", "kinematics"] as Topic[];
const T_SHM = ["shm"] as Topic[];
const T_GRAV = ["gravitation", "shm"] as Topic[];
const T_ES = ["electrostatics"] as Topic[];
const T_CAP = ["capacitors"] as Topic[];
const T_CIR = ["circuits", "capacitors"] as Topic[];
const T_MAG = ["magnetism"] as Topic[];
const T_IND = ["induction", "circuits"] as Topic[];

/** dimensionally neutral variables that still count as real givens */
const PLAIN: Record<string, UnitFamily> = {};

export const EQUATIONS: SheetEquation[] = [
  // ── Kinematics ────────────────────────────────────────────────────
  {
    id: "kin.v",
    section: KINEMATICS,
    topics: T_KIN,
    aliases: ["average velocity", "how fast is it moving on average", "velocity from distance and time"],
    entries: [
      { display: "v = Δx/Δt", target: "v", form: "x/t", vars: { ...PLAIN, v: "velocity", x: "length", t: "time" } },
      { display: "t = Δx/v", target: "t", form: "x/v", vars: { ...PLAIN, t: "time", x: "length", v: "velocity" } },
    ],
  },
  {
    id: "kin.a",
    section: KINEMATICS,
    topics: T_KIN,
    aliases: ["average acceleration", "how fast is the velocity changing"],
    entries: [
      { display: "a = Δv/Δt", target: "a", form: "v/t", vars: { ...PLAIN, a: "acceleration", v: "velocity", t: "time" } },
      { display: "v = aΔt", target: "v", form: "a*t", vars: { ...PLAIN, v: "velocity", a: "acceleration", t: "time" } },
      { display: "t = Δv/a", target: "t", form: "v/a", vars: { ...PLAIN, t: "time", v: "velocity", a: "acceleration" } },
    ],
  },
  {
    id: "kin.x1",
    section: KINEMATICS,
    topics: T_KIN,
    aliases: ["position after some time", "where is it after", "displacement in terms of time"],
    entries: [
      {
        display: "x = x₀ + v₀Δt + ½aΔt²",
        target: "x",
        form: "x0 + v0*t + 0.5*a*t^2",
        vars: { ...PLAIN, x: "length", x0: "length", v0: "velocity", a: "acceleration", t: "time" },
      },
      {
        display: "v₀ = (x − x₀ − ½aΔt²)/Δt",
        target: "v0",
        form: "(x - x0 - 0.5*a*t^2)/t",
        vars: { ...PLAIN, v0: "velocity", x: "length", x0: "length", a: "acceleration", t: "time" },
      },
      {
        display: "a = 2(x − x₀ − v₀Δt)/Δt²",
        target: "a",
        form: "2*(x - x0 - v0*t)/t^2",
        vars: { ...PLAIN, a: "acceleration", x: "length", x0: "length", v0: "velocity", t: "time" },
      },
    ],
  },
  {
    id: "kin.vf2",
    section: KINEMATICS,
    topics: T_KIN,
    aliases: ["kinematic equation", "final velocity from distance", "motion without time"],
    entries: [
      {
        display: "v_f = √(v_i² + 2aΔx)",
        target: "vf",
        form: "sqrt(vi^2 + 2*a*x)",
        vars: { ...PLAIN, vf: "velocity", vi: "velocity", a: "acceleration", x: "length" },
      },
      {
        display: "v_i = √(v_f² − 2aΔx)",
        target: "vi",
        form: "sqrt(vf^2 - 2*a*x)",
        vars: { ...PLAIN, vi: "velocity", vf: "velocity", a: "acceleration", x: "length" },
      },
      {
        display: "Δx = (v_f² − v_i²)/(2a)",
        target: "x",
        form: "(vf^2 - vi^2)/(2*a)",
        vars: { ...PLAIN, x: "length", vf: "velocity", vi: "velocity", a: "acceleration" },
      },
    ],
  },
  {
    id: "kin.x2",
    section: KINEMATICS,
    topics: T_KIN,
    aliases: ["average of the velocities", "displacement without acceleration"],
    entries: [
      {
        display: "Δx = ((v_i + v_f)/2)Δt",
        target: "x",
        form: "0.5*(vi + vf)*t",
        vars: { ...PLAIN, x: "length", vi: "velocity", vf: "velocity", t: "time" },
      },
    ],
  },
  {
    id: "kin.proj.t",
    section: KINEMATICS,
    topics: T_KIN,
    aliases: ["time to hit the ground", "how long does it take to fall", "time of flight"],
    entries: [
      { display: "t = √(2Δy/g)", target: "t", form: "sqrt(2*y/g)", vars: { ...PLAIN, t: "time", y: "length" } },
      { display: "v = 2Δy/t", target: "v", form: "2*y/t", vars: { ...PLAIN, v: "velocity", y: "length", t: "time" } },
    ],
  },
  {
    id: "kin.proj.range",
    section: KINEMATICS,
    topics: T_KIN,
    aliases: ["horizontal range", "time in the air for a launch angle", "time of flight at an angle"],
    entries: [
      {
        display: "Δt = Δx/(v cos θ)",
        target: "t",
        form: "x/(v*cos(theta))",
        vars: { ...PLAIN, t: "time", x: "length", v: "velocity", theta: "angle" },
      },
      {
        display: "Δt = Δx/(v sin θ)",
        target: "t",
        form: "x/(v*sin(theta))",
        vars: { ...PLAIN, t: "time", x: "length", v: "velocity", theta: "angle" },
      },
    ],
  },

  // ── Circular motion and rotation ──────────────────────────────────
  {
    id: "circ.ac",
    section: CIRCULAR,
    topics: T_CIRC,
    aliases: [
      "centripetal acceleration",
      "acceleration of something going in a circle",
      "how fast the direction changes",
      "centripetal force",
    ],
    entries: [
      { display: "a_c = v²/r", target: "ac", form: "v^2/r", vars: { ...PLAIN, ac: "acceleration", v: "velocity", r: "length" } },
      { display: "a_c = ω²r", target: "ac", form: "w^2*r", vars: { ...PLAIN, ac: "acceleration", w: "angular-vel", r: "length" } },
      { display: "v = √(a_c·r)", target: "v", form: "sqrt(ac*r)", vars: { ...PLAIN, v: "velocity", ac: "acceleration", r: "length" } },
      { display: "r = v²/a_c", target: "r", form: "v^2/ac", vars: { ...PLAIN, r: "length", v: "velocity", ac: "acceleration" } },
    ],
  },
  {
    id: "circ.v",
    section: CIRCULAR,
    topics: T_CIRC,
    aliases: ["tangential speed from the rotation rate", "speed on a rotating object", "v = rω"],
    entries: [
      { display: "v = rω", target: "v", form: "r*w", vars: { ...PLAIN, v: "velocity", r: "length", w: "angular-vel" } },
      { display: "ω = v/r", target: "w", form: "v/r", vars: { ...PLAIN, w: "angular-vel", v: "velocity", r: "length" } },
      { display: "r = v/ω", target: "r", form: "v/w", vars: { ...PLAIN, r: "length", v: "velocity", w: "angular-vel" } },
    ],
  },
  {
    id: "circ.period",
    section: CIRCULAR,
    topics: T_CIRC,
    aliases: ["how long one revolution takes", "period of the rotation", "time per lap", "time for one orbit"],
    entries: [
      { display: "T = 2πr/v", target: "T", form: "2*pi*r/v", vars: { ...PLAIN, T: "time", r: "length", v: "velocity" } },
      { display: "T = 2π/ω", target: "T", form: "2*pi/w", vars: { ...PLAIN, T: "time", w: "angular-vel" } },
      { display: "T = 1/f", target: "T", form: "1/f", vars: { ...PLAIN, T: "time", f: "frequency" } },
      { display: "ω = 2πf", target: "w", form: "2*pi*f", vars: { ...PLAIN, w: "angular-vel", f: "frequency" } },
      { display: "f = 1/T", target: "f", form: "1/T", vars: { ...PLAIN, f: "frequency", T: "time" } },
      { display: "ω = v/r", target: "w", form: "v/r", vars: { ...PLAIN, w: "angular-vel", v: "velocity", r: "length" } },
    ],
  },
  {
    id: "circ.Fc",
    section: CIRCULAR,
    topics: ["rotation", "kinematics", "newton"],
    aliases: ["centripetal force", "force needed to keep something moving in a circle", "force pulling inward"],
    entries: [
      { display: "F_c = mv²/r", target: "F", form: "m*v^2/r", vars: { ...PLAIN, F: "force", m: "mass", v: "velocity", r: "length" } },
      { display: "F_c = mω²r", target: "F", form: "m*w^2*r", vars: { ...PLAIN, F: "force", m: "mass", w: "angular-vel", r: "length" } },
      {
        display: "v = √(F_c·r/m)",
        target: "v",
        form: "sqrt(F*r/m)",
        vars: { ...PLAIN, v: "velocity", F: "force", r: "length", m: "mass" },
      },
    ],
  },
  {
    id: "rot.tau",
    section: CIRCULAR,
    topics: T_CIRC,
    aliases: ["torque", "what makes something spin up", "rotational force"],
    entries: [
      { display: "τ = rF sin θ", target: "tau", form: "r*F", vars: { ...PLAIN, tau: "torque", r: "length", F: "force" } },
      { display: "τ = Iα", target: "tau", form: "I*alpha", vars: { ...PLAIN, tau: "torque", I: "inertia", alpha: "angular-acc" } },
      {
        display: "α = τ/I",
        target: "alpha",
        form: "tau/I",
        vars: { ...PLAIN, alpha: "angular-acc", tau: "torque", I: "inertia" },
      },
    ],
  },
  {
    id: "rot.at",
    section: CIRCULAR,
    topics: T_CIRC,
    aliases: ["tangential acceleration", "how fast the speed changes on a circle", "a_t"],
    entries: [
      {
        display: "a_t = rα",
        target: "at",
        form: "r*alpha",
        vars: { ...PLAIN, at: "acceleration", r: "length", alpha: "angular-acc" },
      },
      {
        display: "α = Δω/Δt",
        target: "alpha",
        form: "(w2 - w1)/t",
        vars: { ...PLAIN, alpha: "angular-acc", w1: "angular-vel", w2: "angular-vel", t: "time" },
      },
    ],
  },
  {
    id: "rot.I",
    section: CIRCULAR,
    topics: T_CIRC,
    aliases: ["moment of inertia", "how hard is it to spin this shape", "rotational inertia"],
    entries: [
      { display: "I = ½MR²  (solid cylinder / disk)", target: "I", form: "0.5*M*r^2", vars: { ...PLAIN, I: "inertia", M: "mass", r: "length" } },
      { display: "I = ¼MR²  (hoop)", target: "I", form: "0.25*M*r^2", vars: { ...PLAIN, I: "inertia", M: "mass", r: "length" } },
      { display: "I = (1/12)ML²  (thin rod)", target: "I", form: "M*r^2/12", vars: { ...PLAIN, I: "inertia", M: "mass", r: "length" } },
      {
        display: "I = (2/5)MR²  (solid sphere)",
        target: "I",
        form: "0.4*M*r^2",
        vars: { ...PLAIN, I: "inertia", M: "mass", r: "length" },
      },
    ],
  },
  {
    id: "rot.L",
    section: CIRCULAR,
    topics: T_CIRC,
    aliases: ["rotational energy", "energy of a spinning object"],
    entries: [
      {
        display: "U = ½Iω²",
        target: "U",
        form: "0.5*I*w^2",
        vars: { ...PLAIN, U: "energy", I: "inertia", w: "angular-vel" },
      },
    ],
  },

  // ── Newton's laws ─────────────────────────────────────────────────
  {
    id: "newton.F",
    section: NEWTON,
    topics: T_NEW,
    aliases: ["second law", "force equals mass times acceleration", "net force"],
    entries: [
      { display: "F = ma", target: "F", form: "m*a", vars: { ...PLAIN, F: "force", m: "mass", a: "acceleration" } },
      { display: "a = F/m", target: "a", form: "F/m", vars: { ...PLAIN, a: "acceleration", F: "force", m: "mass" } },
      { display: "m = F/a", target: "m", form: "F/a", vars: { ...PLAIN, m: "mass", F: "force", a: "acceleration" } },
    ],
  },
  {
    id: "newton.weight",
    section: NEWTON,
    topics: T_NEW,
    aliases: ["weight of an object", "how much it weighs", "gravitational force on a mass"],
    entries: [
      { display: "W = mg", target: "W", form: "m*g", vars: { ...PLAIN, W: "force", m: "mass" } },
    ],
  },
  {
    id: "newton.friction",
    section: NEWTON,
    topics: T_NEW,
    aliases: ["friction force", "force needed to slide it", "maximum static friction"],
    entries: [
      {
        display: "F_fr = μF_N",
        target: "F",
        form: "mu*m*g",
        vars: { ...PLAIN, F: "force", mu: "mu-coeff", m: "mass" },
      },
    ],
  },
  {
    id: "newton.spring",
    section: NEWTON,
    topics: T_NEW,
    aliases: ["hooke's law", "force a spring pulls with", "spring force"],
    entries: [
      {
        display: "F_s = −kx",
        target: "F",
        form: "k*x",
        vars: { ...PLAIN, F: "force", k: "spring-k", x: "length" },
      },
      {
        display: "x = F/k",
        target: "x",
        form: "F/k",
        vars: { ...PLAIN, x: "length", F: "force", k: "spring-k" },
      },
    ],
  },

  // ── Work and energy ───────────────────────────────────────────────
  {
    id: "energy.W",
    section: WORK,
    topics: T_WORK,
    aliases: ["work done by a force", "how much work"],
    entries: [
      { display: "W = Fd cos θ", target: "W", form: "F*d", vars: { ...PLAIN, W: "energy", F: "force", d: "length" } },
      { display: "F = W/d", target: "F", form: "W/d", vars: { ...PLAIN, F: "force", W: "energy", d: "length" } },
      { display: "d = W/F", target: "d", form: "W/F", vars: { ...PLAIN, d: "length", W: "energy", F: "force" } },
    ],
  },
  {
    id: "energy.KE",
    section: WORK,
    topics: T_WORK,
    aliases: ["kinetic energy", "how fast it is going", "energy of motion"],
    entries: [
      { display: "K = ½mv²", target: "K", form: "0.5*m*v^2", vars: { ...PLAIN, K: "energy", m: "mass", v: "velocity" } },
      { display: "v = √(2K/m)", target: "v", form: "sqrt(2*K/m)", vars: { ...PLAIN, v: "velocity", K: "energy", m: "mass" } },
      { display: "m = 2K/v²", target: "m", form: "2*K/v^2", vars: { ...PLAIN, m: "mass", K: "energy", v: "velocity" } },
    ],
  },
  {
    id: "energy.P",
    section: WORK,
    topics: T_WORK,
    aliases: ["power", "how fast work is done", "rate of doing work"],
    entries: [
      { display: "P = W/Δt", target: "P", form: "W/t", vars: { ...PLAIN, P: "power", W: "energy", t: "time" } },
      { display: "P = Fv", target: "P", form: "F*v", vars: { ...PLAIN, P: "power", F: "force", v: "velocity" } },
    ],
  },
  {
    id: "energy.Us",
    section: WORK,
    topics: T_WORK,
    aliases: ["spring potential energy", "elastic potential energy"],
    entries: [
      {
        display: "U_s = ½kx²",
        target: "U",
        form: "0.5*k*x^2",
        vars: { ...PLAIN, U: "energy", k: "spring-k", x: "length" },
      },
      {
        display: "k = 2U/x²",
        target: "k",
        form: "2*U/x^2",
        vars: { ...PLAIN, k: "spring-k", U: "energy", x: "length" },
      },
      {
        display: "x = √(2U/k)",
        target: "x",
        form: "sqrt(2*U/k)",
        vars: { ...PLAIN, x: "length", U: "energy", k: "spring-k" },
      },
    ],
  },
  {
    id: "energy.Ug",
    section: WORK,
    topics: T_WORK,
    aliases: ["gravitational potential energy", "energy from height"],
    entries: [
      {
        display: "U_g = mgy",
        target: "U",
        form: "m*g*h",
        vars: { ...PLAIN, U: "energy", m: "mass", h: "length" },
        roles: { h: "height" },
      },
      {
        display: "y = U/(mg)",
        target: "h",
        form: "U/(m*g)",
        vars: { ...PLAIN, h: "length", U: "energy", m: "mass" },
      },
    ],
  },
  {
    id: "energy.Kcons",
    section: WORK,
    topics: T_WORK,
    aliases: ["conservation of energy", "speed after sliding down", "speed at the bottom"],
    entries: [
      {
        display: "½mv_f² = ½mv_i² + mgy",
        target: "vf",
        form: "sqrt(vi^2 + 2*g*h)",
        vars: { ...PLAIN, vf: "velocity", vi: "velocity", h: "length" },
      },
    ],
  },

  // ── Momentum and impulse ──────────────────────────────────────────
  {
    id: "mom.p",
    section: MOMENTUM,
    topics: T_MOM,
    aliases: ["momentum of an object", "linear momentum"],
    entries: [
      { display: "p = mv", target: "p", form: "m*v", vars: { ...PLAIN, p: "momentum", m: "mass", v: "velocity" } },
      { display: "v = p/m", target: "v", form: "p/m", vars: { ...PLAIN, v: "velocity", p: "momentum", m: "mass" } },
    ],
  },
  {
    id: "mom.J",
    section: MOMENTUM,
    topics: T_MOM,
    aliases: ["impulse", "impulse-momentum theorem", "how much momentum is delivered"],
    entries: [
      {
        display: "J = Δp = FΔt",
        target: "J",
        form: "F*t",
        vars: { ...PLAIN, J: "momentum", F: "force", t: "time" },
      },
      {
        display: "F = J/Δt",
        target: "F",
        form: "J/t",
        vars: { ...PLAIN, F: "force", J: "momentum", t: "time" },
      },
      {
        display: "Δt = J/F",
        target: "t",
        form: "J/F",
        vars: { ...PLAIN, t: "time", J: "momentum", F: "force" },
      },
    ],
  },
  {
    id: "mom.cons",
    section: MOMENTUM,
    topics: T_MOM,
    aliases: [
      "conservation of momentum",
      "after they collide",
      "speed after the collision",
      "do they stick together",
      "what happens after the collision",
    ],
    entries: [
      {
        display: "m₁v₁ + m₂v₂ = m₁v₁′ + m₂v₂′",
        target: "v1p",
        form: "(m1*v1 + m2*v2 - m2*v2p)/(m1+m2)",
        vars: {
          ...PLAIN,
          v1p: "velocity",
          m1: "mass",
          v1: "velocity",
          m2: "mass",
          v2: "velocity",
          v2p: "velocity",
        },
      },
      {
        display: "m₁v₁ + m₂v₂ = m₁v₁′ + m₂v₂′",
        target: "v2p",
        form: "(m1*v1 + m2*v2 - m1*v1p)/(m1+m2)",
        vars: {
          ...PLAIN,
          v2p: "velocity",
          m1: "mass",
          v1: "velocity",
          m2: "mass",
          v2: "velocity",
          v1p: "velocity",
        },
      },
      {
        display: "v_cm = (m₁v₁ + m₂v₂)/(m₁ + m₂)",
        target: "vcm",
        form: "(m1*v1 + m2*v2)/(m1+m2)",
        vars: { ...PLAIN, vcm: "velocity", m1: "mass", v1: "velocity", m2: "mass", v2: "velocity" },
      },
    ],
  },
  {
    id: "mom.elastic",
    section: MOMENTUM,
    topics: T_MOM,
    aliases: ["elastic collision", "bounce off each other", "coefficient of restitution"],
    entries: [
      {
        display: "½m₁v₁² + ½m₂v₂² = ½m₁v₁′² + ½m₂v₂′²",
        target: "v1p",
        form: "sqrt((m1*v1^2 + m2*v2^2 - m2*v2p^2)/m1)",
        vars: { ...PLAIN, v1p: "velocity", m1: "mass", v1: "velocity", m2: "mass", v2: "velocity", v2p: "velocity" },
      },
      {
        display: "½m₁v₁² + ½m₂v₂² = ½m₁v₁′² + ½m₂v₂′²",
        target: "v2p",
        form: "sqrt((m2*v2^2 + m1*v1^2 - m1*v1p^2)/m2)",
        vars: { ...PLAIN, v2p: "velocity", m1: "mass", v1: "velocity", m2: "mass", v2: "velocity", v1p: "velocity" },
      },
    ],
  },
  {
    id: "mom.explode",
    section: MOMENTUM,
    topics: T_MOM,
    requires: ["explod", "fragment"],
    aliases: ["explodes into two pieces", "fragments with known mass", "one fragment is thrown"],
    entries: [
      {
        display: "v₂ = −(m₁/m₂)v₁′",
        target: "v2p",
        form: "-m1*v1p/m2",
        vars: { ...PLAIN, v2p: "velocity", m1: "mass", v1p: "velocity", m2: "mass" },
      },
    ],
  },

  // ── Oscillations ──────────────────────────────────────────────────
  {
    id: "shm.T",
    section: OSCILLATIONS,
    topics: T_SHM,
    aliases: ["period of a mass on a spring", "how long one oscillation takes", "spring period"],
    entries: [
      {
        display: "T = 2π√(m/k)",
        target: "T",
        form: "2*pi*sqrt(m/k)",
        vars: { ...PLAIN, T: "time", m: "mass", k: "spring-k" },
      },
      {
        display: "f = (1/2π)√(k/m)",
        target: "f",
        form: "0.5*sqrt(k/m)/pi",
        vars: { ...PLAIN, f: "frequency", k: "spring-k", m: "mass" },
      },
      {
        display: "k = 4π²m/T²",
        target: "k",
        form: "4*pi^2*m/T^2",
        vars: { ...PLAIN, k: "spring-k", m: "mass", T: "time" },
      },
    ],
  },
  {
    id: "shm.pendulum",
    section: OSCILLATIONS,
    topics: T_SHM,
    aliases: ["period of a pendulum", "how long a pendulum swings", "simple pendulum period"],
    entries: [
      {
        display: "T = 2π√(L/g)",
        target: "T",
        form: "2*pi*sqrt(L/g)",
        vars: { ...PLAIN, T: "time", L: "length" },
      },
      {
        display: "L = g(T/2π)²",
        target: "L",
        form: "g*(T/(2*pi))^2",
        vars: { ...PLAIN, L: "length", T: "time" },
      },
    ],
  },
  {
    id: "shm.speed",
    section: OSCILLATIONS,
    topics: T_SHM,
    aliases: ["maximum speed in simple harmonic motion", "speed at the equilibrium position", "v_max"],
    entries: [
      {
        display: "v_max = Aω",
        target: "v",
        form: "A*w",
        vars: { ...PLAIN, v: "velocity", A: "length", w: "angular-vel" },
      },
      {
        display: "v = √(ω²(A² − x²))",
        target: "v",
        form: "sqrt(w^2*(A^2 - x^2))",
        vars: { ...PLAIN, v: "velocity", w: "angular-vel", A: "length", x: "length" },
      },
    ],
  },
  {
    id: "shm.ac",
    section: OSCILLATIONS,
    topics: T_SHM,
    aliases: ["maximum acceleration in simple harmonic motion", "a_max"],
    entries: [
      {
        display: "a_max = Aω²",
        target: "a",
        form: "A*w^2",
        vars: { ...PLAIN, a: "acceleration", A: "length", w: "angular-vel" },
      },
    ],
  },

  // ── Gravitation ───────────────────────────────────────────────────
  {
    id: "grav.F",
    section: GRAVITATION,
    topics: T_GRAV,
    celestial: true,
    aliases: ["force of gravity between two masses", "universal gravitation", "newton's law of gravitation"],
    entries: [
      {
        display: "F = Gm₁m₂/r²",
        target: "F",
        form: "G*m1*m2/r^2",
        vars: { ...PLAIN, F: "force", m1: "mass", m2: "mass", r: "length" },
      },
      {
        display: "r = √(Gm₁m₂/F)",
        target: "r",
        form: "sqrt(G*m1*m2/F)",
        vars: { ...PLAIN, r: "length", m1: "mass", m2: "mass", F: "force" },
      },
    ],
  },
  {
    id: "grav.g",
    section: GRAVITATION,
    topics: T_GRAV,
    celestial: true,
    aliases: ["surface gravity of a planet", "gravity at the surface", "g from mass and radius", "weight of a mass on another world"],
    entries: [
      {
        display: "g = GM/R²",
        target: "g",
        form: "G*M/R^2",
        vars: { ...PLAIN, g: "acceleration", M: "mass", R: "length" },
        roles: { M: "central" },
      },
      {
        display: "W = mg",
        target: "W",
        form: "m*g",
        vars: { ...PLAIN, W: "force", m: "mass", g: "acceleration" },
      },
    ],
  },
  {
    id: "grav.orbit",
    section: GRAVITATION,
    topics: T_GRAV,
    celestial: true,
    aliases: ["orbital speed", "speed of a satellite", "how fast a satellite moves", "velocity of an orbiting object"],
    entries: [
      {
        display: "v = √(GM/r)",
        target: "v",
        form: "sqrt(G*M/r)",
        vars: { ...PLAIN, v: "velocity", M: "mass", r: "length" },
        defaults: { M: "M_earth" },
        roles: { M: "central" },
      },
      {
        display: "r = GM/v²",
        target: "r",
        form: "G*M/v^2",
        vars: { ...PLAIN, r: "length", M: "mass", v: "velocity" },
        defaults: { M: "M_earth" },
        roles: { M: "central" },
      },
      {
        display: "v_esc = √(2GM/r)",
        target: "v",
        form: "sqrt(2*G*M/r)",
        vars: { ...PLAIN, v: "velocity", M: "mass", r: "length" },
        defaults: { M: "M_earth" },
        roles: { M: "central" },
      },
      {
        display: "T = 2π√(r³/GM)",
        target: "T",
        form: "2*pi*sqrt(r^3/(G*M))",
        vars: { ...PLAIN, T: "time", r: "length", M: "mass" },
        defaults: { M: "M_earth" },
        roles: { M: "central" },
      },
    ],
  },
  {
    id: "grav.kepler",
    section: GRAVITATION,
    topics: T_GRAV,
    celestial: true,
    aliases: ["kepler's third law", "find the mass of the star", "mass of the central body", "what star is this"],
    entries: [
      {
        display: "M = 4π²a³/(GT²)",
        target: "M",
        form: "4*pi^2*a^3/(G*T^2)",
        vars: { ...PLAIN, M: "mass", a: "length", T: "time" },
      },
      {
        display: "a = (GMT²/4π²)^(1/3)",
        target: "a",
        form: "cbrt(G*M*T^2/(4*pi^2))",
        vars: { ...PLAIN, a: "length", M: "mass", T: "time" },
        defaults: { M: "M_earth" },
        roles: { M: "central" },
      },
      {
        display: "T = 2π√(a³/GM)",
        target: "T",
        form: "2*pi*sqrt(a^3/(G*M))",
        vars: { ...PLAIN, T: "time", a: "length", M: "mass" },
        defaults: { M: "M_earth" },
        roles: { M: "central" },
      },
    ],
  },

  // ── Electrostatics ────────────────────────────────────────────────
  {
    id: "es.F",
    section: ELECTROSTATICS,
    topics: T_ES,
    aliases: ["force between two charges", "coulomb's law", "electric force between two point charges"],
    entries: [
      {
        display: "F = kq₁q₂/r²",
        target: "F",
        form: "kE*q1*q2/r^2",
        vars: { ...PLAIN, F: "force", q1: "charge", q2: "charge", r: "length" },
      },
      {
        display: "r = √(kq₁q₂/F)",
        target: "r",
        form: "sqrt(kE*q1*q2/F)",
        vars: { ...PLAIN, r: "length", q1: "charge", q2: "charge", F: "force" },
      },
    ],
  },
  {
    id: "es.E",
    section: ELECTROSTATICS,
    topics: T_ES,
    aliases: ["electric field of a point charge", "field strength"],
    entries: [
      {
        display: "E = kq/r²",
        target: "E",
        form: "kE*q/r^2",
        vars: { ...PLAIN, E: "field-e", q: "charge", r: "length" },
      },
      {
        display: "F = qE",
        target: "F",
        form: "q*E",
        vars: { ...PLAIN, F: "force", q: "charge", E: "field-e" },
      },
    ],
  },
  {
    id: "es.V",
    section: ELECTROSTATICS,
    topics: T_ES,
    aliases: ["electric potential from a charge", "voltage of a point charge", "potential difference between two points"],
    entries: [
      {
        display: "ΔV = kq/r",
        target: "V",
        form: "kE*q/r",
        vars: { ...PLAIN, V: "voltage", q: "charge", r: "length" },
      },
      {
        display: "E = ΔV/d",
        target: "E",
        form: "V/d",
        vars: { ...PLAIN, E: "field-e", V: "voltage", d: "length" },
      },
    ],
  },

  // ── Capacitors ────────────────────────────────────────────────────
  {
    id: "cap.Q",
    section: CAPACITORS,
    topics: T_CAP,
    aliases: ["charge on a capacitor", "how much charge a capacitor holds"],
    entries: [
      { display: "Q = CΔV", target: "Q", form: "C*V", vars: { ...PLAIN, Q: "charge", C: "capacitance", V: "voltage" } },
      { display: "C = Q/ΔV", target: "C", form: "Q/V", vars: { ...PLAIN, C: "capacitance", Q: "charge", V: "voltage" } },
      { display: "ΔV = Q/C", target: "V", form: "Q/C", vars: { ...PLAIN, V: "voltage", Q: "charge", C: "capacitance" } },
    ],
  },
  {
    id: "cap.U",
    section: CAPACITORS,
    topics: T_CAP,
    aliases: ["energy stored in a capacitor"],
    entries: [
      {
        display: "U_C = ½C(ΔV)²",
        target: "U",
        form: "0.5*C*V^2",
        vars: { ...PLAIN, U: "energy", C: "capacitance", V: "voltage" },
      },
      {
        display: "Q = √(2CU_C)",
        target: "Q",
        form: "sqrt(2*C*U)",
        vars: { ...PLAIN, Q: "charge", C: "capacitance", U: "energy" },
      },
      {
        display: "C = 2U_C/(ΔV)²",
        target: "C",
        form: "2*U/V^2",
        vars: { ...PLAIN, C: "capacitance", U: "energy", V: "voltage" },
      },
    ],
  },
  {
    id: "cap.comb",
    section: CAPACITORS,
    topics: T_CAP,
    aliases: ["capacitors in series", "capacitors in parallel", "equivalent capacitance"],
    entries: [
      {
        display: "C = C₁ + C₂  (parallel)",
        target: "C",
        form: "C1 + C2",
        vars: { ...PLAIN, C: "capacitance", C1: "capacitance", C2: "capacitance" },
      },
      {
        display: "1/C = 1/C₁ + 1/C₂  (series)",
        target: "C",
        form: "1/(1/C1 + 1/C2)",
        vars: { ...PLAIN, C: "capacitance", C1: "capacitance", C2: "capacitance" },
      },
      {
        display: "C = C₁ + C₂ + C₃  (parallel)",
        target: "C",
        form: "C1 + C2 + C3p",
        vars: { ...PLAIN, C: "capacitance", C1: "capacitance", C2: "capacitance", C3p: "capacitance" },
      },
      {
        display: "1/C = 1/C₁ + 1/C₂ + 1/C₃  (series)",
        target: "C",
        form: "1/(1/C1 + 1/C2 + 1/C3p)",
        vars: { ...PLAIN, C: "capacitance", C1: "capacitance", C2: "capacitance", C3p: "capacitance" },
      },
    ],
  },

  // ── Circuits ──────────────────────────────────────────────────────
  {
    id: "cir.current",
    section: CIRCUITS,
    topics: T_CIR,
    aliases: ["current from charge flow", "how much current flows"],
    entries: [
      { display: "I = ΔQ/Δt", target: "I", form: "Q/t", vars: { ...PLAIN, I: "current", Q: "charge", t: "time" } },
      { display: "Q = IΔt", target: "Q", form: "I*t", vars: { ...PLAIN, Q: "charge", I: "current", t: "time" } },
    ],
  },
  {
    id: "cir.ohm",
    section: CIRCUITS,
    topics: T_CIR,
    aliases: ["ohm's law", "current through a resistor", "voltage across a resistor", "resistance"],
    entries: [
      { display: "I = ΔV/R", target: "I", form: "V/R", vars: { ...PLAIN, I: "current", V: "voltage", R: "resistance" } },
      { display: "ΔV = IR", target: "V", form: "I*R", vars: { ...PLAIN, V: "voltage", I: "current", R: "resistance" } },
      { display: "R = ΔV/I", target: "R", form: "V/I", vars: { ...PLAIN, R: "resistance", V: "voltage", I: "current" } },
    ],
  },
  {
    id: "cir.power",
    section: CIRCUITS,
    topics: T_CIR,
    aliases: ["power dissipated in a resistor", "rate of electrical energy use"],
    entries: [
      { display: "P = IV", target: "P", form: "I*V", vars: { ...PLAIN, P: "power", I: "current", V: "voltage" } },
      { display: "P = I²R", target: "P", form: "I^2*R", vars: { ...PLAIN, P: "power", I: "current", R: "resistance" } },
      { display: "P = (ΔV)²/R", target: "P", form: "V^2/R", vars: { ...PLAIN, P: "power", V: "voltage", R: "resistance" } },
      { display: "I = √(P/R)", target: "I", form: "sqrt(P/R)", vars: { ...PLAIN, I: "current", P: "power", R: "resistance" } },
    ],
  },
  {
    id: "cir.comb",
    section: CIRCUITS,
    topics: T_CIR,
    aliases: ["resistors in series", "resistors in parallel", "equivalent resistance"],
    entries: [
      {
        display: "R = R₁ + R₂  (series)",
        target: "R",
        form: "R1 + R2",
        vars: { ...PLAIN, R: "resistance", R1: "resistance", R2: "resistance" },
      },
      {
        display: "R = R₁R₂/(R₁ + R₂)  (parallel)",
        target: "R",
        form: "R1*R2/(R1+R2)",
        vars: { ...PLAIN, R: "resistance", R1: "resistance", R2: "resistance" },
      },
      {
        display: "R = R₁ + R₂ + R₃  (series)",
        target: "R",
        form: "R1 + R2 + R3p",
        vars: { ...PLAIN, R: "resistance", R1: "resistance", R2: "resistance", R3p: "resistance" },
      },
      {
        display: "R = (1/R₁ + 1/R₂ + 1/R₃)⁻¹  (parallel)",
        target: "R",
        form: "1/(1/R1 + 1/R2 + 1/R3p)",
        vars: { ...PLAIN, R: "resistance", R1: "resistance", R2: "resistance", R3p: "resistance" },
      },
    ],
  },
  {
    id: "cir.tau",
    section: CIRCUITS,
    topics: T_CIR,
    aliases: ["rc time constant", "charging curve"],
    entries: [
      {
        display: "τ = RC",
        target: "tau",
        form: "R*C",
        vars: { ...PLAIN, tau: "time", R: "resistance", C: "capacitance" },
      },
    ],
  },

  // ── Magnetism ─────────────────────────────────────────────────────
  {
    id: "mag.F",
    section: MAGNETISM,
    topics: T_MAG,
    aliases: ["magnetic force on a charge", "magnetic force on a current", "force on a wire in a field"],
    entries: [
      {
        display: "F = qv × B",
        target: "F",
        form: "q*v*B",
        vars: { ...PLAIN, F: "force", q: "charge", v: "velocity", B: "field-b" },
        defaults: { q: "E_CHARGE" },
      },
      {
        display: "F = IL × B",
        target: "F",
        form: "I*L*B",
        vars: { ...PLAIN, F: "force", I: "current", L: "length", B: "field-b" },
      },
    ],
  },
  {
    id: "mag.B",
    section: MAGNETISM,
    topics: T_MAG,
    aliases: ["field of a long wire", "field inside a solenoid", "magnetic field of a coil"],
    entries: [
      {
        display: "B = μ₀I/(2πr)",
        target: "B",
        form: "MU0*I/(2*pi*r)",
        vars: { ...PLAIN, B: "field-b", I: "current", r: "length" },
      },
      {
        display: "B = μ₀NI/(2r)  (solenoid)",
        target: "B",
        form: "MU0*N*I/(2*r)",
        vars: { ...PLAIN, B: "field-b", N: "turns", I: "current", r: "length" },
      },
      {
        display: "μ = B/I",
        target: "mu",
        form: "B/I",
        vars: { ...PLAIN, mu: "field-b-rate", B: "field-b", I: "current" },
      },
    ],
  },
  {
    id: "mag.torque",
    section: MAGNETISM,
    topics: T_MAG,
    aliases: ["torque on a current loop", "motor torque"],
    entries: [
      {
        display: "τ = IAB sin θ",
        target: "tau",
        form: "I*A*B",
        vars: { ...PLAIN, tau: "torque", I: "current", A: "area", B: "field-b" },
      },
    ],
  },

  // ── Electromagnetic induction ─────────────────────────────────────
  {
    id: "ind.flux",
    section: INDUCTION,
    topics: T_IND,
    aliases: ["magnetic flux", "flux through a loop"],
    entries: [
      { display: "Φ_B = BA cos θ", target: "phi", form: "B*A", vars: { ...PLAIN, phi: "flux", B: "field-b", A: "area" } },
      { display: "B = Φ_B/A", target: "B", form: "phi/A", vars: { ...PLAIN, B: "field-b", phi: "flux", A: "area" } },
    ],
  },
  {
    id: "ind.emf",
    section: INDUCTION,
    topics: T_IND,
    aliases: ["faraday's law", "induced emf", "motional emf", "induced current"],
    entries: [
      {
        display: "ε = −NΔΦ_B/Δt",
        target: "emf",
        form: "N*phi/t",
        vars: { ...PLAIN, emf: "voltage", N: "turns", phi: "flux", t: "time" },
      },
      {
        display: "ε = BLv",
        target: "emf",
        form: "B*L*v",
        vars: { ...PLAIN, emf: "voltage", B: "field-b", L: "length", v: "velocity" },
      },
      {
        display: "I = ε/R",
        target: "I",
        form: "emf/R",
        vars: { ...PLAIN, I: "current", emf: "voltage", R: "resistance" },
      },
      {
        display: "ε = IR",
        target: "emf",
        form: "I*R",
        vars: { ...PLAIN, emf: "voltage", I: "current", R: "resistance" },
      },
      {
        display: "R = ε/I",
        target: "R",
        form: "emf/I",
        vars: { ...PLAIN, R: "resistance", emf: "voltage", I: "current" },
      },
    ],
  },
  {
    id: "ind.U",
    section: INDUCTION,
    topics: T_IND,
    aliases: ["energy stored in an inductor", "inductance"],
    entries: [
      {
        display: "U_B = ½LI²",
        target: "U",
        form: "0.5*L*I^2",
        vars: { ...PLAIN, U: "energy", L: "inductance", I: "current" },
      },
      {
        display: "L = 2U/I²",
        target: "L",
        form: "2*U/I^2",
        vars: { ...PLAIN, L: "inductance", U: "energy", I: "current" },
      },
      {
        display: "τ = L/R",
        target: "tau",
        form: "L/R",
        vars: { ...PLAIN, tau: "time", L: "inductance", R: "resistance" },
      },
    ],
  },
];

/** Every solvable direction, flattened — what the rescue solver searches. */
export interface FlatEntry {
  equation: SheetEquation;
  entry: SheetEntry;
}

export const FLAT_ENTRIES: FlatEntry[] = EQUATIONS.flatMap((equation) =>
  equation.entries.map((entry) => ({ equation, entry })),
);

/** Section order for the Reference tab, matching the printed sheet. */
export const SHEET_SECTIONS: string[] = [
  KINEMATICS,
  NEWTON,
  WORK,
  MOMENTUM,
  CIRCULAR,
  OSCILLATIONS,
  GRAVITATION,
  ELECTROSTATICS,
  CAPACITORS,
  CIRCUITS,
  MAGNETISM,
  INDUCTION,
];

/** Distinct displays, de-duplicated across directions, for the reference tab. */
export function sheetDisplays(): Array<{ section: string; display: string; vars: Record<string, UnitFamily>; topics: Topic[] }> {
  const seen = new Set<string>();
  const out: Array<{ section: string; display: string; vars: Record<string, UnitFamily>; topics: Topic[] }> = [];
  for (const equation of EQUATIONS) {
    for (const entry of equation.entries) {
      if (seen.has(entry.display)) continue;
      seen.add(entry.display);
      out.push({ section: equation.section, display: entry.display, vars: entry.vars, topics: equation.topics });
    }
  }
  return out;
}
