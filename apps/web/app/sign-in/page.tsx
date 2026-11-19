import { RedirectForm } from "@/components/app/redirect-form";
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
  searchParams: Promise<{ next?: string; error?: string; deleted?: string }>;
}) {
  const { next, error, deleted } = await searchParams;
  const safeNext = safeNextPath(next);
  const message = error ? (ERRORS[error] ?? ERRORS.callback) : null;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm gap-6 p-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="flex items-center justify-center gap-2.5 text-xl font-semibold tracking-tight">
            <svg aria-hidden="true" viewBox="0 0 512 512" className="size-8 shrink-0">
              <rect width="512" height="512" rx="80" className="fill-brand" />
              <path
                d="M306.9 339.2A112 112 0 1 1 306.9 172.8"
                fill="none"
                className="stroke-brand-foreground"
                strokeWidth="84"
                strokeLinecap="round"
              />
              <circle cx="396" cy="256" r="58" className="fill-brand-foreground" />
            </svg>
            CareerOS
          </h1>
          <p className="text-sm text-muted-foreground">
            Track how much you study for technical interviews — automatically and privately.
          </p>
        </div>
        {deleted === "1" && !message ? (
          <p role="status" className="text-center text-sm text-muted-foreground">
            Your account and all of its data were deleted.
          </p>
        ) : null}
        {message ? (
          <p role="alert" className="text-center text-sm text-warning">
            {message}
          </p>
        ) : null}
        <RedirectForm
          action="/auth/sign-in"
          name="provider"
          hidden={{ next: safeNext }}
          className="flex flex-col gap-2"
          choices={[
            {
              value: "google",
              label: "Continue with Google",
              pendingLabel: "Redirecting to Google…",
            },
            {
              value: "github",
              label: "Continue with GitHub",
              pendingLabel: "Redirecting to GitHub…",
            },
          ]}
        />
        <p className="text-center text-xs text-muted-foreground">
          <a href="/privacy" className="underline-offset-4 hover:underline">
            Privacy
          </a>
        </p>
      </Card>
    </main>
  );
}
