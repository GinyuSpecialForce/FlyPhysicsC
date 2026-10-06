/**
 * Innate keyword priors — the central complex's "instinct" layer. These add
 * topic logit bias on top of the mushroom bodies' learned output, the way
 * real circuits combine innate and learned pathways. Fragment → additive
 * logit per topic.
 */
import type { Topic } from "./features";

type PriorRule = [fragment: string, topic: Topic, weight: number];

const RULES: PriorRule[] = [
  // kinematics
  ["projectile", "kinematics", 2],
  ["centripetal", "kinematics", 2],
  ["twirl", "kinematics", 2.5],
  ["whirl", "kinematics", 2.5],
  ["sling", "kinematics", 2],
  ["dropped", "kinematics", 1.2],
  ["free fall", "kinematics", 2],
  ["accelerates at", "kinematics", 1.2],
  ["decelerat", "kinematics", 1.5],
  ["final velocity", "kinematics", 0.8],
  ["carousel", "kinematics", 2],
  ["impossible to round", "kinematics", 3],
  ["one type of curve", "kinematics", 3],
  ["circular curve", "kinematics", 2.5],
  ["bicycle", "kinematics", 2],
  ["rock", "kinematics", 1],
  ["round a curve", "kinematics", 1.5],
  ["rounds a curve", "kinematics", 1.5],
  ["round the curve", "kinematics", 1.5],
  ["u-turn", "kinematics", 2],
  ["cycloid", "kinematics", 2.5],
  ["tread", "kinematics", 1.5],
  ["gravitron", "kinematics", 2],
  ["yo-yo", "kinematics", 1.5],
  // newton
  ["tension", "newton", 3],
  ["friction", "newton", 2.2],
  ["incline", "newton", 2.5],
  ["pulley", "newton", 2.5],
  ["normal force", "newton", 2],
  ["coefficient of", "newton", 1.5],
  ["net force", "newton", 2],
  ["centrifugal", "newton", 2.5],
  ["static friction", "newton", 1.5],
  ["μs", "newton", 2],
  ["sliding", "newton", 1],
  ["chute", "newton", 2.5],
  ["withstand", "newton", 2],
  ["equator", "newton", 1.5],
  ["levitate", "newton", 3],
  ["levitation", "newton", 3],
  ["turntable", "newton", 1.5],
  ["platter", "newton", 1.5],
  ["skid-pad", "newton", 1.5],
  // energy
  ["work", "energy", 2.2],
  ["kinetic energy", "energy", 2.5],
  ["energy is stored", "energy", 2.5],
  ["potential energy", "energy", 2.5],
  ["how much energy", "energy", 2],
  // momentum
  ["collision", "momentum", 2.5],
  ["collide", "momentum", 2.5],
  ["sticks", "momentum", 2.5],
  ["momentum", "momentum", 2.5],
  ["impulse", "momentum", 3],
  ["rebound", "momentum", 2.5],
  // rotation
  ["moment of inertia", "rotation", 3.5],
  ["inertia", "rotation", 3],
  ["torque", "rotation", 3],
  ["angular", "rotation", 2.2],
  ["rotat", "rotation", 2.2],
  ["spins", "rotation", 2],
  ["spinning", "rotation", 2],
  ["hoop", "rotation", 3.5],
  ["disk", "rotation", 1.8],
  ["rad/s", "rotation", 2.6],
  ["spins at", "rotation", 2.4],
  ["wrench", "rotation", 2],
  // shm
  ["pendulum", "shm", 3],
  ["oscillat", "shm", 3],
  ["shm", "shm", 3],
  ["amplitude", "shm", 2],
  ["spring constant", "shm", 2],
  ["on a spring", "shm", 2.5],
  ["period", "shm", 1.6],
  ["conical", "shm", 2.5],
  ["space station", "shm", 2],
  ["artificial gravity", "shm", 2.5],
  // gravitation
  ["orbit", "gravitation", 3],
  ["satellite", "gravitation", 3],
  ["gravitational", "gravitation", 2.5],
  ["gravit", "gravitation", 1.8],
  ["planet", "gravitation", 2],
  ["escape velocity", "gravitation", 2],
  ["kepler", "gravitation", 3],
  ["geosynchronous", "gravitation", 3],
  ["geostationary", "gravitation", 3],
  ["semi-major", "gravitation", 2.5],
  ["binary asteroid", "gravitation", 3],
  ["tidal", "gravitation", 3],
  ["altitude", "gravitation", 2],
  ["shuttle", "gravitation", 2],
  ["weight", "gravitation", 1.5],
  ["weightlifter", "gravitation", 2],
  ["mercury", "gravitation", 2],
  ["mars", "gravitation", 2],
  ["pluto", "gravitation", 2],
  ["jupiter", "gravitation", 1.5],
  ["sagittarius", "gravitation", 2.5],
  ["exerts on the other", "gravitation", 2],
  ["spacecraft", "gravitation", 1.5],
  // electrostatics
  ["coulomb", "electrostatics", 3],
  ["electric field", "electrostatics", 3],
  ["point charges", "electrostatics", 2.5],
  ["charge", "electrostatics", 1.8],
  ["triples", "electrostatics", 3],
  ["distance between two", "electrostatics", 2.5],
  ["dipole", "electrostatics", 2.5],
  // capacitors
  ["capacitor", "capacitors", 3.5],
  ["capacitance", "capacitors", 3.5],
  ["dielectric", "capacitors", 3],
  // circuits
  ["resistor", "circuits", 3.5],
  ["battery", "circuits", 2.5],
  ["circuit", "circuits", 3],
  ["current flows", "circuits", 2.5],
  ["ohm", "circuits", 2.5],
  ["series", "circuits", 1.2],
  // magnetism
  ["magnetic", "magnetism", 3.2],
  ["magnet", "magnetism", 2.8],
  ["tesla", "magnetism", 2.5],
  // induction
  ["induc", "induction", 4],
  ["magnet toward", "induction", 4],
  ["faraday", "induction", 3],
  ["lenz", "induction", 3],
  ["flux", "induction", 2.5],
  ["emf", "induction", 3],
  ["coil", "induction", 2],
  ["loop", "induction", 1.2],
];

