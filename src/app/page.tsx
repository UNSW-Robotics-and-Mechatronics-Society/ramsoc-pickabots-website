import { redirect } from "next/navigation";

// The app's home is the live Bid page (auth-gated in proxy.ts).
export default function Home() {
  redirect("/bid");
}
