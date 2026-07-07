import "server-only";
import { type Division } from "@/lib/mock-data";

/** The `teams.category` / bracket table column values — distinct from the
 * app's internal `Division` type ('standards'/'open'), which predates this
 * live wiring and is left as-is to avoid a sweeping rename. */
export type DbCategory = "standard" | "open";

export function toDbCategory(division: Division): DbCategory {
  switch (division) {
    case "standards": return "standard";
    case "open": return "open";
    default: {
      const exhaustive: never = division;
      throw new Error(`Unknown division: ${exhaustive}`);
    }
  }
}

export function fromDbCategory(category: string): Division {
  switch (category) {
    case "standard": return "standards";
    case "open": return "open";
    default: throw new Error(`Unknown team category from database: "${category}"`);
  }
}
