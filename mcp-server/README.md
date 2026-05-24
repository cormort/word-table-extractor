# word-table-extractor MCP server

把 [Word 表格提取與多檔合併工具](../Word%20%E8%A1%A8%E6%A0%BC%E6%8F%90%E5%8F%96%E8%88%87%E5%A4%9A%E6%AA%94%E5%90%88%E4%BD%B5%E5%B7%A5%E5%85%B7.html) 的核心邏輯包成 MCP server，讓支援 Model Context Protocol 的 AI agent（Claude Desktop、Claude Code、Cline …）可以直接呼叫表格抽取與合併功能。

## 提供的工具

| 工具 | 輸入 | 輸出 |
|---|---|---|
| `extract_tables` | `docxPath: string` | `{ fileName, tableCount, tables: [...] }` |
| `merge_tables` | `tables: TableObj[]`（≥2）、選填 `headerRowCount` | `mergedTable: TableObj`（含 `sourceBoundaries`）|

`TableObj` 結構：

```ts
{
  tableIndex: number;
  rowCount: number;
  colCount: number;
  headerRowCount: number;       // 自動偵測
  data: string[][];             // 已展開 rowspan/colspan 的二維陣列
  sourceBoundaries?: number[];  // 僅合併結果才有
}
```

## 安裝

```bash
cd mcp-server
npm install
npm run build
```

建置產物在 `dist/index.js`，可直接執行：

```bash
node dist/index.js
```

## 在 Claude Desktop / Claude Code 中設定

編輯設定檔（位置依平台而異）：

- macOS Claude Desktop：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Code：`~/.claude.json` 或專案內 `.mcp.json`

加入：

```json
{
  "mcpServers": {
    "word-table-extractor": {
      "command": "node",
      "args": ["/Users/你/Dev/Work/word-to-json/mcp-server/dist/index.js"]
    }
  }
}
```

重啟客戶端後即可在工具列表看到 `extract_tables` 與 `merge_tables`。

## 典型使用流程（agent 視角）

```
1. extract_tables({ docxPath: "/path/to/report-A.docx" })
   → 拿到 tables[0..N]

2. extract_tables({ docxPath: "/path/to/report-B.docx" })
   → 拿到另一組 tables

3. 從兩組裡挑出 colCount 相同的目標表

4. merge_tables({ tables: [A.tables[0], B.tables[0]] })
   → 拿到 mergedTable（含 sourceBoundaries）
```

## 注意事項

- `extract_tables` 只接受**本機檔案路徑**。若你的 agent 是雲端執行的，請先把檔案放到本機。
- `merge_tables` 不檢查 `colCount` 是否一致，呼叫端應自行確保語義上可合併。寬度不同會以最大寬度補空字串。
- stdout 只用於 JSON-RPC，debug 訊息一律走 stderr。

## 開發

```bash
npm run dev   # tsc --watch
```
