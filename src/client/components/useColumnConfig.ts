import { useCallback, useEffect, useMemo, useState } from "react";

export interface ColumnDefinition {
  id: string;
  field: string;
  label: string;
  width: number;
  minWidth: number;
  visible: boolean;
  jsonPath: string | null;
}

interface StoredColumnEntry {
  id: string;
  width: number;
  visible: boolean;
  field?: string;
  label?: string;
  minWidth?: number;
  jsonPath?: string | null;
}

interface StoredColumnConfig {
  version: 1;
  columns: StoredColumnEntry[];
}

export interface UseColumnConfigResult {
  columns: ColumnDefinition[];
  allColumns: ColumnDefinition[];
  setColumnWidth(id: string, width: number): void;
  toggleColumnVisibility(id: string): void;
  addColumn(field: string, label: string, jsonPath: string | null): void;
  removeColumn(id: string): void;
  resetToDefault(): void;
  gridTemplateColumns: string;
}

const STORAGE_KEY = "slogtail-column-config";
const STORAGE_VERSION = 1;
const SAVE_DEBOUNCE_MS = 200;

const DEFAULT_COLUMNS: ReadonlyArray<ColumnDefinition> = [
  {
    id: "level",
    field: "level",
    label: "Level",
    width: 60,
    minWidth: 40,
    visible: true,
    jsonPath: null,
  },
  {
    id: "timestamp",
    field: "timestamp",
    label: "Timestamp",
    width: 160,
    minWidth: 100,
    visible: true,
    jsonPath: null,
  },
  {
    id: "message",
    field: "message",
    label: "Message",
    width: 0,
    minWidth: 100,
    visible: true,
    jsonPath: null,
  },
];

const DEFAULT_COLUMN_IDS = new Set(DEFAULT_COLUMNS.map((col) => col.id));

function cloneDefaultColumns(): ColumnDefinition[] {
  return DEFAULT_COLUMNS.map((col) => ({ ...col }));
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeStoredColumn(entry: StoredColumnEntry): StoredColumnEntry | null {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.id !== "string" || entry.id.length === 0) return null;
  if (typeof entry.width !== "number" || !Number.isFinite(entry.width) || entry.width < 0) return null;
  if (typeof entry.visible !== "boolean") return null;
  return entry;
}

function loadColumnConfig(): ColumnDefinition[] {
  if (!canUseLocalStorage()) {
    return cloneDefaultColumns();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultColumns();

    const parsed = JSON.parse(raw) as StoredColumnConfig;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== STORAGE_VERSION ||
      !Array.isArray(parsed.columns)
    ) {
      return cloneDefaultColumns();
    }

    const defaultById = new Map(cloneDefaultColumns().map((col) => [col.id, col]));
    const ordered: ColumnDefinition[] = [];
    const seen = new Set<string>();

    for (const rawEntry of parsed.columns) {
      const entry = normalizeStoredColumn(rawEntry);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);

      const base = defaultById.get(entry.id);
      if (base) {
        ordered.push({
          ...base,
          width: entry.width,
          visible: entry.visible,
        });
        defaultById.delete(entry.id);
        continue;
      }

      if (
        typeof entry.field !== "string" ||
        entry.field.trim() === "" ||
        typeof entry.label !== "string" ||
        entry.label.trim() === ""
      ) {
        continue;
      }

      const minWidth =
        typeof entry.minWidth === "number" && Number.isFinite(entry.minWidth) && entry.minWidth > 0
          ? entry.minWidth
          : 80;
      ordered.push({
        id: entry.id,
        field: entry.field.trim(),
        label: entry.label.trim(),
        width: entry.width,
        minWidth,
        visible: entry.visible,
        jsonPath: entry.jsonPath ?? null,
      });
    }

    for (const col of defaultById.values()) {
      ordered.push(col);
    }

    const visibleCount = ordered.filter((col) => col.visible).length;
    if (visibleCount === 0 && ordered.length > 0) {
      ordered[0] = { ...ordered[0], visible: true };
    }

    return ordered;
  } catch {
    return cloneDefaultColumns();
  }
}

function serializeColumnConfig(columns: ColumnDefinition[]): StoredColumnConfig {
  return {
    version: STORAGE_VERSION,
    columns: columns.map((col) => {
      if (DEFAULT_COLUMN_IDS.has(col.id)) {
        return { id: col.id, width: col.width, visible: col.visible };
      }
      return {
        id: col.id,
        field: col.field,
        label: col.label,
        width: col.width,
        minWidth: col.minWidth,
        visible: col.visible,
        jsonPath: col.jsonPath,
      };
    }),
  };
}

function nextColumnId(columns: ColumnDefinition[], field: string, jsonPath: string | null): string {
  const base = jsonPath ? `_raw.${jsonPath}` : field;
  if (!columns.some((col) => col.id === base)) return base;
  let i = 2;
  while (columns.some((col) => col.id === `${base}-${i}`)) {
    i += 1;
  }
  return `${base}-${i}`;
}

export function useColumnConfig(): UseColumnConfigResult {
  const [allColumns, setAllColumns] = useState<ColumnDefinition[]>(() => loadColumnConfig());

  useEffect(() => {
    if (!canUseLocalStorage()) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(serializeColumnConfig(allColumns)),
        );
      } catch {
        // Ignore persistence errors (quota / private mode)
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [allColumns]);

  const setColumnWidth = useCallback((id: string, width: number) => {
    if (!Number.isFinite(width)) return;
    setAllColumns((prev) =>
      prev.map((col) => {
        if (col.id !== id) return col;
        const nextWidth = Math.max(col.minWidth, Math.round(width));
        return { ...col, width: nextWidth };
      }),
    );
  }, []);

  const toggleColumnVisibility = useCallback((id: string) => {
    setAllColumns((prev) => {
      const target = prev.find((col) => col.id === id);
      if (!target) return prev;
      if (target.visible) {
        const visibleCount = prev.filter((col) => col.visible).length;
        if (visibleCount <= 1) return prev;
      }
      return prev.map((col) => (col.id === id ? { ...col, visible: !col.visible } : col));
    });
  }, []);

  const addColumn = useCallback((field: string, label: string, jsonPath: string | null) => {
    const normalizedField = field.trim();
    const normalizedLabel = label.trim();
    if (!normalizedField || !normalizedLabel) return;
    const normalizedPath = jsonPath?.trim() || null;
    setAllColumns((prev) => [
      ...prev,
      {
        id: nextColumnId(prev, normalizedField, normalizedPath),
        field: normalizedField,
        label: normalizedLabel,
        width: 140,
        minWidth: 80,
        visible: true,
        jsonPath: normalizedPath,
      },
    ]);
  }, []);

  const removeColumn = useCallback((id: string) => {
    setAllColumns((prev) => {
      const target = prev.find((col) => col.id === id);
      if (!target) return prev;
      if (target.visible) {
        const visibleCount = prev.filter((col) => col.visible).length;
        if (visibleCount <= 1) return prev;
      }
      return prev.filter((col) => col.id !== id);
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setAllColumns(cloneDefaultColumns());
  }, []);

  const columns = useMemo(
    () => allColumns.filter((col) => col.visible),
    [allColumns],
  );

  const gridTemplateColumns = useMemo(
    () =>
      columns
        .map((col) => (col.width <= 0 ? `minmax(${col.minWidth}px, 1fr)` : `${Math.max(col.width, col.minWidth)}px`))
        .join(" "),
    [columns],
  );

  return {
    columns,
    allColumns,
    setColumnWidth,
    toggleColumnVisibility,
    addColumn,
    removeColumn,
    resetToDefault,
    gridTemplateColumns,
  };
}
