import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combine clsx + tailwind-merge for conditional, conflict-free class names. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
