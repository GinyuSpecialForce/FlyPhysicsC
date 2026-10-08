import { describe, it, expect } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain } from "../src/core/brain";
import type { ThoughtRecord } from "../src/core/types";
import { parseChoiceNumber } from "../src/core/format";

/**
 * Regression bank for the circular-motion / universal-gravitation unit:
 * the full homework set (uniform circular motion, centripetal vs centrifugal,
 * parametric & cycloid motion, nonuniform circular motion, universal
 * gravitation, gravitational field strength, orbits, Kepler's 3rd law).
 * Numeric answers are pinned to the course solution key within 1% (the key
 * rounds to 2-3 sig figs); concept answers are pinned to their phrase.
 */
describe("circular motion & universal gravitation unit", () => {
  const { network } = trainNetwork(1337, 6);
  const brain = new FlyBrain(network);

  const val = (rec: ThoughtRecord): number => parseChoiceNumber(rec.computedAnswer ?? "");

  /** actual = expected within a relative tolerance (the key rounds hard). */
  function near(rec: ThoughtRecord, expected: number, unit: string, rel = 0.01): void {
    const a = val(rec);
    expect(Number.isFinite(a), `${rec.computedAnswer} should be a finite number`).toBe(true);
    expect(Math.abs(a - expected), `${rec.computedAnswer} ≈ ${expected}`).toBeLessThanOrEqual(
      Math.abs(expected) * rel,
    );
    expect(rec.computedAnswer).toContain(unit);
  }

  it("solves uniform circular motion problems (1–9)", () => {
    const sling =
      "David puts a 0.85 kg rock in his sling and twirls it at 3.0 Hz. The rock moves in a circle with radius 35.0 cm. Ignoring the effect of gravity determine: ";
    near(brain.solveFreeform(sling + "(a) the acceleration of the rock"), (2 * Math.PI * 3) ** 2 * 0.35, "m/s²");
    near(brain.solveFreeform(sling + "(b) the tension in the sling"), 0.85 * (2 * Math.PI * 3) ** 2 * 0.35, "N");
    near(brain.solveFreeform(sling + "(c) the speed of the rock when it is released"), 2 * Math.PI * 3 * 0.35, "m/s");

    const washer =
      'A 5.0 g coin falls out of the pocket of a pair of jeans in a washer during the spin cycle. The cylinder of the washer is rotating at 250 rpm and has diameter 60.0 cm. The coin "sticks" to the vertical side of the cylinder. ';
    const w = (250 * 2 * Math.PI) / 60;
    near(brain.solveFreeform(washer + "(a) Find the speed of the coin."), w * 0.3, "m/s"); // 7.9
    near(brain.solveFreeform(washer + "(b) Find the acceleration of the coin."), w * w * 0.3, "m/s²"); // 210
    near(brain.solveFreeform(washer + "(c) Find the normal force acting on the coin."), 0.005 * w * w * 0.3, "N"); // 1.0
    near(
      brain.solveFreeform(
        washer + "(d) What is the minimum value of μs (such that the coin is not sliding down the vertical surface)?",
      ),
      9.8 / (w * w * 0.3),
      "μs",
    ); // 0.048

    expect(
      brain.solveFreeform(
        "A small block is placed on top of a rotating horizontal platter at a distance r from the center. The coefficient of static friction is μs. Derive an expression for the greatest frequency at which the platter can revolve without the block sliding off.",
      ).computedAnswer,
    ).toBe("f = (1/2π)·√(μs·g/r)");

    const curve =
      "A car is traveling on a highway at 20.0 m/s and encounters a curve in the road during which the direction of the car's velocity changes by 90.0° in 30.0 s. ";
    near(
      brain.solveFreeform(curve + "(a) Find the car's centripetal acceleration."),
      (20 * (Math.PI / 2)) / 30,
      "m/s²",
    ); // 1.05
    expect(
      brain.solveFreeform(
        curve +
          "(b) Derive an expression that gives centripetal acceleration in terms of the three variables in this problem: v, θ, and t.",
      ).computedAnswer,
    ).toBe("a = v·θ/t");

    const conical =
      "A mass dangling from the end of a string can be set into motion such that the mass moves in a horizontal circle as shown in the diagram. The string traces out an imaginary cone; this arrangement is called a conical pendulum. ";
    expect(
      brain.solveFreeform(
        conical +
          "(a) Use an analysis of the forces acting on the mass in order to show that the acceleration is given by: a = g(r/h), where h is the height of the cone.",
      ).computedAnswer,
    ).toBe("a = g·(r/h)");
    expect(
      brain.solveFreeform(conical + "(b) Derive and simplify an expression for the period of the motion.")
        .computedAnswer,
    ).toBe("T = 2π√(h/g)");

    const skid =
      "A certain 2130 kg car has a skid-pad rating of 0.85 g. Analyze this car turning on level pavement: ";
    near(
      brain.solveFreeform(skid + "(a) What is the maximum amount of friction acting in a centripetal direction?"),
      2130 * 0.85 * 9.8,
      "N",
    ); // 18 kN
    near(
      brain.solveFreeform(
        skid + "(b) What is the maximum speed this car can go around a circle with radius 50.0 m?",
      ),
      Math.sqrt(0.85 * 9.8 * 50),
      "m/s",
    ); // 20
    near(
      brain.solveFreeform(
        skid +
          "(c) What is the minimum amount of time it can make a U-turn and reverse directions when traveling at a speed of 10.0 m/s?",
      ),
      (Math.PI * 10) / (0.85 * 9.8),
      "s",
    ); // 3.8

    const race =
      "A race car of mass 1900 kg has a wing (i.e. spoiler) that generates downward force on the car equal to 15 kN when traveling at 75 m/s. ";
    near(
      brain.solveFreeform(
        race +
          "(a) Using μs = 0.90, determine the minimum radius turn around which this car can travel (on level pavement) at this speed.",
      ),
      (1900 * 75 * 75) / (1900 * 0.9 * 9.8 + 0.9 * 15000),
      "m",
    ); // 350
    near(
      brain.solveFreeform(race + "(b) Using μs = 0.90, suppose the wing is removed — find the minimum radius turn."),
      (1900 * 75 * 75) / (1900 * 0.9 * 9.8),
      "m",
    ); // 640

    const gravitron =
      "A popular amusement park ride is the Gravitron in which riders are enclosed in a cylinder that spins at 24 rpm. According to Wikipedia the riders experience 4.0 g's. ";
    const gw = (24 * 2 * Math.PI) / 60;
    near(
      brain.solveFreeform(gravitron + "(a) Determine the radius at which the riders are positioned."),
      (4 * 9.8) / (gw * gw),
      "m",
    ); // 6.2
    near(brain.solveFreeform(gravitron + "(b) Find the speed of the riders."), (4 * 9.8) / gw, "m/s"); // 16

    const carousel =
      "A kid gets on a carousel and sets a 250 g ball on the floor of the carousel. The ball is 3.0 m from the center and the carousel's period is 8.0 s. After the ride begins the kid releases the ball and sees it roll away from the center of the carousel. ";
    expect(
      brain.solveFreeform(carousel + "(a) Explain why the ball does this.").computedAnswer,
    ).toBe("nothing pulls it inward; inertia carries it straight (no centripetal force)");
    const cw = (2 * Math.PI) / 8;
    near(
      brain.solveFreeform(carousel + "(b) Ignoring friction, what is the acceleration of the ball relative to the boy."),
      cw * cw * 3,
      "m/s²",
    ); // 1.9
    near(
      brain.solveFreeform(
        carousel + "(c) What centripetal force would the boy have to exert to prevent the ball from rolling away?",
      ),
      0.25 * cw * cw * 3,
      "N",
    ); // 0.46

    const equator =
      "The Earth's surface is technically not an inertial frame of reference – the surface accelerates due to the Earth's rotation. ";
    const wEq = (2 * Math.PI) / 86400;
    near(
      brain.solveFreeform(equator + "(a) Determine the acceleration of the surface of the Earth along the equator."),
      wEq * wEq * 6.37e6,
      "m/s²",
    ); // 0.034
    near(
      brain.solveFreeform(
        equator +
          '(b) Because of this noninertial reference frame there appears to be a slight outward or centrifugal force acting on objects along the equator. Calculate the "centrifugal force" acting on a person of mass 80.0 kg standing on the equator.',
      ),
      80 * wEq * wEq * 6.37e6,
      "N",
    ); // 2.7
    near(
      brain.solveFreeform(
        equator +
          "(c) If the Earth rotated faster and the day were shorter this effect would be greater – at what length of day would a person at the equator levitate due to centrifugal force?",
      ),
      2 * Math.PI * Math.sqrt(6.37e6 / 9.8),
      "s",
    ); // 1.4 h
    expect(
      brain.solveFreeform(
        equator +
          "(d) Physicists sometimes refer to centrifugal force as a fictitious force – explain what is going on in this problem in terms of an inertial frame of reference and by referring to real forces and the property of inertia.",
      ).computedAnswer,
    ).toContain("only gravity and the normal force are real");

    const station =
      "A popular idea for future space exploration is to rotate a space station or spacecraft in order to create artificial gravity. Imagine a space station in the form of a giant wheel with diameter d. ";
    expect(
      brain.solveFreeform(
        station +
          "(a) Derive an expression that gives the required period of rotation to produce artificial gravity equivalent to earth's g.",
      ).computedAnswer,
    ).toBe("T = 2π√(r/g) = 2π√(d/2g)");
    near(
      brain.solveFreeform(
        station +
          "(b) It is thought that revolution rates greater than 2.0 rpm would cause astronauts to become dizzy – what is the minimum diameter for the space station to avoid this?",
      ),
      (2 * 9.8) / ((2 * 2 * Math.PI) / 60) ** 2,
      "m",
    ); // 450

    const param =
      "An object moves in a circle such that its position in meters is given by the following parametric equations: x(t) = 2cos(3t), y(t) = 2sin(3t), where t is in seconds. At t = 2.00 s find: ";
    near(brain.solveFreeform(param + "(a) Find the position of the object."), 2, "m", 0.02);
    near(brain.solveFreeform(param + "(b) Find the velocity of the object."), 6, "m/s", 0.02);
    near(brain.solveFreeform(param + "(c) Find the acceleration of the object."), 18, "m/s²", 0.02);
    near(brain.solveFreeform(param + "(d) Find the period of the motion."), (2 * Math.PI) / 3, "s");

    const bike =
      "A bicycle rolls with constant speed 6.00 m/s along a level roadway. A rock is caught in the tread of one of its tires. The tire has a radius of 33.0 cm and rotates in a counterclockwise direction. Let t = 0, x = 0, y = 0 be the point when the rock touches the pavement. ";
    expect(
      brain.solveFreeform(
        bike +
          "(a) Determine a set of parametric equations x(t) and y(t) that describe the motion of the rock relative to the earth.",
      ).computedAnswer,
    ).toBe("x = vt − r·sin(vt/r), y = r(1 − cos(vt/r))");
    near(brain.solveFreeform(bike + "(b) Find the maximum speed of the rock."), 12, "m/s", 0.02);
    near(
      brain.solveFreeform(bike + "(b) Find the point in time at which the maximum speed occurs."),
      (Math.PI * 0.33) / 6,
      "s",
    ); // 0.173

    const yoyo =
      "A kid plays with a yo-yo of mass 125 g and twirls it in a vertical circle. The length of the string is 90.0 cm. The kid twirls it just fast enough to keep it moving in a complete circle – this results in a centripetal acceleration of 5.00 g at the lowest point. ";
    near(brain.solveFreeform(yoyo + "(a) Find the speed of the yo-yo at the highest point."), 2.97, "m/s");
    near(brain.solveFreeform(yoyo + "(b) Find the speed at the lowest point."), 6.64, "m/s");
    expect(brain.solveFreeform(yoyo + "(c) Find the tension in the string at the highest point.").computedAnswer).toBe(
      "0 N",
    ); // the string goes slack at the top
    near(
      brain.solveFreeform(yoyo + "(c) Find the tension in the string at the lowest point."),
      0.125 * (5 * 9.8 + 9.8),
      "N",
    ); // 7.35

    const turntable =
      "A small block sits at rest upon the horizontal surface of a stationary turntable. The turntable starts rotating and the block does not slide initially. The block has a constant tangential acceleration, a, as it moves in a circular path and the rotation rate of the turntable increases. Static friction prevents the block from sliding - but only up to a certain point. ";
    expect(
      brain.solveFreeform(
        turntable + "(a) Sketch the direction of static friction at several points along the block's path.",
      ).computedAnswer,
    ).toBe("tangent at first, then increasingly radial");
    expect(
      brain.solveFreeform(
        turntable +
          "(b) Show that the direction of static friction changes by 90° in the same time that the turntable rotates θ = 37.4° from rest.",
      ).computedAnswer,
    ).toContain("37.4°");
    expect(
      brain.solveFreeform(
        turntable +
          "(c) Derive an expression in terms of a and the static coefficient of friction μs for the maximum angle θ that the turntable can rotate before the block slides.",
      ).computedAnswer,
    ).toBe("θ_max = ½·√((μs·g/a)² − 1)");

    const slow =
      "The speed of a car decreases uniformly from 30.0 m/s to 20.0 m/s as it rounds a curve of radius 150.0 m. The direction of the car's motion is changed from west to south as it rounds the curve. ";
    near(
      brain.solveFreeform(slow + "(a) Determine the time for the car to round the curve."),
      (150 * (Math.PI / 2)) / 25,
      "s",
    ); // 9.42
    near(
      brain.solveFreeform(slow + "(b) Determine the acceleration of the car at a point halfway through the curve."),
      Math.sqrt(((900 + 400) / 2 / 150) ** 2 + (10 / ((150 * (Math.PI / 2)) / 25)) ** 2),
      "m/s²",
    ); // 4.46

    // concepts (a)–(c) of problem 1 and the centripetal/centrifugal distinction
    expect(
      brain.solveFreeform(
        "(a) Explain why it is impossible to round a curve in your car without accelerating.",
      ).computedAnswer,
    ).toBe("direction changes → velocity changes");
    expect(
      brain.solveFreeform(
        "(b) There is only one type of curve that involves constant acceleration – what is it and can a car perform such a curve?",
      ).computedAnswer,
    ).toBe("parabola, not a circle");
    expect(
      brain.solveFreeform("(c) Explain why any circular curve will not be constant acceleration.").computedAnswer,
    ).toBe("a changes direction");
    expect(
      brain.solveFreeform("Distinguish, explain, and apply the concepts of centripetal and centrifugal force.")
        .computedAnswer,
    ).toContain("centrifugal is fictitious");
  });

  it("solves universal gravitation, orbits, and Kepler problems (18–35)", () => {
    const bowling =
      "Two bowling balls – one 5.0 kg and the other 6.0 kg sit on a rack. The centers of the two balls are 60.0 cm apart. ";
    near(
      brain.solveFreeform(bowling + "(a) Find the force that one exerts on the other."),
      (6.67e-11 * 5 * 6) / 0.6 ** 2,
      "N",
    ); // 5.6 nN
    near(brain.solveFreeform(bowling + "(b) At what separation would this force be quadrupled?"), 0.3, "m", 0.02);

    const pluto =
      "A weightlifter is able to bench press a weight of 900 N on earth. ";
    near(
      brain.solveFreeform(pluto + "(a) What mass would have the same weight on Pluto?"),
      900 / ((6.67e-11 * 1.303e22) / 1.1883e6 ** 2),
      "kg",
    ); // 1470
    expect(
      brain.solveFreeform(
        pluto +
          "(b) Would the weightlifter be able to bench press this mass on Pluto just like he did the object with equal weight on Earth? Explain.",
      ).computedAnswer,
    ).toContain("No");

    const l1 =
      "A spacecraft coasting from Earth to the Moon will lose speed up until a certain point and then gain speed as it nears the Moon. ";
    near(
      brain.solveFreeform(l1 + "(a) Find the acceleration at a point halfway between Earth and Moon."),
      (6.67e-11 * (5.97e24 - 7.342e22)) / (3.844e8 / 2) ** 2,
      "m/s²",
    ); // 0.0107
    near(
      brain.solveFreeform(l1 + "(b) Find the point at which the spacecraft stops losing speed and starts gaining speed."),
      (3.844e8 * Math.sqrt(5.97e24 / 7.342e22)) / (1 + Math.sqrt(5.97e24 / 7.342e22)),
      "m",
    ); // 346 Mm

    const moonsun =
      "As the Moon orbits the Earth it reaches a point directly between the Earth and the Sun. ";
    near(
      brain.solveFreeform(moonsun + "(a) Determine the net force of gravity on the Moon at this point (coming from Earth and Sun)."),
      7.342e22 *
        Math.abs((6.67e-11 * 1.989e30) / (1.496e11 - 3.844e8) ** 2 - (6.67e-11 * 5.97e24) / 3.844e8 ** 2),
      "N",
    ); // 2.4e20
    expect(
      brain.solveFreeform(
        moonsun + "(b) In light of the result, explain how it is possible for the Moon to continue orbiting the Earth.",
      ).computedAnswer,
    ).toContain("nearly uniform");

    const probe =
      "In 1995, the Galileo robotic spacecraft released a probe into Jupiter's atmosphere. When traveling at 830 m/s the 300 kg-probe's main chute deployed and slowed it to 40 m/s in 8.0 seconds. ";
    near(
      brain.solveFreeform(probe + "(a) Find the force of Jupiter's gravity acting on the probe."),
      300 * ((6.67e-11 * 1.898e27) / 7.1492e7 ** 2),
      "N",
    ); // 7400
    near(
      brain.solveFreeform(probe + "(b) Determine the force that the cords of the chute had to withstand."),
      300 * ((6.67e-11 * 1.898e27) / 7.1492e7 ** 2 + (830 - 40) / 8),
      "N",
    ); // 37 kN

    near(
      brain.solveFreeform("(a) Calculate g for the surface of Mercury."),
      (6.67e-11 * 3.301e23) / 2.4397e6 ** 2,
      "m/s²",
    ); // 3.70
    near(
      brain.solveFreeform("(b) Calculate g for the surface of Mars."),
      (6.67e-11 * 6.417e23) / 3.3895e6 ** 2,
      "m/s²",
    ); // 3.72
    expect(
      brain.solveFreeform(
        "(c) Explain in words how these values can be so close to one another although Mars is much larger than Mercury.",
      ).computedAnswer,
    ).toContain("g = GM/R²");

    const worlds =
      "Find the value of the gravitational field at the surface of the following hypothetical worlds as a multiple of Earth's gravitational field: ";
    expect(
      brain.solveFreeform(worlds + "(a) Planet Q: twice Earth's mass, twice Earth's diameter").computedAnswer,
    ).toBe("g⊕/2");
    expect(
      brain.solveFreeform(worlds + "(b) Planet X: half Earth's mass, half Earth's diameter").computedAnswer,
    ).toBe("2g");
    expect(
      brain.solveFreeform(worlds + "(c) Planet S: one tenth Earth's density, ten times Earth's diameter")
        .computedAnswer,
    ).toBe("g⊕");
    expect(
      brain.solveFreeform(worlds + "(d) Planet M: one tenth Earth's mass, one half Earth's diameter").computedAnswer,
    ).toBe("0.4g⊕");
    expect(
      brain.solveFreeform(worlds + "(e) Moon L: one hundredth Earth's mass, one fourth Earth's diameter")
        .computedAnswer,
    ).toBe("0.16g⊕");

    const alt = (g: number): number => Math.sqrt((6.67e-11 * 5.97e24) / g) - 6.37e6;
    near(brain.solveFreeform("(a) At what altitude above Earth is g = 4.90 m/s²?"), alt(4.9), "m");
    near(brain.solveFreeform("(b) At what altitude is g = 2.45 m/s²?"), alt(2.45), "m");
    near(brain.solveFreeform("(c) At what altitude is g = 9.78 m/s²?"), alt(9.78), "m", 0.5); // "significantly different" — a few km

    expect(
      brain.solveFreeform(
        "It can be shown that the value of g inside an empty spherical shell is zero at all points inside the shell. Suppose the Earth had uniform density. (a) Use these two ideas to solve for g inside the Earth.",
      ).computedAnswer,
    ).toContain("g = g⊕·(r/R⊕)");

    const tidal =
      "Tidal force is related to the difference in g across a given body. For example, suppose the Moon is located above the Indian Ocean. The value of Moon's gravitational field will be stronger in the Indian Ocean than on the opposite side of the Earth in the Pacific Ocean. ";
    const dG =
      6.67e-11 * 7.342e22 * (1 / (3.844e8 - 6.37e6) ** 2 - 1 / (3.844e8 + 6.37e6) ** 2);
    near(
      brain.solveFreeform(
        tidal + "(a) Determine the difference in Moon's g for these two locations using appropriate info about the two bodies.",
      ),
      dG,
      "m/s²",
    ); // 2.21e-6
    near(
      brain.solveFreeform(
        tidal +
          "(b) This difference would be the acceleration of one ocean relative to the other (ignoring other forces). Estimate how much the surfaces would move apart in one hour's time assuming constant acceleration from rest.",
      ),
      0.5 * dG * 3600 ** 2,
      "m",
      0.05,
    ); // 14

    const shuttle = "The space shuttle typically orbited Earth at altitude 300 km. ";
    const rShuttle = 6.37e6 + 3e5;
    near(brain.solveFreeform(shuttle + "(a) Find the value of g at this altitude."), (6.67e-11 * 5.97e24) / rShuttle ** 2, "m/s²"); // 8.94
    near(brain.solveFreeform(shuttle + "(b) Find the speed of the shuttle in this orbit."), Math.sqrt((6.67e-11 * 5.97e24) / rShuttle), "m/s"); // 7730
    near(
      brain.solveFreeform(shuttle + "(c) Find the period of the orbit."),
      2 * Math.PI * Math.sqrt(rShuttle ** 3 / (6.67e-11 * 5.97e24)),
      "s",
      0.02,
    ); // 90.5 min
    near(
      brain.solveFreeform(shuttle + "(d) Find the pull of gravity on a 70.0 kg astronaut aboard the shuttle in this orbit."),
      (70 * 6.67e-11 * 5.97e24) / rShuttle ** 2,
      "N",
    ); // 626
    expect(
      brain.solveFreeform(shuttle + "(e) Explain why the astronaut floats about inside the shuttle.").computedAnswer,
    ).toContain("free fall");
    expect(
      brain.solveFreeform(
        shuttle + "(f) In order to leave orbit and return to earth in what direction should rockets fire and why?",
      ).computedAnswer,
    ).toContain("retrograde");

    expect(
      brain.solveFreeform(
        "In order to place a satellite or spacecraft into orbit about Earth it is not enough to simply lift the object to the correct altitude. Besides lifting the object into space, what other purpose do the rocket engines serve in order to initiate an orbit? Explain.",
      ).computedAnswer,
    ).toContain("sideways");

    const sat =
      "A news report states that a certain satellite is traveling at a speed of 16000 mph in its orbit about Earth. ";
    const vSat = 16000 * 0.44704;
    const rSat = (6.67e-11 * 5.97e24) / vSat ** 2;
    near(brain.solveFreeform(sat + "(a) Determine its altitude."), rSat - 6.37e6, "m"); // 1400 km
    near(
      brain.solveFreeform(sat + "(b) Find the number of revolutions it makes per day (24 hours)."),
      86400 / ((2 * Math.PI * rSat) / vSat),
      "rev/day",
      0.02,
    ); // 13

    near(
      brain.solveFreeform(
        "(a) What is the altitude of the required orbit for a geosynchronous satellite with a period of 23 hours 56 minutes 4.0 seconds?",
      ),
      Math.cbrt((6.67e-11 * 5.97e24 * 86164 ** 2) / (4 * Math.PI ** 2)) - 6.37e6,
      "m",
    ); // 35787 km
    near(
      brain.solveFreeform(
        "(b) What speed is necessary to inject a geosynchronous satellite into this orbit of period 23 hours 56 minutes 4.0 seconds?",
      ),
      Math.sqrt(
        (6.67e-11 * 5.97e24) / Math.cbrt((6.67e-11 * 5.97e24 * 86164 ** 2) / (4 * Math.PI ** 2)),
      ),
      "m/s",
    ); // 3074.8

    const sag =
      "Since the mid-1990's astronomers have observed stars orbiting compact radio source Sagittarius A at the center of our galaxy. The star SO-2 has an elliptical orbit with semi-major axis 1.5 × 10^14 m and period 16 years. ";
    const Msag = (4 * Math.PI ** 2 * (1.5e14) ** 3) / (6.67e-11 * (16 * 3.156e7) ** 2);
    near(brain.solveFreeform(sag + "(a) Use this information to estimate the mass of Sag. A."), Msag, "kg"); // 7.8e36
    near(
      brain.solveFreeform(sag + "(b) How many times more massive is Sag. A than the Sun?"),
      Msag / 1.989e30,
      "suns",
    ); // 3.9 million

    const ratios =
      "Two planets travel in circular orbits around a star. Planet A has speed v and planet B has speed 3v. ";
    expect(brain.solveFreeform(ratios + "Find the ratio of the two planets' orbital radii.").computedAnswer).toBe(
      "9:1",
    );
    expect(brain.solveFreeform(ratios + "Find the ratio of the two planets' periods.").computedAnswer).toBe("27:1");

    const binary =
      'Suppose astronomers discover a "binary asteroid" consisting of two asteroids orbiting one another with a separation of 80.0 km and a period of 3.0 days. The larger body has a diameter 2.0 times greater than the smaller. ';
    const Mtot = (4 * Math.PI ** 2 * 8e4 ** 3) / (6.67e-11 * (3 * 86400) ** 2);
    near(brain.solveFreeform(binary + "(a) Determine the total mass of the system."), Mtot, "kg"); // 4.5e15
    near(brain.solveFreeform(binary + "(b) Determine the mass of the smaller object."), Mtot / 9, "kg"); // 5.0e14
    near(
      brain.solveFreeform(binary + "(c) Determine the speed of the smaller object."),
      (2 * Math.PI * (8e4 * (8 / 9))) / (3 * 86400),
      "m/s",
    ); // 1.7

    const moons =
      "The following table shows radius (in multiples of Jupiter's radius) and period (in Earth days) for the orbits of some of Jupiter's moons. Use Kepler's 3rd Law to complete the table. ";
    expect(
      brain.solveFreeform(moons + "What graph based on this data would produce a straight line?").computedAnswer,
    ).toBe("r³ vs. T²");
    expect(
      brain.solveFreeform(moons + "Sketch what this graph would look like and determine the slope.").computedAnswer,
    ).toBe("slope = GM/4π²");
  });
});