/**
 * Question-phrase priors — what the problem ASKS FOR is often the strongest
 * routing signal when the scenario nouns are ambiguous or absent. These are
 * deliberately strong: "what is its momentum?" routes to momentum even if
 * the sentence never says the word.
 */
const QUESTION_RULES: PriorRule[] = [
  ["what is its acceleration", "newton", 3.5],
  ["what is the acceleration", "newton", 3.5],
  ["find the acceleration", "newton", 3],
  ["what is its speed", "kinematics", 2],
  ["how fast", "kinematics", 2],
  ["how long does it take", "kinematics", 2],
  ["how far does it travel", "kinematics", 1.5],
  ["what is its kinetic energy", "energy", 3.5],
  ["how much energy", "energy", 2.5],
  ["how much work", "energy", 3],
  ["what is its momentum", "momentum", 4],
  ["what impulse", "momentum", 3.5],
  ["what is its angular", "rotation", 3],
  ["what torque", "rotation", 3],
  ["what is the angular", "rotation", 3],
  ["what is its period", "shm", 3.5],
  ["what is the period", "shm", 3.5],
  ["what is the frequency", "shm", 2.5],
  ["what is its orbital", "gravitation", 3.5],
  ["what is the orbital", "gravitation", 3.5],
  ["escape velocity", "gravitation", 2],
  ["what is the force", "electrostatics", 1.2],
  ["what is the charge", "electrostatics", 2.5],
  ["what is the electric field", "electrostatics", 3.5],
  ["what is the capacitance", "capacitors", 4],
  ["energy stored", "capacitors", 2],
  ["what is the current", "circuits", 4],
  ["what current", "circuits", 4],
  ["power dissipated", "circuits", 3],
  ["what is the magnetic force", "magnetism", 4],
  ["magnetic field", "magnetism", 2],
  ["what emf", "induction", 4],
  ["what is the emf", "induction", 4],
  ["induced current", "induction", 3.5],
  // answer-family hints: what the question asks FOR narrows the circuit
  ["determine the acceleration", "newton", 3],
  ["what is the normal force", "newton", 3],
  ["maximum amount of friction", "newton", 2.5],
  ["minimum radius", "kinematics", 2],
  ["radius at which", "kinematics", 2],
  ["what is the net force", "newton", 3],
  ["how much force", "newton", 2.5],
  ["what force", "newton", 2.5],
  ["equivalent resistance", "circuits", 3],
  ["resistance", "circuits", 2],
  ["voltage", "circuits", 1.5],
  ["charge flows", "circuits", 2],
  ["power dissipated", "circuits", 2],
  ["power", "circuits", 1],
  ["how much power", "energy", 2],
  ["energy", "energy", 1.2],
  ["how high", "kinematics", 2],
  ["acceleration", "kinematics", 1],
];

/** Both rule sets, hoisted so keywordPriors allocates nothing extra per call. */
const RULE_SETS: readonly (readonly PriorRule[])[] = [RULES, QUESTION_RULES];

/**
 * Blend learned topic probabilities with innate priors: multiply by
 * exp(log-prior) (additive in log space), then renormalize. Shared by the
 * brain's classify stage and the training loop, which trains on the
 * residual the priors can't already explain. Plain loops, same operation
 * order as the old map/reduce — bit-identical output.
 */
export function blendPriors(probs: number[], logPriors: number[]): number[] {
  const n = probs.length;
  const biased = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const b = probs[i] * Math.exp(logPriors[i] ?? 0);
    biased[i] = b;
    sum += b;
  }
  if (sum > 0) {
    for (let i = 0; i < n; i++) biased[i] /= sum;
    return biased;
  }
  return probs.slice();
}

/** Additive log-prior per topic index, given the problem text. */
export function keywordPriors(text: string, topics: readonly Topic[]): number[] {
  const t = text.toLowerCase();
  const priors = new Array<number>(topics.length).fill(0);
  // one topic→index map per call instead of an indexOf scan per rule hit
  const index = new Map<Topic, number>();
  for (let i = 0; i < topics.length; i++) index.set(topics[i], i);
  for (const rules of RULE_SETS) {
    for (const [fragment, topic, weight] of rules) {
      if (t.includes(fragment)) {
        const i = index.get(topic);
        if (i !== undefined) priors[i] += weight;
      }
    }
  }
  return priors;
}
