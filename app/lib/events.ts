import supabase from "./supabase";

export async function logEvent(
  userId: string,
  eventName: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from("events").insert({
      user_id: userId,
      event_name: eventName,
      metadata: metadata ?? null,
    });
    if (error) console.error("[logEvent]", eventName, error);
  } catch (err) {
    console.error("[logEvent]", eventName, err);
  }
}
