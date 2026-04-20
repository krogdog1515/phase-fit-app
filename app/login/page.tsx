"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    <main className="min-h-screen bg-[#f9f7f7] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">

        {/* LOGO / TITLE */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Phase Fit
          </h1>
          <p className="text-sm text-gray-500">
            Smarter training, aligned with your cycle
          </p>
        </div>

        {/* CARD */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">

          <h2 className="text-lg font-semibold text-gray-900">
            Login
          </h2>

          {/* EMAIL */}
          <div>
            <label className="text-sm text-gray-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 p-3 border border-gray-300 rounded"
            />
          </div>

          {/* PASSWORD */}
          <div>
            <label className="text-sm text-gray-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 p-3 border border-gray-300 rounded"
            />
          </div>

          {/* BUTTON */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className={`w-full py-3 rounded font-semibold ${
              loading
                ? "bg-gray-400 text-white"
                : "bg-[#7a1f2a] text-white"
            }`}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {/* SIGN UP */}
          <p
            onClick={() => router.push("/signup")}
            className="text-sm text-center text-[#7a1f2a] cursor-pointer font-medium"
          >
            Don’t have an account? Sign up
          </p>

        </div>
      </div>
    </main>
  );
}