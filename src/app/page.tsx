import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* Hero glass card */}
      <section className="glass-strong flex flex-col gap-3 rounded-3xl p-6">
        <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-foreground/70">
          RAMSoc UNSW
        </span>
        <h1 className="text-4xl leading-tight">Pickabots</h1>
        <p className="text-sm text-foreground/70">
          Design, build, and battle. The Pickabots competition is coming — get
          your team ready.
        </p>
        <Link
          href="/sign-up"
          className="mt-2 w-fit rounded-full bg-white/90 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white"
        >
          Register your team
        </Link>
      </section>

      {/* Placeholder content blocks — the MVP will fill these in */}
      <section className="glass flex flex-col gap-2 rounded-3xl p-5">
        <h2 className="text-lg">What is Pickabots?</h2>
        <p className="text-sm text-foreground/70">
          A robotics competition run by the UNSW Robotics &amp; Mechatronics
          Society. More details, schedule, and rules drop here soon.
        </p>
      </section>

      <section className="glass flex flex-col gap-2 rounded-3xl p-5">
        <h2 className="text-lg">Get started</h2>
        <p className="text-sm text-foreground/70">
          Sign in to manage your team and registration from the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="mt-1 w-fit rounded-full border border-white/20 px-4 py-2 text-sm transition-colors hover:bg-white/10"
        >
          Go to dashboard →
        </Link>
      </section>
    </div>
  );
}
