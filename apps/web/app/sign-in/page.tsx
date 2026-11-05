import { safeNextPath } from "@/lib/auth/routes";

// Placeholder styling: the sign-in design arrives with the app shell (#22).
const ERRORS: Record<string, string> = {
  oauth: "Sign-in was cancelled or the provider did not share a verified email. Please try again.",
  callback: "We couldn't complete the sign-in. Please try again.",
  provider: "That sign-in option isn't available right now.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = safeNextPath(next);
  const message = error ? (ERRORS[error] ?? ERRORS.callback) : null;

  return (
    <main>
      <h1>CareerOS</h1>
      <p>Track how much you study for technical interviews — automatically and privately.</p>
      {message ? <p role="alert">{message}</p> : null}
      <form method="post" action="/auth/sign-in">
        <input type="hidden" name="next" value={safeNext} />
        <button type="submit" name="provider" value="google">
          Continue with Google
        </button>
        <button type="submit" name="provider" value="github">
          Continue with GitHub
        </button>
      </form>
      <p>
        <a href="/privacy">Privacy</a>
      </p>
    </main>
  );
}
