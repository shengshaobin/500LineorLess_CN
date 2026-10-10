const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("./engine");
const seed = require("./seed");

const SAMPLE_PLAIN =
  "这款面霜是我用过好用的，有检测说明配方，感受因人而异，效果100%可见，支持售后。现在限时优惠价，查看主页领券，以活动规则为准。要花时间级护肤神器，收益会波动，纯天然零添加，还能帮助缓解闭口。完美日记同款的感觉，最近回购了第二次。";

function reviewSample() {
  return engine.buildReview(seed.sampleDraft, seed.rules(), {
    platform: "通用",
    ignores: seed.defaultIgnores,
  });
}

test("sample copy rewrites risky phrases and leaves brand names alone", () => {
  const review = reviewSample();
  const surfaces = review.matches.map((match) => match.surface);
  assert.deepEqual(surfaces, [
    "最好用",
    "国家级认证",
    "三天见效",
    "100%",
    "无效退款",
    "全网最低价",
    "加微信",
    "转发必中",
    "躺赚",
    "神器",
    "稳赚不赔",
    "纯天然",
    "零添加",
    "根治",
  ]);
  assert.equal(engine.reviewToPlain(review), SAMPLE_PLAIN);
  assert.equal(review.stats.auto, 10);
  assert.equal(review.stats.suggest, 4);
  const caution = new Set(review.opinions.filter((item) => item.caution).map((item) => item.term));
  assert.deepEqual(caution, new Set(["国家级认证", "加微信", "躺赚", "根治"]));
  assert.equal(review.opinions.some((item) => item.term === "完美"), false);
});

test("longer phrase wins and ignores cover brand names", () => {
  const rules = [
    { id: "a", term: "最", action: "auto", replacement: "很", solution: "短", platforms: ["通用"], enabled: true, aliases: [], skipInside: [] },
    { id: "b", term: "最好用", action: "auto", replacement: "好用", solution: "长", platforms: ["通用"], enabled: true, aliases: [], skipInside: [] },
    { id: "c", term: "完美", action: "suggest", replacement: "满意", solution: "品牌", platforms: ["通用"], enabled: true, aliases: [], skipInside: ["完美日记"] },
  ];
  const review = engine.buildReview("最近最好用，完美日记很完美", rules, {
    platform: "通用",
    ignores: ["最近"],
  });
  assert.deepEqual(
    review.matches.map((match) => match.surface),
    ["最好用", "完美"]
  );
  assert.equal(engine.reviewToPlain(review), "最近好用，完美日记很完美");
});

test("fullwidth digits and ascii boundaries", () => {
  const rules = seed.rules().filter((rule) => rule.term === "100%" || rule.term === "vx");
  const review = engine.buildReview("效果１００％，联系VX，单词navx不用改", rules, { platform: "通用", ignores: [] });
  assert.deepEqual(
    review.matches.map((match) => match.surface),
    ["１００％", "VX"]
  );
});

test("platform scope keeps marketplace copy from short-video-only rules", () => {
  const rules = seed.rules();
  const text = "今晚秒杀，官方推荐，亲测有效";
  const douyin = engine.buildReview(text, rules, { platform: "抖音", ignores: [] });
  const taobao = engine.buildReview(text, rules, { platform: "淘宝", ignores: [] });
  const xhs = engine.buildReview(text, rules, { platform: "小红书", ignores: [] });
  assert.deepEqual(douyin.matches.map((match) => match.rule.term).sort(), ["官方推荐", "秒杀"]);
  assert.deepEqual(taobao.matches.map((match) => match.rule.term), []);
  assert.deepEqual(xhs.matches.map((match) => match.rule.term), ["秒杀", "亲测有效"]);
});

test("disabled rules and deleting a phrase", () => {
  const rules = [
    { id: "off", term: "最好", action: "auto", replacement: "更合适", solution: "x", platforms: ["通用"], enabled: false, aliases: [] },
    { id: "del", term: "不转不是", action: "auto", replacement: "", solution: "删", platforms: ["通用"], enabled: true, aliases: [] },
  ];
  const review = engine.buildReview("最好，不转不是中国人", rules, { platform: "通用", ignores: [] });
  assert.deepEqual(review.matches.map((match) => match.surface), ["不转不是"]);
  assert.equal(engine.reviewToPlain(review), "最好，中国人");
});

