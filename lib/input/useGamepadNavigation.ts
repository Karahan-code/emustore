"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { playUiSound } from "@/lib/audio/ui-sfx";
import { SEARCH_TOGGLE_EVENT } from "@/lib/input/events";

type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";
const QUICK_CATALOG_EVENT = "emustore:section-step";
const NAVIGATION_REPEAT_MS = 230;
const AXIS_THRESHOLD = 0.55;

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(EDITABLE_SELECTOR);
}

function getFocusableElements(): HTMLElement[] {
  const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const scope: ParentNode = modal ?? document;
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true",
  );
}

function moveFocus(direction: Direction): void {
  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeIndex = active ? focusable.indexOf(active) : -1;
  if (activeIndex < 0) {
    (direction === "left" || direction === "up" ? focusable.at(-1) : focusable[0])?.focus();
    return;
  }

  const currentRect = focusable[activeIndex].getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;
  let next: HTMLElement | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of focusable) {
    if (candidate === active) continue;

    const rect = candidate.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const primary = direction === "left" || direction === "right" ? Math.abs(x - currentX) : Math.abs(y - currentY);
    const secondary = direction === "left" || direction === "right" ? Math.abs(y - currentY) : Math.abs(x - currentX);
    const isInDirection = direction === "left" ? x < currentX : direction === "right" ? x > currentX : direction === "up" ? y < currentY : y > currentY;
    if (!isInDirection) continue;

    const score = primary + secondary * 1.8;
    if (score < bestScore) {
      bestScore = score;
      next = candidate;
    }
  }

  if (next) {
    next.focus();
    return;
  }

  const currentPosition = activeIndex;
  const wrappedPosition = currentPosition + (direction === "left" || direction === "up" ? -1 : 1);
  const wrapped = (wrappedPosition + focusable.length) % focusable.length;
  focusable[wrapped]?.focus();
}

function goBack(): void {
  const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const closeControl = modal?.querySelector<HTMLElement>("[data-gamepad-close]")
    ?? document.querySelector<HTMLElement>("[data-gamepad-close]");
  if (closeControl) {
    closeControl.click();
    return;
  }

  if (document.activeElement instanceof HTMLElement && isEditableTarget(document.activeElement)) {
    playUiSound("back");
    document.activeElement.blur();
    return;
  }

  const backControl = document.querySelector<HTMLElement>("[data-gamepad-back]");
  if (backControl) {
    backControl.click();
    return;
  }

  if (window.history.length > 1) {
    playUiSound("back");
    window.history.back();
  }
}

function activateFocusedElement(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.click();
}

function activateSelectedFavorite(): void {
  const active = document.activeElement;
  const modal = active instanceof Element ? active.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') : null;
  const scope: ParentNode = modal ?? document;
  if (active instanceof Element) {
    const ownFavorite = active.matches("[data-gamepad-favorite]")
      ? active
      : active.closest("[data-gamepad-item]")?.querySelector("[data-gamepad-favorite]");
    if (ownFavorite instanceof HTMLElement) {
      ownFavorite.click();
      return;
    }
  }

  scope.querySelector<HTMLElement>("[data-gamepad-favorite]")?.click();
}

function dispatchCatalogStep(delta: -1 | 1): void {
  window.dispatchEvent(new CustomEvent(QUICK_CATALOG_EVENT, { detail: { delta } }));
}

function directionFromPad(pad: Gamepad): Direction | null {
  const buttonDirections: Array<[number, Direction]> = [
    [12, "up"],
    [13, "down"],
    [14, "left"],
    [15, "right"],
  ];
  const dpadDirection = buttonDirections.find(([index]) => pad.buttons[index]?.pressed)?.[1];
  if (dpadDirection) return dpadDirection;

  const xAxis = pad.axes[0] ?? 0;
  const yAxis = pad.axes[1] ?? 0;
  if (Math.abs(xAxis) > Math.abs(yAxis) && Math.abs(xAxis) > AXIS_THRESHOLD) {
    return xAxis < 0 ? "left" : "right";
  }
  if (Math.abs(yAxis) > AXIS_THRESHOLD) return yAxis < 0 ? "up" : "down";
  return null;
}

