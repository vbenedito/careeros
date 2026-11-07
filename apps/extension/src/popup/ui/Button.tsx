import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

const VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border border-border bg-background hover:bg-muted",
  ghost: "hover:bg-muted",
  subtle: "text-muted-foreground hover:bg-muted hover:text-foreground",
  link: "text-primary underline-offset-4 hover:underline",
  "link-xs": "text-xs text-primary underline-offset-4 hover:underline",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
} as const;

const SIZES = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
  icon: "h-8 w-8",
  inline: "",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

/** The only button in the popup. Icon-only buttons must pass `aria-label`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "sm", className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 aria-disabled:opacity-60",
        VARIANTS[variant],
        !variant.startsWith("link") && SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
