"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhaseFitLogo from "../components/PhaseFitLogo";
import supabase from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
    } else {
      router.push("/");
    }
  };

  return (
    <main className="pf-page flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">

        <div className="text-center space-y-2">
          <PhaseFitLogo variant="auth" className="flex justify-center" priority />
          <p className="pf-accent-italic pf-body-muted">
            Smarter training, aligned with your cycle
          </p>
        </div>

        <div className="pf-card p-6 space-y-4">

          <h2 className="pf-heading-section text-base">Login</h2>

          <div>
            <label className="pf-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pf-input"
            />
          </div>

          <div>
            <label className="pf-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pf-input"
            />
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="pf-btn-primary disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <p
            onClick={() => router.push("/signup")}
            className="pf-link text-center block"
          >
            Don&apos;t have an account? Sign up
          </p>

        </div>
      </div>
    </main>
  );
}
