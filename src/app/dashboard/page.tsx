import { currentUser } from "@clerk/nextjs/server";

// Protected by proxy.ts — an unauthenticated request never reaches here.
export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div className="flex flex-1 flex-col gap-5">
      <section className="glass-strong flex flex-col gap-2 rounded-3xl p-6">
        <h1 className="text-3xl">Dashboard</h1>
        <p className="text-sm text-foreground/70">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}. Team management
          lands here in the MVP.
        </p>
      </section>

      <section className="glass flex flex-col gap-2 rounded-3xl p-5">
        <h2 className="text-lg">Your team</h2>
        <p className="text-sm text-foreground/70">
          Nothing here yet — registration and team tools are coming next.
        </p>
      </section>
    </div>
  );
}
