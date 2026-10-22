const test = require("node:test");
const assert = require("node:assert/strict");
const { scoringSummary } = require("../scoring");

function eventFixture() {
  return {
    criteria: [
      { id: "pbb", name: "PBB", weight: 2, minScore: 0, maxScore: 100, active: true },
      { id: "costume", name: "Kostum", weight: 1, minScore: 0, maxScore: 100, active: true },
      { id: "inactive", name: "Tidak dipakai", weight: 10, minScore: 0, maxScore: 100, active: false }
    ],
    judgeAssignments: [{ judgeId: "j1" }, { judgeId: "j2" }],
    registrations: [
      { id: "r1", participantName: "Tim A", teamName: "A" },
      { id: "r2", participantName: "Tim B", teamName: "B" },
      { id: "r3", participantName: "Tim C", teamName: "C" }
    ],
    scores: [
      { registrationId: "r1", criterionId: "pbb", judgeId: "j1", value: 80 },
      { registrationId: "r1", criterionId: "pbb", judgeId: "j2", value: 100 },
      { registrationId: "r1", criterionId: "costume", judgeId: "j1", value: 70 },
      { registrationId: "r2", criterionId: "pbb", judgeId: "j1", value: 90 },
      { registrationId: "r2", criterionId: "costume", judgeId: "j2", value: 50 },
      { registrationId: "r3", criterionId: "pbb", judgeId: "outsider", value: 100 }
    ]
  };
}

test("weighted ranking averages judges and ignores scores from unassigned judges", () => {
  const results = scoringSummary(eventFixture());
  assert.equal(results[0].registrationId, "r1");
  assert.equal(results[0].scores[0].average, 90);
  assert.equal(results[0].scores[0].maxScore, 100);
  assert.equal(results[0].total, 250);
  assert.equal(results[2].scores[0].average, null);
  assert.equal(results[2].rank, null);
});

test("equal totals share a rank and the next distinct total gets the next rank", () => {
  const event = eventFixture();
  event.scores = [
    { registrationId: "r1", criterionId: "pbb", judgeId: "j1", value: 90 },
    { registrationId: "r1", criterionId: "costume", judgeId: "j1", value: 50 },
    { registrationId: "r2", criterionId: "pbb", judgeId: "j1", value: 90 },
    { registrationId: "r2", criterionId: "costume", judgeId: "j1", value: 50 },
    { registrationId: "r3", criterionId: "pbb", judgeId: "j1", value: 70 },
    { registrationId: "r3", criterionId: "costume", judgeId: "j1", value: 40 }
  ];
  const results = scoringSummary(event);
  assert.deepEqual(results.map((item) => item.rank), [1, 1, 2]);
});

test("no active criteria leaves every participant unranked", () => {
  const event = eventFixture();
  event.criteria.forEach((criterion) => { criterion.active = false; });
  assert.ok(scoringSummary(event).every((item) => !item.complete && item.rank === null));
});
