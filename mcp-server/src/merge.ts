import type { TableObj } from "./types.js";

export interface MergeOptions {
  /** 若給定則覆寫第一張表偵測到的 headerRowCount */
  headerRowCount?: number;
}

/**
 * 合併多張表格。規則：
 *   - 第一張：含 header 全部保留，並把該起始 row 0 加入 sourceBoundaries
 *   - 後續每張：跳過自己的 headerRowCount 列，僅 push 資料列
 *   - 每張實際有 push 內容的表，都會在 sourceBoundaries 記錄其起始位置
 *     （供 rowspan 探測時不跨越群組邊界）
 *
 * 若 colCount 不一致，仍允許合併（取最大寬度補空），由呼叫端決定是否預先過濾。
 */
export function mergeTables(tables: TableObj[], options: MergeOptions = {}): TableObj {
  if (!tables || tables.length < 2) {
    throw new Error("mergeTables 至少需要兩張表格");
  }

  const headerRowCount = options.headerRowCount ?? tables[0].headerRowCount ?? 1;
  const mergedData: string[][] = [];
  const sourceBoundaries: number[] = [];

  tables.forEach((t, idx) => {
    if (!t || !t.data || t.data.length === 0) return;

    if (idx === 0) {
      sourceBoundaries.push(mergedData.length);
      for (const row of t.data) mergedData.push([...row]);
    } else {
      const skip = t.headerRowCount ?? 1;
      if (skip < t.data.length) {
        sourceBoundaries.push(mergedData.length);
        for (let r = skip; r < t.data.length; r++) {
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
    tableIndex: 1,
    rowCount: mergedData.length,
    colCount,
    headerRowCount,
    data: mergedData,
    sourceBoundaries,
  };
}
