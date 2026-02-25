import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * State used by the keyboard navigation handler.
 * Extracted as a plain interface so the core logic can be tested
 * without DOM / React dependencies.
 */
export interface KeyboardNavState {
  /** Total number of items in the log list */
  totalItems: number;
  /** Currently selected index (-1 = no selection) */
  selectedIndex: number;
  /** Whether the detail panel is currently open */
  isDetailOpen: boolean;
  /** Callback to change the selected index */
  onSelectIndex: (index: number) => void;
  /** Callback to open the detail panel */
  onOpenDetail: () => void;
  /** Callback to close the detail panel */
  onCloseDetail: () => void;
  /** Callback to focus the search input */
  focusSearchInput: () => void;
  /** Whether an input or textarea element is currently focused */
  isInputFocused: boolean;
}

/**
 * Options accepted by the useKeyboardNav hook.
 * Mirrors the design document's KeyboardNavOptions interface.
 */
export interface KeyboardNavOptions {
  totalItems: number;
  selectedIndex: number;
  isDetailOpen: boolean;
  onSelectIndex: (index: number) => void;
  onOpenDetail: () => void;
  onCloseDetail: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

// ---------------------------------------------------------------------------
// Core handler (pure function, testable without DOM)
// ---------------------------------------------------------------------------

/**
 * Handle a keyboard event for log navigation.
 *
 * This function is intentionally extracted from the React hook so that
 * it can be unit-tested with plain objects (no jsdom required).
 */
export function handleKeyboardNav(
  event: { key: string; preventDefault: () => void },
  state: KeyboardNavState,
): void {
  // When an input/textarea is focused, disable all navigation shortcuts
  if (state.isInputFocused) {
    return;
  }

  switch (event.key) {
    // Move down: j / ArrowDown
    case "j":
    case "ArrowDown": {
      const next = state.selectedIndex + 1;
      if (next < state.totalItems) {
        state.onSelectIndex(next);
      }
      break;
    }

    // Move up: k / ArrowUp
    case "k":
    case "ArrowUp": {
      if (state.selectedIndex > 0) {
        state.onSelectIndex(state.selectedIndex - 1);
      }
      break;
    }

    // Open detail: Enter
    case "Enter": {
      if (state.selectedIndex >= 0) {
        state.onOpenDetail();
      }
      break;
    }

    // Close detail: Escape
    case "Escape": {
      if (state.isDetailOpen) {
        state.onCloseDetail();
      }
      break;
    }

    // Focus search: /
    case "/": {
      event.preventDefault();
      state.focusSearchInput();
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

/**
 * Hook that registers keyboard shortcuts for log list navigation.
 *
 * - j / ArrowDown: select next log
 * - k / ArrowUp: select previous log
 * - Enter: open detail panel for selected log
 * - Escape: close detail panel
 * - /: focus search bar
 *
 * All shortcuts are disabled when an input or textarea has focus.
 */
export function useKeyboardNav(options: KeyboardNavOptions): void {
  const {
    totalItems,
    selectedIndex,
    isDetailOpen,
    onSelectIndex,
    onOpenDetail,
    onCloseDetail,
    searchInputRef,
  } = options;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInputFocused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement;

      handleKeyboardNav(e, {
        totalItems,
        selectedIndex,
        isDetailOpen,
        onSelectIndex,
        onOpenDetail,
        onCloseDetail,
        focusSearchInput: () => {
          searchInputRef.current?.focus();
        },
        isInputFocused,
      });
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    totalItems,
    selectedIndex,
    isDetailOpen,
    onSelectIndex,
    onOpenDetail,
    onCloseDetail,
    searchInputRef,
  ]);
}
