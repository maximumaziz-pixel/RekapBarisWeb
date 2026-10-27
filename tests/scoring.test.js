const test = require("node:test");
const assert = require("node:assert/strict");
const { scoringHistoryForParticipant, scoringSummary } = require("../scoring");

function eventFixture() {
  return {
    criteria: [
      { id: "pbb", name: "PBB", categoryId: "pbb-category", categoryName: "PBB", weight: 2, minScore: 0, maxScore: 100, active: true },
      { id: "costume", name: "Kostum", categoryId: "costume-category", categoryName: "Kostum", weight: 1, minScore: 0, maxScore: 100, active: true },
      { id: "inactive", name: "Tidak dipakai", weight: 10, minScore: 0, maxScore: 100, active: false }
    ],
    scoringConfiguration: {
      categories: [
        { id: "pbb-category", name: "PBB", rankingGroup: "pbb" },
        { id: "costume-category", name: "Kostum", rankingGroup: "kostum" }
      ],
      judges: [
        { label: "Juri 1", categoryIds: ["pbb-category", "costume-category"] },
        { label: "Juri 2", categoryIds: ["pbb-category", "costume-category"] }
      ],
      settings: { klasemenAkhir: true, kejuaraanApproved: true }
    },
    registrations: [
      { id: "r1", participantName: "Tim A", teamName: "A" },
      { id: "r2", participantName: "Tim B", teamName: "B" },
      { id: "r3", participantName: "Tim C", teamName: "C" }
    ],
    scores: [
      { registrationId: "r1", criterionId: "pbb", judgeLabel: "Juri 1", value: 80 },
      { registrationId: "r1", criterionId: "pbb", judgeLabel: "Juri 2", value: 100 },
      { registrationId: "r1", criterionId: "costume", judgeLabel: "Juri 1", value: 70 },
      { registrationId: "r1", criterionId: "costume", judgeLabel: "Juri 2", value: 80 },
      { registrationId: "r2", criterionId: "pbb", judgeLabel: "Juri 1", value: 90 },
      { registrationId: "r2", criterionId: "costume", judgeLabel: "Juri 2", value: 50 },
      { registrationId: "r3", criterionId: "pbb", judgeLabel: "Juri tidak dikenal", value: 100 }
    ]
  };
}

test("weighted ranking sums configured judge labels and ignores unknown labels", () => {
  const results = scoringSummary(eventFixture()).participants;
  assert.equal(results[0].registrationId, "r1");
  assert.equal(results[0].scores[0].average, 90);
  assert.equal(results[0].scores[0].total, 180);
  assert.equal(results[0].scores[0].maxScore, 100);
  assert.equal(results[0].total, 510);
  assert.equal(results[2].scores[0].average, null);
  assert.equal(results[2].rank, null);
});

test("equal totals share a rank and the next distinct total gets the next rank", () => {
  const event = eventFixture();
  event.scores = [
    { registrationId: "r1", criterionId: "pbb", judgeLabel: "Juri 1", value: 90 },
    { registrationId: "r1", criterionId: "costume", judgeLabel: "Juri 1", value: 50 },
    { registrationId: "r2", criterionId: "pbb", judgeLabel: "Juri 1", value: 90 },
    { registrationId: "r2", criterionId: "costume", judgeLabel: "Juri 1", value: 50 },
    { registrationId: "r3", criterionId: "pbb", judgeLabel: "Juri 1", value: 70 },
    { registrationId: "r3", criterionId: "costume", judgeLabel: "Juri 1", value: 40 }
  ];
  event.scoringConfiguration.judges = [{ label: "Juri 1", categoryIds: ["pbb-category", "costume-category"] }];
  const results = scoringSummary(event);
  assert.deepEqual(results.participants.map((item) => item.rank), [1, 1, 2]);
});

