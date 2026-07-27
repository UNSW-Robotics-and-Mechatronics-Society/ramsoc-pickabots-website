import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { getBracketState } from "@/lib/db/bracket";
import { getObsState } from "@/lib/db/obs";
import { ringLiveView } from "@/lib/schedule";
import { type Division } from "@/lib/mock-data";
import AdminKeyForm from "@/components/admin/AdminKeyForm";
import ControlPanel, { type RingInfo } from "@/components/obs/ControlPanel";

// The stream operator's phone page — every load must see the real current
// scene/override, never a cached snapshot they might then act against.
export const dynamic = "force-dynamic";

export const metadata = { title: "Stream Control — Pickabots" };

export default async function ControlPage() {
  let user;
  try {
    user = await currentUser();
  } catch {
    redirect("/voting"); // Clerk unreachable — fail safe, same as /admin
  }
  if (!isAdminUser(user)) {
    return <AdminKeyForm />;
  }

  const [obs, bracket] = await Promise.all([getObsState(), getBracketState()]);

  // Informational strip: what the bracket says is on each ring right now, per
  // division. The panel doesn't act on this — scene switching is by ring
  // number — it's context so the operator knows what camera they're cutting to.
  const live: Record<Division, RingInfo[]> = { standards: [], open: [] };
  for (const d of ["standards", "open"] as Division[]) {
    live[d] = ringLiveView(bracket.matches, bracket.schedules[d]).map((r, i) => ({
      ring: i + 1,
      active: r.active ? `${r.active.slotA.teamName} vs ${r.active.slotB.teamName}` : null,
      next: r.next ? `${r.next.slotA.teamName} vs ${r.next.slotB.teamName}` : null,
    }));
  }

  return <ControlPanel initialState={obs} live={live} />;
}
