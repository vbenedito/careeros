import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { privacyConfig } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacy · CareerOS",
  robots: { index: true, follow: true },
};

const UPDATED = "November 7, 2026";

/** SEC-13: plain-language privacy notice (LGPD). Public: no sign-in needed. */
export default function PrivacyPage() {
  const { controller, contactEmail, dataRegion } = privacyConfig();
  const contact = contactEmail ? (
    <a href={`mailto:${contactEmail}`} className="text-primary underline-offset-4 hover:underline">
      {contactEmail}
    </a>
  ) : (
    <NotConfigured what="contact email" />
  );

  return (
    <div className="min-h-svh">
      <header className="flex h-14 items-center gap-2 border-b border-border px-4">
        <a href="/" className="font-semibold tracking-tight">
          CareerOS
        </a>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-8 p-4 py-8 text-sm leading-relaxed md:p-6 md:py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
          <p className="text-muted-foreground">Last updated {UPDATED}.</p>
          <p>
            CareerOS measures how much time you spend studying on the websites you choose. This page
            explains what that involves, in plain language.
          </p>
        </div>

        <Section title="Who is responsible">
          <p>
            CareerOS is run by {controller ?? <NotConfigured what="controller name" />}, the data
            controller under Brazil's General Data Protection Law (LGPD). For any privacy question
            or request, write to {contact}.
          </p>
        </Section>

        <Section title="What we collect and why">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium">Data</th>
                <th className="py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border align-top">
              <Row data="Email, sign-in provider, account ids, name and avatar from Google or GitHub">
                Your account. Name and avatar come with the sign-in; CareerOS does not use them.
              </Row>
              <Row data="Sign-in records with IP address and browser, kept by Supabase">
                Keeping sign-in secure. CareerOS itself does not read them.
              </Row>
              <Row data="Web request logs with IP address, kept by Vercel">
                Running the dashboard; kept for a short time
              </Row>
              <Row data="The sites you choose to track (e.g. leetcode.com)">
                Knowing where your study time counts
              </Row>
              <Row data="Study periods: tracked site, start and end time, a random device id">
                Your totals and charts — this is the product
              </Row>
              <Row data="In the extension, on your computer: its sign-in, settings, a random device id, your tracked-site list, today's study periods and periods waiting to upload">
                Staying connected and not losing time while offline
              </Row>
            </tbody>
          </table>
          <p>
            Nothing else. The extension never records full addresses (paths or search terms), page
            titles or content, keystrokes, form data, passwords or screenshots, and never stores or
            sends the names of sites you have not chosen. It does not read pages at all, and it
            never tracks incognito windows. The dashboard has no analytics or advertising scripts.
          </p>
        </Section>

        <Section title="Legal basis">
          <p>
            We process this data to provide the service you signed up for (LGPD, article 7, item V).
          </p>
        </Section>

        <Section title="Who processes it and where">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong className="font-medium">Supabase</strong> stores your account and study data,
              in the {dataRegion ?? <NotConfigured what="data region" />} region.
            </li>
            <li>
              <strong className="font-medium">Vercel</strong> hosts the dashboard.
            </li>
            <li>
              <strong className="font-medium">Google</strong> and{" "}
              <strong className="font-medium">GitHub</strong> sign you in; they share your email and
              basic profile with CareerOS.
            </li>
          </ul>
          <p>
            These providers may process data outside Brazil (international transfer), under their
            own safeguards. Your data is never sold or shared for marketing.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Until you delete your account. Our own weekly backups are encrypted and kept for 90
            days, so deleted data disappears from them within 90 days. Logs kept by Supabase and
            Vercel expire according to their own retention periods.
          </p>
        </Section>

        <Section title="Your rights">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong className="font-medium">See your data:</strong> the dashboard shows your study
              time and tracked sites.
            </li>
            <li>
              <strong className="font-medium">Get a copy or correct it:</strong> write to {contact}.
            </li>
            <li>
              <strong className="font-medium">Delete it:</strong> Settings → Delete account removes
              your account and all study data immediately. Disconnecting the extension clears your
              sign-in and study data from your computer.
            </li>
          </ul>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ data, children }: { data: string; children: ReactNode }) {
  return (
    <tr>
      <td className="py-2 pr-4">{data}</td>
      <td className="py-2 text-muted-foreground">{children}</td>
    </tr>
  );
}

function NotConfigured({ what }: { what: string }) {
  return (
    <mark className="rounded bg-warning/20 px-1 text-foreground">[{what} not configured]</mark>
  );
}
