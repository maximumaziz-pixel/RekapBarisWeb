function scoringSummary(event) {
  const criteria = event.criteria.filter((criterion) => criterion.active);
  const configuration = event.scoringConfiguration || event.scoringFormat?.configuration;
  const configuredJudges = configuration?.judges || [];
  const configuredPenalties = configuration?.penalties || [];
  const rankGroups = [
    { id: "pbb", name: "PBB", setting: "klasemenPbb" },
    { id: "danton", name: "DANTON", setting: "klasemenDanton" },
    { id: "varfor", name: "VARFOR", setting: "klasemenVarfor" },
    { id: "kostum", name: "KOSTUM", setting: "klasemenKostum" }
  ];
  const groupForCategory = (category) => {
    const name = `${category.name || ""} ${category.id || ""}`.toLocaleLowerCase("id-ID");
    if (name.includes("danton")) return "danton";
    if (rankGroups.some((group) => group.id === category.rankingGroup)) return category.rankingGroup;
    if (name.includes("kostum")) return "kostum";
    if (name.includes("varfor")) return "varfor";
    if (name.includes("pbb")) return "pbb";
    return null;
  };
  const categoryGroups = (configuration?.categories || []).map((category) => ({
    id: category.id,
    name: category.name,
    rankingGroup: groupForCategory(category),
    itemGroups: Array.isArray(category.itemGroups) ? category.itemGroups : []
  }));
  const participants = event.registrations.map((registration) => {
    const criterionScores = criteria.map((criterion) => {
      const eligibleJudges = configuredJudges.filter((judge) => (judge.categoryIds || []).includes(criterion.categoryId));
      const judgeLabels = eligibleJudges.map((judge) => judge.label || judge.name).filter(Boolean);
      const judgeScores = judgeLabels.map((label) => ({
        label,
        value: event.scores.find((score) => score.registrationId === registration.id
          && score.criterionId === criterion.id
          && score.judgeLabel === label)?.value ?? null
      }));
      const values = judgeScores.map((score) => score.value).filter((value) => value !== null);
      return {
        criterionId: criterion.id,
        name: criterion.name,
        categoryId: criterion.categoryId,
        categoryName: criterion.categoryName,
        weight: criterion.weight,
        minScore: criterion.minScore,
        maxScore: criterion.maxScore,
        average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        judgeScores,
        total: values.reduce((sum, value) => sum + value, 0),
        expected: judgeLabels.length,
        submitted: values.length
      };
    });
    const complete = criterionScores.length > 0 && criterionScores.every((item) => item.expected > 0 && item.submitted >= item.expected);
    const categoryTotals = categoryGroups.map((category) => {
      const categoryCriteria = criterionScores.filter((item) => item.categoryId === category.id);
      const categoryComplete = categoryCriteria.length > 0
        && categoryCriteria.every((item) => item.expected > 0 && item.submitted >= item.expected);
      return {
        ...category,
        total: categoryCriteria.reduce((sum, item) => sum + item.total * item.weight, 0),
        complete: categoryComplete
      };
    });
    const selectedPenalties = registration.scoringPenalties && typeof registration.scoringPenalties === "object"
      ? registration.scoringPenalties
      : {};
    const penalties = configuredPenalties.map((penalty) => ({
      ...penalty,
      quantity: Math.max(0, Number(selectedPenalties[penalty.id]) || 0),
      total: Math.max(0, Number(selectedPenalties[penalty.id]) || 0) * penalty.value
    })).filter((penalty) => penalty.quantity > 0);
    const penaltyTotal = penalties.reduce((sum, penalty) => sum + penalty.total, 0);
    const scoreTotal = complete ? criterionScores.reduce((sum, item) => sum + item.total * item.weight, 0) : null;
    const total = complete ? scoreTotal - penaltyTotal : null;
    return {
      registrationId: registration.id,
      participantName: registration.participantName,
      teamName: registration.teamName,
      institution: registration.user?.institution || "",
      isManual: !registration.userId,
      scores: criterionScores,
      categoryTotals,
      penalties,
      penaltyTotal,
      performanceTime: registration.scoringTime || "",
      total,
      complete
    };
  });
  const maxPerformanceTime = configuration?.settings?.maxPerformanceTime;
  const parsePerformanceTime = (value) => {
    const match = /^(\d{2}):([0-5]\d)$/.exec(value || "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const comparisonForSingle = (participant, selection) => {
    if (!selection || typeof selection !== "object") return null;
    if (selection.type === "time") {
      const seconds = parsePerformanceTime(participant.performanceTime);
      const maximum = parsePerformanceTime(maxPerformanceTime);
      return seconds === null || (maximum !== null && seconds > maximum) ? null : seconds;
    }
    if (selection.type === "category" && selection.categoryId === "danton") {
      const dantonCategories = participant.categoryTotals.filter((item) => item.rankingGroup === "danton");
      if (!dantonCategories.length || dantonCategories.some((item) => !item.complete)) return null;
      return dantonCategories.reduce((sum, item) => sum + item.total, 0);
    }
    const category = participant.categoryTotals.find((item) => item.id === selection.categoryId);
    if (!category?.complete) return null;
    if (selection.type === "category") return category.total;
    if (selection.type === "group") {
      const categoryDefinition = categoryGroups.find((item) => item.id === selection.categoryId);
      const group = categoryDefinition?.itemGroups.find((item) => item.id === selection.groupId);
      if (!group) return null;
      const itemNames = new Set(group.items || []);
      const scores = participant.scores.filter((score) => score.categoryId === selection.categoryId && itemNames.has(score.name));
      if (!scores.length || scores.some((score) => score.expected === 0 || score.submitted < score.expected)) return null;
      return scores.reduce((sum, score) => sum + score.total * score.weight, 0);
    }
    return null;
  };
  const comparisonFor = (participant, selection) => Array.isArray(selection)
    ? selection.map((item) => comparisonForSingle(participant, item))
    : comparisonForSingle(participant, selection);
  const comparisonLabelFor = (selection) => {
    if (Array.isArray(selection)) return selection.map((item) => comparisonLabelFor(item)).filter(Boolean).join(" / ");
    if (!selection || typeof selection !== "object") return "";
    if (selection.type === "time") return "Waktu tampil";
    if (selection.type === "category" && selection.categoryId === "danton") return "Total Danton";
    const category = categoryGroups.find((item) => item.id === selection.categoryId);
    if (!category) return "";
    if (selection.type === "category") return category.name;
    const group = category.itemGroups.find((item) => item.id === selection.groupId);
    return group ? `${category.name} / ${group.name}` : "";
  };
  const compareComparisonValues = (a, b) => {
    const aValues = Array.isArray(a) ? a : [a];
    const bValues = Array.isArray(b) ? b : [b];
    for (let index = 0; index < Math.max(aValues.length, bValues.length); index += 1) {
      const aValue = aValues[index] ?? null;
      const bValue = bValues[index] ?? null;
      if (aValue === null || bValue === null) {
        if (aValue !== bValue) return aValue === null ? 1 : -1;
      } else if (aValue !== bValue) {
        return bValue - aValue;
      }
    }
    return 0;
  };
  const rankByValue = (items, getScore, isComplete, tieBreaker) => {
    const ranked = [...items].sort((a, b) => {
      const aComplete = isComplete(a);
      const bComplete = isComplete(b);
      if (aComplete !== bComplete) return aComplete ? -1 : 1;
      const scoreDifference = (getScore(b) ?? -Infinity) - (getScore(a) ?? -Infinity);
      if (scoreDifference) return scoreDifference;
      return compareComparisonValues(comparisonFor(a, tieBreaker), comparisonFor(b, tieBreaker));
    });
    let rank = 0;
    let previous;
    let previousComparison;
    return ranked.map((participant) => {
      const completeForRank = isComplete(participant);
      const score = completeForRank ? getScore(participant) : null;
      const comparisonValue = completeForRank ? comparisonFor(participant, tieBreaker) : null;
      if (!completeForRank) return { ...participant, rank: null, rankingTotal: null, comparisonValue: null };
      if (previous === undefined || score !== previous || JSON.stringify(comparisonValue) !== JSON.stringify(previousComparison)) rank += 1;
      previous = score;
      previousComparison = comparisonValue;
      return { ...participant, rank, rankingTotal: score, comparisonValue };
    });
  };
  const masterParticipants = participants.map((participant) => ({ ...participant }));
  const tieBreakers = configuration?.settings?.tieBreakers || {};
  const rankedParticipants = rankByValue(participants, (participant) => participant.total, (participant) => participant.complete, tieBreakers.overall);
  const rankingTieBreaker = (groupId) => {
    const categories = categoryGroups.filter((category) => category.rankingGroup === groupId);
    const categorySettings = tieBreakers.categories || {};
    if (Object.hasOwn(categorySettings, groupId)) return categorySettings[groupId] || undefined;
    const hasCategorySelection = categories.some((category) => Object.hasOwn(categorySettings, category.id));
    if (hasCategorySelection) return categories.map((category) => categorySettings[category.id]).filter(Boolean);
    return categorySettings[groupId] || undefined;
  };
  const rankings = [...rankGroups.map((group) => {
    const tieBreaker = rankingTieBreaker(group.id);
    return {
    ...group,
    enabled: true,
    comparisonLabel: comparisonLabelFor(tieBreaker),
    comparisonTypes: (Array.isArray(tieBreaker) ? tieBreaker : [tieBreaker]).map((item) => item?.type || "score"),
    participants: rankByValue(
      participants,
      (participant) => participant.categoryTotals
        .filter((category) => category.rankingGroup === group.id)
        .reduce((sum, category) => sum + category.total, 0),
      (participant) => {
        const categories = participant.categoryTotals.filter((category) => category.rankingGroup === group.id);
        return categories.length > 0 && categories.every((category) => category.complete);
      },
      tieBreaker
    )
  }; }), {
    id: "overall",
    name: "NILAI AKHIR KESELURUHAN",
    enabled: true,
    comparisonLabel: comparisonLabelFor(tieBreakers.overall),
    comparisonTypes: [tieBreakers.overall?.type || "score"],
    participants: rankedParticipants
  }];
  return {
    participants: rankedParticipants,
    masterParticipants,
    rankings,
    settings: {
      kejuaraanApproved: Boolean(configuration?.settings?.kejuaraanApproved)
    }
  };
}

function scoringHistoryForParticipant(summary, registrationId, configuration, tier) {
  const participant = summary.masterParticipants.find((item) => item.registrationId === registrationId);
  if (!participant) return null;
  return {
    tier: { id: tier.id, name: tier.name },
    configuration: configuration || {},
    participant,
    overall: summary.participants.find((item) => item.registrationId === registrationId) || null,
    rankings: summary.rankings.map((ranking) => ({
      id: ranking.id,
      name: ranking.name,
      comparisonLabel: ranking.comparisonLabel,
      comparisonTypes: ranking.comparisonTypes,
      participant: ranking.participants.find((item) => item.registrationId === registrationId) || null
    }))
  };
}

module.exports = { scoringSummary, scoringHistoryForParticipant };
