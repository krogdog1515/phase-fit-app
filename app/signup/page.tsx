"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhaseFitLogo from "../components/PhaseFitLogo";
import supabase from "../lib/supabase";
import { logEvent } from "../lib/events";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
    } else if (data.session) {
      await logEvent(data.user!.id, "signup_completed");
      router.push("/onboarding/privacy");
    } else {
      alert("Account created. Check your email to confirm, then log in.");
      router.push("/login");
    }
  };

  return (
    <main className="pf-page flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">

        <div className="text-center space-y-2">
          <PhaseFitLogo variant="auth" className="flex justify-center" priority />
          <p className="pf-body-muted">Create your account</p>
        </div>

        <div className="pf-card p-6 space-y-4">
          <h2 className="pf-heading-section text-base">Sign Up</h2>

          <div>
            <label className="pf-label">Email</label>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pf-input"
            />
          </div>

          <div>
            <label className="pf-label">Password</label>
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pf-input"
            />
          </div>

          <button
            type="button"
            onClick={handleSignup}
            disabled={loading}
            className="pf-btn-primary disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <p
            onClick={() => router.push("/login")}
            className="pf-link text-center block"
          >
            Already have an account? Login
          </p>
        </div>
      </div>
    </main>
  );
}
