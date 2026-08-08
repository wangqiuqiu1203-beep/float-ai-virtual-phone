// lib/worldbook-docx-import.ts
// 支持从 .docx / .txt / .md 文本导入世界书：
// 1. docx -> 纯文本（jszip 解压 + 正则提取 w:t / w:br / w:p）
// 2. 纯文本 -> WorldBookConfig（按标题/梗条目自动拆分词条并生成触发关键词）

import JSZip from "jszip";
import type { WorldBookConfig, WorldBookEntry } from "./settings-types";
import { createWorldBook, parseWorldBookFromJson } from "./settings-storage";

/** 把 docx 的 document.xml 转成带换行的纯文本（按文档顺序混合提取）。 */
function docxXmlToText(xml: string): string {
  const tokens: string[] = [];
  const re = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:br[^>]*\/>|<\/w:p>|<w:tab[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[0].startsWith("<w:br")) tokens.push("\n");
    else if (m[0].startsWith("<w:tab")) tokens.push("\t");
    else if (m[0] === "</w:p>") tokens.push("\n");
  }
  return tokens.join("");
}

/** 读取 .docx 文件，返回纯文本（段落按换行分隔）。 */
export async function parseDocxFileToText(file: File): Promise<string> {
  return parseDocxArrayBufferToText(await file.arrayBuffer());
}

/** 从 docx 的 ArrayBuffer 提取纯文本。 */
export async function parseDocxArrayBufferToText(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("不是有效的 docx 文件（缺少 word/document.xml）");
  const xml = await entry.async("string");
  const text = docxXmlToText(xml);
  if (!text.trim()) throw new Error("docx 文件中没有可提取的文本");
  return text;
}

/** 读取 .txt / .md 文件。 */
export function readPlainTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result ?? ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsText(file, "utf-8");
  });
}

/** 按文件类型读取文本内容。 */
export async function readWorldBookSourceText(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".docx")) return parseDocxFileToText(file);
  return readPlainTextFile(file);
}

