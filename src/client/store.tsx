import { useState, useCallback, useMemo, createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { LogLevel } from "../types";

// ---------------------------------------------------------------------------
// Filter State
// ---------------------------------------------------------------------------

export interface FilterState {
  search?: string;
  level: LogLevel[];
  service: string[];
  host: string[];
  source: string[];
  startTime?: Date;
  endTime?: Date;
  limit: number;
  offset: number;
  order: "asc" | "desc";
  isLiveTail: boolean;
  /** Custom facet filters: jsonPath -> selected values (OR within same key) */
  jsonFilters: Record<string, string[]>;
}

const DEFAULT_FILTER_STATE: FilterState = {
  level: [],
  service: [],
  host: [],
  source: [],
  limit: 200,
  offset: 0,
  order: "desc",
  isLiveTail: true,
  jsonFilters: {},
};

// ---------------------------------------------------------------------------
// Filter Actions
// ---------------------------------------------------------------------------

export interface FilterActions {
  setSearch(search: string | undefined): void;
  setLevel(level: LogLevel | undefined): void;
  toggleLevel(level: LogLevel): void;
  setService(service: string | undefined): void;
  toggleService(service: string): void;
  setHost(host: string | undefined): void;
  toggleHost(host: string): void;
  setSource(source: string | undefined): void;
  toggleSource(source: string): void;
  setTimeRange(startTime: Date | undefined, endTime: Date | undefined): void;
  setLimit(limit: number): void;
  setOffset(offset: number): void;
  setOrder(order: "asc" | "desc"): void;
  toggleLiveTail(): void;
  resetFilters(): void;
  updateFilters(partial: Partial<FilterState>): void;
  toggleJsonFilter(jsonPath: string, value: string): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type FilterContextValue = readonly [FilterState, FilterActions];

export const FilterContext = createContext<FilterContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTER_STATE);

  const setSearch = useCallback(
    (search: string | undefined) => setState((s) => ({ ...s, search, offset: 0 })),
    [],
  );

  const setLevel = useCallback(
    (level: LogLevel | undefined) =>
      setState((s) => ({ ...s, level: level ? [level] : [], offset: 0 })),
    [],
  );

  const toggleLevel = useCallback(
    (level: LogLevel) =>
      setState((s) => ({ ...s, level: toggleInArray(s.level, level), offset: 0 })),
    [],
  );

  const setService = useCallback(
    (service: string | undefined) =>
      setState((s) => ({ ...s, service: service ? [service] : [], offset: 0 })),
    [],
  );

  const toggleService = useCallback(
    (service: string) =>
      setState((s) => ({ ...s, service: toggleInArray(s.service, service), offset: 0 })),
    [],
  );

  const setHost = useCallback(
    (host: string | undefined) =>
      setState((s) => ({ ...s, host: host ? [host] : [], offset: 0 })),
    [],
  );

  const toggleHost = useCallback(
    (host: string) =>
      setState((s) => ({ ...s, host: toggleInArray(s.host, host), offset: 0 })),
    [],
  );

  const setSource = useCallback(
    (source: string | undefined) =>
      setState((s) => ({ ...s, source: source ? [source] : [], offset: 0 })),
    [],
  );

  const toggleSource = useCallback(
    (source: string) =>
      setState((s) => ({ ...s, source: toggleInArray(s.source, source), offset: 0 })),
    [],
  );

  const setTimeRange = useCallback(
    (startTime: Date | undefined, endTime: Date | undefined) =>
      setState((s) => ({ ...s, startTime, endTime, offset: 0 })),
    [],
  );

  const setLimit = useCallback(
    (limit: number) => setState((s) => ({ ...s, limit })),
    [],
  );

  const setOffset = useCallback(
    (offset: number) => setState((s) => ({ ...s, offset })),
    [],
  );

  const setOrder = useCallback(
    (order: "asc" | "desc") => setState((s) => ({ ...s, order, offset: 0 })),
    [],
  );

  const toggleLiveTail = useCallback(
    () => setState((s) => ({ ...s, isLiveTail: !s.isLiveTail })),
    [],
  );

  const resetFilters = useCallback(
    () => setState(DEFAULT_FILTER_STATE),
    [],
  );

  const updateFilters = useCallback(
    (partial: Partial<FilterState>) => setState((s) => ({ ...s, ...partial, offset: 0 })),
    [],
  );

  const toggleJsonFilter = useCallback(
    (jsonPath: string, value: string) =>
      setState((s) => {
        const jsonFilters = { ...s.jsonFilters };
        const current = jsonFilters[jsonPath] ?? [];
        const updated = toggleInArray(current, value);
        if (updated.length === 0) {
          delete jsonFilters[jsonPath];
        } else {
          jsonFilters[jsonPath] = updated;
        }
        return { ...s, jsonFilters, offset: 0 };
      }),
    [],
  );

  const actions: FilterActions = useMemo(
    () => ({
      setSearch,
      setLevel,
      toggleLevel,
      setService,
      toggleService,
      setHost,
      toggleHost,
      setSource,
      toggleSource,
      setTimeRange,
      setLimit,
      setOffset,
      setOrder,
      toggleLiveTail,
      resetFilters,
      updateFilters,
      toggleJsonFilter,
    }),
    [
      setSearch,
      setLevel,
      toggleLevel,
      setService,
      toggleService,
      setHost,
      toggleHost,
      setSource,
      toggleSource,
      setTimeRange,
      setLimit,
      setOffset,
      setOrder,
      toggleLiveTail,
      resetFilters,
      updateFilters,
      toggleJsonFilter,
    ],
  );

  const value: FilterContextValue = useMemo(
    () => [state, actions] as const,
    [state, actions],
  );

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return ctx;
}
