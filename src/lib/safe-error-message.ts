import "server-only";

const MAX_LENGTH = 300;

/**
 * Turns a caught error into a short, safe string for an API's JSON error
 * response. Guards against upstreams (Supabase, ClickSend, ...) that fail by
 * returning an HTML error page instead of JSON — some client libraries stuff
 * that whole body into `error.message`, which would otherwise get rendered
 * verbatim in the UI and blow out the layout.
 */
export function safeErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : fallback;
  const looksLikeHtml = /<\s*(!doctype|html|body|head)\b/i.test(message);
  if (looksLikeHtml) return `${fallback} (upstream returned an error page — check its status)`;
  return message.length > MAX_LENGTH ? `${message.slice(0, MAX_LENGTH)}…` : message;
}