export function useGamepadNavigation(): void {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let animationFrame = 0;
    let lastDirection: Direction | null = null;
    let lastMoveAt = 0;
    const pressedButtons = new Set<string>();

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector("[data-gamepad-close]")) {
          event.preventDefault();
          goBack();
        } else if (isEditableTarget(event.target)) {
          playUiSound("back");
          (event.target as HTMLElement).blur();
        } else {
          event.preventDefault();
          goBack();
        }
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
        if (event.key.toLowerCase() === "q" || event.key === "/") {
          event.preventDefault();
          window.dispatchEvent(new Event(SEARCH_TOGGLE_EVENT));
          return;
        }
        if (event.key === ",") {
          event.preventDefault();
          const locale = pathname.split("/")[1] === "tr" ? "tr" : "en";
          const settingsPath = "/" + locale + "/settings";
          if (pathname === settingsPath) {
            playUiSound("back");
            if (window.history.length > 1) router.back();
            else router.push("/" + locale + "?view=discover&platform=ps1");
          } else {
            playUiSound("confirm");
            router.push(settingsPath);
          }
          return;
        }
      }

      const directions: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const direction = directions[event.key];
      if (!direction || isEditableTarget(event.target)) return;

      event.preventDefault();
      moveFocus(direction);
    };

    const pressed = (pad: Gamepad, index: number): boolean =>
      pad.buttons[index]?.pressed ?? false;

    const justPressed = (pad: Gamepad, index: number): boolean => {
      const key = `${pad.index}:${index}`;
      const isDown = pressed(pad, index);
      const wasDown = pressedButtons.has(key);
      if (isDown) pressedButtons.add(key);
      else pressedButtons.delete(key);
      return isDown && !wasDown;
    };

    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find((candidate) => candidate?.connected);
      if (!pad) {
        pressedButtons.clear();
        lastDirection = null;
        animationFrame = 0;
        return;
      }

      const direction = directionFromPad(pad);
      const now = performance.now();
      if (
        direction &&
        !isEditableTarget(document.activeElement) &&
        (direction !== lastDirection || now - lastMoveAt >= NAVIGATION_REPEAT_MS)
      ) {
        moveFocus(direction);
        lastDirection = direction;
        lastMoveAt = now;
      }
      if (!direction) lastDirection = null;

      if (justPressed(pad, 0)) activateFocusedElement();
      if (justPressed(pad, 1)) goBack();
      if (justPressed(pad, 2)) activateSelectedFavorite();
      if (justPressed(pad, 3)) window.dispatchEvent(new Event(SEARCH_TOGGLE_EVENT));
      if (justPressed(pad, 4)) dispatchCatalogStep(-1);
      if (justPressed(pad, 5)) dispatchCatalogStep(1);
      if (justPressed(pad, 9)) {
        const locale = pathname.split("/")[1] === "tr" ? "tr" : "en";
        const settingsPath = "/" + locale + "/settings";
        if (pathname === settingsPath) {
          playUiSound("back");
          if (window.history.length > 1) router.back();
          else router.push("/" + locale + "?view=discover&platform=ps1");
        } else {
          playUiSound("confirm");
          router.push(settingsPath);
        }
      }
      animationFrame = window.requestAnimationFrame(poll);
    };

    const startPolling = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(poll);
    };
    const onGamepadConnected = () => startPolling();

    document.addEventListener("keydown", keyDown);
    window.addEventListener("gamepadconnected", onGamepadConnected);
    window.addEventListener("gamepaddisconnected", onGamepadConnected);
    if (typeof navigator.getGamepads === "function" && Array.from(navigator.getGamepads()).some((pad) => pad?.connected)) {
      startPolling();
    }

    return () => {
      document.removeEventListener("keydown", keyDown);
      window.removeEventListener("gamepadconnected", onGamepadConnected);
      window.removeEventListener("gamepaddisconnected", onGamepadConnected);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [pathname, router]);
}
