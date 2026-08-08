"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  GATE_COOKIE,
  GATE_COOKIE_MAX_AGE_SECONDS,
  isCorrectPasscode,
  sanitizeNextPath,
} from "@/lib/gate";

// Server action backing the minimal passcode form at app/enter-passcode/page.tsx.
// Correct passcode -> set the gate cookie, redirect into the originally
// requested /tours/* path. Incorrect -> redirect back to the form with an
// error flag; no cookie is set, so /tours/* stays blocked.
export async function submitPasscode(formData: FormData) {
  const passcode = String(formData.get("passcode") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? ""));

  if (!isCorrectPasscode(passcode)) {
    redirect(`/enter-passcode?next=${encodeURIComponent(nextPath)}&error=1`);
  }

  const cookieStore = await cookies();
  cookieStore.set(GATE_COOKIE, passcode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GATE_COOKIE_MAX_AGE_SECONDS,
  });

  redirect(nextPath);
}
