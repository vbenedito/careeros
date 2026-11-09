"use client";

import type { VariantProps } from "class-variance-authority";
/**
 * A native POST form whose submit leads to another page (OAuth redirect, sign-out) (#93).
 * While the browser waits, the clicked button shows a spinner and a "…ing" label and every
 * submit button is aria-disabled. `disabled` is not used on purpose: a disabled submitter
 * is left out of the form data, and the server needs its name/value (e.g. provider=github).
 * A second submit is cancelled instead. Coming back with the Back button (bfcache) resets it.
 */
import { Loader2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button, type buttonVariants } from "@/components/ui/button";

type ButtonStyle = VariantProps<typeof buttonVariants>;

export interface RedirectChoice {
  /** The submitted `value` (sent with `name`), also the key of the pending state. */
  value: string;
  label: ReactNode;
  pendingLabel: string;
}

export function RedirectForm({
  action,
  name,
  choices,
  hidden,
  className,
  buttonClassName,
  variant = "outline",
  size,
}: {
  action: string;
  /** Name of the field the clicked button submits. */
  name: string;
  choices: RedirectChoice[];
  /** Extra hidden fields, e.g. { next: "/settings" }. */
  hidden?: Record<string, string>;
  className?: string;
  buttonClassName?: string;
  variant?: ButtonStyle["variant"];
  size?: ButtonStyle["size"];
}) {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    // Back/forward cache restores the page as it was left: in the pending state.
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (pending !== null) {
      e.preventDefault(); // already on its way
      return;
    }
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    setPending(submitter?.value ?? choices[0]?.value ?? "");
  }

  return (
    <form
      method="post"
      action={action}
      onSubmit={onSubmit}
      aria-busy={pending !== null}
      className={className}
    >
      {hidden
        ? Object.entries(hidden).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))
        : null}
      {choices.map((choice) => {
        const isPending = pending === choice.value;
        return (
          <Button
            key={choice.value}
            type="submit"
            name={name}
            value={choice.value}
            variant={variant}
            size={size}
            aria-disabled={pending !== null}
            className={buttonClassName}
          >
            {isPending ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : null}
            {isPending ? choice.pendingLabel : choice.label}
          </Button>
        );
      })}
      <span aria-live="polite" className="sr-only">
        {pending !== null ? (choices.find((c) => c.value === pending)?.pendingLabel ?? "") : ""}
      </span>
    </form>
  );
}
