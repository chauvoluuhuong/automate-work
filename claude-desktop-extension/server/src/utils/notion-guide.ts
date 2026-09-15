/**
 * Utilities for generating and synchronizing the "How to use Notion tools" skill.
 */

import type { ActiveNotionPageConfigItem, SkillItem } from "../tools/types.js";
import { filterInstructions, getDatabaseInstructions } from "../tools/notion.js";
import { upsertSkill, getNotionGuideSkillPointId } from "../services/vector-db.js";
import { buildConnectionSkillName } from "./helpers.js";

/**
 * Build the structured Markdown guide for using Notion tools with active resources.
 */
export async function buildNotionGuideSkillContent(
  activeNotionPages: ActiveNotionPageConfigItem[] = [],
  apiKeyOverride?: string,
): Promise<string> {
  const pages = activeNotionPages.filter((p) => p.type !== "database");
  const databases = activeNotionPages.filter((p) => p.type === "database");

  const skillName = buildConnectionSkillName("notion");
  const lines: string[] = [
    `# ${skillName}`,
    "",
    "This guide explains how to access, read, search, create, and update our team's active Notion workspace resources using the available Notion MCP tools.",
    "",
    "## Tool Reference",
    "- `notion_list_resources`: Discover and list all accessible pages and databases across the workspace.",
    "- `notion_get_page`: Retrieve full Markdown content, blocks, inline databases, and comments for any Notion page or database.",
    "- `notion_search`: Deep schema-aware search across Notion database properties, page bodies, and comments with structured filtering and pagination.",
    "- `notion_create_page_record`: Create a new page record (row/item) in an active/selected Notion database with structured properties, Markdown notes, icon, and optional initial comment.",
    "- `notion_update_page`: Update properties, title, append Markdown body content, or archive an existing Notion page or database record.",
    "- `notion_archive_page`: Archive (soft-delete) a page record or item in Notion.",
    "- `notion_create_comment`: Post a discussion comment to a Notion page/item, or reply to an existing comment thread.",
    "- `notion_get_comments`: Retrieve unresolved comments and discussion threads for a Notion page or database item.",
    "- `notion_check_connection`: Test connectivity to the Notion workspace.",
    "",
    "### Safety & Approvals",
    "- Always ask for explicit user approval before executing actions that create, modify, or delete Notion data (`notion_create_page_record`, `notion_update_page`, `notion_archive_page`, `notion_create_comment`).",
    "",
  ];

  if (pages.length === 0 && databases.length === 0) {
    lines.push(
      "## Active Notion Resources",
      "",
      "No specific Notion resources are currently selected as active in the application configuration.",
      "- To discover accessible pages and databases in the workspace, call `notion_list_resources({ type: 'all' })`.",
      "- To read any page content, call `notion_get_page({ pageId: '<page-id>' })`.",
      "- To search across a database, call `notion_search({ databaseId: '<db-id>', searchText: '...' })`.",
      "- To create a new record in a database, call `notion_create_page_record({ databaseId: '<db-id>', properties: { ... } })`.",
      "",
    );
    return lines.join("\n");
  }

  lines.push("## Active Notion Resources & Usage Instructions", "");

  // Pages section
  if (pages.length > 0) {
    lines.push(
      "### Active Pages",
      "When inspecting product specs, RFCs, design docs, or team guidelines, use the **`notion_get_page`** tool with the page ID. This retrieves the complete document structure including subheadings, nested blocks, code snippets, callouts, and comments.",
      "",
    );

    for (const page of pages) {
      const icon = page.icon || "📄";
      const title = page.title || "Untitled Page";
      lines.push(`#### ${icon} ${title}`);
      lines.push(`- **ID**: \`${page.id}\``);
      lines.push(`- **Type**: \`Page\``);
      if (page.description && page.description.trim()) {
        lines.push(`- **Description**: ${page.description.trim()}`);
      }
      if (page.url) {
        lines.push(`- **URL**: [Open in Notion](${page.url})`);
      }
      lines.push(
        `- **Fetch Page Content**:`,
        "  ```json",
        `  notion_get_page({ "pageId": "${page.id}" })`,
        "  ```",
        `- **Update or Append Notes**:`,
        "  ```json",
        `  notion_update_page({ "pageId": "${page.id}", "content": "## Implementation Update\\n- Completed review" })`,
        "  ```",
        `- **Add Page Comment**:`,
        "  ```json",
        `  notion_create_comment({ "pageId": "${page.id}", "text": "Reviewed and approved." })`,
        "  ```",
        "",
      );
    }
  }

  // Databases section
  if (databases.length > 0) {
    lines.push(
      "### Active Databases",
      "Active databases can be searched, queried, and updated with new records. Use **`notion_create_page_record`** to add structured items, **`notion_update_page`** to edit items or append notes, and **`notion_search`** to filter records.",
      "",
    );

    for (const db of databases) {
      const icon = db.icon || "🗄️";
      const title = db.title || "Untitled Database";
      lines.push(`#### ${icon} ${title}`);
      lines.push(`- **Database ID**: \`${db.id}\``);
      lines.push(`- **Type**: \`Database\``);
      if (db.description && db.description.trim()) {
        lines.push(`- **Description**: ${db.description.trim()}`);
      }
      if (db.url) {
        lines.push(`- **URL**: [Open in Notion](${db.url})`);
      }
      lines.push("");

      try {
        const instructions = await getDatabaseInstructions({
          databaseId: db.id,
          apiKeyOverride,
        });

        const titleProp = instructions?.database?.title_property || "Name";

        // 1. Create Record Instructions
        lines.push(
          `##### 1. How to Create Records in "${title}" (\`notion_create_page_record\`)`,
          `Use **\`notion_create_page_record\`** to create a new item/row in this database.`,
          `- **Required Title Field**: \`${titleProp}\` (pass in \`properties\` or as \`title\`).`,
          `- Standalone page creation is not permitted; records must specify \`databaseId: "${db.id}"\`.`,
          "",
        );

        if (instructions?.actions?.create_record?.example) {
          lines.push(
            "**Example Tool Call:**",
            "```json",
            `notion_create_page_record(${JSON.stringify(instructions.actions.create_record.example, null, 2)})`,
            "```",
            "",
          );
        }

        // 2. Edit / Update Instructions
        lines.push(
          `##### 2. How to Edit / Update Records in "${title}" (\`notion_update_page\`)`,
          "Use **`notion_update_page`** with the record's `pageId` to edit properties or append Markdown notes to its body.",
          "",
        );

        if (instructions?.actions?.update_record?.example) {
          lines.push(
            "**Example Tool Call:**",
            "```json",
            `notion_update_page(${JSON.stringify(instructions.actions.update_record.example, null, 2)})`,
            "```",
            "",
          );
        }

        // 3. Search & Filter Instructions
        lines.push(
          `##### 3. How to Search & Filter "${title}" (\`notion_search\`)`,
          "Use **`notion_search`** to query records with structured filters and free-text matching.",
          "",
        );

        if (instructions?.filters && Object.keys(instructions.filters).length > 0) {
          lines.push(
            "| Property Name | Filter Type | Accepted Values / Formats |",
            "| :--- | :--- | :--- |",
          );

          for (const [propName, filterMeta] of Object.entries(instructions.filters) as [string, any][]) {
            let acceptedStr = "-";
            if (Array.isArray(filterMeta.accepted_values)) {
              acceptedStr = filterMeta.accepted_values.map((v: any) => `\`${v}\``).join(", ");
            } else if (filterMeta.type) {
              acceptedStr = filterMeta.type;
            }
            lines.push(`| **${propName}** | \`${filterMeta.type || "unknown"}\` | ${acceptedStr} |`);
          }
          lines.push("");
        }

        if (instructions?.examples && instructions.examples.length > 0) {
          lines.push("**Filter Query Examples:**", "");
          for (const ex of instructions.examples) {
            lines.push(`- *${ex.description}*:`);
            lines.push("  ```json");
            lines.push(`  notion_search(${JSON.stringify(ex.request, null, 2)})`);
            lines.push("  ```");
          }
          lines.push("");
        }

        // 4. Comment & Archive Instructions
        lines.push(
          `##### 4. Comments & Archiving for "${title}"`,
          `- **Post Comment**: \`notion_create_comment({ "pageId": "<record-id>", "text": "Task completed!" })\``,
          `- **Get Comments**: \`notion_get_comments({ "pageId": "<record-id>" })\``,
          `- **Archive / Delete Record**: \`notion_archive_page({ "pageId": "<record-id>" })\``,
          "",
        );
      } catch (err: any) {
        lines.push(
          `*(Database schema could not be fetched dynamically: ${err?.message || "Check Notion connectivity"}. Showing standard instructions:)*`,
          "",
          `##### 1. How to Create Records in "${title}" (\`notion_create_page_record\`)`,
          `Use **\`notion_create_page_record\`** to create a new item/row in this database.`,
          `- Standalone page creation is not permitted; records must specify \`databaseId: "${db.id}"\`.`,
          "```json",
          `notion_create_page_record({\n  "databaseId": "${db.id}",\n  "properties": {\n    "Name": "New Record Title"\n  }\n})`,
          "```",
          "",
          `##### 2. How to Update Records in "${title}" (\`notion_update_page\`)`,
          `Use **\`notion_update_page\`** to update properties or append markdown content to a record in this database.`,
          "```json",
          `notion_update_page({\n  "pageId": "<record-id>",\n  "properties": {\n    "Status": "Done"\n  }\n})`,
          "```",
          "",
          `##### 3. Filter Instructions for "${title}" (\`notion_search\`)`,
          `Use **\`notion_search\`** with \`databaseId: "${db.id}"\` to query items in this database.`,
          "```json",
          `notion_search({\n  "databaseId": "${db.id}",\n  "query": "search query"\n})`,
          "```",
          "",
          `##### 4. Comments & Archiving for "${title}"`,
          `- **Post Comment**: \`notion_create_comment({ "pageId": "<record-id>", "text": "Task completed!" })\``,
          `- **Get Comments**: \`notion_get_comments({ "pageId": "<record-id>" })\``,
          `- **Archive / Delete Record**: \`notion_archive_page({ "pageId": "<record-id>" })\``,
          "",
        );
      }
    }
  }

  return lines.join("\n");
}

/**
 * Synchronize the "How to use Notion tools" skill into Qdrant.
 * Always syncs/overwrites the single document point identified by getNotionGuideSkillPointId(username).
 */
export async function syncNotionGuideSkill(options: {
  username?: string;
  activeNotionPages?: ActiveNotionPageConfigItem[];
  apiKeyOverride?: string;
}): Promise<SkillItem | null> {
  const username = options.username || "default";
  const pages = options.activeNotionPages || [];

  try {
    const pointId = getNotionGuideSkillPointId(username);
    const content = await buildNotionGuideSkillContent(pages, options.apiKeyOverride);

    const skill = await upsertSkill({
      id: pointId,
      name: buildConnectionSkillName("notion"),
      description: "Instructions, active pages/databases guide, and filter instructions for Notion workspace",
      content,
      metadata: {
        source: "notion-guide",
        author: username,
        category: "notion",
        tags: ["notion", "guide", "tools", "filter-instructions"],
      },
    });

    return skill;
  } catch (err) {
    // If Qdrant is not configured or offline, log warning without failing configuration save
    console.warn("Could not sync Notion guide skill to Qdrant:", err);
    return null;
  }
}
