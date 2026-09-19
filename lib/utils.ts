import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combines conditional classes without changing legacy CSS selectors. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
