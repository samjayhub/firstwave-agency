import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  svc: { signup: vi.fn(), login: vi.fn() },
}));

vi.mock("@/app/api/_lib/deps", () => ({
  authService: () => h.svc,
}));

import { POST as signup } from "./signup/route";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";

const jsonReq = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.svc.signup.mockReset();
  h.svc.login.mockReset();
});

describe("POST /api/auth/signup", () => {
  it("creates an account (201) and sets an HttpOnly session cookie", async () => {
    h.svc.signup.mockResolvedValue({
      token: "tok123",
      user: { id: "u1", agencyId: "ag1", email: "a@b.com", role: "agency_admin" },
    });
    const res = await signup(jsonReq("/api/auth/signup", {
      agencyName: "Acme",
      email: "a@b.com",
      password: "supersecret",
    }));
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sml_session=tok123");
    expect(cookie).toContain("HttpOnly");
  });

  it("403 on a cross-origin request (before touching the service)", async () => {
    const res = await signup(
      jsonReq(
        "/api/auth/signup",
        { agencyName: "Acme", email: "a@b.com", password: "supersecret" },
        { origin: "https://evil.example" },
      ),
    );
    expect(res.status).toBe(403);
    expect(h.svc.signup).not.toHaveBeenCalled();
  });

  it("400 on an invalid body", async () => {
    const res = await signup(jsonReq("/api/auth/signup", { email: "bad" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in (200) and sets the session cookie", async () => {
    h.svc.login.mockResolvedValue({
      token: "logintok",
      user: { id: "u1", agencyId: "ag1", email: "a@b.com", role: "agency_admin" },
    });
    const res = await login(jsonReq("/api/auth/login", {
      email: "a@b.com",
      password: "supersecret",
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("sml_session=logintok");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await logout(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/sml_session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
  });
});
