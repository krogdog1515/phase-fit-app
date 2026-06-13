export const ONBOARDING_GOAL_OPTIONS = [
  "Lose body fat",
  "Build muscle",
  "Get stronger",
  "Improve energy",
  "Improve overall fitness",
  "Recover postpartum",
  "Build consistency",
] as const;

export const ONBOARDING_TRAINING_STYLE_OPTIONS = [
  "Strength training",
  "Muscle building",
  "Running",
  "Walking",
  "Yoga / Pilates",
  "Mixed fitness",
  "Sports / athletic training",
  "Not sure yet",
] as const;

export const ONBOARDING_LIFE_STAGE_OPTIONS = [
  "Regular cycle",
  "Hormonal IUD",
  "Non-hormonal IUD",
  "Postpartum",
  "Prenatal",
  "Prefer not to say",
] as const;

export const ONBOARDING_EXPERIENCE_OPTIONS = [
  "Beginner",
  "Intermediate",
  "Advanced",
] as const;

export const ONBOARDING_ENVIRONMENT_OPTIONS = [
  "Commercial gym",
  "Home gym",
  "Limited equipment",
  "Bodyweight only",
] as const;

export const ONBOARDING_FREQUENCY_OPTIONS = [
  "1-2 days per week",
  "3-4 days per week",
  "5+ days per week",
] as const;

export const ONBOARDING_CHALLENGE_OPTIONS = [
  "Consistency",
  "Energy",
  "Motivation",
  "Recovery",
  "Time",
  "Strength progress",
] as const;

export type OnboardingFormValues = {
  goal: string;
  trainingStyle: string;
  lifeStage: string;
  trainingExperience: string;
  trainingEnvironment: string;
  trainingFrequency: string;
  biggestChallenge: string;
};

export const ONBOARDING_STEPS = [
  {
    id: "goal",
    title: "Primary goal",
    hint: "What matters most to you right now?",
  },
  {
    id: "trainingStyle",
    title: "Preferred training style",
    hint: "How do you like to move?",
  },
  {
    id: "lifeStage",
    title: "Current phase of life",
    hint: "Helps us adapt recommendations to your context.",
  },
  {
    id: "trainingExperience",
    title: "Training experience",
    hint: "Where are you in your fitness journey?",
  },
  {
    id: "trainingEnvironment",
    title: "Training environment",
    hint: "What equipment do you usually have?",
  },
  {
    id: "trainingFrequency",
    title: "Training frequency",
    hint: "How often can you realistically train?",
  },
  {
    id: "biggestChallenge",
    title: "Biggest challenge",
    hint: "What gets in the way most often?",
  },
] as const;
