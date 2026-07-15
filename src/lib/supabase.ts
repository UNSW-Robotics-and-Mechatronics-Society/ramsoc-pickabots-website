import { createClient } from "@supabase/supabase-js";

// Server-only client — never import into a Client Component
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export default supabase;
