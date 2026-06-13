import supabase from "./supabase";
import type { OnboardingFormValues } from "./onboarding-options";

export type UserProfileRow = {
  user_id: string;
  goal: string | null;
  life_stage: string | null;
  preferred_training_style: string | null;
  training_experience: string | null;
  training_environment: string | null;
  training_frequency: string | null;
  biggest_challenge: string | null;
  onboarding_completed: boolean;
  created_at?: string;
  updated_at?: string;
};

export async function getUserProfile(
  userId: string
): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data as UserProfileRow | null;
}

/** Route after auth: privacy intro, onboarding form, or home. */
export async function resolvePostAuthRoute(userId: string): Promise<string> {
  const profile = await getUserProfile(userId);

  if (!profile) {
    return "/onboarding/privacy";
  }

  if (!profile.onboarding_completed) {
    return "/onboarding";
  }

  return "/";
}

export async function saveOnboardingProfile(
  userId: string,
  values: OnboardingFormValues
): Promise<{ error: string | null }> {
  const payload = {
    user_id: userId,
    goal: values.goal,
    life_stage: values.lifeStage,
    preferred_training_style: values.trainingStyle,
    training_experience: values.trainingExperience,
    training_environment: values.trainingEnvironment,
    training_frequency: values.trainingFrequency,
    biggest_challenge: values.biggestChallenge,
    onboarding_completed: true,
  };

  const { data: existing } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_profiles")
      .update(payload)
      .eq("user_id", userId);

    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("user_profiles").insert(payload);
  return { error: error?.message ?? null };
}
