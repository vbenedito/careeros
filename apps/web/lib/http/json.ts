import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "no-store" };

/** JSON reply for the dashboard's API routes: never cached. */
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

/** `{ error }` reply with a stable code the browser can map to a message. */
export const fail = (status: number, error: string) => json({ error }, status);
