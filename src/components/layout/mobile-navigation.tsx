"use client";

import { Menu, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type NavigationLink = Readonly<{ href: string; label: string }>;

export function MobileNavigation({
  links,
}: {
  links: readonly NavigationLink[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const navigationId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeAndFocusTrigger() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function followLink(href: string) {
    const target = document.getElementById(href.split("#")[1] ?? "");
    if (target) {
      // Move focus out of the panel before hiding its links. Native navigation
      // still updates the URL and scrolls to the chosen section.
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
        target.addEventListener(
          "blur",
          () => target.removeAttribute("tabindex"),
          { once: true },
        );
      }
      target.focus({ preventScroll: true });
      setIsOpen(false);
    } else {
      closeAndFocusTrigger();
    }
  }

  return (
    <div
      className="md:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          closeAndFocusTrigger();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Navegación principal"
        aria-expanded={isOpen}
        aria-controls={navigationId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <Menu aria-hidden="true" className="size-5" />
        )}
      </Button>
      <nav
        id={navigationId}
        aria-label="Navegación principal móvil"
        hidden={!isOpen}
        className={`${isOpen ? "block" : "hidden"} absolute inset-x-0 top-full z-20 border-b border-border bg-background shadow-sm`}
      >
        <ul className="page-container space-y-1 py-3">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted"
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) return;
                  followLink(link.href);
                }}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
