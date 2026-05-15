import { Suspense } from "react";
import { OrderWorkspace } from "./OrderWorkspace";

export default function PosOrderPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<p className="shrink-0 text-lg text-stone-500">Loading…</p>}>
        <OrderWorkspace />
      </Suspense>
    </div>
  );
}