test("configured category tie-breaker separates equal totals", () => {
  const event = eventFixture();
  event.scoringConfiguration.settings.tieBreakers = {
    overall: { type: "category", categoryId: "pbb-category" }
  };
  event.scores = [
    { registrationId: "r1", criterionId: "pbb", judgeLabel: "Juri 1", value: 80 },
    { registrationId: "r1", criterionId: "costume", judgeLabel: "Juri 1", value: 50 },
    { registrationId: "r2", criterionId: "pbb", judgeLabel: "Juri 1", value: 90 },
    { registrationId: "r2", criterionId: "costume", judgeLabel: "Juri 1", value: 30 }
  ];
  event.scoringConfiguration.judges = [{ label: "Juri 1", categoryIds: ["pbb-category", "costume-category"] }];

  const results = scoringSummary(event).participants;
  assert.deepEqual(results.map((item) => item.registrationId), ["r2", "r1", "r3"]);
  assert.deepEqual(results.slice(0, 2).map((item) => item.rank), [1, 2]);
  assert.equal(results[0].comparisonValue, 180);
});

test("time tie-breaker favors the latest valid time not exceeding the maximum", () => {
  const event = eventFixture();
  event.scoringConfiguration.settings.maxPerformanceTime = "05:00";
  event.scoringConfiguration.settings.tieBreakers = { overall: { type: "time" } };
  event.registrations.forEach((registration) => { registration.scoringTime = "04:00"; });
  event.registrations[0].scoringTime = "04:30";
  event.registrations[1].scoringTime = "05:10";
  event.registrations[2].scoringTime = "04:45";
  event.scores = [
    ...["r1", "r2", "r3"].flatMap((registrationId) => [
      { registrationId, criterionId: "pbb", judgeLabel: "Juri 1", value: 80 },
      { registrationId, criterionId: "costume", judgeLabel: "Juri 1", value: 50 }
    ])
  ];
  event.scoringConfiguration.judges = [{ label: "Juri 1", categoryIds: ["pbb-category", "costume-category"] }];

  const results = scoringSummary(event).participants;
  assert.deepEqual(results.slice(0, 3).map((item) => item.registrationId), ["r3", "r1", "r2"]);
  assert.deepEqual(results.slice(0, 2).map((item) => item.rank), [1, 2]);
  assert.equal(results[2].comparisonValue, null);
});

test("combined Danton standings use the configured category comparison chain", () => {
  const event = eventFixture();
  event.criteria.push(
    { id: "danton-pbb", name: "Danton PBB", categoryId: "danton-pbb", categoryName: "Danton PBB", weight: 1, minScore: 0, maxScore: 100, active: true },
    { id: "danton-varfor", name: "Danton VARFOR", categoryId: "danton-varfor", categoryName: "Danton VARFOR", weight: 1, minScore: 0, maxScore: 100, active: true }
  );
  event.scoringConfiguration.categories.push(
    { id: "danton-pbb", name: "Danton PBB", rankingGroup: "pbb" },
    { id: "danton-varfor", name: "Danton Variasi dan Formasi", rankingGroup: "varfor" }
  );
  event.scoringConfiguration.judges = [{ label: "Juri 1", categoryIds: ["pbb-category", "costume-category", "danton-pbb", "danton-varfor"] }];
  event.scoringConfiguration.settings.tieBreakers = {
    categories: { danton: { type: "category", categoryId: "danton" } }
  };
  event.scores = [
    { registrationId: "r1", criterionId: "danton-pbb", judgeLabel: "Juri 1", value: 90 },
    { registrationId: "r1", criterionId: "danton-varfor", judgeLabel: "Juri 1", value: 10 },
    { registrationId: "r2", criterionId: "danton-pbb", judgeLabel: "Juri 1", value: 80 },
    { registrationId: "r2", criterionId: "danton-varfor", judgeLabel: "Juri 1", value: 20 }
  ];

  const danton = scoringSummary(event).rankings.find((item) => item.id === "danton");
  assert.deepEqual(danton.participants.slice(0, 2).map((item) => item.registrationId), ["r1", "r2"]);
  assert.deepEqual(danton.participants.slice(0, 2).map((item) => item.rank), [1, 1]);
  assert.equal(danton.comparisonLabel, "Total Danton");
  assert.equal(danton.participants[0].rankingTotal, 100);
  assert.equal(danton.participants[0].comparisonValue, 100);
  assert.equal(scoringSummary(event).rankings.find((item) => item.id === "pbb").participants
    .find((item) => item.registrationId === "r1").rankingTotal, null);
});

test("no active criteria leaves every participant unranked", () => {
  const event = eventFixture();
  event.criteria.forEach((criterion) => { criterion.active = false; });
  assert.ok(scoringSummary(event).participants.every((item) => !item.complete && item.rank === null));
});

