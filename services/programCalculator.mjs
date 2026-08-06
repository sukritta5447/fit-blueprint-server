import { HttpError } from "../utils/httpError.mjs";

const GOALS = new Set(["muscle_gain", "fat_loss", "endurance", "general_fitness"]);
const EXPERIENCES = new Set(["beginner", "intermediate", "advanced"]);
const DIETS = new Set(["standard", "high_protein", "vegetarian", "plant_based"]);
const GENDERS = new Set(["male", "female", "prefer_not_to_say"]);

function assertNumber(value, field, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max}`, "invalid_program_input");
  }
}

function assertEnum(value, field, values) {
  if (!values.has(value)) {
    throw new HttpError(400, `${field} is invalid`, "invalid_program_input");
  }
}

function round(value) {
  return Math.round(value);
}

function getActivityMultiplier(daysPerWeek) {
  if (daysPerWeek <= 3) return 1.375;
  if (daysPerWeek === 4) return 1.55;
  if (daysPerWeek === 5) return 1.6;
  return 1.725;
}

function getGoalAdjustment(goal) {
  return { muscle_gain: 250, fat_loss: -400, endurance: 100, general_fitness: 0 }[goal];
}

function getProteinFactor(goal, experience) {
  if (goal === "fat_loss") return 2.0;
  if (goal === "muscle_gain" && experience !== "beginner") return 1.8;
  return 1.6;
}

function buildWorkoutPlan(daysPerWeek, experience, goal, equipment = "") {
  const focus = goal === "endurance" ? "conditioning" : "strength";
  const level = experience === "beginner" ? "2–3 sets" : "3–4 sets";
  const exercises = equipment.toLowerCase().includes("home")
    ? ["Squat variation", "Push-up variation", "Row variation", "Hip hinge variation"]
    : ["Squat", "Bench press", "Row", "Romanian deadlift"];

  return {
    frequency_per_week: daysPerWeek,
    focus,
    progression: "เพิ่ม reps ก่อนเพิ่มน้ำหนัก เมื่อทำครบช่วง reps ด้วยฟอร์มที่ดี",
    days: Array.from({ length: daysPerWeek }, (_, index) => ({
      day: index + 1,
      name: `${focus === "conditioning" ? "Conditioning" : "Strength"} day ${index + 1}`,
      exercises: exercises.map((name, exerciseIndex) => ({
        name,
        sets: level,
        reps: focus === "conditioning" ? "30–45 seconds" : exerciseIndex === 0 ? "6–10" : "8–12",
        rest_seconds: 90,
      })),
    })),
  };
}

export function calculateProgram(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "A JSON object body is required", "invalid_body");
  }

  assertNumber(input.age, "age", 13, 120);
  assertNumber(input.weight_kg, "weight_kg", 20, 500);
  assertNumber(input.height_cm, "height_cm", 100, 250);
  assertNumber(input.days_per_week, "days_per_week", 2, 6);
  assertEnum(input.gender, "gender", GENDERS);
  assertEnum(input.goal, "goal", GOALS);
  assertEnum(input.experience, "experience", EXPERIENCES);
  assertEnum(input.diet, "diet", DIETS);

  const bmr = input.gender === "male"
    ? 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age + 5
    : 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age - 161;
  const tdee = bmr * getActivityMultiplier(input.days_per_week);
  const dailyCalories = Math.max(1200, round(tdee + getGoalAdjustment(input.goal)));
  const proteinGrams = round(input.weight_kg * getProteinFactor(input.goal, input.experience));
  const fatGrams = round((dailyCalories * 0.25) / 9);
  const carbsGrams = Math.max(0, round((dailyCalories - proteinGrams * 4 - fatGrams * 9) / 4));

  return {
    assumptions: [
      "ใช้สูตร Mifflin-St Jeor และ activity multiplier จากจำนวนวันฝึก",
      "เป็นค่าประมาณเบื้องต้น ควรปรับตามน้ำหนักและ performance จริงทุก 2–3 สัปดาห์",
    ],
    calculation: {
      bmr: round(bmr),
      tdee: round(tdee),
      daily_calories: dailyCalories,
      macros: { protein_g: proteinGrams, carbs_g: carbsGrams, fat_g: fatGrams },
    },
    workout_plan: buildWorkoutPlan(input.days_per_week, input.experience, input.goal, input.equipment),
    nutrition_plan: {
      daily_calories: dailyCalories,
      macros: { protein_g: proteinGrams, carbs_g: carbsGrams, fat_g: fatGrams },
      diet: input.diet,
      restrictions: input.restrictions ?? "",
      meal_guidance: "แบ่งโปรตีนให้ใกล้เคียงกัน 3–4 มื้อต่อวัน และดื่มน้ำให้เพียงพอ",
    },
    warnings: input.injuries
      ? ["มีข้อจำกัด/อาการบาดเจ็บ: ควรให้ผู้เชี่ยวชาญตรวจทานท่าฝึกก่อนใช้งานจริง"]
      : [],
  };
}
