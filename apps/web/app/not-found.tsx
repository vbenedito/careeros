import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Button asChild variant="outline">
        <a href="/">Go to the dashboard</a>
      </Button>
    </main>
  );
}
