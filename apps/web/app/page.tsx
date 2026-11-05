import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

// Placeholder until the dashboard shell (#22). The proxy already guards this route; the
// server-side check below is defense in depth (AUTH-02).
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <main>
      <h1>CareerOS</h1>
      <p>
        Signed in as <strong data-testid="user-email">{user.email}</strong>
      </p>
      <form method="post" action="/auth/sign-out">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