test("applySpans replaces from the end", () => {
  const text = "最好，最好";
  const next = engine.applySpans(text, [
    { start: 0, end: 2 },
    { start: 3, end: 5 },
  ], "更合适");
  assert.equal(next, "更合适，更合适");
});

test("import table, lines, and json", () => {
  const table = fs.readFileSync(path.join(__dirname, "template.csv"), "utf8");
  const parsed = engine.parseImport(table);
  assert.equal(parsed.format, "table");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rules.length, 3);
  assert.equal(parsed.rules[0].action, "auto");
  assert.equal(parsed.rules[1].action, "suggest");
  assert.equal(parsed.rules[2].replacement, "");
  assert.deepEqual(parsed.rules[2].platforms, ["抖音", "小红书"]);

  const quoted = engine.parseImport('卡审词,替换建议,解决方案\n"最好,真的","更合适,更稳","含逗号"\n');
  assert.equal(quoted.rules[0].term, "最好,真的");
  assert.equal(quoted.rules[0].replacement, "更合适,更稳");

  const lines = engine.parseImport("最好 => 更合适 | 绝对化 | 抖音 | 绝对化用语 | 高 | 确认 | 历史驳回");
  assert.equal(lines.format, "lines");
  assert.equal(lines.rules[0].term, "最好");
  assert.equal(lines.rules[0].action, "suggest");
  assert.equal(lines.rules[0].note, "历史驳回");
  assert.deepEqual(lines.rules[0].platforms, ["抖音"]);

  const json = engine.parseImport(JSON.stringify({
    rules: [{ 卡审词: "根治", 替换建议: "帮助缓解", 解决方案: "疗效", 处理方式: "自动" }],
    忽略词: ["最近", "最后"],
  }));
  assert.equal(json.format, "json");
  assert.equal(json.rules[0].action, "auto");
  assert.deepEqual(json.ignores, ["最近", "最后"]);

  const broken = engine.parseImport('{"rules":');
  assert.equal(broken.errors[0], "JSON 无法解析");
  assert.equal(broken.format, "json");
});

test("merge updates the same term and replace drops old rules", () => {
  const existing = [{ id: "keep", term: "最好", replacement: "旧", solution: "旧方案", action: "suggest", platforms: ["通用"], enabled: true, aliases: [], skipInside: [], severity: "low", category: "绝对化用语", note: "" }];
  const incoming = [{ id: "new", term: "最好", replacement: "更合适", solution: "新方案", action: "auto", platforms: ["抖音"], enabled: true, aliases: ["最佳"], skipInside: [], severity: "high", category: "绝对化用语", note: "案例" }];
  const merged = engine.mergeRules(existing, incoming, "append");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "keep");
  assert.equal(merged[0].solution, "新方案");
  assert.equal(merged[0].action, "auto");
  const replaced = engine.mergeRules(existing, [{ term: "神器", solution: "改掉", replacement: "单品", action: "suggest" }], "replace");
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].term, "神器");
});

test("seed library is internally consistent", () => {
  const rules = seed.rules();
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  assert.equal(new Set(rules.map((rule) => rule.term)).size, rules.length);
  rules.forEach((rule) => {
    assert.ok(rule.term);
    assert.ok(rule.solution);
    assert.ok(rule.platforms.length);
    assert.ok(rule.category);
  });
  const second = seed.rules();
  second[0].aliases.push("mutation");
  assert.equal(seed.rules()[0].aliases.includes("mutation"), false);
});

test("report lists the reason and the replacement", () => {
  const review = engine.buildReview("无效退款", seed.rules(), { platform: "通用", ignores: [] });
  const report = engine.reviewToReport(review);
  assert.match(report, /支持售后/);
  assert.match(report, /无效退款/);
  assert.match(report, /方案：/);
});
