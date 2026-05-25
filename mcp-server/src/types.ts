export interface TableObj {
  tableIndex: number;
  rowCount: number;
  colCount: number;
  headerRowCount: number;
  data: string[][];
  /** 合併結果才會有：每張來源表起始 row index，用於避免 rowspan 跨越來源邊界 */
  sourceBoundaries?: number[];
}

export interface ExtractResult {
  fileName: string;
  tableCount: number;
  tables: TableObj[];
}
