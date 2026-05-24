#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { extractTablesFromDocx } from "./parse.js";
import { mergeTables } from "./merge.js";
import type { TableObj } from "./types.js";

const server = new McpServer(
  { name: "word-table-extractor", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "提供 Word (.docx) 表格抽取與合併。\n\n" +
      "## 典型工作流\n" +
      "1. 對每個 .docx 呼叫 `extract_tables`，得到每張表的 colCount、" +
      "headerRowCount、data。\n" +
      "2. 判斷哪些表「可合併」與「該合併」：\n" +
      "   - 硬性：colCount 必須相同\n" +
      "   - 軟性：data[0..headerRowCount-1]（header 文字）應該相同；" +
      "headerRowCount 應該相同。差異大就不該合，否則語意會亂。\n" +
      "3. 結合使用者意圖（自然語言指示）決定最終要合的清單。\n" +
      "4. 把表的陣列餵給 `merge_tables`；它回傳 `{ table, warnings }`，" +
      "warnings 不為空時應該回報給使用者。\n\n" +
      "## 重點\n" +
      "- 表的順序就是合併順序：第 1 張的 header 會被保留。\n" +
      "- headerRowCount 預設取所有表的 max，所以單張偵測失準也不會漏跳。\n" +
      "- colCount 不一致會直接 throw，無法合併。\n" +
      "- 不確定該不該合時，先把每張表的 header（data[0..headerRowCount-1]）" +
      "拿給使用者看，確認後再合。",
  }
);

const tableSchema = z.object({
  tableIndex: z.number().int(),
  rowCount: z.number().int(),
  colCount: z.number().int(),
  headerRowCount: z.number().int().min(1),
  data: z.array(z.array(z.string())),
  sourceBoundaries: z.array(z.number().int()).optional(),
});

server.registerTool(
  "extract_tables",
  {
    title: "Extract tables from Word .docx",
    description:
      "解析指定路徑的 .docx 檔，回傳所有偵測到的表格。\n" +
      "每張表包含：\n" +
      "- tableIndex：在該檔案中是第幾張表（1-based）\n" +
      "- rowCount / colCount：列數與欄數\n" +
      "- headerRowCount：結合 TH 計數與 rowspan/colspan 結構偵測自動推算\n" +
      "- data：已展開 rowspan/colspan 的二維字串陣列\n\n" +
      "後續若要合併多張表，請先比對各表的 colCount 與 data[0..headerRowCount-1]" +
      "（header 文字）以判斷是否同類。",
    inputSchema: {
      docxPath: z
        .string()
        .min(1)
        .describe("本機 .docx 檔案的絕對或相對路徑"),
    },
  },
  async ({ docxPath }) => {
    try {
      const result = await extractTablesFromDocx(docxPath);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `extract_tables 失敗：${msg}` }],
      };
    }
  }
);

server.registerTool(
  "merge_tables",
  {
    title: "Merge multiple tables",
    description:
      "合併多張表格。表的陣列順序即合併順序：第 1 張的 header 會被保留，" +
      "後續每張跳過 headerRowCount 列。\n\n" +
      "## 行為\n" +
      "- 預設 headerRowCount = max(所有表的 headerRowCount)，避免個別表偵測失準。\n" +
      "- sourceBoundaries 記錄每張表貢獻內容的起始 row index，供呼叫端在" +
      "渲染時避免 rowspan 跨越來源表邊界。\n\n" +
      "## 防呆\n" +
      "- 硬性：colCount 不一致會 throw，請先用 extract_tables 確認。\n" +
      "- 軟性：headerRowCount 不一致、header 文字不一致時，會在 warnings " +
      "陣列中提示。warnings 不為空時應將內容告知使用者，確認是否真的要合併。\n\n" +
      "## 回傳\n" +
      "`{ table: TableObj, warnings: string[] }`",
    inputSchema: {
      tables: z
        .array(tableSchema)
        .min(2)
        .describe(
          "至少兩張表格的 JSON 陣列（通常是 extract_tables 的輸出）。" +
            "陣列順序即合併順序，第 1 張的 header 會被保留。"
        ),
      headerRowCount: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("可選：覆寫自動推算的 headerRowCount（預設為所有表的最大值）"),
    },
  },
  async ({ tables, headerRowCount }) => {
    try {
      const merged = mergeTables(tables as TableObj[], { headerRowCount });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { table: merged.table, warnings: merged.warnings },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `merge_tables 失敗：${msg}` }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // McpServer 透過 stdio 工作後不能往 stdout 印任何 log（會干擾 JSON-RPC frame）
  // 若需要 debug，可改用 stderr：process.stderr.write("...\n");
}

main().catch((err) => {
  process.stderr.write(`MCP server fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
