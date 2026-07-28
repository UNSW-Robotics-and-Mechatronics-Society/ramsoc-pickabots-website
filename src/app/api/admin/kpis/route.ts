import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { getKpis } from "@/lib/db/kpis";
import { safeErrorMessage } from "@/lib/safe-error-message";

// GET → headline stats for the admin Settings panel's KPI header.
export async function GET() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const kpis = await getKpis();
    return NextResponse.json(kpis);
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to load stats") }, { status: 500 });
  }
}
