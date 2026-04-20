"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "../lib/supabase";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
    } else {
      alert("Account created. You can now log in.");
      router.push("/login");
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="bg-[#111] p-8 rounded-xl w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Sign Up</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded bg-white text-black"
        />

        <input
          type="password"
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 rounded bg-white text-black"
        />

        <button
          onClick={handleSignup}
          className="w-full bg-white text-black py-3 rounded font-semibold"
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>

        <p
          className="text-sm text-gray-400 cursor-pointer"
          onClick={() => router.push("/login")}
        >
          Already have an account? Login
        </p>
      </div>
    </main>
  );
}