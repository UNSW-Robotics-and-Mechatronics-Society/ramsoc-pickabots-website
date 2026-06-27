export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Covers the ShaderBackground (-z-10) with the sumobots gears style */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[9] bg-black"
        style={{ backgroundImage: "url('/background_gears.svg')" }}
      />
      {children}
    </>
  );
}
