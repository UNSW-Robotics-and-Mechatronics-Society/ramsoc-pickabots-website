"use server";

import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";

export type AdminKeyState = { error: string | null };
export type RedeemResult = { ok: boolean; error?: string };

/**
 * Core admin-grant logic shared by the /admin form and the profile-menu flow.
 * Validates the access code and, if correct, promotes the signed-in user to
 * the "admin" role in Clerk publicMetadata — no manual backend step required.
 */
async function grantAdmin(key: unknown): Promise<RedeemResult> {
  const expected = process.env.ADMIN_ACCESS_CODE;

  if (!expected) return { ok: false, error: "Admin access is not configured." };
  if (typeof key !== "string" || key !== expected) return { ok: false, error: "Incorrect key." };

  const { userId } = await auth();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { role: "admin" } });

  return { ok: true };
}

/** Form action for the /admin access gate — redirects into the dashboard on success. */
export async function submitAdminKey(
  _prevState: AdminKeyState,
  formData: FormData,
): Promise<AdminKeyState> {
  const result = await grantAdmin(formData.get("key"));
  if (!result.ok) return { error: result.error ?? "Something went wrong." };

  redirect("/admin");
}

/**
 * Client-callable variant used by the profile-menu "Become an admin" flow.
 * Returns a result instead of redirecting so the caller can update UI in place.
 */
export async function redeemAdminKey(key: string): Promise<RedeemResult> {
  return grantAdmin(key);
}
