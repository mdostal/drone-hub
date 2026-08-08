import { submitPasscode } from "./actions";
import { sanitizeNextPath } from "@/lib/gate";

// Minimal passcode-entry form. No styling polish — this is the functional
// gate for /tours/*, not a marketing surface. See middleware.ts + lib/gate.ts.
export default async function EnterPasscodePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  const hasError = params.error === "1";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={submitPasscode} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-lg font-medium">Enter passcode</h1>
        <input type="hidden" name="next" value={nextPath} />
        <input
          type="password"
          name="passcode"
          placeholder="Passcode"
          aria-label="Passcode"
          autoFocus
          required
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded border px-3 py-2">
          Continue
        </button>
        {hasError && (
          <p role="alert" className="text-sm text-red-600">
            Incorrect passcode — try again.
          </p>
        )}
      </form>
    </main>
  );
}
