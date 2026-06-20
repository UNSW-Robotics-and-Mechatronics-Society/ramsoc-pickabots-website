import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { type Division } from "@/lib/mock-data";
import AdminPageClient from "@/components/admin/AdminPageClient";

type Props = {
  searchParams: Promise<{ division?: string }>;
};

export default async function AdminPage({ searchParams }: Props) {
  const user = await currentUser();

  if (!isAdminUser(user)) {
    redirect("/bid");
  }

  const { division: raw } = await searchParams;
  const division: Division = raw === "open" ? "open" : "standards";

  return (
    <div className="fixed inset-0 z-20 flex flex-col pt-6 pb-24">
      <header className="shrink-0 px-6 pb-3">
        <h1 className="text-2xl">Admin</h1>
        <p className="text-xs text-foreground/50">
          {division === "standards" ? "Standards" : "Open"} division
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <AdminPageClient division={division} />
      </div>
    </div>
  );
}
