// Landing/status page. Phase 0 scaffold — the real dashboard lands in Phase 1.
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "3rem", lineHeight: 1.6 }}>
      <h1>AI Social Marketing Platform</h1>
      <p>
        <strong>Phase 0 — spec + scaffold.</strong> No application logic yet.
      </p>
      <p>
        Read the architecture spec in <code>docs/</code>. The Phase 1 MVP is the
        core loop on one platform, all built in-house. See{" "}
        <code>docs/05-roadmap.md</code>.
      </p>
    </main>
  );
}
