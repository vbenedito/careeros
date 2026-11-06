import { redirect } from "next/navigation";
import { extensionId } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";
import { ConnectExtension } from "./connect-extension";

// Placeholder styling: the design arrives with the app shell (#22).
export default async function ConnectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/connect");

  return (
    <main>
      <h1>Connect the extension</h1>
      <p>
        The CareerOS extension gets its own sign-in for <strong>{user.email}</strong>. Signing out
        here does not disconnect it.
      </p>
      <ConnectExtension extensionId={extensionId()} userEmail={user.email ?? null} />
      <p>
        <a href="/">Back to the dashboard</a>
      </p>
    </main>
  );
}
