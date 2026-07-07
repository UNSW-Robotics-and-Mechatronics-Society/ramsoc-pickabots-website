"use server";

import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";

export type AdminKeyState = { error: string | null };

export async function submitAdminKey(
  _prevState: AdminKeyState,
  formData: FormData,
): Promise<AdminKeyState> {
  const key = formData.get("key");
  const expected = process.env.ADMIN_ACCESS_CODE;

  if (!expected) return { error: "Admin access is not configured." };
  if (typeof key !== "string" || key !== expected) return { error: "Incorrect key." };

  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in." };

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { role: "admin" } });

  redirect("/admin");
}
