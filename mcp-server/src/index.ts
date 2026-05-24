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
      "提供 Word (.docx) 表格抽取與合併。" +
      "extract_tables：給定 .docx 路徑，回傳所有表格的二維陣列與標題列數。" +
      "merge_tables：給定多張同欄數表格的 JSON（從 extract_tables 取得），" +
      "回傳合併後的表格；合併規則為第一張保留 header，後續跳過自己的 header 列。",
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
      "解析指定路徑的 .docx 檔，回傳所有偵測到的表格。每張表包含 rowCount、colCount、" +
      "headerRowCount（自動偵測）、data（已展開 rowspan/colspan 的二維字串陣列）。",
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
      "合併多張表格。第一張全部保留（含 header），後續每張跳過自己的 headerRowCount 列。" +
      "回傳的 mergedTable 含 sourceBoundaries（每張來源表起始 row index），" +
      "供呼叫端在渲染時避免 rowspan 跨越來源表邊界。",
    inputSchema: {
      tables: z
        .array(tableSchema)
        .min(2)
        .describe("至少兩張表格的 JSON 陣列，通常是 extract_tables 的輸出"),
      headerRowCount: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("可選：覆寫第一張表偵測到的 headerRowCount"),
    },
  },
  async ({ tables, headerRowCount }) => {
    try {
      const merged = mergeTables(tables as TableObj[], { headerRowCount });
      return {
        content: [
          { type: "text", text: JSON.stringify(merged, null, 2) },
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
