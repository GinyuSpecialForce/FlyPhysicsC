/**
 * Hand-written evaluation bank — problems NOT from the generators, used to
 * measure honest generalization. 4–5 per topic × 12 topics.
 */
import type { Problem } from "./types";
import type { Topic } from "./features";

type Raw = [text: string, choices: [string, string, string, string, string], answer: number, solution: string];

const RAW: Record<Topic, Raw[]> = {
  kinematics: [
    ["A runner accelerates from rest to 9 m/s in 3 s. What is her acceleration?", ["1 m/s²", "3 m/s²", "9 m/s²", "27 m/s²", "6 m/s²"], 1, "a = Δv/Δt = 9/3"],
    ["A car moving at 20 m/s brakes at −4 m/s². How far does it travel before stopping?", ["40 m", "50 m", "80 m", "100 m", "25 m"], 1, "v² = v₀² + 2ax → x = 400/8"],
    ["A stone dropped from a cliff hits the ground at 24.5 m/s. How tall is the cliff?", ["30.6 m", "24.5 m", "61.2 m", "12.3 m", "49 m"], 0, "h = v²/2g = 600.25/19.6"],
    ["A ball is thrown straight up at 15 m/s. How high does it rise?", ["22.9 m", "11.5 m", "45.9 m", "7.5 m", "30.6 m"], 1, "h = v₀²/2g = 225/19.6"],
    ["An object at rest accelerates at 3 m/s² for 4 s. What is its final speed?", ["7 m/s", "12 m/s", "6 m/s", "24 m/s", "3 m/s"], 1, "v = at = 3·4"],
  ],
  newton: [
    ["A 4 kg block on a frictionless table is pushed with 12 N. What is its acceleration?", ["48 m/s²", "3 m/s²", "0.33 m/s²", "16 m/s²", "8 m/s²"], 1, "a = F/m = 12/4"],
    ["A 10 kg crate is pulled with 50 N on a surface with μ = 0.2. What is the acceleration?", ["1 m/s²", "3 m/s²", "5 m/s²", "3.04 m/s²", "7 m/s²"], 3, "a = (50 − 0.2·10·9.8)/10 = 3.04"],
    ["What net force gives a 1500 kg car an acceleration of 2 m/s²?", ["750 N", "3000 N", "1500 N", "7500 N", "6000 N"], 1, "F = ma = 1500·2"],
    ["A 2 kg mass hangs from a rope. What is the tension?", ["9.8 N", "19.6 N", "2 N", "39.2 N", "0 N"], 1, "T = mg = 2·9.8"],
    ["A 5 kg box slides at constant velocity under a 15 N horizontal pull. What is the friction force?", ["0 N", "15 N", "49 N", "3 N", "75 N"], 1, "constant v → f = F = 15 N"],
  ],
  energy: [
    ["How much work does a 20 N force do moving a box 3 m in the direction of the force?", ["6.7 J", "60 J", "23 J", "10 J", "17 J"], 1, "W = Fd = 20·3"],
    ["A 0.5 kg ball moves at 8 m/s. What is its kinetic energy?", ["4 J", "16 J", "32 J", "2 J", "20 J"], 1, "K = ½mv² = 0.5·0.5·64"],
    ["A spring with k = 300 N/m is stretched 0.2 m. How much energy is stored?", ["12 J", "6 J", "60 J", "3 J", "30 J"], 1, "U = ½kx² = 0.5·300·0.04"],
    ["A 2 kg book is lifted 1.5 m at constant speed. How much work was done on it by the lifting force?", ["3 J", "29.4 J", "13.2 J", "20 J", "44.1 J"], 1, "W = mgh = 2·9.8·1.5"],
    ["A 1000 kg car travels at 20 m/s. What is its kinetic energy?", ["20000 J", "400000 J", "200000 J", "100000 J", "10000 J"], 2, "K = ½·1000·20² = 200000 J"],
  ],
  momentum: [
    ["A 3 kg ball at 4 m/s strikes a wall and rebounds at 2 m/s. What is the magnitude of its change in momentum?", ["6 kg·m/s", "18 kg·m/s", "12 kg·m/s", "2 kg·m/s", "10 kg·m/s"], 1, "Δp = m·Δv = 3·(4−(−2)) = 18"],
    ["A 2 kg cart at 3 m/s sticks to a 4 kg cart at rest. What is their common velocity?", ["1 m/s", "2 m/s", "1.5 m/s", "3 m/s", "0.67 m/s"], 0, "vf = 6/6"],
    ["A 0.15 kg baseball approaches a bat at 40 m/s and leaves at 50 m/s. What is the impulse delivered to it?", ["1.5 kg·m/s", "13.5 kg·m/s", "7.5 kg·m/s", "3 kg·m/s", "6 kg·m/s"], 1, "J = mΔv = 0.15·90"],
    ["A 60 kg skater at 2 m/s collides and holds onto a 40 kg skater at rest. Their speed is:", ["2 m/s", "1.2 m/s", "1 m/s", "0.8 m/s", "1.6 m/s"], 1, "vf = 120/100"],
    ["A 1000 kg car at 10 m/s has what momentum?", ["100 kg·m/s", "10000 kg·m/s", "1000 kg·m/s", "100000 kg·m/s", "10 kg·m/s"], 1, "p = mv = 10000"],
  ],
  rotation: [
    ["A uniform disk (M = 4 kg, R = 0.5 m) has what moment of inertia?", ["0.5 kg·m²", "1 kg·m²", "2 kg·m²", "4 kg·m²", "0.25 kg·m²"], 0, "I = ½MR² = 0.5·4·0.25"],
    ["A torque of 6 N·m acts on a wheel with I = 3 kg·m². What is α?", ["18 rad/s²", "2 rad/s²", "0.5 rad/s²", "9 rad/s²", "6 rad/s²"], 1, "α = τ/I = 2"],
    ["A hoop (M = 2 kg, R = 0.5 m) spins at 4 rad/s. What is its kinetic energy?", ["2 J", "4 J", "8 J", "16 J", "1 J"], 1, "K = ½MR²ω² = ½·2·0.25·16 = 4 J"],
    ["A force of 10 N acts perpendicular to a 0.3 m wrench. What is the torque?", ["3 N·m", "30 N·m", "33 N·m", "0.03 N·m", "300 N·m"], 0, "τ = rF = 3"],
    ["A disk (I = 2 kg·m²) spinning at 5 rad/s is brought to rest in 4 s. What torque stopped it?", ["10 N·m", "2.5 N·m", "40 N·m", "8 N·m", "0.4 N·m"], 1, "τ = I·Δω/Δt = 2·5/4"],
  ],
  shm: [
    ["A 0.5 kg mass on a k = 200 N/m spring oscillates. What is the period?", ["0.314 s", "0.1 s", "1 s", "0.628 s", "3.14 s"], 0, "T = 2π√(0.5/200)"],
    ["A pendulum of length 0.98 m has what period on Earth?", ["6.28 s", "1.99 s", "0.5 s", "3.14 s", "2.5 s"], 1, "T = 2π√(0.98/9.8) ≈ 1.99 s"],
    ["A mass–spring system has period 2 s. What is its frequency?", ["0.5 Hz", "2 Hz", "6.28 Hz", "4 Hz", "1 Hz"], 0, "f = 1/T"],
    ["A 2 kg mass on a spring with k = 32 N/m oscillates. What is the period?", ["3.14 s", "1.57 s", "6.28 s", "0.5 s", "2 s"], 1, "T = 2π√(2/32) = π/2 ≈ 1.57 s"],
    ["Where is the speed of a mass on a spring greatest?", ["At maximum displacement", "At equilibrium", "Halfway between", "Never zero", "Depends on mass"], 1, "max speed at equilibrium"],
  ],
  gravitation: [
    ["What is the gravitational force between two 1000 kg masses 2 m apart?", ["3.34×10⁻⁵ N", "1.67×10⁻⁵ N", "6.67×10⁻⁵ N", "1.67×10⁻⁴ N", "3.34×10⁻⁶ N"], 1, "F = G·1000²/2² = 1.67×10⁻⁵ N"],
    ["A satellite orbits at r = 2R⊕ from Earth's center. Its orbital speed compared to a surface orbit (v₀) is:", ["v₀/2", "v₀/√2", "v₀", "2v₀", "v₀·√2"], 1, "v ∝ 1/√r"],
    ["If Earth's radius were halved (same mass), surface gravity would be:", ["2g", "4g", "g/2", "g/4", "unchanged"], 1, "g ∝ 1/r² → ×4"],
    ["At what distance from Earth's center does g drop to one-quarter its surface value?", ["2R⊕", "4R⊕", "R⊕/2", "√2·R⊕", "16R⊕"], 0, "r ∝ 1/√(g) → 2R⊕"],
    ["A planet has 2× Earth's mass and 2× Earth's radius. Its surface gravity is:", ["4g⊕", "g⊕/2", "2g⊕", "g⊕", "g⊕/4"], 1, "g ∝ M/r² = 2/4"],
  ],
  electrostatics: [
    ["Two +2 μC charges sit 0.1 m apart. What is the repulsive force?", ["3.6 N", "1.8 N", "7.2 N", "0.36 N", "36 N"], 0, "F = kq²/r² = 8.99e9·4e-12/0.01"],
    ["What is the electric field 0.3 m from a 6 μC point charge?", ["600000 N/C", "60000 N/C", "180000 N/C", "6000 N/C", "6000000 N/C"], 0, "E = kq/r² ≈ 6e5"],
    ["A charge of −3 μC is placed in an E field of 500 N/C. What force does it feel?", ["0.0015 N opposite the field", "0.0015 N along the field", "0.00015 N opposite the field", "1.5 N opposite the field", "0.0015 N perpendicular to the field"], 0, "F = qE, negative charge → opposite E"],
    ["Two charges, +4 μC and −1 μC, are 0.2 m apart. Are they attracted or repelled, and what force magnitude?", ["Attracted, 0.9 N", "Repelled, 0.9 N", "Attracted, 1.8 N", "Repelled, 1.8 N", "Attracted, 0.45 N"], 0, "opposite signs attract; F = k·4e-12/0.04 ≈ 0.899 N"],
    ["If the distance between two charges triples, the force becomes:", ["1/3 of original", "1/6 of original", "1/9 of original", "3× original", "9× original"], 2, "F ∝ 1/r²"],
  ],
  capacitors: [
    ["A 10 μF capacitor is charged to 12 V. What charge does it hold?", ["120 μC", "1.2 μC", "0.83 μC", "1200 μC", "12 μC"], 0, "Q = CV = 120 μC"],
    ["A 4 μF capacitor stores 0.02 J. What is the voltage across it?", ["50 V", "100 V", "10 V", "25 V", "200 V"], 1, "V = √(2U/C) = √(0.04/4e-6) = 100 V"],
    ["Two 6 μF capacitors in parallel have equivalent capacitance:", ["3 μF", "12 μF", "6 μF", "36 μF", "1.5 μF"], 1, "parallel: C adds"],
    ["Two 6 μF capacitors in series have equivalent capacitance:", ["12 μF", "3 μF", "6 μF", "36 μF", "2 μF"], 1, "series: 1/C adds → 3 μF"],
    ["A 20 μF capacitor at 10 V stores what energy?", ["0.001 J", "0.01 J", "0.1 J", "1 J", "0.2 J"], 0, "U = ½CV² = 0.001 J"],
  ],
  circuits: [
    ["A 12 V battery drives a 4 Ω resistor. What current flows?", ["48 A", "3 A", "0.33 A", "8 A", "16 A"], 1, "I = V/R = 3 A"],
    ["Two 6 Ω resistors in parallel across a 12 V battery draw what total current?", ["2 A", "4 A", "1 A", "6 A", "0.5 A"], 1, "R_eq = 3 Ω → I = 4 A"],
    ["A 6 Ω and 3 Ω resistor in series across 9 V: what is the current?", ["1 A", "3 A", "2 A", "0.5 A", "4.5 A"], 0, "I = 9/9"],
    ["A 3 A current flows through a 5 Ω resistor. What is the voltage drop?", ["1.67 V", "15 V", "0.6 V", "8 V", "1.5 V"], 1, "V = IR = 15 V"],
    ["Which dissipates more power: a resistor carrying 2 A across 10 Ω, or 4 A across 5 Ω?", ["The 2 A one", "The 4 A one", "Equal", "Cannot tell", "Neither dissipates power"], 1, "P = I²R: 40 W vs 80 W"],
  ],
  magnetism: [
    ["A proton moves at 2×10⁶ m/s perpendicular to a 0.5 T field. What force does it feel?", ["8×10⁻¹⁴ N", "1.6×10⁻¹³ N", "4×10⁻¹⁴ N", "3.2×10⁻¹³ N", "8×10⁻¹³ N"], 1, "F = qvB = 1.6e-19·2e6·0.5"],
    ["A 2 A current flows through 0.5 m of wire perpendicular to a 0.4 T field. What is the force?", ["0.2 N", "0.4 N", "0.8 N", "1.6 N", "0.1 N"], 1, "F = BIL = 0.4·2·0.5"],
    ["The force on a charge moving parallel to a magnetic field is:", ["qvB", "0", "qvB/2", "2qvB", "qE"], 1, "sin θ = 0"],
    ["A proton and an electron move at the same speed perpendicular to the same B field. The proton's circular path radius is:", ["Smaller", "Larger", "Equal", "Zero", "Depends on charge sign only"], 1, "r = mv/qB: proton has much larger m"],
    ["A 0.3 m wire carries 5 A in a 2 T field at 30° to the field. What is the force?", ["3 N", "1.5 N", "0.75 N", "6 N", "2.6 N"], 1, "F = BIL sin30° = 1.5 N"],
  ],
  induction: [
    ["A 0.2 m² loop in a field changing at 3 T/s has what induced emf?", ["0.6 V", "0.15 V", "1.5 V", "6 V", "0.067 V"], 0, "ε = A·dB/dt = 0.6 V"],
    ["A 100-turn coil of area 0.01 m² sees its field drop from 0.5 T to 0 in 0.25 s. What is the induced emf?", ["2 V", "0.5 V", "20 V", "0.02 V", "5 V"], 0, "ε = N·A·ΔB/Δt = 100·0.01·2"],
    ["Pushing a magnet toward a loop induces a current whose magnetic field:", ["Aids the change", "Opposes the change", "Is zero", "Is perpendicular to the loop", "Depends on resistance"], 1, "Lenz's law"],
    ["A loop's area shrinks from 0.5 m² to 0.25 m² in 0.5 s in a constant 2 T field. What is the emf?", ["0.25 V", "0.5 V", "1 V", "2 V", "0.125 V"], 2, "ε = B·ΔA/Δt = 2·0.25/0.5 = 1 V"],
    ["Flux through a loop is 4 Wb and drops to zero in 2 s. What is the emf in a single turn?", ["8 V", "2 V", "0.5 V", "4 V", "16 V"], 1, "ε = ΔΦ/Δt = 2 V"],
  ],
};

export const EVAL_BANK: Problem[] = Object.entries(RAW).flatMap(([topic, list]) =>
  list.map(([text, choices, answer, solution], i) => ({
    id: `eval-${topic}-${i}`,
    topic: topic as Topic,
    text,
    choices: choices.map((c) => ({ text: c })),
    answer,
    solution,
    origin: "eval" as const,
  })),
);
