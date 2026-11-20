"use client";

/**
 * DASH-18 (PRB-13): one-time announcement while the setting is off. Dismiss hides it for good in
 * this browser (a `localStorage` flag, no cookie, no server record). It renders only after the
 * flag has been read, so a dismissed card never flashes; without usable storage it is shown and
 * Dismiss hides it until the page reloads.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  browserStorage,
  dismissAnnouncement,
  isAnnouncementDismissed,
} from "@/lib/problems/announcement";
import { problemsCopy } from "@/lib/problems/copy";

export function ProblemsAnnouncement({ neetCode = false }: { neetCode?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => setVisible(!isAnnouncementDismissed(browserStorage())), []);

  if (!visible) return null;
  return (
    <Card
      aria-labelledby="problems-announcement-text"
      className="flex-col gap-3 sm:flex-row sm:items-center"
      data-testid="problems-announcement"
    >
      <p id="problems-announcement-text" className="flex-1 text-sm font-medium">
        {problemsCopy(neetCode).announcement}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href="/settings#problems">Turn on in Settings</a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dismissAnnouncement(browserStorage());
            setVisible(false);
          }}
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