test("configured penalties are deducted from completed totals", () => {
  const event = eventFixture();
  event.scoringConfiguration.penalties = [{ id: "line", name: "Injak garis", value: 25 }];
  event.registrations[0].scoringPenalties = { line: 2 };
  const results = scoringSummary(event).participants;
  const firstParticipant = results.find((item) => item.registrationId === "r1");
  assert.equal(firstParticipant.penaltyTotal, 50);
  assert.equal(firstParticipant.total, 460);
});

test("category leaderboards are ranked independently from the overall standings", () => {
  const result = scoringSummary(eventFixture());
  const pbb = result.rankings.find((ranking) => ranking.id === "pbb");
  const kostum = result.rankings.find((ranking) => ranking.id === "kostum");
  const overall = result.rankings.find((ranking) => ranking.id === "overall");
  assert.equal(pbb.participants[0].registrationId, "r1");
  assert.equal(pbb.participants[0].rankingTotal, 360);
  assert.equal(kostum.participants[0].rankingTotal, 150);
  assert.equal(overall.enabled, true);
  assert.equal(overall.participants[0].rankingTotal, 510);
});

test("master order stays unchanged while Danton ranking combines Danton PBB and VARFOR", () => {
  const event = eventFixture();
  event.registrations = [event.registrations[2], event.registrations[0], event.registrations[1]];
  event.criteria.push(
    { id: "danton-pbb", name: "Danton PBB", categoryId: "danton-pbb-category", categoryName: "Danton PBB", weight: 1, minScore: 0, maxScore: 100, active: true },
    { id: "danton-varfor", name: "Danton VARFOR", categoryId: "danton-varfor-category", categoryName: "Danton VARFOR", weight: 1, minScore: 0, maxScore: 100, active: true }
  );
  event.scoringConfiguration.categories.push(
    { id: "danton-pbb-category", name: "Danton PBB", rankingGroup: "pbb" },
    { id: "danton-varfor-category", name: "Danton Variasi dan Formasi", rankingGroup: "varfor" }
  );
  event.scoringConfiguration.judges = [{
    label: "Juri 1",
    categoryIds: ["pbb-category", "costume-category", "danton-pbb-category", "danton-varfor-category"]
  }];
  event.scores.push(
    { registrationId: "r1", criterionId: "danton-pbb", judgeLabel: "Juri 1", value: 35 },
    { registrationId: "r1", criterionId: "danton-varfor", judgeLabel: "Juri 1", value: 45 }
  );

  const result = scoringSummary(event);
  const danton = result.rankings.find((ranking) => ranking.id === "danton");
  assert.deepEqual(result.masterParticipants.map((participant) => participant.registrationId), ["r3", "r1", "r2"]);
  assert.equal(danton.participants.find((participant) => participant.registrationId === "r1").rankingTotal, 80);
  assert.equal(result.rankings.find((ranking) => ranking.id === "pbb").participants
    .find((participant) => participant.registrationId === "r1").rankingTotal, 160);
  assert.equal(result.rankings.find((ranking) => ranking.id === "varfor").participants
    .find((participant) => participant.registrationId === "r1").rankingTotal, null);
});

test("overall standings remain available without the publication approval flag", () => {
  const event = eventFixture();
  event.scoringConfiguration.settings.kejuaraanApproved = false;
  const rankings = scoringSummary(event).rankings;
  assert.deepEqual(rankings.map((ranking) => ranking.id), ["pbb", "danton", "varfor", "kostum", "overall"]);
  assert.equal(rankings.find((ranking) => ranking.id === "overall").enabled, true);
});

test("participant assessment history contains only the requested registration", () => {
  const summary = scoringSummary(eventFixture());
  const history = scoringHistoryForParticipant(summary, "r1", { categories: [] }, { id: "tier-1", name: "Tingkat 1" });

  assert.equal(history.participant.registrationId, "r1");
  assert.equal(history.overall.registrationId, "r1");
  assert.ok(history.rankings.every((ranking) => ranking.participant?.registrationId === "r1" || ranking.participant === null));
  assert.equal(JSON.stringify(history).includes('"registrationId":"r2"'), false);
  assert.deepEqual(history.tier, { id: "tier-1", name: "Tingkat 1" });
});
