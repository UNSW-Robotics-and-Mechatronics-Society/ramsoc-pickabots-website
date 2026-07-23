"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { UserButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, LayoutDashboard, Eye, EyeOff } from "lucide-react";
import { redeemAdminKey, demoteFromAdmin } from "@/app/admin/actions";

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
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [demotePending, setDemotePending] = useState(false);
  const [demoteError, setDemoteError] = useState<string | null>(null);

  const isAdmin = user?.publicMetadata?.role === "admin";

  function openModal() {
    setKey("");
    setShowKey(false);
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

  async function handleDemote() {
    setDemotePending(true);
    setDemoteError(null);

    const result = await demoteFromAdmin();

    if (!result.ok) {
      setDemotePending(false);
      setDemoteError(result.error ?? "Something went wrong.");
      return;
    }

    // Refresh the cached Clerk user so publicMetadata.role reflects the
    // revoked role, then leave the now-inaccessible admin area.
    await user?.reload();
    setDemotePending(false);
    router.push("/voting");
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

        {isLoaded && isAdmin && (
          <UserButton.UserProfilePage
            label="Admin"
            url="admin-access"
            labelIcon={<ShieldCheck className="h-4 w-4" />}
          >
            <div className="px-1 py-2">
              <h1 className="text-base font-semibold">Admin access</h1>
              <p className="mt-1 text-sm text-foreground/60">
                You currently have admin access. You can revoke it at any
                time — you&apos;ll be able to re-enter the admin key to
                become an admin again later.
              </p>
              {demoteError && (
                <p className="mt-3 text-sm text-red-400">{demoteError}</p>
              )}
              <button
                type="button"
                onClick={handleDemote}
                disabled={demotePending}
                className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                <ShieldOff className="h-4 w-4" />
                {demotePending ? "Removing…" : "Demote from admin"}
              </button>
            </div>
          </UserButton.UserProfilePage>
        )}
      </UserButton>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-200 overflow-y-auto bg-black/60 backdrop-blur-sm"
            onClick={() => !pending && setOpen(false)}
          >
            <div className="flex min-h-full items-center justify-center px-6 py-10">
              <form
                onClick={(e) => e.stopPropagation()}
                onSubmit={handleSubmit}
                className="glass flex w-full max-w-xs flex-col gap-3 rounded-2xl p-6"
              >
                <h2 className="text-center text-lg font-semibold">Admin Access</h2>
                <p className="text-center text-sm text-foreground/60">
                  Enter the admin key to unlock the admin dashboard.
                </p>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    required
                    autoFocus
                    placeholder="Admin key"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-9 text-sm outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Hide admin key" : "Show admin key"}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-foreground/40 transition-colors hover:text-foreground/80"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
          </div>,
          document.body,
        )}
    </>
  );
}
