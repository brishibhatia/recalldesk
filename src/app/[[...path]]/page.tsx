import { Suspense } from "react";
import { RecallDesk } from "@/components/recall-desk";
import { mode } from "@/server/config";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Suspense fallback={<main className="loading">Opening RecallDesk…</main>}>
      <RecallDesk mode={mode()} />
    </Suspense>
  );
}
