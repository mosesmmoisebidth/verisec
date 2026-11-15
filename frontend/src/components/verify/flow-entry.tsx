"use client";

import { useEffect, useLayoutEffect } from "react";

/** Position of the step last shown. Module state survives client navigation. */
let lastOrder: number | null = null;

/**
 * Flow motion markers on `<html>` (which survives client navigation):
 *
 * - `data-vs-entered`: set once the first entrance has played. Later steps skip
 *   the card slide-in and staggered rise, so the blurred card stays put.
 * - `data-vs-dir`: `fwd` or `back`, from this step's position against the last
 *   one. CSS slides the new step in from the right on Continue and from the left
 *   on Back. Set in a layout effect, before the browser paints the new step, so
 *   its animation starts with the right direction.
 *
 * Both are set only on the client, after hydration, so server HTML never differs.
 */
export function FlowEntry({ order }: { order: number }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (lastOrder !== null && order !== lastOrder) {
      root.dataset.vsDir = order > lastOrder ? "fwd" : "back";
    } else {
      delete root.dataset.vsDir;
    }
    lastOrder = order;
  }, [order]);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.vsEntered) return;
    const t = window.setTimeout(() => {
      root.dataset.vsEntered = "1";
    }, 700);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
