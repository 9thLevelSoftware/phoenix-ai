export function checkSafetyRedFlags(message: string): { safe: boolean; reason?: string; responseOverride?: string } {
  const normalized = message.toLowerCase().trim();

  // 1. Unsafe Supplement / Toxic Chemicals Gating (Clenbuterol, DNP)
  const supplementRegex = /\b(clenbuterol|clen\b|dnp\b|dinitrophenol)\b/i;
  if (supplementRegex.test(normalized)) {
    return {
      safe: false,
      reason: "unsafe_supplement",
      responseOverride: "I cannot recommend or assist in scheduling routines that incorporate unsafe, unapproved, or high-risk chemical performance enhancers like DNP or clenbuterol. These substances carry extreme, life-threatening physiological risks. Let's focus on natural hypertrophy principles and progressive overload."
    };
  }

  // 2. Extreme Dieting / Starvation Targets Gating
  // Matches targets under healthy calorie levels (e.g. 500 kcal, 800 kcal, starving)
  const dietRegex = /\b(starve|starving)\b|\b(500|600|700|800|900|1000)\s*(calories|cal|kcal)\b/i;
  if (dietRegex.test(normalized)) {
    return {
      safe: false,
      reason: "extreme_dieting",
      responseOverride: "Your safety is the highest priority. Restricting your intake to extreme calorie targets (such as under 1200 kcal/day for women or 1500 kcal/day for men) is highly counterproductive for performance, hypertrophy, and overall metabolic health. Please consult a registered dietitian or healthcare professional to establish a sustainable, safe nutrition plan."
    };
  }

  // Allow athletic idioms like "no pain no gain"
  if (normalized.includes("no pain no gain")) {
    return { safe: true };
  }

  // 3. Acute Physical Pain / Stabbing Discomfort / Chest Pain / Severe Injury Gating
  // Uses strict word boundaries to avoid false positives (e.g. "painting", "painstaking")
  const painRegex = /\b(chest\s+pain|joint\s+pain|stabbing\s+pain|acute\s+pain|injured|injury|injuries)\b|\b(hurts?|pain)\b(?!\s*(taking|ted|ful|t\b))/i;
  if (painRegex.test(normalized)) {
    return {
      safe: false,
      reason: "acute_pain_injury",
      responseOverride: "I am sorry to hear you are experiencing discomfort. As an AI athletic coach, I cannot provide medical advice, diagnosis, or treatment plans. If you are experiencing chest pain or acute joint discomfort, please stop exercising immediately and consult a healthcare professional. We cannot plan routines for active injuries without medical clearance."
    };
  }

  return { safe: true };
}
