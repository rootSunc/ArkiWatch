"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A retry control, preferred over the main region when a load has failed. */
const RETRY_SELECTOR = ".platform-error-retry, .platform-inline-warning-action";

const DATE_TRIGGER_SELECTOR = ".date-scope-trigger";

type ShellFocusOptions = {
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  isAssistantOpen: boolean;
  isScopePending: boolean;
  isPending: boolean;
  isLoadingView: boolean;
  selectedNavKey: string;
  selectedDate: string | null;
  selectedEventId: string | null;
  /** Any value that changes when the platform payload is replaced. */
  overviewRevision: unknown;
};

function visible(elements: Iterable<HTMLElement>): HTMLElement[] {
  return Array.from(elements).filter((element) => element.getClientRects().length > 0);
}

/**
 * Keyboard focus and inertness for the dashboard shell.
 *
 * The shell has several overlapping surfaces — a modal drawer, an assistant
 * panel, an event inspector, a scope transition — and each one has to say what
 * happens to focus and to the accessibility tree while it is open. Gathering
 * that here keeps the policy readable and stops it from being re-derived at
 * each call site.
 *
 * Returns the refs the shell must attach, plus two requests for a focus move
 * that can only happen once new data has rendered.
 */
export function useShellFocus({
  isMobileMenuOpen,
  onCloseMobileMenu,
  isAssistantOpen,
  isScopePending,
  isPending,
  isLoadingView,
  selectedNavKey,
  selectedDate,
  selectedEventId,
  overviewRevision,
}: ShellFocusOptions) {
  const mainContentRef = useRef<HTMLElement>(null);
  const dashboardAppRef = useRef<HTMLDivElement>(null);
  const scopeContentRef = useRef<HTMLDivElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const mobileNavigationButtonRef = useRef<HTMLButtonElement>(null);
  const eventDetailCloseRef = useRef<HTMLButtonElement>(null);
  const eventDetailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const assistantTopbarButtonRef = useRef<HTMLButtonElement>(null);
  const assistantNavButtonRef = useRef<HTMLButtonElement>(null);

  const mobileMenuWasOpenRef = useRef(false);
  const previousNavKeyRef = useRef(selectedNavKey);
  const restoreDateFocusRef = useRef(false);
  const retryFocusRef = useRef(false);

  const assistantFocusReturnRefs = useMemo(
    () => [assistantTopbarButtonRef, assistantNavButtonRef],
    [],
  );

  // Scope controls showing a superseded city or date leave the tab order until
  // the requested scope lands.
  useEffect(() => {
    const scopeContent = scopeContentRef.current;
    if (scopeContent) {
      scopeContent.inert = isScopePending;
    }

    return () => {
      if (scopeContent) {
        scopeContent.inert = false;
      }
    };
  }, [isScopePending]);

  // The drawer and the assistant are modal: whatever sits behind them leaves
  // both the accessibility tree and the tab order.
  useEffect(() => {
    const dashboardApp = dashboardAppRef.current;
    if (dashboardApp) {
      dashboardApp.inert = isMobileMenuOpen || isAssistantOpen;
    }

    const sideNavigation = mobileNavigationRef.current;
    if (sideNavigation) {
      sideNavigation.inert = isAssistantOpen;
    }

    return () => {
      if (dashboardApp) {
        dashboardApp.inert = false;
      }
      if (sideNavigation) {
        sideNavigation.inert = false;
      }
    };
  }, [isAssistantOpen, isMobileMenuOpen]);

  // A workspace change is a page change: the reader starts at the top of the
  // new main region.
  useEffect(() => {
    if (previousNavKeyRef.current === selectedNavKey) {
      return;
    }

    previousNavKeyRef.current = selectedNavKey;
    const frame = window.requestAnimationFrame(() => {
      const mainContent = mainContentRef.current;
      if (!mainContent) {
        return;
      }

      mainContent.scrollTo({ top: 0, left: 0, behavior: "auto" });
      mainContent.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNavKey]);

  // The drawer only exists below the desktop breakpoint.
  useEffect(() => {
    const desktopNavQuery = window.matchMedia("(min-width: 1024px)");

    function closeMobileMenuOnDesktop(): void {
      if (desktopNavQuery.matches) {
        onCloseMobileMenu();
      }
    }

    closeMobileMenuOnDesktop();
    desktopNavQuery.addEventListener("change", closeMobileMenuOnDesktop);
    return () => desktopNavQuery.removeEventListener("change", closeMobileMenuOnDesktop);
  }, [onCloseMobileMenu]);

  // Drawer focus trap, with focus returning to the button that opened it.
  useEffect(() => {
    if (!isMobileMenuOpen) {
      if (mobileMenuWasOpenRef.current && window.matchMedia("(max-width: 1023px)").matches) {
        mobileNavigationButtonRef.current?.focus();
      }
      mobileMenuWasOpenRef.current = false;
      return;
    }

    mobileMenuWasOpenRef.current = true;
    const navigation = mobileNavigationRef.current;
    if (!navigation) {
      return;
    }

    const focusable = () => visible(navigation.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    focusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseMobileMenu();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen, onCloseMobileMenu]);

  // A date change re-renders the scope controls, so focus returns to the
  // trigger only once the new scope has actually rendered.
  useEffect(() => {
    if (!restoreDateFocusRef.current || isPending || isScopePending || isLoadingView) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const dateTrigger = visible(
        document.querySelectorAll<HTMLElement>(DATE_TRIGGER_SELECTOR),
      )[0];
      if (!dateTrigger) {
        return;
      }

      restoreDateFocusRef.current = false;
      dateTrigger.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isLoadingView, isPending, isScopePending, selectedDate]);

  // A retry that fails again must still offer a reachable retry control.
  useEffect(() => {
    if (!retryFocusRef.current || isPending || isLoadingView) {
      return;
    }

    retryFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const retryButton = document.querySelector<HTMLButtonElement>(RETRY_SELECTOR);
      if (retryButton && !retryButton.disabled) {
        retryButton.focus();
        return;
      }

      mainContentRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isLoadingView, isPending, overviewRevision]);

  // The event inspector is a dialog: focus lands on its close button.
  useEffect(() => {
    if (!selectedEventId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => eventDetailCloseRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedEventId]);

  const requestDateFocusRestore = useCallback(() => {
    restoreDateFocusRef.current = true;
  }, []);

  const requestRetryFocus = useCallback(() => {
    retryFocusRef.current = true;
  }, []);

  const restoreEventDetailTriggerFocus = useCallback(() => {
    window.requestAnimationFrame(() => eventDetailTriggerRef.current?.focus());
  }, []);

  return {
    mainContentRef,
    dashboardAppRef,
    scopeContentRef,
    mobileNavigationRef,
    mobileNavigationButtonRef,
    eventDetailCloseRef,
    eventDetailTriggerRef,
    assistantTopbarButtonRef,
    assistantNavButtonRef,
    assistantFocusReturnRefs,
    requestDateFocusRestore,
    requestRetryFocus,
    restoreEventDetailTriggerFocus,
  };
}
