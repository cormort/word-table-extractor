import type { TableObj } from "./types.js";

// ===== CSV =====

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * 把表格資料轉成 CSV 文字。
 *   - 用 CRLF 行尾（Excel 友善）
 *   - 含逗號 / 雙引號 / 換行的欄位以雙引號包覆並 escape
 *   - 不含 BOM；呼叫端可視需求自行加上
 */
export function tableToCsv(table: TableObj): string {
  if (!table || !table.data) return "";
  return table.data.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

// ===== Markdown =====

function mdEscape(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

/**
 * 把表格資料轉成 GFM Markdown 表格。
 * 多列 header（headerRowCount > 1）會合併成單列：同欄裡因 rowspan 展開造成
 * 的重複文字會 dedup 後用 <br> 串接。
 */
export function tableToMarkdown(table: TableObj): string {
  if (!table || !table.data || table.data.length === 0) return "";
  const { data } = table;
  const cols = data[0].length;
  const hrc = Math.max(1, Math.min(table.headerRowCount || 1, data.length));

  let headerCells: string[];
  if (hrc > 1) {
    headerCells = Array.from({ length: cols }, (_, c) => {
      const parts: string[] = [];
      for (let r = 0; r < hrc; r++) {
        const cell = data[r]?.[c] ?? "";
        if (cell && !parts.includes(String(cell))) parts.push(String(cell));
      }
      return parts.join("<br>");
    });
  } else {
    headerCells = (data[0] || []).map((c) => String(c ?? ""));
  }

  const lines: string[] = [];
  lines.push("| " + headerCells.map(mdEscape).join(" | ") + " |");
  lines.push("|" + headerCells.map(() => " --- ").join("|") + "|");
  for (let r = hrc; r < data.length; r++) {
    lines.push("| " + (data[r] || []).map(mdEscape).join(" | ") + " |");
  }
  return lines.join("\n") + "\n";
}
