import { useState } from "react";
import { currentTheme, saveTheme, type Theme } from "../lib/theme";

/** The page theme and a toggle. Light unless the visitor picked dark. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };
  return [theme, toggle];
}
