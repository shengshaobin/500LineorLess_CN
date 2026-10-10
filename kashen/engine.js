(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Kashen = api;
})(typeof self !== "undefined" ? self : this, function () {
  const PARTICLES = "的了啦啊呀呢吧过吗嘛哦喔";

  function fold(text) {
    const source = String(text || "");
    let norm = "";
    const map = [];
    for (let i = 0; i < source.length; ) {
      const cp = source.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      let folded = ch;
      if (cp >= 0xff01 && cp <= 0xff5e) folded = String.fromCharCode(cp - 0xfee0);
      else if (cp === 0x3000) folded = " ";
      folded = folded.toLowerCase();
      for (let k = 0; k < folded.length; k++) {
        norm += folded[k];
        map.push(i);
      }
      i += ch.length;
    }
    return { norm, map, text: source };
  }

  function originalRange(folded, start, end) {
    if (end <= start) return [0, 0];
    const from = folded.map[start];
    const last = folded.map[end - 1];
    const cp = folded.text.codePointAt(last);
    const len = cp > 0xffff ? 2 : 1;
    return [from, last + len];
  }

  function isAsciiToken(value) {
    return /^[a-z0-9]+$/.test(value);
  }

  function bounded(norm, start, end) {
    const word = (ch) => /[a-z0-9]/.test(ch || "");
    return !word(norm[start - 1]) && !word(norm[end]);
  }

  function severityRank(severity) {
    if (severity === "high") return 3;
    if (severity === "low") return 1;
    return 2;
  }

  function severityLabel(severity) {
    if (severity === "high") return "高";
    if (severity === "low") return "低";
    return "中";
  }

  function ruleApplies(rule, platform) {
    if (!rule || rule.enabled === false) return false;
    if (!platform || platform === "通用") return true;
    const platforms = rule.platforms && rule.platforms.length ? rule.platforms : ["通用"];
    return platforms.includes("通用") || platforms.includes(platform);
  }

  function findPhraseSpans(folded, phrase) {
    const needle = fold(phrase).norm;
    if (!needle) return [];
    const ascii = isAsciiToken(needle);
    const spans = [];
    let from = 0;
    while (from <= folded.norm.length - needle.length) {
      const index = folded.norm.indexOf(needle, from);
      if (index < 0) break;
      const end = index + needle.length;
      if (!ascii || bounded(folded.norm, index, end)) {
        const range = originalRange(folded, index, end);
        spans.push({ start: range[0], end: range[1] });
      }
      from = index + 1;
    }
    return spans;
  }

  function contained(span, covers) {
    return covers.some((cover) => span.start >= cover.start && span.end <= cover.end);
  }

  function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
  }

  function cautionNext(text, end) {
    const next = text[end] || "";
    return /[\u3400-\u9fff]/.test(next) && !PARTICLES.includes(next);
  }

  function cloneRule(rule) {
    return {
      id: rule.id || "",
      term: String(rule.term || "").trim(),
      aliases: [...(rule.aliases || [])],
      action: rule.action === "suggest" ? "suggest" : "auto",
      replacement: rule.replacement == null ? "" : String(rule.replacement),
      solution: String(rule.solution || "").trim(),
      platforms: [...(rule.platforms && rule.platforms.length ? rule.platforms : ["通用"])],
      category: rule.category || "未分类",
      severity: rule.severity === "high" || rule.severity === "low" ? rule.severity : "medium",
      note: String(rule.note || "").trim(),
      enabled: rule.enabled !== false,
      skipInside: [...(rule.skipInside || [])],
    };
  }

  function buildReview(text, rules, options) {
    const source = String(text || "");
    const settings = options || {};
    const platform = settings.platform || "通用";
    const folded = fold(source);
    const ignoreSpans = [];
    (settings.ignores || []).forEach((phrase) => {
      findPhraseSpans(folded, phrase).forEach((span) => ignoreSpans.push(span));
    });

    const localCache = new Map();
    const candidates = [];
    (rules || []).forEach((raw) => {
      if (!ruleApplies(raw, platform)) return;
      const rule = cloneRule(raw);
      if (!rule.term) return;
      const phrases = [{ phrase: rule.term, alias: false }];
      rule.aliases.forEach((alias) => phrases.push({ phrase: alias, alias: true }));
      phrases.forEach((item) => {
        findPhraseSpans(folded, item.phrase).forEach((span) => {
          candidates.push({
            start: span.start,
            end: span.end,
            surface: source.slice(span.start, span.end),
            rule: rule,
          });
        });
      });
    });

    candidates.sort((a, b) => {
      const lengthDelta = b.end - b.start - (a.end - a.start);
      if (lengthDelta) return lengthDelta;
      const severityDelta = severityRank(b.rule.severity) - severityRank(a.rule.severity);
      if (severityDelta) return severityDelta;
      if (a.rule.action !== b.rule.action) return a.rule.action === "auto" ? -1 : 1;
      return a.start - b.start;
    });

    const chosen = [];
    candidates.forEach((candidate) => {
      if (!localCache.has(candidate.rule.id)) {
        const spans = [];
        (candidate.rule.skipInside || []).forEach((phrase) => {
          findPhraseSpans(folded, phrase).forEach((span) => spans.push(span));
        });
        localCache.set(candidate.rule.id, spans);
      }
      if (contained(candidate, ignoreSpans)) return;
      if (contained(candidate, localCache.get(candidate.rule.id))) return;
      if (chosen.some((kept) => overlaps(kept, candidate))) return;
      chosen.push(candidate);
    });
    chosen.sort((a, b) => a.start - b.start || a.end - b.end);

    const matches = chosen.map((match) => ({
      start: match.start,
      end: match.end,
      surface: match.surface,
      replacement: match.rule.replacement,
      kind: match.rule.action === "auto" ? "auto" : "suggest",
      caution: match.rule.action === "auto" && cautionNext(source, match.end),
      rule: match.rule,
    }));

    const segments = [];
    let cursor = 0;
    matches.forEach((match) => {
      if (match.start > cursor) {
        segments.push({ kind: "text", text: source.slice(cursor, match.start) });
      }
      segments.push({
        kind: match.kind,
        text: source.slice(match.start, match.end),
        replacement: match.replacement,
        ruleId: match.rule.id,
        caution: match.caution,
      });
      cursor = match.end;
    });
    if (cursor < source.length) segments.push({ kind: "text", text: source.slice(cursor) });

    const opinions = [];
    const grouped = new Map();
    matches.forEach((match) => {
      let opinion = grouped.get(match.rule.id);
      if (!opinion) {
        opinion = {
          ruleId: match.rule.id,
          term: match.rule.term,
          action: match.rule.action,
          replacement: match.rule.replacement,
          solution: match.rule.solution,
          note: match.rule.note,
          category: match.rule.category,
          severity: match.rule.severity,
          severityLabel: severityLabel(match.rule.severity),
          platforms: match.rule.platforms,
          count: 0,
          caution: false,
          surfaces: [],
          spans: [],
        };
        grouped.set(match.rule.id, opinion);
        opinions.push(opinion);
      }
      opinion.count += 1;
      opinion.caution = opinion.caution || match.caution;
      if (!opinion.surfaces.includes(match.surface)) opinion.surfaces.push(match.surface);
      opinion.spans.push({ start: match.start, end: match.end });
    });

    const stats = {
      total: matches.length,
      auto: matches.filter((match) => match.kind === "auto").length,
      suggest: matches.filter((match) => match.kind === "suggest").length,
    };

    return { text: source, matches, segments, opinions, stats };
  }

  function reviewToPlain(review) {
    return (review.segments || [])
      .map((segment) => (segment.kind === "auto" ? segment.replacement : segment.text))
      .join("");
  }

  function reviewToReport(review) {
    const lines = ["【修改预览】", reviewToPlain(review), "", "【修改意见】"];
    if (!review.opinions.length) {
      lines.push("未命中当前平台的卡审词。");
      return lines.join("\n");
    }
    review.opinions.forEach((opinion, index) => {
      const from = opinion.surfaces.map((item) => `「${item}」`).join("");
      let arrow = "→ （需人工改写）";
      if (opinion.replacement) arrow = `→「${opinion.replacement}」`;
      else if (opinion.action === "auto") arrow = "→（删除）";
      const mode = opinion.action === "auto" ? "自动替换" : "待确认";
      lines.push(`${index + 1}. ${from}${arrow}（${mode}，${opinion.count} 处）`);
      if (opinion.solution) lines.push(`   方案：${opinion.solution}`);
      if (opinion.note) lines.push(`   案例：${opinion.note}`);
      if (opinion.caution) lines.push("   注意：和后面的字连在一起，写回前请通读。");
    });
    return lines.join("\n");
  }

  function applySpans(text, spans, replacement) {
    const ordered = [...spans].sort((a, b) => b.start - a.start);
    let next = String(text || "");
    ordered.forEach((span) => {
      next = next.slice(0, span.start) + replacement + next.slice(span.end);
    });
    return next;
  }

  function stripBom(text) {
    return String(text || "").replace(/^\uFEFF/, "");
  }

  function detectDelimiter(text) {
    const first = text.split(/\r?\n/).find((line) => line.trim()) || "";
    const tabs = (first.match(/\t/g) || []).length;
    const commas = (first.match(/,/g) || []).length;
    const ideographic = (first.match(/，/g) || []).length;
    if (tabs > commas && tabs >= ideographic) return "\t";
    if (!commas && !tabs && ideographic) return "，";
    return ",";
  }

  function parseTable(text) {
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") cell += ch;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((items) => items.some((item) => String(item).trim()));
  }

  function canonHeader(header) {
    const key = String(header || "").trim().toLowerCase();
    const table = {
      卡审词: "term",
      敏感词: "term",
      违禁词: "term",
      关键词: "term",
      词: "term",
      term: "term",
      keyword: "term",
      替换: "replacement",
      替换建议: "replacement",
      替换为: "replacement",
      建议替换: "replacement",
      replacement: "replacement",
      replace: "replacement",
      解决方案: "solution",
      方案: "solution",
      修改意见: "solution",
      说明: "solution",
      原因: "solution",
      solution: "solution",
      平台: "platforms",
      适用平台: "platforms",
      platform: "platforms",
      platforms: "platforms",
      分类: "category",
      类别: "category",
      category: "category",
      严重程度: "severity",
      级别: "severity",
      风险: "severity",
      severity: "severity",
      处理: "action",
      处理方式: "action",
      action: "action",
      备注: "note",
      案例: "note",
      以往案例: "note",
      历史案例: "note",
      note: "note",
      别名: "aliases",
      变体: "aliases",
      aliases: "aliases",
      排除词: "skipInside",
      忽略: "skipInside",
      skipinside: "skipInside",
      启用: "enabled",
      enabled: "enabled",
    };
    return table[key] || "";
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.flatMap((item) => splitList(item));
    return String(value || "")
      .split(/[/、,，;；|｜\n\t]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseSeverity(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return "medium";
    if (/高|严重|high|^h$/.test(text)) return "high";
    if (/低|low|^l$/.test(text)) return "low";
    return "medium";
  }

  function parseAction(value, replacement) {
    const text = String(value || "").trim().toLowerCase();
    if (text) {
      if (/确认|标记|提示|人工|suggest|flag|仅/.test(text)) return "suggest";
      if (/自动|替换|auto|replace/.test(text)) return "auto";
    }
    return replacement ? "auto" : "suggest";
  }

  function parseEnabled(value) {
    if (value == null || value === "") return true;
    return !/^(0|false|否|停用|禁用|no|off)$/i.test(String(value).trim());
  }

  function pick(obj, keys) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
    }
    return undefined;
  }

  function uid() {
    return "r_" + Math.random().toString(36).slice(2, 10);
  }

  function safeId(id) {
    const cleaned = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    return cleaned;
  }

  function normalizeRule(raw, label) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { error: label + " 不是一条词条" };
    }
    const termValue = pick(raw, ["term", "卡审词", "敏感词", "违禁词", "关键词", "词", "keyword"]);
    const term = String(termValue || "").trim();
    if (!term) return { error: label + " 缺少卡审词" };
    if ([...term].length > 200) return { error: label + " 的卡审词过长" };
    const replacementValue = pick(raw, ["replacement", "替换", "替换建议", "替换为", "建议替换", "replace"]);
    const replacement = replacementValue == null ? "" : String(replacementValue).trim();
    const solutionValue = pick(raw, ["solution", "解决方案", "方案", "修改意见", "说明", "原因"]);
    const solution = solutionValue == null ? "" : String(solutionValue).trim();
    const platforms = splitList(pick(raw, ["platforms", "平台", "适用平台", "platform"]) || "");
    const aliases = splitList(pick(raw, ["aliases", "别名", "变体"]) || "");
    const skipInside = splitList(pick(raw, ["skipInside", "排除词", "忽略"]) || "");
    const categoryValue = pick(raw, ["category", "分类", "类别"]);
    const noteValue = pick(raw, ["note", "备注", "案例", "以往案例", "历史案例"]);
    return {
      rule: {
        id: safeId(pick(raw, ["id"]) || "") || uid(),
        term: term,
        aliases: aliases.filter((item) => item !== term),
        action: parseAction(pick(raw, ["action", "处理", "处理方式"]), replacement),
        replacement: replacement,
        solution: solution,
        platforms: platforms.length ? platforms : ["通用"],
        category: String(categoryValue || "未分类").trim() || "未分类",
        severity: parseSeverity(pick(raw, ["severity", "严重程度", "级别", "风险"])),
        note: String(noteValue || "").trim(),
        enabled: parseEnabled(pick(raw, ["enabled", "启用"])),
        skipInside: skipInside,
      },
    };
  }

  function looksLikeHeader(cells) {
    return /卡审|敏感|违禁|关键词|term|keyword|替换|solution|解决方案|修改意见/.test(
      cells.join(" ").toLowerCase()
    );
  }

  function parseDelimited(text) {
    const rows = parseTable(text);
    if (!rows.length) return null;
    const headers = rows[0].map(canonHeader);
    if (!headers.includes("term")) {
      if (looksLikeHeader(rows[0])) {
        return { error: "表头里没有「卡审词」这一列", rules: [] };
      }
      return null;
    }
    const rules = [];
    const errors = [];
    rows.slice(1).forEach((row, index) => {
      const record = {};
      headers.forEach((header, column) => {
        if (header) record[header] = row[column] == null ? "" : row[column];
      });
      const parsed = normalizeRule(record, "第 " + (index + 2) + " 行");
      if (parsed.error) errors.push(parsed.error);
      else rules.push(parsed.rule);
    });
    return { rules, errors, format: "table" };
  }

  function splitLine(line) {
    if (/=>|->|→/.test(line)) {
      const parts = line.split(/=>|->|→/);
      const left = parts.shift();
      const right = parts.join("→");
      return [left].concat(right.split("|"));
    }
    if (line.includes("\t")) return line.split("\t");
    if (line.includes("|")) return line.split("|");
    if (line.includes(",") || line.includes("，")) return line.split(/,|，/);
    return [line];
  }

  function parseLines(text) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    const rules = [];
    const errors = [];
    lines.forEach((line, index) => {
      const parts = splitLine(line).map((part) => part.trim());
      const parsed = normalizeRule(
        {
          term: parts[0] || "",
          replacement: parts[1] || "",
          solution: parts[2] || "",
          platforms: parts[3] || "",
          category: parts[4] || "",
          severity: parts[5] || "",
          action: parts[6] || "",
          note: parts[7] || "",
        },
        "第 " + (index + 1) + " 行"
      );
      if (parsed.error) errors.push(parsed.error);
      else rules.push(parsed.rule);
    });
    return { rules, errors, format: "lines" };
  }

  function parseJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { error: "JSON 无法解析" };
    }
    let items = [];
    let ignores = null;
    if (Array.isArray(data)) items = data;
    else if (data && typeof data === "object") {
      items = data.rules || data.data || data.items || data["词库"] || [];
      if (data.ignores || data["忽略词"]) ignores = splitList(data.ignores || data["忽略词"]);
    } else return { error: "JSON 里没有词条列表" };
    if (!Array.isArray(items)) return { error: "JSON 里没有词条列表" };
    const rules = [];
    const errors = [];
    items.forEach((item, index) => {
      const parsed = normalizeRule(item, "第 " + (index + 1) + " 条");
      if (parsed.error) errors.push(parsed.error);
      else rules.push(parsed.rule);
    });
    return { rules, errors, ignores, format: "json" };
  }

  function parseImport(text) {
    const source = stripBom(text).trim();
    if (!source) return { rules: [], errors: ["内容是空的"], format: "empty", ignores: null };
    if (source.startsWith("PK")) {
      return { rules: [], errors: ["这像是 Excel 文件。请在 Excel 里另存为 CSV 再导入。"], format: "xlsx", ignores: null };
    }
    if (source.startsWith("{") || source.startsWith("[")) {
      const parsed = parseJson(source);
      if (!parsed.error) {
        return {
          rules: parsed.rules,
          errors: parsed.errors,
          format: "json",
          ignores: parsed.ignores || null,
        };
      }
      return { rules: [], errors: [parsed.error], format: "json", ignores: null };
    }
    const table = parseDelimited(source);
    if (table) {
      return {
        rules: table.rules,
        errors: table.error ? [table.error].concat(table.errors || []) : table.errors,
        format: table.format || "table",
        ignores: null,
      };
    }
    const lines = parseLines(source);
    return { rules: lines.rules, errors: lines.errors, format: "lines", ignores: null };
  }

  function mergeRules(existing, incoming, mode) {
    const used = new Set();
    if (mode === "replace") {
      return incoming.map((rule) => {
        const next = cloneRule(rule);
        let id = safeId(next.id);
        if (!id || used.has(id)) id = uid();
        while (used.has(id)) id = uid();
        used.add(id);
        next.id = id;
        return next;
      });
    }
    const next = (existing || []).map(cloneRule);
    const byTerm = new Map(next.map((rule) => [fold(rule.term).norm, rule]));
    next.forEach((rule) => used.add(rule.id));
    incoming.forEach((raw) => {
      const rule = cloneRule(raw);
      const key = fold(rule.term).norm;
      const prev = byTerm.get(key);
      if (prev) {
        const id = prev.id;
        Object.assign(prev, rule, { id: id });
      } else {
        let id = safeId(rule.id);
        if (!id || used.has(id)) id = uid();
        while (used.has(id)) id = uid();
        used.add(id);
        rule.id = id;
        next.push(rule);
        byTerm.set(key, rule);
      }
    });
    return next;
  }

  return {
    fold: fold,
    buildReview: buildReview,
    reviewToPlain: reviewToPlain,
    reviewToReport: reviewToReport,
    applySpans: applySpans,
    parseImport: parseImport,
    mergeRules: mergeRules,
    severityLabel: severityLabel,
    ruleApplies: ruleApplies,
    cloneRule: cloneRule,
  };
});
