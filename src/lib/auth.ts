export function isAdminUser(
  user: { publicMetadata?: Record<string, unknown> } | null | undefined,
): boolean {
  return user?.publicMetadata?.['role'] === 'admin';
}
