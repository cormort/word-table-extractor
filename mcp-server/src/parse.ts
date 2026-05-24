import { promises as fs } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { JSDOM } from "jsdom";
import type { ExtractResult, TableObj } from "./types.js";

/**
 * 解析單一 .docx 檔，回傳所有表格的結構化資料。
 * 演算法與原 HTML 版本一致：
 *   - 用 rowspan/colspan 展開 grid
 *   - headerRowCount = max(TH 計數, 結構偵測值)
 *     · TH 計數：連續開頭含 <th> 的列數
 *     · 結構偵測：從 row 0 起，cell 的 rowspan>1 或 colspan>1 暗示下一列仍是
 *       header（mammoth 不一定會把多列 header 全標成 <th>，所以需要這個輔助）
 *   - colCount 取所有列的最大寬度，鋸齒列補空字串
 */
export async function extractTablesFromDocx(docxPath: string): Promise<ExtractResult> {
  const abs = path.resolve(docxPath);
  await fs.access(abs);

  const buffer = await fs.readFile(abs);
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const htmlTables = doc.querySelectorAll("table");

  const tables: TableObj[] = [];

  htmlTables.forEach((tableEl, index) => {
    const rows = tableEl.querySelectorAll("tr");
    const grid: string[][] = [];
    let autoHeaderRowCount = 0;
    let headerStreak = true;

    rows.forEach((row, rIdx) => {
      if (!grid[rIdx]) grid[rIdx] = [];
      const cells = row.querySelectorAll("th, td");
      let hasTh = false;
      let cIdx = 0;

      cells.forEach((cell) => {
        if (cell.tagName === "TH") hasTh = true;
        while (grid[rIdx][cIdx] !== undefined) cIdx++;
        const rowspan = parseInt(cell.getAttribute("rowspan") || "1", 10) || 1;
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
        const cleanText = (cell.textContent || "")
          .replace(/[\r\n\t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            if (!grid[rIdx + r]) grid[rIdx + r] = [];
            grid[rIdx + r][cIdx + c] = cleanText;
          }
        }
        cIdx += colspan;
      });

      if (headerStreak && hasTh) autoHeaderRowCount++;
      else headerStreak = false;
    });

    const rowsJson = grid.filter((r) => r && r.length > 0);
    if (rowsJson.length === 0) return;

    const colCount = rowsJson.reduce((max, r) => Math.max(max, r.length), 0);
    rowsJson.forEach((r) => {
      for (let i = 0; i < colCount; i++) if (r[i] === undefined) r[i] = "";
    });

    // 結構偵測：從 row 0 往下走，只要該列 cell 有 rowspan>1 或 colspan>1，
    // 就把 header 範圍延伸到下一列
    let structuralEnd = 0;
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      if (rIdx > structuralEnd) break;
      const cells = rows[rIdx].querySelectorAll("th, td");
      let hasColspan = false;
      cells.forEach((cell) => {
        const rs = parseInt(cell.getAttribute("rowspan") || "1", 10) || 1;
        const cs = parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
        if (cs > 1) hasColspan = true;
        const extent = rIdx + rs - 1;
        if (extent > structuralEnd) structuralEnd = extent;
      });
      if (hasColspan && rIdx + 1 > structuralEnd) structuralEnd = rIdx + 1;
    }
    const structuralCount = structuralEnd + 1;

    autoHeaderRowCount = Math.max(autoHeaderRowCount, structuralCount);
    if (autoHeaderRowCount === 0) autoHeaderRowCount = 1;
    if (autoHeaderRowCount >= rowsJson.length) autoHeaderRowCount = 1;

    tables.push({
      tableIndex: index + 1,
      rowCount: rowsJson.length,
      colCount,
      data: rowsJson,
      headerRowCount: autoHeaderRowCount,
    });
  });

  return {
    fileName: path.basename(abs, path.extname(abs)),
    tableCount: tables.length,
    tables,
  };
}
