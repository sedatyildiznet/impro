import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../stores/session";
import { Button, Field, Logo } from "../ui/primitives";

export function AuthShell({
  title,
  children,
  alt,
}: {
  title: string;
  children: React.ReactNode;
  alt: React.ReactNode;
}) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-ink-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <Logo />
        <div>
          <h1 className="max-w-[12ch] text-5xl font-semibold leading-[0.95] tracking-tight">
            All your conversations. One place.
          </h1>
          <p className="mt-5 max-w-md text-mist-500">
            Personal messages and team inboxes together. People, not platforms.
          </p>
        </div>
        <p className="text-xs text-mist-600">Impro · app.impro.chat</p>
      </section>
      <section className="grid place-items-center px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {children}
          <div className="text-sm text-mist-500">{alt}</div>
        </div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      const out = (await api.login({
        username: String(fd.get("username")),
        password: String(fd.get("password")),
      })) as { user: never; matrix: never };
      setAuth(out.user, out.matrix);
      nav("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Welcome back" alt={<>New here? <Link className="text-accent" to="/register">Create your Impro account</Link></>}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Username" name="username" autoComplete="username" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      const out = (await api.register({
        username: String(fd.get("username")),
        displayName: String(fd.get("displayName")),
        email: String(fd.get("email") || "") || undefined,
        password: String(fd.get("password")),
      })) as { user: never; matrix: never };
      setAuth(out.user, out.matrix);
      nav("/welcome");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create your account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create your Impro account"
      alt={<>Already have an account? <Link className="text-accent" to="/login">Sign in</Link></>}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Username" name="username" autoComplete="username" required placeholder="yourname" />
        <Field label="Display name" name="displayName" required placeholder="Your name" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function WelcomePage() {
  const nav = useNavigate();
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6">
      <Logo />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Welcome to Impro</h1>
      <p className="mt-3 text-mist-500">Connect the networks you already use. You can skip this and do it later.</p>
      <div className="mt-8 grid gap-3">
        {["WhatsApp", "Telegram", "Signal", "Instagram", "Matrix"].map((n) => (
          <button
            key={n}
            onClick={() => nav("/settings/connections")}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-ink-800 px-4 py-3 text-left hover:bg-ink-700"
          >
            <span>{n}</span>
            <span className="text-sm text-accent">Connect</span>
          </button>
        ))}
      </div>
      <Button className="mt-8" variant="muted" onClick={() => nav("/")}>
        Skip for now
      </Button>
    </div>
  );
}
