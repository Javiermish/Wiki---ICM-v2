"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  subscribeToTheme,
  toggleTheme,
} from "@/lib/theme";

export function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="min-h-11 min-w-11"
      aria-label="Tema oscuro"
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      <Moon aria-hidden="true" className="size-5 dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-5 dark:block" />
    </Button>
  );
}
