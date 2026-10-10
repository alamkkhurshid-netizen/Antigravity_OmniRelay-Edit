import { clsx, type ClassValue } from "clsx";

/** Combines conditional classes without changing legacy CSS selectors. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

