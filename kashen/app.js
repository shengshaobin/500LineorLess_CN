(function () {
  const Kashen = window.Kashen;
  const Seed = window.KashenSeed;
  const KEY = "kashen.v1";
  const PLATFORMS = Seed.platforms.slice();
  const CATEGORIES = Seed.categories.slice();

  const els = {
    banner: document.getElementById("banner"),
    platformBar: document.getElementById("platform-bar"),
    search: document.getElementById("search"),
    category: document.getElementById("category"),
    onlyPlatform: document.getElementById("only-platform"),
    ruleList: document.getElementById("rule-list"),
    ignoreCount: document.getElementById("ignore-count"),
    ignores: document.getElementById("ignores"),
    draft: document.getElementById("draft"),
    backdrop: document.getElementById("backdrop"),
    placeholder: document.getElementById("placeholder"),
    editorScroll: document.getElementById("editor-scroll"),
    draftStats: document.getElementById("draft-stats"),
    reviewStats: document.getElementById("review-stats"),
    preview: document.getElementById("preview"),
    emptyReview: document.getElementById("empty-review"),
    opinions: document.getElementById("opinions"),
    applyAuto: document.getElementById("apply-auto"),
    live: document.getElementById("live"),
    toast: document.getElementById("toast"),
    ruleDialog: document.getElementById("rule-dialog"),
    ruleForm: document.getElementById("rule-form"),
    ruleDialogTitle: document.getElementById("rule-dialog-title"),
    term: document.getElementById("rule-term"),
    termWarning: document.getElementById("term-warning"),
    aliases: document.getElementById("rule-aliases"),
    replacement: document.getElementById("rule-replacement"),
    solution: document.getElementById("rule-solution"),
    platformChecks: document.getElementById("platform-checks"),
    platformExtra: document.getElementById("platform-extra"),
    ruleCategory: document.getElementById("rule-category"),
    ruleCategoryCustom: document.getElementById("rule-category-custom"),
    note: document.getElementById("rule-note"),
    skip: document.getElementById("rule-skip"),
    ruleError: document.getElementById("rule-error"),
    importDialog: document.getElementById("import-dialog"),
    importText: document.getElementById("import-text"),
    importFile: document.getElementById("import-file"),
    importError: document.getElementById("import-error"),
    importSummary: document.getElementById("import-summary"),
    importTable: document.getElementById("import-table"),
    importIgnoresLine: document.getElementById("import-ignores-line"),
    importIgnores: document.getElementById("import-ignores"),
  };

  const state = loadState();
  let editingId = "";
  let pendingImport = null;
  let lastReview = emptyReview();
  let lastLive = "";
  let toastTimer = 0;
  let categorySignature = "";

  function emptyReview() {
    return { matches: [], segments: [], opinions: [], stats: { total: 0, auto: 0, suggest: 0 } };
  }

  function loadState() {
    const fresh = {
      version: 1,
      rules: Seed.rules(),
      ignores: Seed.defaultIgnores.slice(),
      platform: "通用",
      draft: Seed.sampleDraft,
      onlyPlatform: true,
      banner: true,
      category: "",
      query: "",
      activeRuleId: "",
    };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || !Array.isArray(raw.rules)) return fresh;
      const seen = new Set();
      fresh.rules = raw.rules.map((rule) => {
        const next = Kashen.cloneRule(rule);
        next.id = String(next.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
        if (!next.id || seen.has(next.id)) next.id = "r_" + Math.random().toString(36).slice(2, 10);
        seen.add(next.id);
        return next;
      });
      fresh.ignores = Array.isArray(raw.ignores) ? raw.ignores.map((item) => String(item)).filter(Boolean) : fresh.ignores;
      fresh.platform = PLATFORMS.includes(raw.platform) ? raw.platform : "通用";
      fresh.draft = typeof raw.draft === "string" ? raw.draft : "";
      fresh.onlyPlatform = raw.onlyPlatform !== false;
      fresh.banner = raw.banner !== false;
      return fresh;
    } catch (error) {
      return fresh;
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: 1,
        rules: state.rules,
        ignores: state.ignores,
        platform: state.platform,
        draft: state.draft,
        onlyPlatform: state.onlyPlatform,
        banner: state.banner,
      }));
    } catch (error) {
      /* private mode or a full disk should not block the review itself */
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function splitList(value) {
    return String(value || "").split(/[/、,，;；|｜\n\t]+/).map((item) => item.trim()).filter(Boolean);
  }

  function severityRank(severity) {
    if (severity === "high") return 3;
    if (severity === "low") return 1;
    return 2;
  }

  function platformMatch(rule) {
    if (!state.onlyPlatform || state.platform === "通用") return true;
    const platforms = rule.platforms && rule.platforms.length ? rule.platforms : ["通用"];
    return platforms.includes("通用") || platforms.includes(state.platform);
  }

  function currentReview() {
    return Kashen.buildReview(state.draft, state.rules, {
      platform: state.platform,
      ignores: state.ignores,
    });
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1600);
  }

  function copyText(text) {
    const done = () => toast("已复制");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => { fallbackCopy(text); done(); });
      return;
    }
    fallbackCopy(text);
    done();
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function buildChrome() {
    els.platformBar.innerHTML = PLATFORMS.map((name) => (
      `<button type="button" data-platform="${name}" aria-pressed="false">${name}</button>`
    )).join("");
    els.platformChecks.innerHTML = PLATFORMS.map((name) => (
      `<label class="check"><input type="checkbox" value="${name}">${name}</label>`
    )).join("");
    els.platformBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-platform]");
      if (!button) return;
      state.platform = button.dataset.platform;
      state.activeRuleId = "";
      refresh();
    });
  }

  function syncPlatforms() {
    els.platformBar.querySelectorAll("button").forEach((button) => {
      const on = button.dataset.platform === state.platform;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    els.onlyPlatform.checked = state.onlyPlatform;
    els.onlyPlatform.disabled = state.platform === "通用";
  }

  function syncBanner() {
    els.banner.hidden = !state.banner;
  }

  function syncIgnoresField() {
    els.ignoreCount.textContent = String(state.ignores.length);
    if (document.activeElement === els.ignores) return;
    const next = state.ignores.join("、");
    if (els.ignores.value !== next) els.ignores.value = next;
  }

  function syncCategoryOptions() {
    const cats = [];
    CATEGORIES.concat(state.rules.map((rule) => rule.category)).forEach((cat) => {
      if (cat && !cats.includes(cat)) cats.push(cat);
    });
    const signature = cats.join("\n");
    if (signature === categorySignature) return;
    categorySignature = signature;
    const current = state.category;
    els.category.innerHTML = `<option value="">全部分类</option>` + cats.map((cat) => (
      `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
    )).join("");
    els.category.value = cats.includes(current) ? current : "";
    state.category = els.category.value;
  }

  function renderRules() {
    syncCategoryOptions();
    const counts = new Map();
    lastReview.matches.forEach((match) => {
      counts.set(match.rule.id, (counts.get(match.rule.id) || 0) + 1);
    });
    const query = state.query.trim().toLowerCase();
    const rules = state.rules.filter((rule) => {
      if (!platformMatch(rule)) return false;
      if (state.category && rule.category !== state.category) return false;
      if (!query) return true;
      const blob = [rule.term, rule.solution, rule.note, rule.replacement, rule.category].concat(rule.aliases).join("\n").toLowerCase();
      return blob.includes(query);
    }).sort((a, b) => {
      const hit = (counts.get(b.id) ? 1 : 0) - (counts.get(a.id) ? 1 : 0);
      if (hit) return hit;
      const severity = severityRank(b.severity) - severityRank(a.severity);
      if (severity) return severity;
      return a.term.localeCompare(b.term, "zh");
    });
    const scroll = els.ruleList.scrollTop;
    if (!rules.length) {
      els.ruleList.innerHTML = `<div class="empty-mini">${state.rules.length ? "没有符合筛选的词条" : "词库是空的。导入以往卡审词后，新文案会按这些词来查。"}</div>`;
    } else {
      els.ruleList.innerHTML = rules.map((rule) => ruleCard(rule, counts.get(rule.id) || 0)).join("");
    }
    els.ruleList.scrollTop = scroll;
  }

  function ruleCard(rule, hits) {
    const mode = rule.action === "auto" ? "自动" : "待确认";
    const replacement = rule.action === "auto" && !rule.replacement
      ? "删掉这个词"
      : (rule.replacement ? "改为「" + escapeHtml(rule.replacement) + "」" : "只标记，不自动改");
    const aliasText = rule.aliases.length ? `<p class="aliases">变体：${escapeHtml(rule.aliases.join("、"))}</p>` : "";
    const note = rule.note ? `<p class="note">案例：${escapeHtml(rule.note)}</p>` : "";
    const platforms = rule.platforms.slice(0, 4).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");
    const extra = rule.platforms.length > 4 ? `<span class="tag">+${rule.platforms.length - 4}</span>` : "";
    return `<article class="rule${hits ? " is-hit" : ""}${rule.enabled ? "" : " is-off"}${state.activeRuleId === rule.id ? " is-active" : ""}" data-id="${rule.id}">
      <div class="rule-top">
        <span class="sev ${rule.severity}">${Kashen.severityLabel(rule.severity)}</span>
        <h3>${escapeHtml(rule.term)}</h3>
        ${hits ? `<span class="badge-hit">命中 ${hits}</span>` : ""}
      </div>
      <p>${replacement}</p>
      <p class="solution">${escapeHtml(rule.solution || "还没有写解决方案")}</p>
      ${note}${aliasText}
      <div class="rule-foot">
        ${platforms}${extra}<span class="tag">${escapeHtml(rule.category)}</span><span class="mode ${rule.action}">${mode}</span>
        <button class="mini" type="button" data-action="toggle-rule" data-id="${rule.id}">${rule.enabled ? "停用" : "启用"}</button>
        <button class="mini" type="button" data-action="edit-rule" data-id="${rule.id}">编辑</button>
        <button class="mini" type="button" data-action="delete-rule" data-id="${rule.id}">删除</button>
      </div>
    </article>`;
  }

  function renderReview() {
    lastReview = currentReview();
    const review = lastReview;
    if (els.draft.value !== state.draft) els.draft.value = state.draft;
    els.backdrop.innerHTML = highlightOriginal(state.draft, review.matches);
    els.placeholder.hidden = state.draft.length > 0;
    els.preview.innerHTML = state.draft ? previewHtml(review) : "";
    const length = Array.from(state.draft).length;
    els.draftStats.textContent = length ? `字数 ${length} · 命中 ${review.stats.total} 处` : "还没有文案";
    els.reviewStats.textContent = state.draft.trim()
      ? `自动 ${review.stats.auto} · 待确认 ${review.stats.suggest}`
      : "改动会高亮，理由写在每条下面";
    els.applyAuto.disabled = review.stats.auto === 0;
    if (!state.draft.trim()) {
      els.emptyReview.hidden = false;
      els.emptyReview.textContent = "中间贴上文案后，这里会给出修改预览和每条理由。";
      els.opinions.innerHTML = "";
    } else if (!review.opinions.length) {
      els.emptyReview.hidden = false;
      els.emptyReview.textContent = "这份文案没有命中当前平台的卡审词。";
      els.opinions.innerHTML = "";
    } else {
      els.emptyReview.hidden = true;
      els.opinions.innerHTML = review.opinions.map((opinion, index) => opinionCard(opinion, index)).join("");
    }
    const message = state.draft.trim()
      ? `命中 ${review.stats.total} 处，自动替换 ${review.stats.auto} 处，待确认 ${review.stats.suggest} 处`
      : "";
    if (message !== lastLive) {
      lastLive = message;
      els.live.textContent = message;
    }
  }

  function markClass(ruleId, base) {
    const on = state.activeRuleId === ruleId ? " is-on" : "";
    const dim = state.activeRuleId && state.activeRuleId !== ruleId ? " is-dim" : "";
    return base + on + dim;
  }

  function highlightOriginal(text, matches) {
    let html = "";
    let cursor = 0;
    matches.forEach((match) => {
      html += escapeHtml(text.slice(cursor, match.start));
      const base = match.kind === "auto" ? "hit-auto" : "hit-suggest";
      html += `<mark class="${markClass(match.rule.id, base)}">${escapeHtml(text.slice(match.start, match.end))}</mark>`;
      cursor = match.end;
    });
    html += escapeHtml(text.slice(cursor));
    return html;
  }

  function previewHtml(review) {
    return review.segments.map((segment) => {
      if (segment.kind === "text") return escapeHtml(segment.text);
      if (segment.kind === "auto") {
        const inserted = segment.replacement
          ? `<ins class="${markClass(segment.ruleId, "")}">${escapeHtml(segment.replacement)}</ins>`
          : `<ins class="${markClass(segment.ruleId, "ghost")}">删除</ins>`;
        return `<del class="${markClass(segment.ruleId, "")}">${escapeHtml(segment.text)}</del>${inserted}`;
      }
      const hint = segment.replacement
        ? `<span class="suggest-chip">改为${escapeHtml(segment.replacement)}</span>`
        : `<span class="suggest-chip warn">需改写</span>`;
      return `<mark class="${markClass(segment.ruleId, "flag")}">${escapeHtml(segment.text)}</mark>${hint}`;
    }).join("");
  }

  function opinionCard(opinion, index) {
    const from = opinion.surfaces.map((item) => `<del>${escapeHtml(item)}</del>`).join(" ");
    let to = `<span class="suggest-chip warn">需人工改写</span>`;
    if (opinion.replacement) to = `<ins>${escapeHtml(opinion.replacement)}</ins>`;
    else if (opinion.action === "auto") to = `<ins class="ghost">删除</ins>`;
    const canApply = opinion.action === "auto" || opinion.replacement;
    const applyLabel = opinion.action === "auto" && !opinion.replacement ? "从原文删除" : (opinion.action === "auto" ? "写回原文" : "采纳这条");
    const caution = opinion.caution ? `<p class="caution">这条和后面的字连在一起，写回前请通读一遍。</p>` : "";
    const note = opinion.note ? `<p class="note">案例：${escapeHtml(opinion.note)}</p>` : "";
    return `<li class="opinion ${opinion.severity}${state.activeRuleId === opinion.ruleId ? " is-active" : ""}" data-opinion="${opinion.ruleId}">
      <div class="opinion-top">
        <span class="tag">${index + 1}</span>
        <span class="sev ${opinion.severity}">${opinion.severityLabel}</span>
        <span class="tag">${escapeHtml(opinion.category)}</span>
        <span class="tag">${opinion.count} 处</span>
        <span class="mode ${opinion.action}">${opinion.action === "auto" ? "自动替换" : "待确认"}</span>
      </div>
      <p class="diff">${from} → ${to}</p>
      <p class="solution">${escapeHtml(opinion.solution || "这条还没有写解决方案。")}</p>
      ${note}${caution}
      <div class="opinion-actions">
        ${canApply ? `<button class="btn" type="button" data-action="apply-rule" data-id="${opinion.ruleId}">${applyLabel}</button>` : ""}
        <button class="mini" type="button" data-action="focus-rule" data-id="${opinion.ruleId}">定位原文</button>
        <button class="mini" type="button" data-action="edit-rule" data-id="${opinion.ruleId}">编辑词条</button>
      </div>
    </li>`;
  }

  function refresh() {
    persist();
    syncPlatforms();
    syncBanner();
    syncIgnoresField();
    renderReview();
    renderRules();
  }

  function setDraft(text, caret) {
    state.draft = text;
    state.activeRuleId = "";
    if (caret != null) {
      refresh();
      els.draft.focus();
      const pos = Math.max(0, Math.min(caret, els.draft.value.length));
      els.draft.setSelectionRange(pos, pos);
      return;
    }
    refresh();
  }

  function focusRule(id, options) {
    if (!id) return;
    if (options && options.toggle && state.activeRuleId === id) state.activeRuleId = "";
    else state.activeRuleId = id;
    renderReview();
    renderRules();
    if (!state.activeRuleId) return;
    const opinion = lastReview.opinions.find((item) => item.ruleId === id);
    if (opinion && opinion.spans[0]) revealOffset(opinion.spans[0].start, opinion.spans[0].end);
    const card = els.ruleList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (card) card.scrollIntoView({ block: "nearest" });
    const item = els.opinions.querySelector(`[data-opinion="${CSS.escape(id)}"]`);
    if (item) item.scrollIntoView({ block: "nearest" });
  }

  function revealOffset(start, end) {
    const textarea = els.draft;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    const mirror = document.createElement("div");
    const style = getComputedStyle(textarea);
    mirror.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box;width:${textarea.clientWidth}px;font-family:${style.fontFamily};font-size:${style.fontSize};line-height:${style.lineHeight};padding:${style.padding};`;
    mirror.textContent = textarea.value.slice(0, start);
    const marker = document.createElement("span");
    marker.textContent = textarea.value.slice(start, end) || " ";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const top = marker.offsetTop;
    mirror.remove();
    const view = els.editorScroll.clientHeight;
    els.editorScroll.scrollTop = Math.max(0, top - view / 3);
  }

  function applyRule(id) {
    const opinion = currentReview().opinions.find((item) => item.ruleId === id);
    if (!opinion) return;
    if (opinion.action !== "auto" && !opinion.replacement) return;
    setDraft(Kashen.applySpans(state.draft, opinion.spans, opinion.replacement), opinion.spans[0].start + opinion.replacement.length);
    toast(opinion.replacement ? "已写回原文" : "已从原文删除");
  }

  function applyAuto() {
    const matches = currentReview().matches.filter((match) => match.kind === "auto");
    if (!matches.length) return;
    const spans = matches.map((match) => ({ start: match.start, end: match.end, replacement: match.replacement }));
    const ordered = spans.sort((a, b) => b.start - a.start);
    let text = state.draft;
    ordered.forEach((span) => {
      text = text.slice(0, span.start) + span.replacement + text.slice(span.end);
    });
    setDraft(text, text.length);
    toast("已写回自动项");
  }

  function openRuleDialog(rule) {
    editingId = rule ? rule.id : "";
    els.ruleForm.reset();
    els.ruleError.hidden = true;
    els.termWarning.hidden = true;
    els.ruleDialogTitle.textContent = rule ? "编辑词条" : "新增词条";
    fillRuleCategories(rule ? rule.category : CATEGORIES[0]);
    els.term.value = rule ? rule.term : "";
    els.aliases.value = rule ? rule.aliases.join("、") : "";
    els.replacement.value = rule ? rule.replacement : "";
    els.solution.value = rule ? rule.solution : "";
    els.note.value = rule ? rule.note : "";
    els.skip.value = rule ? rule.skipInside.join("、") : "";
    const action = rule ? rule.action : "suggest";
    els.ruleForm.elements.action.value = action;
    els.ruleForm.elements.severity.value = rule ? rule.severity : "medium";
    const known = new Set(PLATFORMS);
    const selected = rule ? rule.platforms : ["通用"];
    els.platformChecks.querySelectorAll("input").forEach((input) => {
      input.checked = selected.includes(input.value);
    });
    els.platformExtra.value = selected.filter((item) => !known.has(item)).join("、");
    updateTermWarning();
    els.ruleDialog.showModal();
    els.term.focus();
  }

  function fillRuleCategories(selected) {
    const cats = [];
    CATEGORIES.concat(state.rules.map((rule) => rule.category)).forEach((cat) => {
      if (cat && !cats.includes(cat)) cats.push(cat);
    });
    if (selected && !cats.includes(selected)) cats.push(selected);
    els.ruleCategory.innerHTML = cats.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join("") + `<option value="__custom">自定义</option>`;
    els.ruleCategory.value = selected && cats.includes(selected) ? selected : cats[0];
    els.ruleCategoryCustom.hidden = true;
    els.ruleCategoryCustom.value = "";
  }

  function updateTermWarning() {
    els.termWarning.hidden = [...els.term.value.trim()].length !== 1;
  }

  function readPlatforms() {
    const checked = [...els.platformChecks.querySelectorAll("input:checked")].map((input) => input.value);
    const extra = splitList(els.platformExtra.value);
    const all = [];
    checked.concat(extra).forEach((item) => { if (!all.includes(item)) all.push(item); });
    return all.length ? all : ["通用"];
  }

  function readCategory() {
    if (els.ruleCategory.value === "__custom") return els.ruleCategoryCustom.value.trim() || "未分类";
    return els.ruleCategory.value || "未分类";
  }

  function saveRuleFromForm() {
    const term = els.term.value.trim();
    if (!term) {
      els.ruleError.hidden = false;
      els.ruleError.textContent = "先填写卡审词。";
      return;
    }
    const duplicate = state.rules.find((rule) => Kashen.fold(rule.term).norm === Kashen.fold(term).norm && rule.id !== editingId);
    if (duplicate) {
      els.ruleError.hidden = false;
      els.ruleError.textContent = "词库里已经有「" + duplicate.term + "」。请编辑原来的那条。";
      return;
    }
    const next = Kashen.cloneRule({
      id: editingId || ("r_" + Math.random().toString(36).slice(2, 10)),
      term: term,
      aliases: splitList(els.aliases.value).filter((item) => item !== term),
      action: els.ruleForm.elements.action.value,
      replacement: els.replacement.value.trim(),
      solution: els.solution.value.trim(),
      platforms: readPlatforms(),
      category: readCategory(),
      severity: els.ruleForm.elements.severity.value,
      note: els.note.value.trim(),
      enabled: true,
      skipInside: splitList(els.skip.value),
    });
    if (editingId) {
      const index = state.rules.findIndex((rule) => rule.id === editingId);
      if (index >= 0) {
        next.enabled = state.rules[index].enabled;
        state.rules.splice(index, 1, next);
      } else state.rules.push(next);
    } else state.rules.push(next);
    els.ruleDialog.close();
    refresh();
    toast(editingId ? "已保存词条" : "已加入词库");
  }

  function restoreSeed() {
    const ids = new Set(state.rules.map((rule) => rule.id));
    const terms = new Set(state.rules.map((rule) => Kashen.fold(rule.term).norm));
    let added = 0;
    Seed.rules().forEach((rule) => {
      if (ids.has(rule.id) || terms.has(Kashen.fold(rule.term).norm)) return;
      state.rules.push(rule);
      added += 1;
    });
    Seed.defaultIgnores.forEach((item) => {
      if (!state.ignores.includes(item)) state.ignores.push(item);
    });
    refresh();
    toast(added ? "已补回 " + added + " 条内置词" : "内置词都在");
  }

  function showImport(text) {
    els.importText.value = text || "";
    pendingImport = null;
    renderImportPreview();
    if (!els.importDialog.open) els.importDialog.showModal();
  }

  function renderImportPreview() {
    const parsed = Kashen.parseImport(els.importText.value);
    if (parsed.rules.length > 2000) {
      parsed.errors.push("一次最多导入 2000 条。");
      parsed.rules = [];
    }
    pendingImport = parsed;
    const errorText = parsed.errors.slice(0, 6).join("；");
    els.importError.hidden = !errorText;
    els.importError.textContent = errorText;
    const auto = parsed.rules.filter((rule) => rule.action === "auto").length;
    els.importSummary.textContent = parsed.rules.length
      ? `识别到 ${parsed.rules.length} 条，其中自动替换 ${auto} 条，待确认 ${parsed.rules.length - auto} 条。`
      : "还没有识别到词条。";
    els.importIgnoresLine.hidden = !parsed.ignores;
    const rows = parsed.rules.slice(0, 8).map((rule) => (
      `<tr><td>${escapeHtml(rule.term)}</td><td>${escapeHtml(rule.replacement || "—")}</td><td>${escapeHtml(rule.solution || "—")}</td><td>${rule.action === "auto" ? "自动" : "确认"}</td></tr>`
    )).join("");
    els.importTable.innerHTML = rows ? `<table class="import-preview"><thead><tr><th>卡审词</th><th>替换</th><th>方案</th><th>处理</th></tr></thead><tbody>${rows}</tbody></table>` : "";
  }

  function confirmImport(mode) {
    renderImportPreview();
    if (!pendingImport || !pendingImport.rules.length) {
      els.importError.hidden = false;
      els.importError.textContent = els.importError.textContent || "没有可以导入的词条。";
      return;
    }
    if (mode === "replace" && !window.confirm("替换会清掉现在的词库，只保留这次导入的内容。")) return;
    state.rules = Kashen.mergeRules(mode === "replace" ? [] : state.rules, pendingImport.rules, mode === "replace" ? "replace" : "append");
    if (pendingImport.ignores && els.importIgnores.checked) {
      state.ignores = mode === "replace" ? pendingImport.ignores.slice() : Array.from(new Set(state.ignores.concat(pendingImport.ignores)));
    }
    els.importDialog.close();
    refresh();
    toast(mode === "replace" ? "已替换词库" : "已追加到词库");
  }

  function readImportFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showImport("");
      els.importError.hidden = false;
      els.importError.textContent = "文件超过 2MB。";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => showImport(String(reader.result || ""));
    reader.readAsText(file, "utf-8");
  }

  function handleAction(button) {
    const action = button.dataset.action;
    const id = button.dataset.id || "";
    if (action === "dismiss-banner") {
      state.banner = false;
      refresh();
      return;
    }
    if (action === "import") { showImport(els.importText.value); return; }
    if (action === "export") {
      const blob = new Blob([JSON.stringify({ version: 1, rules: state.rules, ignores: state.ignores }, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "卡审词库.json";
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
    if (action === "add") { openRuleDialog(null); return; }
    if (action === "sample") {
      if (state.draft.trim() && state.draft !== Seed.sampleDraft && !window.confirm("用示例文案替换当前内容？")) return;
      setDraft(Seed.sampleDraft, 0);
      return;
    }
    if (action === "clear-draft") {
      if (state.draft && !window.confirm("清空中间的文案？")) return;
      setDraft("", 0);
      return;
    }
    if (action === "copy-preview") { copyText(Kashen.reviewToPlain(currentReview())); return; }
    if (action === "copy-report") { copyText(Kashen.reviewToReport(currentReview())); return; }
    if (action === "apply-auto") { applyAuto(); return; }
    if (action === "apply-rule") { applyRule(id); return; }
    if (action === "focus-rule") { focusRule(id); return; }
    if (action === "edit-rule") {
      const rule = state.rules.find((item) => item.id === id);
      if (rule) openRuleDialog(rule);
      return;
    }
    if (action === "toggle-rule") {
      const rule = state.rules.find((item) => item.id === id);
      if (!rule) return;
      rule.enabled = !rule.enabled;
      refresh();
      return;
    }
    if (action === "delete-rule") {
      if (button.dataset.confirm !== "1") {
        button.dataset.confirm = "1";
        button.textContent = "确认删除";
        return;
      }
      state.rules = state.rules.filter((item) => item.id !== id);
      if (state.activeRuleId === id) state.activeRuleId = "";
      refresh();
      return;
    }
    if (action === "restore-seed") { restoreSeed(); return; }
    if (action === "clear-rules") {
      if (!window.confirm("清空后只保留你之后新导入的词。内置词可以再恢复。")) return;
      state.rules = [];
      state.activeRuleId = "";
      refresh();
      return;
    }
    if (action === "confirm-import") { confirmImport(button.dataset.mode); return; }
    if (action === "close-dialog") {
      const dialog = document.getElementById(button.dataset.dialog);
      if (dialog) dialog.close();
    }
  }

  function bind() {
    buildChrome();
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (button) {
        handleAction(button);
        return;
      }
      const card = event.target.closest(".rule");
      if (card && card.closest("#rule-list")) focusRule(card.dataset.id, { toggle: true });
    });
    els.search.addEventListener("input", () => {
      state.query = els.search.value;
      renderRules();
    });
    els.category.addEventListener("change", () => {
      state.category = els.category.value;
      renderRules();
    });
    els.onlyPlatform.addEventListener("change", () => {
      state.onlyPlatform = els.onlyPlatform.checked;
      refresh();
    });
    els.draft.addEventListener("input", () => {
      state.draft = els.draft.value;
      state.activeRuleId = "";
      refresh();
    });
    els.ignores.addEventListener("input", () => {
      state.ignores = splitList(els.ignores.value);
      refresh();
    });
    els.ruleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveRuleFromForm();
    });
    els.term.addEventListener("input", updateTermWarning);
    els.ruleCategory.addEventListener("change", () => {
      const custom = els.ruleCategory.value === "__custom";
      els.ruleCategoryCustom.hidden = !custom;
      if (custom) els.ruleCategoryCustom.focus();
    });
    els.importText.addEventListener("input", renderImportPreview);
    els.importFile.addEventListener("change", () => {
      readImportFile(els.importFile.files && els.importFile.files[0]);
      els.importFile.value = "";
    });
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) readImportFile(file);
    });
    refresh();
  }

  bind();
  window.KashenDebug = {
    getState: () => state,
    currentReview: currentReview,
    setDraft: setDraft,
  };
})();
