import { notFound } from "next/navigation";
import DevGallery from "./DevGallery";

// Development-only component gallery. 404s in production so it's never exposed,
// even though the proxy exempts /dev from auth/standby.
export default function DevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevGallery />;
}
