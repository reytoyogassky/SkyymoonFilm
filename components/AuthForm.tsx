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
    "w-full bg-transparent border-none focus:outline-none text-[15px] text-white placeholder:text-white/35 flex-1";

  return (
    <div className="flex flex-col gap-5">
      {/* Form */}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!isLogin && (
          <label className="flex items-center gap-3 px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus-within:border-[#ff5566]/50 transition-colors">
            <User className="w-[17px] h-[17px] text-white/40 flex-none" />
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

        <label className="flex items-center gap-3 px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus-within:border-[#ff5566]/50 transition-colors">
          <Mail className="w-[17px] h-[17px] text-white/40 flex-none" />
          <input
            value={isLogin ? identifier : email}
            onChange={(e) => (isLogin ? setIdentifier(e.target.value) : setEmail(e.target.value))}
            placeholder={isLogin ? "Email atau username" : "Email"}
            type={isLogin ? "text" : "email"}
            autoComplete={isLogin ? "username" : "email"}
            className={inputCls}
            required
          />
        </label>

        <label className="flex items-center gap-3 px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus-within:border-[#ff5566]/50 transition-colors">
          <Lock className="w-[17px] h-[17px] text-white/40 flex-none" />
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
            className="text-white/40 hover:text-white/80 transition-colors cursor-pointer"
            aria-label={showPass ? "Sembunyikan password" : "Tampilkan password"}
          >
            {showPass ? <EyeOff className="w-[17px] h-[17px]" /> : <Eye className="w-[17px] h-[17px]" />}
          </button>
        </label>

        {!isLogin && (
          <label className="flex items-center gap-3 px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus-within:border-[#ff5566]/50 transition-colors">
            <Lock className="w-[17px] h-[17px] text-white/40 flex-none" />
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Ulangi password"
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              className={inputCls}
              required
            />
          </label>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 text-[13px] text-[#ff9aa5] bg-[#e11d2e]/12 border border-[#ff5566]/25 px-4 py-3 rounded-[14px]"
          >
            <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
            {error}
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[13px] text-emerald-300 bg-emerald-500/10 border border-emerald-400/25 px-4 py-3 rounded-[14px]"
          >
            {success}
          </motion.div>
        )}

        <motion.button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full px-5 py-[15px] rounded-full text-[15px] font-bold text-white accent-gradient accent-shadow transition-all disabled:opacity-60 cursor-pointer"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLogin ? "Masuk" : "Daftar Sekarang"}
        </motion.button>
      </form>

      <div className="text-center text-[14px] text-white/50">
        {isLogin ? (
          <>
            Belum punya akun?{" "}
            <Link href="/daftar" className="text-[#ff5566] font-semibold hover:underline">
              Daftar
            </Link>
          </>
        ) : (
          <>
            Sudah punya akun?{" "}
            <Link href="/masuk" className="text-[#ff5566] font-semibold hover:underline">
              Masuk
            </Link>
          </>
        )}
      </div>
    </div>
  );
}