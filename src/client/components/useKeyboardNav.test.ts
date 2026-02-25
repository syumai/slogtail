import { describe, it, expect, vi } from "vitest";
import { handleKeyboardNav, type KeyboardNavState } from "./useKeyboardNav";

// ---------------------------------------------------------------------------
// Helper to create a minimal KeyboardNavState
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<KeyboardNavState> = {}): KeyboardNavState {
  return {
    totalItems: 10,
    selectedIndex: -1,
    isDetailOpen: false,
    onSelectIndex: vi.fn(),
    onOpenDetail: vi.fn(),
    onCloseDetail: vi.fn(),
    focusSearchInput: vi.fn(),
    isInputFocused: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper to create a minimal KeyboardEvent-like object
// ---------------------------------------------------------------------------

function makeKeyEvent(key: string): {
  key: string;
  preventDefault: () => void;
} {
  return {
    key,
    preventDefault: vi.fn() as unknown as () => void,
  };
}

// ---------------------------------------------------------------------------
// j / ArrowDown - move selection down
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - j/ArrowDown (move down)", () => {
  it("moves selection from -1 to 0 on 'j' key", () => {
    const state = makeState({ selectedIndex: -1 });
    const event = makeKeyEvent("j");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).toHaveBeenCalledWith(0);
  });

  it("moves selection from 0 to 1 on 'j' key", () => {
    const state = makeState({ selectedIndex: 0 });
    const event = makeKeyEvent("j");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).toHaveBeenCalledWith(1);
  });

  it("moves selection down on ArrowDown key", () => {
    const state = makeState({ selectedIndex: 3 });
    const event = makeKeyEvent("ArrowDown");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).toHaveBeenCalledWith(4);
  });

  it("does not move below the last item", () => {
    const state = makeState({ selectedIndex: 9, totalItems: 10 });
    const event = makeKeyEvent("j");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });

  it("does not move when totalItems is 0", () => {
    const state = makeState({ selectedIndex: -1, totalItems: 0 });
    const event = makeKeyEvent("j");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// k / ArrowUp - move selection up
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - k/ArrowUp (move up)", () => {
  it("moves selection from 5 to 4 on 'k' key", () => {
    const state = makeState({ selectedIndex: 5 });
    const event = makeKeyEvent("k");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).toHaveBeenCalledWith(4);
  });

  it("moves selection up on ArrowUp key", () => {
    const state = makeState({ selectedIndex: 3 });
    const event = makeKeyEvent("ArrowUp");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).toHaveBeenCalledWith(2);
  });

  it("does not move above index 0", () => {
    const state = makeState({ selectedIndex: 0 });
    const event = makeKeyEvent("k");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });

  it("does not move when selectedIndex is -1 (no selection)", () => {
    const state = makeState({ selectedIndex: -1 });
    const event = makeKeyEvent("k");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Enter - open detail panel
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - Enter (open detail)", () => {
  it("calls onOpenDetail when a row is selected", () => {
    const state = makeState({ selectedIndex: 3 });
    const event = makeKeyEvent("Enter");
    handleKeyboardNav(event, state);
    expect(state.onOpenDetail).toHaveBeenCalled();
  });

  it("does not call onOpenDetail when no row is selected", () => {
    const state = makeState({ selectedIndex: -1 });
    const event = makeKeyEvent("Enter");
    handleKeyboardNav(event, state);
    expect(state.onOpenDetail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Escape - close detail panel
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - Escape (close detail)", () => {
  it("calls onCloseDetail when detail is open", () => {
    const state = makeState({ isDetailOpen: true, selectedIndex: 3 });
    const event = makeKeyEvent("Escape");
    handleKeyboardNav(event, state);
    expect(state.onCloseDetail).toHaveBeenCalled();
  });

  it("does not call onCloseDetail when detail is closed", () => {
    const state = makeState({ isDetailOpen: false });
    const event = makeKeyEvent("Escape");
    handleKeyboardNav(event, state);
    expect(state.onCloseDetail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// / - focus search bar
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - / (focus search)", () => {
  it("calls focusSearchInput on '/' key", () => {
    const state = makeState();
    const event = makeKeyEvent("/");
    handleKeyboardNav(event, state);
    expect(state.focusSearchInput).toHaveBeenCalled();
  });

  it("calls preventDefault on '/' key to prevent browser search", () => {
    const state = makeState();
    const event = makeKeyEvent("/");
    handleKeyboardNav(event, state);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Input focused - shortcuts disabled
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - input focused (shortcuts disabled)", () => {
  it("does not handle 'j' when input is focused", () => {
    const state = makeState({ isInputFocused: true, selectedIndex: 0 });
    const event = makeKeyEvent("j");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });

  it("does not handle 'k' when input is focused", () => {
    const state = makeState({ isInputFocused: true, selectedIndex: 5 });
    const event = makeKeyEvent("k");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });

  it("does not handle ArrowDown when input is focused", () => {
    const state = makeState({ isInputFocused: true, selectedIndex: 0 });
    const event = makeKeyEvent("ArrowDown");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });

  it("does not handle ArrowUp when input is focused", () => {
    const state = makeState({ isInputFocused: true, selectedIndex: 5 });
    const event = makeKeyEvent("ArrowUp");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
  });

  it("does not handle Enter when input is focused", () => {
    const state = makeState({ isInputFocused: true, selectedIndex: 3 });
    const event = makeKeyEvent("Enter");
    handleKeyboardNav(event, state);
    expect(state.onOpenDetail).not.toHaveBeenCalled();
  });

  it("does not handle Escape when input is focused", () => {
    const state = makeState({
      isInputFocused: true,
      isDetailOpen: true,
      selectedIndex: 3,
    });
    const event = makeKeyEvent("Escape");
    handleKeyboardNav(event, state);
    expect(state.onCloseDetail).not.toHaveBeenCalled();
  });

  it("does not handle '/' when input is focused", () => {
    const state = makeState({ isInputFocused: true });
    const event = makeKeyEvent("/");
    handleKeyboardNav(event, state);
    expect(state.focusSearchInput).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unrelated keys - no action
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - unrelated keys", () => {
  it("does not call any callback for unrelated keys", () => {
    const state = makeState({ selectedIndex: 3 });
    const event = makeKeyEvent("a");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).not.toHaveBeenCalled();
    expect(state.onOpenDetail).not.toHaveBeenCalled();
    expect(state.onCloseDetail).not.toHaveBeenCalled();
    expect(state.focusSearchInput).not.toHaveBeenCalled();
  });

  it("does not call preventDefault for unrelated keys", () => {
    const state = makeState();
    const event = makeKeyEvent("a");
    handleKeyboardNav(event, state);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Detail panel open - j/k still works for navigation
// ---------------------------------------------------------------------------

describe("handleKeyboardNav - detail open + navigation", () => {
  it("allows j to move down while detail is open", () => {
    const state = makeState({
      selectedIndex: 2,
      isDetailOpen: true,
    });
    const event = makeKeyEvent("j");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).toHaveBeenCalledWith(3);
  });

  it("allows k to move up while detail is open", () => {
    const state = makeState({
      selectedIndex: 5,
      isDetailOpen: true,
    });
    const event = makeKeyEvent("k");
    handleKeyboardNav(event, state);
    expect(state.onSelectIndex).toHaveBeenCalledWith(4);
  });
});
