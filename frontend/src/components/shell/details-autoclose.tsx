"use client";

import { useEffect } from "react";

/**
 * Closes every open `<details>` menu (the ⋯ actions menu, the topbar bell and
 * account popovers) when you click anywhere outside it, or press Escape.
 *
 * Native `<details>` only toggles from its own summary — it has no notion of an
 * outside click — so a menu left open stays open until you click its summary
 * again. This one document-level listener gives all of them the dismiss-on-
 * outside-click behaviour a dropdown is expected to have, without turning each
 * menu into a stateful client component. Mounted once in the console shell.
 *
 * Expandable cards (a webhook endpoint, an integration's channel) are `<details>`
 * too but are not menus: they carry `data-keep-open` and are left alone, so
 * clicking a control below an open card does not collapse it under the pointer.
 */
export function DetailsAutoClose() {
  useEffect(() => {
    const closeOthers = (target: Node | null) => {
      for (const el of document.querySelectorAll<HTMLDetailsElement>("details[open]:not([data-keep-open])")) {
        if (!target || !el.contains(target)) el.open = false;
      }
    };
    const onPointerDown = (e: PointerEvent) => closeOthers(e.target as Node);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOthers(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
