import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { type Division } from "@/lib/mock-data";
import { listTeams } from "@/lib/db/teams";
import { getBracketState } from "@/lib/db/bracket";
import AdminPageClient from "@/components/admin/AdminPageClient";
import AdminNavBar from "@/components/admin/AdminNavBar";
import AdminKeyForm from "@/components/admin/AdminKeyForm";

type Props = {
  searchParams: Promise<{ division?: string }>;
};

export default async function AdminPage({ searchParams }: Props) {
  let user;
  try {
    user = await currentUser();
  } catch {
    // Clerk API unreachable (e.g. network error in dev) — fail safe
    redirect("/voting");
  }

  if (!isAdminUser(user)) {
    return <AdminKeyForm />;
  }

  const { division: raw } = await searchParams;
  const division: Division = raw === "open" ? "open" : "standards";

  const [teams, bracket] = await Promise.all([listTeams(), getBracketState()]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col">
      {/* Header row — aligns with the AdminSidePanel's division toggle (top-6) */}
      <header className="shrink-0 flex items-center gap-4 px-6 pt-6 pb-2">
        <span className="text-lg font-semibold uppercase tracking-widest text-foreground/80">
          Admin
        </span>
        <AdminNavBar />
      </header>

      {/*
        pt-12 clears the AdminSidePanel's second row (view toggle) which sits
        below the division toggle that aligns with the header row above.
      */}
      <div className="min-h-0 flex-1 pt-12">
        <AdminPageClient division={division} initialTeams={teams} initialBracket={bracket} />
      </div>
    </div>
  );
}
