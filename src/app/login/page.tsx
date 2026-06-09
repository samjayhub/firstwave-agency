// Login page (P4-03). If already authenticated, skip straight to the dashboard.
import { redirect } from "next/navigation";
import { getPageAuth } from "@/lib/ui/page-auth";
import { LoginForm } from "./LoginForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (getPageAuth()) redirect("/dashboard");
  return (
    <main className="auth-wrap">
      <h1 className="page-title">Sign in</h1>
      <p className="muted">Operator access to the Firstwave dashboard.</p>
      <div className="card" style={{ marginTop: "1rem" }}>
        <LoginForm />
      </div>
    </main>
  );
}
