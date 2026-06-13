"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "./supabase";
import { resolvePostAuthRoute } from "./user-profile";

/** Redirects unauthenticated or incomplete-onboarding users away from app routes. */
export function useOnboardingGuard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const guard = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/login");
        return;
      }

      const dest = await resolvePostAuthRoute(data.user.id);
      if (dest !== "/") {
        router.replace(dest);
        return;
      }

      if (!cancelled) {
        setReady(true);
      }
    };

    guard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return ready;
}
