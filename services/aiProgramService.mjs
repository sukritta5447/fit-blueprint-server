const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_TIMEOUT_MS = 15000;

function getTimeoutSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : (() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeoutMs);
        return controller.signal;
      })();
}

function isValidAiPlan(plan, daysPerWeek) {
  const days = plan?.workout_plan?.days;
  const nutrition = plan?.nutrition_plan;

  return (
    Array.isArray(days) &&
    days.length === daysPerWeek &&
    days.every(
      (day) =>
        Number.isInteger(day.day) &&
        typeof day.name === "string" &&
        Array.isArray(day.exercises) &&
        day.exercises.every(
          (exercise) =>
            typeof exercise.name === "string" &&
            typeof exercise.sets === "string" &&
            typeof exercise.reps === "string" &&
            Number.isInteger(exercise.rest_seconds),
        ),
    ) &&
    typeof plan.workout_plan.focus === "string" &&
    typeof plan.workout_plan.progression === "string" &&
    Array.isArray(nutrition?.meal_guidance) &&
    Array.isArray(nutrition?.food_suggestions) &&
    typeof plan.explanation === "string"
  );
}

function normalizeAiPlan(plan) {
  return {
    ...plan,
    workout_plan: {
      ...plan.workout_plan,
      days: plan.workout_plan.days.map((day) => ({
        ...day,
        day: day.day ?? day.day_number,
        name: day.name ?? day.day_name,
        exercises: day.exercises.map((exercise) => ({
          ...exercise,
          sets: String(exercise.sets),
          reps: String(exercise.reps),
          rest_seconds: Number(exercise.rest_seconds),
        })),
      })),
    },
  };
}

function createPrompt(input, basePlan) {
  return JSON.stringify({
    profile: {
      age: input.age,
      weight_kg: input.weight_kg,
      height_cm: input.height_cm,
      gender: input.gender,
      goal: input.goal,
      experience: input.experience,
      days_per_week: input.days_per_week,
      diet: input.diet,
      restrictions: input.restrictions ?? "",
      injuries: input.injuries ?? "",
    },
    fixed_nutrition_targets: basePlan.calculation,
    existing_plan: basePlan,
  });
}

function parseJsonContent(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObjectIndex = cleaned.indexOf("{");
    if (firstObjectIndex < 0) {
      throw new Error("Gemini returned invalid JSON");
    }

    let depth = 0;
    let isInsideString = false;
    let isEscaped = false;

    for (let index = firstObjectIndex; index < cleaned.length; index += 1) {
      const character = cleaned[index];

      if (isInsideString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (character === "\\") {
          isEscaped = true;
        } else if (character === '"') {
          isInsideString = false;
        }
        continue;
      }

      if (character === '"') {
        isInsideString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;

        if (depth === 0) {
          return JSON.parse(cleaned.slice(firstObjectIndex, index + 1));
        }
      }
    }

    throw new Error("Gemini returned invalid JSON");
  }
}

export async function personalizeProgram(input, basePlan) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const response = await fetch(
    `${GEMINI_API_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
    method: "POST",
    signal: getTimeoutSignal(timeoutMs),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: [
              "You are a careful fitness programming assistant.",
              "Return JSON only with keys: workout_plan, nutrition_plan, explanation.",
              "Keep the fixed daily_calories and macros exactly as provided.",
              "Create exactly the requested number of workout days.",
              "Respect diet, restrictions, injuries, experience, and available equipment.",
              "Do not diagnose, treat, or make medical claims. If injury information is present, include a cautious note in explanation.",
              "Each exercise must contain name, sets, reps, and rest_seconds as an integer.",
              "nutrition_plan.meal_guidance and food_suggestions must be arrays of short strings.",
            ].join(" "),
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: createPrompt(input, basePlan) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            workout_plan: {
              type: "OBJECT",
              properties: {
                focus: { type: "STRING" },
                progression: { type: "STRING" },
                days: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      day: { type: "INTEGER" },
                      name: { type: "STRING" },
                      exercises: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: {
                            name: { type: "STRING" },
                            sets: { type: "STRING" },
                            reps: { type: "STRING" },
                            rest_seconds: { type: "INTEGER" },
                          },
                          required: ["name", "sets", "reps", "rest_seconds"],
                        },
                      },
                    },
                    required: ["day", "name", "exercises"],
                  },
                },
              },
              required: ["focus", "progression", "days"],
            },
            nutrition_plan: {
              type: "OBJECT",
              properties: {
                meal_guidance: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
                food_suggestions: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["meal_guidance", "food_suggestions"],
            },
            explanation: { type: "STRING" },
          },
          required: ["workout_plan", "nutrition_plan", "explanation"],
        },
      },
    }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("Gemini returned an empty program response");
  }

  const aiPlan = normalizeAiPlan(parseJsonContent(content));
  if (!isValidAiPlan(aiPlan, input.days_per_week)) {
    throw new Error("Gemini returned an invalid program shape");
  }

  return aiPlan;
}