/** 从标题提取触发关键词：去编号/标点，按顿号斜杠切分，每段整词保留（最多6个）。 */
function keywordsFromTitle(title: string): string {
  const cleaned = title
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\d{1,3}[\.、．)\s]*/, "")
    .replace(/[（(【\[].*?[）)】\]]/g, "")
    .replace(/[·:：，,。！？!?、\s"'“”‘’\-—/\\|~`]+/g, " ")
    .trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const words: string[] = [];
  for (const p of parts) {
    if (/^[\u4e00-\u9fff]+$/.test(p)) {
      // 中文整段保留（<=8字），过长截前6字
      const w = p.length > 8 ? p.slice(0, 6) : p;
      if (!words.includes(w)) words.push(w);
    } else if (p.length >= 2 && !words.includes(p)) {
      words.push(p);
    }
  }
  return words.slice(0, 6).join(",");
}

/** 生成一个世界书词条。 */
function makeEntry(opts: {
  key: string;
  content: string;
  comment: string;
  insertionOrder: number;
  constant?: boolean;
}): WorldBookEntry {
  return {
    uid: `wb-entry-${Date.now()}-${opts.insertionOrder}-${Math.random().toString(36).slice(2, 7)}`,
    key: opts.key,
    content: opts.content.trim(),
    comment: opts.comment,
    use_regex: false,
    disable: false,
    constant: opts.constant ?? false,
    position: "before_char",
    insertion_order: opts.insertionOrder,
  };
}

/**
 * 把纯文本转换为世界书：
 * - 按 Markdown / 编号标题拆分章节
 * - 章节内若含大量 `**"梗"**` 条目，则拆成逐条词条（触发词=梗本身）
 * - 章节内若含 `**xx类**` 子标题（如文案库分类），按子标题拆分
 */
export function buildWorldBookFromText(
  text: string,
  fallbackName: string,
): WorldBookConfig {
  const cleaned = text
    .replace(/\u3000/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const lines = cleaned.split("\n");

  // 识别章节标题
  const headingRe = /^(#{1,6}\s*|\d{1,3}[\.、．]\s*).+/;
  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (headingRe.test(line)) {
      if (current && current.lines.length) sections.push(current);
      current = { title: line, lines: [] };
    } else if (current) {
      current.lines.push(raw);
    } else {
      // 文档开头无标题的内容归入"前言"
      if (!sections.length) current = { title: "前言", lines: [raw] };
      else sections[sections.length - 1].lines.push(raw);
    }
  }
  if (current && current.lines.length) sections.push(current);
  if (!sections.length && cleaned.trim()) {
    sections.push({ title: fallbackName, lines: cleaned.split("\n") });
  }

  const entries: WorldBookEntry[] = [];
  let order = 0;
  let lastWasMemeSection = false;

  for (const section of sections) {
    const body = section.lines.join("\n").trim();
    if (!body) continue;
    const titleText = section.title.replace(/^#{1,6}\s*/, "").trim();

    // 1) 梗条目模式：`**"xx"**`（必须带引号，兼容 "xx""yy" 双梗），>=2 条则拆分
    const memeRe = /^\*\*["“]([^"”*]{1,40})["”]/;
    const memeLines = section.lines.filter((l) => memeRe.test(l.trim()));
    if (memeLines.length >= 2 && body.length > 120) {
      let currentMeme: { key: string; comment: string; lines: string[] } | null = null;
      const pushMeme = () => {
        if (!currentMeme) return;
        entries.push(
          makeEntry({
            key: currentMeme.key,
            content: currentMeme.lines.join("\n").trim(),
            comment: currentMeme.comment,
            insertionOrder: order++,
          }),
        );
      };
      for (const raw of section.lines) {
        const line = raw.trim();
        const m = line.match(memeRe);
        if (m) {
          pushMeme();
          const memeName = m[1].trim();
          currentMeme = {
            key: memeName.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").slice(0, 24) || keywordsFromTitle(memeName),
            comment: memeName,
            lines: [raw],
          };
        } else if (currentMeme) {
          currentMeme.lines.push(raw);
        }
      }
      pushMeme();
      lastWasMemeSection = true;
      continue;
    }
    lastWasMemeSection = false;

    // 2) 子类目模式：`**xx类**` 开头，>=2 条则拆分
    const subRe = /^\*\*([^"“”*]{1,24}?类)\*\*/;
    const subLines = section.lines.filter((l) => subRe.test(l.trim()));
    if (subLines.length >= 2) {
      let currentSub: { key: string; comment: string; lines: string[] } | null = null;
      const pushSub = () => {
        if (!currentSub) return;
        entries.push(
          makeEntry({
            key: currentSub.key,
            content: currentSub.lines.join("\n").trim(),
            comment: currentSub.comment,
            insertionOrder: order++,
          }),
        );
      };
      for (const raw of section.lines) {
        const line = raw.trim();
        const m = line.match(subRe);
        if (m) {
          pushSub();
          const subName = m[1].trim().replace(/[：:]+$/, "");
          currentSub = {
            key: keywordsFromTitle(subName) || subName.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").slice(0, 16),
            comment: subName,
            lines: [raw],
          };
        } else if (currentSub) {
          currentSub.lines.push(raw);
        }
      }
      pushSub();
      continue;
    }

    // 3) 整章节一条
    const titleKeywords = keywordsFromTitle(titleText);
    const fallbackKey = fallbackName.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").slice(0, 16) || "世界书";
    entries.push(
      makeEntry({
        key: titleKeywords || fallbackKey,
        content: `${section.title}\n${body}`,
        comment: titleText,
        insertionOrder: order++,
        constant: /身份|核心原则|安全边界|一句话总结/.test(titleText),
      }),
    );
  }

  const wb = createWorldBook(fallbackName);
  wb.entries = entries;
  return wb;
}

// --- ZIP 世界书包（递归解压） ──────────────────────────────

const MAX_ZIP_DEPTH = 6;

/** 解析一个世界书包文件：递归解压 zip（含嵌套 zip），收集其中的 docx/txt/md/json 并转为独立世界书。 */
export async function parseWorldBookZip(file: File): Promise<WorldBookConfig[]> {
  const results: WorldBookConfig[] = [];
  const seenNames = new Set<string>();
  await walkZipBuffer(await file.arrayBuffer(), results, seenNames, 0);
  return results;
}

async function walkZipBuffer(
  buffer: ArrayBuffer,
  results: WorldBookConfig[],
  seenNames: Set<string>,
  depth: number,
): Promise<void> {
  if (depth > MAX_ZIP_DEPTH) return;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return; // 不是有效 zip，跳过
  }

  const tasks: Promise<void>[] = [];
  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const lower = relPath.toLowerCase();
    const baseName = relPath.split("/").pop()?.replace(/\.[^.]+$/, "").trim() || "导入的世界书";

    if (lower.endsWith(".zip")) {
      tasks.push(
        entry.async("arraybuffer").then((buf) => walkZipBuffer(buf, results, seenNames, depth + 1)),
      );
    } else if (lower.endsWith(".json")) {
      tasks.push(
        entry.async("string").then(async (text) => {
          try {
            const wb = parseWorldBookFromJson(text);
            if (wb && wb.entries.length > 0) pushUnique(wb, results, seenNames);
          } catch {
            // 单个文件失败不影响其他文件
          }
        }),
      );
    } else if (lower.endsWith(".docx")) {
      tasks.push(
        entry.async("arraybuffer").then(async (buf) => {
          try {
            const text = await parseDocxArrayBufferToText(buf);
            if (text.trim()) pushUnique(buildWorldBookFromText(text, baseName), results, seenNames);
          } catch {
            // 单个文件失败不影响其他文件
          }
        }),
      );
    } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
      tasks.push(
        entry.async("string").then((text) => {
          if (text.trim()) pushUnique(buildWorldBookFromText(text, baseName), results, seenNames);
        }),
      );
    }
  });
  await Promise.all(tasks);
}

function pushUnique(wb: WorldBookConfig, results: WorldBookConfig[], seenNames: Set<string>): void {
  const key = wb.name;
  if (seenNames.has(key)) return;
  seenNames.add(key);
  results.push(wb);
}