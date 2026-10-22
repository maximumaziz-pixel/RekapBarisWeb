function scoringSummary(event) {
  const criteria = event.criteria.filter((criterion) => criterion.active);
  const assignedJudgeIds = new Set(event.judgeAssignments.map((assignment) => assignment.judgeId));
  const participants = event.registrations.map((registration) => {
    const criterionScores = criteria.map((criterion) => {
      const values = event.scores
        .filter((score) => score.registrationId === registration.id && score.criterionId === criterion.id && assignedJudgeIds.has(score.judgeId))
        .map((score) => score.value);
      return {
        criterionId: criterion.id,
        name: criterion.name,
        weight: criterion.weight,
        average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        submitted: values.length
      };
    });
    const complete = criterionScores.length > 0 && criterionScores.every((item) => item.average !== null);
    const total = complete ? criterionScores.reduce((sum, item) => sum + item.average * item.weight, 0) : null;
    return {
      registrationId: registration.id,
      participantName: registration.participantName,
      teamName: registration.teamName,
      scores: criterionScores,
      total,
      complete
    };
  });
  participants.sort((a, b) => a.complete !== b.complete
    ? (a.complete ? -1 : 1)
    : (b.total ?? -Infinity) - (a.total ?? -Infinity));
  let rank = 0;
  let previous;
  for (const participant of participants) {
    if (!participant.complete) {
      participant.rank = null;
      continue;
    }
    if (previous === undefined || participant.total !== previous) rank += 1;
    participant.rank = rank;
    previous = participant.total;
  }
  return participants;
}

module.exports = { scoringSummary };
