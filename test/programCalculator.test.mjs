import assert from "node:assert/strict";
import test from "node:test";
import { calculateProgram } from "../services/programCalculator.mjs";

const baseInput = {
  age: 30,
  weight_kg: 70,
  height_cm: 175,
  gender: "male",
  goal: "muscle_gain",
  experience: "beginner",
  days_per_week: 4,
  diet: "standard",
};

test("calculateProgram returns deterministic nutrition and workout output", () => {
  const result = calculateProgram(baseInput);

  assert.equal(result.calculation.bmr, 1649);
  assert.equal(result.calculation.tdee, 2556);
  assert.equal(result.calculation.daily_calories, 2806);
  assert.equal(result.calculation.macros.protein_g, 112);
  assert.equal(result.workout_plan.days.length, 4);
  assert.equal(result.nutrition_plan.daily_calories, 2806);
});

test("calculateProgram rejects invalid enum and numeric input", () => {
  assert.throws(() => calculateProgram({ ...baseInput, goal: "extreme_cut" }), (error) => error.code === "invalid_program_input");
  assert.throws(() => calculateProgram({ ...baseInput, age: 12 }), (error) => error.code === "invalid_program_input");
});

test("calculateProgram includes a safety warning when injuries are supplied", () => {
  const result = calculateProgram({ ...baseInput, injuries: "shoulder pain" });

  assert.equal(result.warnings.length, 1);
});

test("calculateProgram rejects fractional age and frequency and non-string optional fields", () => {
  for (const input of [
    { age: 30.5 }, { days_per_week: 3.5 }, { equipment: 123 },
    { equipment: null }, { restrictions: {} }, { injuries: [] },
  ]) {
    assert.throws(() => calculateProgram({ ...baseInput, ...input }),
      (error) => error.statusCode === 400 && error.code === "invalid_program_input");
  }
  const result = calculateProgram({ ...baseInput, equipment: "home", restrictions: "", injuries: "" });
  assert.equal(result.workout_plan.days[0].exercises[1].name, "Push-up variation");
});
