// Root: send visitors into the dashboard (which redirects to /login if needed).
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
