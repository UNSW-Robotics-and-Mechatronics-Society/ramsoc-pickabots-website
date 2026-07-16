"use client";

import { useState } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { ShieldCheck, LayoutDashboard } from "lucide-react";
import { redeemAdminKey } from "@/app/admin/actions";

/**
 * Clerk profile button with a self-service admin flow baked into its menu:
 *  - non-admins get a "Become an admin" action that prompts for the access code
 *  - existing admins get a quick link straight to the dashboard
 *
 * Accepts the same appearance overrides so callers can size the avatar.
 */
export default function AdminUserButton({
  appearance,
}: {
  appearance?: React.ComponentProps<typeof UserButton>["appearance"];
}) {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isAdmin = user?.publicMetadata?.role === "admin";

  function openModal() {
    setKey("");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const result = await redeemAdminKey(key);

    if (!result.ok) {
      setPending(false);
      setError(result.error ?? "Something went wrong.");
      return;
    }

    // Refresh the cached Clerk user so publicMetadata.role reflects the new
    // role, then head into the dashboard.
    await user?.reload();
    setPending(false);
    setOpen(false);
    router.push("/admin");
  }

  return (
    <>
      <UserButton appearance={appearance}>
        <UserButton.MenuItems>
          {isLoaded && isAdmin ? (
            <UserButton.Link
              label="Admin dashboard"
              labelIcon={<LayoutDashboard className="h-4 w-4" />}
              href="/admin"
            />
          ) : (
            <UserButton.Action
              label="Become an admin"
              labelIcon={<ShieldCheck className="h-4 w-4" />}
              onClick={openModal}
            />
          )}
        </UserButton.MenuItems>
      </UserButton>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          onClick={() => !pending && setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="glass flex w-full max-w-xs flex-col gap-3 rounded-2xl p-6"
          >
            <h2 className="text-center text-lg font-semibold">Admin Access</h2>
            <p className="text-center text-sm text-foreground/60">
              Enter the admin key to unlock the admin dashboard.
            </p>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              autoFocus
              placeholder="Admin key"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            {error && <p className="text-center text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/15 disabled:opacity-50"
            >
              {pending ? "Checking…" : "Enter"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="text-center text-xs text-foreground/40 transition-colors hover:text-foreground/70 disabled:opacity-50"
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </>
  );
}
