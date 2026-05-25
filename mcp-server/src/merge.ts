import type { TableObj } from "./types.js";

export interface MergeOptions {
  /** 若給定則覆寫自動推算的 headerRowCount */
  headerRowCount?: number;
}

export interface MergeResult {
  /** 合併後的表格 */
  table: TableObj;
  /** 非致命的相容性警告（header 文字不一致、headerRowCount 不一致等）。
   *  Agent 可據此向使用者確認是否真的要合併。 */
  warnings: string[];
}

/**
 * 合併多張表格。
 *
 * 硬性檢查（不通過會 throw）：
 *   - 至少 2 張表
 *   - 所有表的 colCount 一致
 *
 * 軟性檢查（產生 warnings 但仍會合併）：
 *   - 各表的 headerRowCount 不一致
 *   - 各表的 header 文字（data[0..headerRowCount-1]）不一致
 *
 * 規則：
 *   - headerRowCount = options.headerRowCount ?? max(所有表的 headerRowCount)
 *   - 第一張：含 header 全部保留
 *   - 後續每張：統一跳過 headerRowCount 列
 *   - sourceBoundaries 記錄每張表的起始 row index
 */
export function mergeTables(tables: TableObj[], options: MergeOptions = {}): MergeResult {
  if (!tables || tables.length < 2) {
    throw new Error("mergeTables 至少需要兩張表格");
  }

  // 硬性檢查：colCount 必須一致
  const firstColCount = tables[0]?.colCount;
  const colMismatch = tables.filter((t, i) => i > 0 && t?.colCount !== firstColCount);
  if (colMismatch.length > 0) {
    const detail = colMismatch
      .map((t) => `tableIndex ${t.tableIndex}（${t.colCount} 欄）`)
      .join("、");
    throw new Error(
      `colCount 不一致，無法合併。第 1 張為 ${firstColCount} 欄，不一致的有：${detail}`
    );
  }

  const warnings: string[] = [];

  // 軟性檢查：各表 headerRowCount 一致性
  const hrcs = tables.map((t) => t?.headerRowCount ?? 1);
  const uniqueHrcs = Array.from(new Set(hrcs));

  const headerRowCount =
    options.headerRowCount ??
    hrcs.reduce((max, h) => Math.max(max, h), 1);

  if (uniqueHrcs.length > 1) {
    warnings.push(
      `各表 headerRowCount 不一致（${hrcs.join(", ")}）。` +
        `已以最大值 ${headerRowCount} 為基準統一跳過 header（避免偵測較少的表把 sub-header 漏跳成資料列）。`
    );
  }

  // 軟性檢查：header 文字一致性（以第 1 張為基準比對前 headerRowCount 列）
  if (headerRowCount > 0) {
    const ref = JSON.stringify(tables[0].data.slice(0, headerRowCount));
    tables.forEach((t, i) => {
      if (i === 0) return;
      const cur = JSON.stringify((t.data ?? []).slice(0, headerRowCount));
      if (cur !== ref) {
        warnings.push(
          `第 ${i + 1} 張（tableIndex ${t.tableIndex}）的 header 文字與第 1 張不完全一致，` +
            `合併後可能不是同類資料。請確認語意上確實同類。`
        );
      }
    });
  }

  const mergedData: string[][] = [];
  const sourceBoundaries: number[] = [];

  tables.forEach((t, idx) => {
    if (!t || !t.data || t.data.length === 0) return;

    if (idx === 0) {
      sourceBoundaries.push(mergedData.length);
      for (const row of t.data) mergedData.push([...row]);
    } else {
      if (headerRowCount < t.data.length) {
        sourceBoundaries.push(mergedData.length);
        for (let r = headerRowCount; r < t.data.length; r++) {
          mergedData.push([...t.data[r]]);
        }
      }
    }
  });

  if (mergedData.length === 0) {
    throw new Error("合併失敗：所有來源表都沒有可合併的資料");
  }

  const colCount = mergedData.reduce((max, r) => Math.max(max, r.length), 0);
  mergedData.forEach((r) => {
    for (let i = 0; i < colCount; i++) if (r[i] === undefined) r[i] = "";
  });

  return {
    table: {
      tableIndex: 1,
      rowCount: mergedData.length,
      colCount,
      headerRowCount,
      data: mergedData,
      sourceBoundaries,
    },
    warnings,
  };
}
