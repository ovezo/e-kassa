import { redirect } from "next/navigation";

/** Reception default: open orders (no separate home screen). */
export default function PosRootPage() {
  redirect("/pos/open");
}
