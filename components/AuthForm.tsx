"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { Mail, Lock, User, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/client-store";

interface AuthFormProps {
  mode: "login" | "register";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isLogin = mode === "login";
  const { login, register } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (isLogin) {
      if (!identifier.trim()) {
        setError("Masukkan email atau username.");
        return;
      }
      if (!password) {
        setError("Masukkan password.");
        return;
      }
      setLoading(true);
      const err = login(identifier, password);
      setLoading(false);
      if (err) {
        setError(err);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    if (username.trim().length < 3) {
      setError("Username minimal 3 karakter.");
      return;
    }
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setLoading(true);
    const err = register({ username, email, password });
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setSuccess("Akun berhasil dibuat! Kamu langsung masuk.");
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 700);
  };

  const inputCls =
    "w-full bg-transparent border-none focus:outline-none text-[16px] text-white placeholder:text-white/40 flex-1 font-medium";

  return (
    <div className="flex flex-col gap-6">
      {/* Form */}
      <form onSubmit={submit} className="flex flex-col gap-5">
        {!isLogin && (
          <label className="flex items-center gap-3.5 px-5 py-4 rounded-xl bg-white/8 border border-white/15 focus-within:border-[#9D4EDD]/60 transition-all duration-300 hover:bg-white/10">
            <User className="w-5 h-5 text-white/50 flex-none" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className={inputCls}
              required
            />
          </label>
        )}

        <label className="flex items-center gap-3.5 px-5 py-4 rounded-xl bg-white/8 border border-white/15 focus-within:border-[#9D4EDD]/60 transition-all duration-300 hover:bg-white/10">
          <Mail className="w-5 h-5 text-white/50 flex-none" />
          <input
            value={isLogin ? identifier : email}
            onChange={(e) => (isLogin ? setIdentifier(e.target.value) : setEmail(e.target.value))}
            placeholder={isLogin ? "Email or username" : "Email"}
            type={isLogin ? "text" : "email"}
            autoComplete={isLogin ? "username" : "email"}
            className={inputCls}
            required
          />
        </label>

        <label className="flex items-center gap-3.5 px-5 py-4 rounded-xl bg-white/8 border border-white/15 focus-within:border-[#9D4EDD]/60 transition-all duration-300 hover:bg-white/10">
          <Lock className="w-5 h-5 text-white/50 flex-none" />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type={showPass ? "text" : "password"}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className={inputCls}
            required
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="text-white/50 hover:text-white/90 transition-all duration-300 cursor-pointer"
            aria-label={showPass ? "Hide password" : "Show password"}
          >
            {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </label>

        {!isLogin && (
          <label className="flex items-center gap-3.5 px-5 py-4 rounded-xl bg-white/8 border border-white/15 focus-within:border-[#9D4EDD]/60 transition-all duration-300 hover:bg-white/10">
            <Lock className="w-5 h-5 text-white/50 flex-none" />
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              className={inputCls}
              required
            />
          </label>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 text-[14px] text-red-300 bg-red-500/15 border border-red-400/30 px-5 py-4 rounded-xl"
          >
            <AlertCircle className="w-5 h-5 flex-none mt-0.5" />
            <span className="font-medium">{error}</span>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[14px] text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-5 py-4 rounded-xl font-medium"
          >
            {success}
          </motion.div>
        )}

        <motion.button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2.5 w-full px-6 py-4 rounded-xl text-[16px] font-bold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
            boxShadow: "0 8px 24px rgba(123,44,191,0.4)",
          }}
          whileHover={{ scale: loading ? 1 : 1.02, boxShadow: "0 12px 32px rgba(123,44,191,0.5)" }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
        >
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {isLogin ? "Sign In" : "Create Account"}
        </motion.button>
      </form>

      <div className="text-center text-[15px] text-white/55">
        {isLogin ? (
          <>
            Don't have an account?{" "}
            <Link href="/daftar" className="text-[#9D4EDD] font-bold hover:underline transition-all duration-300">
              Sign Up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/masuk" className="text-[#9D4EDD] font-bold hover:underline transition-all duration-300">
              Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}