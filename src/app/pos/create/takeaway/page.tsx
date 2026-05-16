import { redirect } from "next/navigation";

/** Pick-up / delivery are chosen on `/pos/create`; keep old URL working. */
export default function PosCreateTakeawayRedirectPage() {
  redirect("/pos/create");
}
