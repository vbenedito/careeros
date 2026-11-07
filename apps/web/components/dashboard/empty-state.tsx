import { ExtensionStatus } from "@/components/app/extension-status";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * DASH-11: the period has no study time. Explains how time gets here and, through
 * ExtensionStatus, offers "Connect" when the extension in this browser is missing or not
 * connected (there is no server-side device registry in v0).
 */
export function EmptyState(props: { extensionId: string; userEmail: string | null }) {
  return (
    <Card data-testid="empty-state" aria-labelledby="empty-title">
      <CardHeader>
        <h2 id="empty-title" className="text-base font-semibold">
          No study time in this period
        </h2>
        <p className="text-sm text-muted-foreground">
          Time is tracked automatically while you study on your{" "}
          <a href="/settings" className="text-primary underline-offset-4 hover:underline">
            tracked sites
          </a>{" "}
          with the extension connected.
        </p>
      </CardHeader>
      <CardContent>
        <ExtensionStatus {...props} />
      </CardContent>
    </Card>
  );
}
