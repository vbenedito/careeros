import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/routes";

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
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm gap-6 p-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">CareerOS</h1>
          <p className="text-sm text-muted-foreground">
            Track how much you study for technical interviews — automatically and privately.
          </p>
        </div>
        {message ? (
          <p role="alert" className="text-center text-sm text-warning">
            {message}
          </p>
        ) : null}
        <form method="post" action="/auth/sign-in" className="flex flex-col gap-2">
          <input type="hidden" name="next" value={safeNext} />
          <Button type="submit" name="provider" value="google" variant="outline">
            Continue with Google
          </Button>
          <Button type="submit" name="provider" value="github" variant="outline">
            Continue with GitHub
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          <a href="/privacy" className="underline-offset-4 hover:underline">
            Privacy
          </a>
        </p>
      </Card>
    </main>
  );
}
