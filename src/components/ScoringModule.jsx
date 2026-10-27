import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ScoringFormatConfiguration from "./ScoringFormatConfiguration.jsx";
import {
  ClipboardList, Download, ExternalLink, FileText, Megaphone,
  Shirt, Shield, Swords, Trophy
} from "lucide-react";

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || `Permintaan gagal (${response.status}).`);
  return data;
}

const labelOf = (judge) => judge.label || judge.name;
const scoreText = (value) => value === null || value === undefined ? "—" : String(Math.round(value));
const timeText = (seconds) => seconds === null || seconds === undefined
  ? "—"
  : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const parseTimeSeconds = (value) => {
  const match = /^(\d{2}):([0-5]\d)$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
  const comparisonText = (value, group) => {
    const values = Array.isArray(value) ? value : [value];
    return values.map((item, index) => group?.comparisonTypes?.[index] === "time" ? timeText(item) : scoreText(item)).join(" / ");
  };
const resultTabs = [
  { id: "master", label: "Master awal", icon: ClipboardList },
  { id: "overall", label: "Keseluruhan", icon: Trophy },
  { id: "pbb", label: "PBB", icon: Shield },
  { id: "danton", label: "Danton", icon: Swords },
  { id: "varfor", label: "Varfor", icon: Swords },
  { id: "kostum", label: "Kostum", icon: Shirt }
];
const announcementTab = { id: "announcement", label: "Pengumuman lomba", icon: Megaphone };

function rankingGroupOfCategory(category) {
  const name = `${category.name || ""} ${category.id || ""}`.toLocaleLowerCase("id-ID");
  if (name.includes("danton")) return "danton";
  if (["pbb", "danton", "varfor", "kostum"].includes(category.rankingGroup)) return category.rankingGroup;
  if (name.includes("kostum")) return "kostum";
  if (name.includes("varfor")) return "varfor";
  if (name.includes("pbb")) return "pbb";
  return null;
}

function mergeDantonCategories(categories) {
  const dantonCategories = categories.filter((category) => rankingGroupOfCategory(category) === "danton");
  if (!dantonCategories.length) return categories;
  const dantonJudges = [...new Map(dantonCategories.flatMap((category) => category.judges)
    .map((judge) => [labelOf(judge), judge])).values()];
  let inserted = false;
  return categories.flatMap((category) => {
    if (rankingGroupOfCategory(category) !== "danton") return [category];
    if (inserted) return [];
    inserted = true;
    return [{
      id: "danton",
      name: "Danton",
      rankingGroup: "danton",
      sourceCategories: dantonCategories,
      judges: dantonJudges
    }];
  });
}

function categoryDraftTotal(category, registrationId, drafts) {
  return category.criteria.reduce((sum, criterion) => sum + category.judges.reduce((judgeSum, judge) => {
    return judgeSum + (Number(drafts[`${registrationId}:${criterion.id}:${labelOf(judge)}`]) || 0);
  }, 0) * criterion.weight, 0);
}

export default function ScoringModule({ events = [] }) {
  const [eventId, setEventId] = useState(events[0]?.id || "");
  const [tierId, setTierId] = useState("");
  const [tierNameDraft, setTierNameDraft] = useState("");
  const [tierDrafts, setTierDrafts] = useState([]);
  const [tierBusy, setTierBusy] = useState(false);
  const [tab, setTab] = useState("configuration");
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [scoring, setScoring] = useState(null);
  const [formats, setFormats] = useState([]);
  const [formatId, setFormatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState({});
  const [penaltyDrafts, setPenaltyDrafts] = useState({});
  const [performanceTimeDrafts, setPerformanceTimeDrafts] = useState({});
  const [deviceSaved, setDeviceSaved] = useState(false);
  const [dirtyDraft, setDirtyDraft] = useState(false);
  const isResultTab = resultTabs.some((item) => item.id === tab);
  const resultTabLabel = resultTabs.find((item) => item.id === tab)?.label || (tab === announcementTab.id ? announcementTab.label : "");

  useEffect(() => {
    if (!events.some((event) => event.id === eventId)) setEventId(events[0]?.id || "");
  }, [events, eventId]);

  const load = useCallback(async ({ preserveDrafts = false } = {}) => {
    const formatResult = await request("/admin/scoring-formats");
    setFormats(formatResult.formats || []);
    if (!eventId) {
      setScoring(null);
      return;
    }
    const result = await request(`/admin/scoring/${eventId}${tierId ? `?tierId=${encodeURIComponent(tierId)}` : ""}`);
    setScoring(result);
    setFormatId(result.activeTier?.formatId || "");
    if (result.activeTier?.id && result.activeTier.id !== tierId) setTierId(result.activeTier.id);
    if (Array.isArray(result.tiers)) setTierDrafts(result.tiers.map(({ id, name }) => ({ id, name })));
    let deviceDraft = null;
    const storedDraft = localStorage.getItem(`scoring-draft:${eventId}:${result.activeTier?.id || "default"}`);
    if (storedDraft) {
      try {
        deviceDraft = JSON.parse(storedDraft);
      } catch {
        throw new Error("Data nilai tersimpan di perangkat tidak dapat dibaca. Hapus data browser untuk event ini atau hubungi administrator.");
      }
      if (!deviceDraft || typeof deviceDraft !== "object"
        || !deviceDraft.drafts || typeof deviceDraft.drafts !== "object"
        || !deviceDraft.penaltyDrafts || typeof deviceDraft.penaltyDrafts !== "object"
        || !deviceDraft.performanceTimeDrafts || typeof deviceDraft.performanceTimeDrafts !== "object") {
        throw new Error("Struktur draft nilai di perangkat tidak valid. Data belum diubah atau dihapus.");
      }
    }
    const savedDrafts = Object.fromEntries((result.scoreEntries || []).map((entry) => [
      `${entry.registrationId}:${entry.criterionId}:${entry.judgeLabel}`,
      String(entry.value)
    ]));
    const savedPenalties = Object.fromEntries((result.participants || []).map((participant) => [
      participant.registrationId,
      Object.fromEntries((participant.penalties || []).map((penalty) => [penalty.id, penalty.quantity]))
    ]));
    const savedTimes = Object.fromEntries((result.participants || []).map((participant) => [
      participant.registrationId,
      participant.performanceTime || ""
    ]));
    setDrafts((current) => preserveDrafts ? { ...savedDrafts, ...(deviceDraft?.drafts || {}), ...current } : { ...savedDrafts, ...(deviceDraft?.drafts || {}) });
    setPenaltyDrafts((current) => preserveDrafts ? { ...savedPenalties, ...(deviceDraft?.penaltyDrafts || {}), ...current } : { ...savedPenalties, ...(deviceDraft?.penaltyDrafts || {}) });
    setPerformanceTimeDrafts((current) => preserveDrafts ? { ...savedTimes, ...(deviceDraft?.performanceTimeDrafts || {}), ...current } : { ...savedTimes, ...(deviceDraft?.performanceTimeDrafts || {}) });
    if (!preserveDrafts) {
      setDeviceSaved(Boolean(deviceDraft));
      setDirtyDraft(Boolean(deviceDraft));
    }
  }, [eventId, tierId]);

  useEffect(() => {
    setError("");
    setScoring(null);
    setDrafts({});
    setPenaltyDrafts({});
    setPerformanceTimeDrafts({});
    setDeviceSaved(false);
    setDirtyDraft(false);
    setSelectedParticipantId("");
    load().catch((loadError) => setError(loadError.message));
  }, [load]);

  const judges = scoring?.configuration?.judges || [];
  const criteria = scoring?.criteria || [];
  const participants = scoring?.participants || [];
  const config = scoring?.configuration;
  const activeTier = scoring?.activeTier;
  const participantAssignments = scoring?.participantAssignments || [];
  const penalties = config?.penalties || [];
  const scoreCategories = useMemo(() => {
    const categories = config?.categories || [];
    if (categories.length) {
      return categories.map((category) => {
        const categoryCriteria = criteria.filter((criterion) => criterion.categoryId === category.id);
        const validGroups = Array.isArray(category.itemGroups)
          ? category.itemGroups.filter((group) => group && typeof group === "object").map((group, index) => ({
            ...group,
            id: typeof group.id === "string" && group.id ? group.id : `group-${category.id}-${index}`,
            name: typeof group.name === "string" && group.name.trim() ? group.name : `Bagian ${index + 1}`,
            items: Array.isArray(group.items) ? group.items.filter((item) => typeof item === "string") : []
          }))
          : [];
        const sourceGroups = validGroups.length
          ? validGroups
          : [{ id: `group-${category.id}-default`, name: category.name, items: categoryCriteria.map((criterion) => criterion.name) }];
        const assignedNames = new Set();
        const itemGroups = sourceGroups.map((group) => {
          const groupCriteria = categoryCriteria.filter((criterion) => group.items.includes(criterion.name) && !assignedNames.has(criterion.name));
          groupCriteria.forEach((criterion) => assignedNames.add(criterion.name));
          return { ...group, criteria: groupCriteria };
        }).filter((group) => group.criteria.length);
        const ungroupedCriteria = categoryCriteria.filter((criterion) => !assignedNames.has(criterion.name));
        if (ungroupedCriteria.length) itemGroups.push({ id: `group-${category.id}-other`, name: "Lainnya", criteria: ungroupedCriteria });
        return {
          ...category,
          criteria: categoryCriteria,
          itemGroups,
          judges: judges.filter((judge) => (judge.categoryIds || []).includes(category.id))
        };
      });
    }
    return [...new Map(criteria.map((criterion) => [criterion.categoryId, criterion.categoryName])).entries()]
      .map(([id, name]) => {
        const categoryCriteria = criteria.filter((criterion) => criterion.categoryId === id);
        return {
          id,
          name,
          criteria: categoryCriteria,
          itemGroups: [{ id: `group-${id}-default`, name, criteria: categoryCriteria }],
          judges: judges.filter((judge) => (judge.categoryIds || []).includes(id))
        };
      });
  }, [config, criteria, judges]);
  const dantonCategories = scoreCategories.filter((category) => rankingGroupOfCategory(category) === "danton");
  const resultCategories = mergeDantonCategories(scoreCategories.filter((category) => tab === "master" || tab === "overall"
    ? true
    : rankingGroupOfCategory(category) === tab));

  const exportResults = (group) => {
    const rankedGroup = (scoring?.rankings || []).find((item) => item.id === tab);
    const rows = [];
    const header = ["No", "Peringkat", "Nama peserta/tim", "Asal sekolah"];
    resultCategories.forEach((category) => {
      const categoryJudges = judges.filter((judge) => (judge.categoryIds || []).includes(category.id));
      const displayedJudges = category.sourceCategories ? category.judges : categoryJudges;
      header.push(category.name, ...displayedJudges.map(labelOf), `Total ${category.name}`);
    });
    if (tab !== "master") header.push(rankedGroup?.comparisonLabel || "Pembanding", "Nilai pembanding");
    header.push("Nilai akhir");
    rows.push(header);
    group.forEach((participant, index) => {
      const row = [index + 1, tab === "master" ? "" : participant.rank ?? "", participant.teamName || participant.participantName, participant.institution || ""];
      resultCategories.forEach((category) => {
        const sourceCategories = category.sourceCategories || [category];
        const sourceCategoryIds = new Set(sourceCategories.map((item) => item.id));
        const categoryTotal = participant.categoryTotals.filter((item) => sourceCategoryIds.has(item.id)).reduce((sum, item) => sum + item.total, 0);
        const categoryCriteria = participant.scores.filter((item) => sourceCategoryIds.has(item.categoryId));
        const categoryJudges = category.sourceCategories ? category.judges : judges.filter((judge) => (judge.categoryIds || []).includes(category.id));
        row.push(category.name);
        categoryJudges.forEach((judge) => row.push(categoryCriteria.reduce((sum, criterion) => {
          return sum + (criterion.judgeScores.find((score) => score.label === labelOf(judge))?.value || 0) * criterion.weight;
        }, 0)));
        row.push(categoryTotal);
      });
      if (tab !== "master") row.push(rankedGroup?.comparisonLabel || "", comparisonText(participant.comparisonValue, rankedGroup));
      row.push((tab === "master" ? participant.total : participant.rankingTotal) ?? "");
      rows.push(row);
    });
    const content = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(scoring?.event.name || "hasil-lomba").replace(/[^a-z0-9-_]+/gi, "-")}-${tab}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveFormat = async (name, configuration, selectedFormatId = "") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await request(selectedFormatId
        ? `/admin/scoring-formats/${encodeURIComponent(selectedFormatId)}`
        : "/admin/scoring-formats", {
        method: selectedFormatId ? "PUT" : "POST",
        body: JSON.stringify({ name, configuration })
      });
      setFormats((current) => [saved.format, ...current.filter((format) => format.id !== saved.format.id)]);
      setFormatId(saved.format.id);
      const eventHasScores = (scoring?.scoreEntries || []).length > 0;
      if (eventId && scoring && !eventHasScores) {
        await request("/admin/scoring-formats/apply", {
          method: "POST",
          body: JSON.stringify({ eventId, formatId: saved.format.id, tierId: tierId || activeTier?.id })
        });
        await load({ preserveDrafts: true });
        setNotice("Konfigurasi tersimpan dan diterapkan ke event.");
      } else if (eventId && eventHasScores) {
        await request(`/admin/scoring/${eventId}/settings`, {
          method: "PATCH",
          body: JSON.stringify({ tierId: tierId || activeTier?.id, settings: configuration.settings })
        });
        await load({ preserveDrafts: true });
        setNotice("Format tersimpan. Pengaturan pembanding, waktu, dan pengumuman diperbarui tanpa mengubah nilai yang sudah masuk.");
      } else {
        setNotice("Format penilaian berhasil disimpan.");
      }
    } catch (saveError) {
      setError(saveError.message);
      throw saveError;
    } finally {
      setBusy(false);
    }
  };

  const applyFormat = async () => {
    if (!eventId || !formatId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/admin/scoring-formats/apply", {
        method: "POST",
        body: JSON.stringify({ eventId, formatId, tierId: tierId || activeTier?.id })
      });
      await load({ preserveDrafts: true });
      setNotice("Format berhasil diterapkan ke event.");
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTiers = async () => {
    if (!eventId || !tierDrafts.length || tierDrafts.some((tier) => !tier.name.trim())) {
      setError("Buat minimal satu tingkatan dan isi semua namanya.");
      return;
    }
    setTierBusy(true);
    setError("");
    try {
      const result = await request(`/admin/scoring/${eventId}/tiers`, {
        method: "PATCH",
        body: JSON.stringify({ tiers: tierDrafts.map((tier) => ({ id: tier.id, name: tier.name.trim() })) })
      });
      setTierDrafts(result.tiers);
      if (!result.tiers.some((tier) => tier.id === tierId)) setTierId(result.tiers[0].id);
      await load({ preserveDrafts: true });
      setNotice("Tingkatan event berhasil disimpan.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setTierBusy(false);
    }
  };

  const assignParticipantTier = async (registrationId, nextTierId) => {
    setTierBusy(true);
    setError("");
    try {
      await request(`/admin/scoring/${eventId}/participants/${registrationId}/tier`, {
        method: "PATCH",
        body: JSON.stringify({ tierId: nextTierId })
      });
      await load({ preserveDrafts: true });
      setNotice("Tingkatan peserta berhasil diperbarui.");
    } catch (assignError) {
      setError(assignError.message);
    } finally {
      setTierBusy(false);
    }
  };

  const deleteFormat = async (selectedFormatId) => {
    setBusy(true);
    setError("");
    try {
      await request(`/admin/scoring-formats/${encodeURIComponent(selectedFormatId)}`, { method: "DELETE" });
      setFormats((current) => current.filter((format) => format.id !== selectedFormatId));
      setFormatId("");
      setNotice("Format berhasil dihapus.");
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveToDevice = () => {
    setError("");
    setBusy(true);
    try {
      localStorage.setItem(`scoring-draft:${eventId}:${tierId || "default"}`, JSON.stringify({
        drafts,
        penaltyDrafts,
        performanceTimeDrafts,
        savedAt: new Date().toISOString()
      }));
      setDeviceSaved(true);
      setDirtyDraft(true);
      setNotice("Draft nilai tersimpan aman di perangkat ini. Tekan “Upload nilai” untuk mengirimkannya ke data event.");
    } catch (storageError) {
      setError(`Draft tidak dapat disimpan di perangkat: ${storageError.message}`);
    } finally {
      setBusy(false);
    }
  };

  const uploadScores = async () => {
    if (!deviceSaved) {
      setError("Simpan draft di perangkat terlebih dahulu sebelum upload.");
      return;
    }
    const scores = [];
    for (const participant of participants) {
      for (const criterion of criteria) {
        for (const judge of judges.filter((item) => (item.categoryIds || []).includes(criterion.categoryId))) {
          const judgeLabel = labelOf(judge);
          const rawValue = drafts[`${participant.registrationId}:${criterion.id}:${judgeLabel}`];
          if (rawValue === "" || rawValue === undefined) continue;
          const value = Number(rawValue);
          if (!Number.isInteger(value) || value < criterion.minScore || value > criterion.maxScore) {
            setError(`Nilai ${criterion.categoryName} — ${criterion.name} untuk ${participant.teamName || participant.participantName} harus berupa bilangan bulat antara ${criterion.minScore} sampai ${criterion.maxScore}.`);
            return;
          }
          scores.push({ registrationId: participant.registrationId, criterionId: criterion.id, judgeLabel, value });
        }
      }
    }
    const hasRecapData = participants.some((participant) =>
      Boolean((performanceTimeDrafts[participant.registrationId] || "").trim())
      || Object.values(penaltyDrafts[participant.registrationId] || {}).some((quantity) => Number(quantity) > 0));
    if (!scores.length && !hasRecapData) {
      setError("Belum ada nilai, penalti, atau waktu tampil untuk di-upload.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request(`/admin/scoring/${eventId}/upload?tierId=${encodeURIComponent(tierId || activeTier?.id || "")}`, {
        method: "POST",
        body: JSON.stringify({
          scores,
          recaps: participants.map((participant) => ({
            registrationId: participant.registrationId,
            penaltyQuantities: Object.fromEntries(Object.entries(penaltyDrafts[participant.registrationId] || {})
              .map(([penaltyId, quantity]) => [penaltyId, Number(quantity) || 0])),
            performanceTime: performanceTimeDrafts[participant.registrationId] || ""
          }))
        })
      });
      localStorage.removeItem(`scoring-draft:${eventId}:${tierId || "default"}`);
      setDeviceSaved(false);
      setDirtyDraft(false);
      await load();
      setNotice(`Upload berhasil. ${result.uploadedScores} nilai dan data rekap ${result.uploadedRecaps} peserta telah tersimpan.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const addManualParticipant = async (participant) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request(`/admin/scoring/${eventId}/participants`, {
        method: "POST",
        body: JSON.stringify({ ...participant, tierId: tierId || activeTier?.id })
      });
      await load({ preserveDrafts: true });
      setNotice("Peserta manual berhasil ditambahkan ke event.");
      return result;
    } catch (participantError) {
      setError(participantError.message);
      throw participantError;
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => Object.fromEntries(participants.map((participant) => {
    const total = criteria.reduce((sum, criterion) => {
      const values = judges.filter((judge) => (judge.categoryIds || []).includes(criterion.categoryId)).map((judge) => {
        const value = drafts[`${participant.registrationId}:${criterion.id}:${labelOf(judge)}`];
        return value === "" || value === undefined ? null : Number(value);
      }).filter((value) => value !== null && Number.isFinite(value));
      return sum + values.reduce((a, b) => a + b, 0) * criterion.weight;
    }, 0) - Object.entries(penaltyDrafts[participant.registrationId] || {}).reduce((sum, [penaltyId, quantity]) => {
      return sum + (Number(quantity || 0) * (penalties.find((penalty) => penalty.id === penaltyId)?.value || 0));
    }, 0);
    return [participant.registrationId, total];
  })), [criteria, drafts, judges, participants, penaltyDrafts, penalties]);

  const statusFor = (participant) => {
    const savedCount = (scoring?.scoreEntries || []).filter((entry) => entry.registrationId === participant.registrationId).length;
    const expectedCount = criteria.reduce((count, criterion) => count + judges.filter((judge) => (judge.categoryIds || []).includes(criterion.categoryId)).length, 0);
    const draftedCount = criteria.reduce((count, criterion) => count + judges.filter((judge) => {
      const value = drafts[`${participant.registrationId}:${criterion.id}:${labelOf(judge)}`];
      return (judge.categoryIds || []).includes(criterion.categoryId) && value !== "" && value !== undefined;
    }).length, 0);
    if (!dirtyDraft && expectedCount > 0 && savedCount >= expectedCount) return { label: "SUDAH", className: "is-done" };
    if (dirtyDraft || savedCount > 0 || draftedCount > 0) return { label: "PROSES", className: "is-progress" };
    return { label: "BELUM", className: "is-pending" };
  };
  const selectedEvent = events.find((event) => event.id === eventId);
  const handleScoreNavigation = (event) => {
    if (event.key !== "Tab" && event.key !== "Enter") return;
    event.preventDefault();
    const input = event.currentTarget;
    const direction = event.shiftKey ? -1 : 1;
    const table = input.closest("table");
    const rows = Array.from(table.querySelectorAll("tbody tr")).filter((row) => row.querySelector("[data-score-input]"));
    const rowIndex = rows.indexOf(input.closest("tr"));
    const columnIndex = input.closest("td").cellIndex;
    const nextRow = rows[rowIndex + direction];
    const verticalInput = nextRow && Array.from(nextRow.querySelectorAll("[data-score-input]"))
      .find((candidate) => candidate.closest("td").cellIndex === columnIndex);
    if (verticalInput) {
      verticalInput.focus();
      return;
    }
    const inputs = Array.from(input.closest(".scoring-participant-card").querySelectorAll("[data-score-input]"));
    const nextInput = inputs[inputs.indexOf(input) + direction];
    if (nextInput) nextInput.focus();
  };

  return <div className="scoring-module">
    <div className="panel-title">
      <span className="eyebrow">REKAPITULASI PENILAIAN</span>
      <h2>Konfigurasi dan rekap nilai</h2>
      <p>Daftar item, label juri, dan hasil penilaian dikelola dari konfigurasi terpusat.</p>
    </div>
    <nav className="member-dashboard-tabs scoring-tabs" aria-label="Menu rekapitulasi penilaian">
      {[{ id: "configuration", label: "Konfigurasi penilaian", icon: FileText }, { id: "recap", label: "Rekap nilai", icon: ClipboardList }, announcementTab].map(({ id, label, icon: Icon }) => <button
        className={tab === id ? "is-active" : ""}
        type="button"
        key={id}
        onClick={() => { setTab(id); setEventDetailOpen(false); }}
      ><Icon size={15} aria-hidden="true" />{label}</button>)}
      {resultTabs.map((item) => <button
        className={tab === item.id ? "is-active" : ""}
        type="button"
        key={item.id}
        onClick={() => { setTab(item.id); setEventDetailOpen(false); }}
      ><item.icon size={15} aria-hidden="true" />{item.label}</button>)}
    </nav>

    {tab === "configuration" && events.length > 0 && (
      <label className="scoring-event-picker">Event
        <select value={eventId} onChange={(event) => { setEventId(event.target.value); setTierId(""); }}>
          {events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.status}</option>)}
        </select>
      </label>
    )}
    {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
    {notice && <div className="form-alert" role="status">{notice}</div>}

    {(tab === "recap" || isResultTab || tab === announcementTab.id) && !eventDetailOpen && (
      <section className="dashboard-panel scoring-panel">
        <div className="panel-heading"><div><span className="eyebrow">{tab === "recap" ? "PILIH EVENT" : resultTabLabel}</span><h3>{tab === "recap" ? "Rekap nilai per event" : tab === announcementTab.id ? "Pilih event untuk mengatur pengumuman" : `Pilih event untuk melihat ${resultTabLabel.toLocaleLowerCase("id-ID")}`}</h3></div></div>
        {!events.length ? <p className="empty-inline">Belum ada event tersedia.</p> : <div className="scoring-event-cards">
          {events.map((event) => <button className="scoring-event-card" type="button" key={event.id} onClick={() => {
            setEventId(event.id);
            setTierId("");
            setSelectedParticipantId("");
            setEventDetailOpen(true);
          }}>
            <span className="scoring-event-logo">{event.posterUrl ? <img src={event.posterUrl} alt="" /> : <span>RB</span>}</span>
            <strong>{event.name}</strong>
            <small>{event.status}</small>
          </button>)}
        </div>}
      </section>
    )}

    {tab === "configuration" && <>
      {eventId && scoring && <section className="dashboard-panel scoring-tier-config">
        <div className="panel-heading"><div><span className="eyebrow">TINGKATAN EVENT</span><h3>Atur tingkatan dan format penilaian</h3></div><span>{tierDrafts.length}/3 tingkatan</span></div>
        <div className="scoring-tier-config-list">
          {tierDrafts.map((tier, index) => <div className="scoring-tier-config-row" key={tier.id}>
            <label className="scoring-config-field">Tingkatan {index + 1}
              <input maxLength="80" value={tier.name} onChange={(event) => setTierDrafts((current) => current.map((item) => item.id === tier.id ? { ...item, name: event.target.value } : item))} />
            </label>
            <button className="reject-button" type="button" disabled={tierDrafts.length < 2 || tierBusy} aria-label={`Hapus ${tier.name}`} onClick={() => setTierDrafts((current) => current.filter((item) => item.id !== tier.id))}>Hapus</button>
          </div>)}
        </div>
        <div className="scoring-tier-actions">
          <button className="button button-outline button-small" type="button" disabled={tierDrafts.length >= 3 || tierBusy} onClick={() => setTierDrafts((current) => [...current, { id: `tier-${crypto.randomUUID()}`, name: `Tingkat ${current.length + 1}` }])}>Tambah tingkatan</button>
          <button className="button button-primary button-small" type="button" disabled={tierBusy} onClick={saveTiers}>{tierBusy ? "Menyimpan..." : "Simpan tingkatan"}</button>
        </div>
        <div className="scoring-tier-picker" role="tablist" aria-label="Pilih tingkatan untuk dikonfigurasi">
          {tierDrafts.map((tier) => <button className={tier.id === tierId ? "is-active" : ""} key={tier.id} type="button" role="tab" aria-selected={tier.id === tierId} onClick={() => { setTierId(tier.id); setFormatId(""); }}>{tier.name}</button>)}
        </div>
      </section>}
      <ScoringFormatConfiguration
        configuration={config}
        formats={formats}
        tiers={scoring?.tiers || []}
        activeTier={activeTier}
        eventId={eventId}
        formatId={formatId}
        onFormatChange={setFormatId}
        onDeleteFormat={deleteFormat}
        onSave={saveFormat}
        onApply={applyFormat}
        participants={participants}
        onAddParticipant={addManualParticipant}
        busy={busy}
      />
      {!events.length && <p className="empty-inline">Format dapat disimpan sekarang dan diterapkan setelah event tersedia.</p>}
    </>}

    {tab === announcementTab.id && eventDetailOpen && <section className="dashboard-panel scoring-panel">
      <div className="panel-heading"><div><span className="eyebrow">PENGUMUMAN LOMBA</span><h3>{scoring?.event.name || selectedEvent?.name || "Pengaturan pengumuman"}</h3></div><button className="button button-outline button-small" type="button" onClick={() => setEventDetailOpen(false)}>Kembali ke daftar event</button></div>
      {!scoring && !error ? <p className="empty-inline">Memuat konfigurasi event...</p> : <ScoringFormatConfiguration
        configuration={config}
        formats={formats}
        eventId={eventId}
        formatId={formatId}
        onFormatChange={setFormatId}
        onDeleteFormat={deleteFormat}
        onSave={saveFormat}
        onApply={applyFormat}
        participants={participants}
        onAddParticipant={addManualParticipant}
        busy={busy}
        announcementOnly
      />}
    </section>}

    {tab === "recap" && eventDetailOpen && <section className="dashboard-panel scoring-panel">
      <div className="panel-heading"><div><span className="eyebrow">REKAP NILAI EVENT</span><h3>{scoring?.event.name || selectedEvent?.name || "Input nilai"}</h3></div><button className="button button-outline button-small" type="button" onClick={() => { setEventDetailOpen(false); setSelectedParticipantId(""); }}>Kembali ke daftar event</button></div>
      {!eventId && <p className="empty-inline">Pilih atau buat event terlebih dahulu.</p>}
      {eventId && !scoring && !error && <p className="empty-inline">Memuat konfigurasi penilaian...</p>}
      {scoring && <>
        <div className="scoring-tier-picker" role="tablist" aria-label="Pilih tingkatan rekap nilai">
          {(scoring.tiers || []).map((tier) => <button className={tier.id === tierId ? "is-active" : ""} key={tier.id} type="button" role="tab" aria-selected={tier.id === tierId} onClick={() => { setSelectedParticipantId(""); setTierId(tier.id); }}>{tier.name}</button>)}
        </div>
        {participantAssignments.length > 0 && <details className="scoring-tier-assignment">
          <summary>Atur tingkatan peserta ({participantAssignments.length})</summary>
          <div>{participantAssignments.map((participant) => <label key={participant.registrationId}>
            <span>{participant.teamName || participant.participantName}</span>
            <select value={participant.tierId} disabled={tierBusy} onChange={(event) => assignParticipantTier(participant.registrationId, event.target.value)}>
              {(scoring.tiers || []).map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
            </select>
          </label>)}</div>
        </details>}
        {!participants.length
          ? <p className="empty-inline">Belum ada peserta pada tingkatan ini.</p>
          : !criteria.length || !judges.length
            ? <p className="empty-inline">Terapkan konfigurasi kategori dan label juri terlebih dahulu.</p>
            : <>
            <div className="scoring-upload-actions">
              <p>{deviceSaved ? "Draft sudah tersimpan di perangkat." : "Simpan draft di perangkat sebelum meng-upload nilai ke data event."}</p>
              <button className="button button-outline" type="button" disabled={busy} onClick={saveToDevice}>Simpan di perangkat</button>
              <button className="button button-primary" type="button" disabled={busy || !deviceSaved} onClick={uploadScores}>Upload nilai</button>
            </div>
            {!selectedParticipantId ? <div className="scoring-participant-list">
              {participants.map((participant) => {
                const status = statusFor(participant);
                return <div className="scoring-participant-row" key={participant.registrationId}>
                  <div><strong>{participant.teamName || participant.participantName}</strong><small>{participant.teamName ? participant.participantName : "Peserta event"}</small></div>
                  <span className={`scoring-entry-status ${status.className}`}>{status.label}</span>
                  <button className="button button-outline button-small" type="button" onClick={() => setSelectedParticipantId(participant.registrationId)}>Input nilai</button>
                </div>;
              })}
            </div> : <div className="scoring-rows">
            <button className="text-link scoring-back-to-roster" type="button" onClick={() => setSelectedParticipantId("")}>← Kembali ke daftar peserta</button>
            {participants.filter((participant) => participant.registrationId === selectedParticipantId).map((participant) => (
              <article className="scoring-participant-card" key={participant.registrationId}>
                <div className="panel-heading">
                  <div><span className="eyebrow">PESERTA</span><h3>{participant.teamName || participant.participantName}</h3></div>
                  <strong><span className={`scoring-entry-status ${statusFor(participant).className}`}>{statusFor(participant).label}</span> Total sementara: {scoreText(totals[participant.registrationId] ?? 0)}</strong>
                </div>
                <div className="scoring-sheet-grid">
                  {scoreCategories.map((category) => {
                        const categoryTotal = categoryDraftTotal(category, participant.registrationId, drafts);
                        return <Fragment key={category.id}><section className="scoring-sheet-section">
                          <h4>{category.name}</h4>
                          <div className="scoring-table-scroll">
                            <table className="scoring-sheet-table">
                              <colgroup>
                                <col style={{ width: "5%" }} />
                                <col style={{ width: "38%" }} />
                                {category.judges.map((judge) => <col key={judge.id} />)}
                                <col style={{ width: "10%" }} />
                              </colgroup>
                              <thead><tr><th>No</th><th>Gerakan / Kriteria</th>{category.judges.map((judge) => <th key={judge.id}>{labelOf(judge)}</th>)}<th>JML</th></tr></thead>
                          <tbody>
                            {(() => {
                              let rowNumber = 0;
                              return category.itemGroups.map((group) => {
                                const groupTotal = group.criteria.reduce((sum, criterion) => sum + category.judges.reduce((judgeSum, judge) => {
                                  return judgeSum + (Number(drafts[`${participant.registrationId}:${criterion.id}:${labelOf(judge)}`]) || 0) * criterion.weight;
                                }, 0), 0);
                                return <Fragment key={group.id}>
                                  <tr className="scoring-table-group"><th colSpan={category.judges.length + 3}>{group.name}</th></tr>
                                  {group.criteria.map((criterion) => {
                                    const index = rowNumber++;
                                    const itemTotal = category.judges.reduce((sum, judge) => sum + (Number(drafts[`${participant.registrationId}:${criterion.id}:${labelOf(judge)}`]) || 0), 0);
                                    return <tr key={criterion.id}>
                                      <td>{index + 1}</td>
                                      <td>{criterion.name}</td>
                                      {category.judges.map((judge) => {
                                        const judgeLabel = labelOf(judge);
                                        const key = `${participant.registrationId}:${criterion.id}:${judgeLabel}`;
                                        return <td key={judge.id}>
                                          <input
                                            type="number"
                                            data-score-input
                                            min={criterion.minScore}
                                            max={criterion.maxScore}
                                              step="1"
                                            value={drafts[key] ?? ""}
                                            onChange={(event) => {
                                              setDrafts((current) => ({ ...current, [key]: event.target.value }));
                                              setDeviceSaved(false);
                                              setDirtyDraft(true);
                                            }}
                                            onKeyDown={handleScoreNavigation}
                                            aria-label={`${criterion.name}, ${judgeLabel}`}
                                          />
                                        </td>;
                                      })}
                                      <td className="scoring-table-total">{itemTotal}</td>
                                    </tr>;
                                  })}
                                  <tr className="scoring-table-group-total">
                                    <th colSpan={2}>TOTAL {group.name.toLocaleUpperCase("id-ID")}</th>
                                    {category.judges.map((judge) => <td key={judge.id}>{group.criteria.reduce((sum, criterion) => {
                                      return sum + (Number(drafts[`${participant.registrationId}:${criterion.id}:${labelOf(judge)}`]) || 0) * criterion.weight;
                                    }, 0)}</td>)}
                                    <td>{scoreText(groupTotal)}</td>
                                  </tr>
                                </Fragment>;
                              });
                            })()}
                            {!category.criteria.length && <tr><td colSpan={category.judges.length + 3} className="scoring-table-empty">Belum ada item penilaian.</td></tr>}
                            <tr className="scoring-table-summary">
                              <th colSpan={2}>TOTAL {category.name.toLocaleUpperCase("id-ID")}</th>
                              {category.judges.map((judge) => <td key={judge.id}>{category.criteria.reduce((sum, criterion) => {
                                return sum + (Number(drafts[`${participant.registrationId}:${criterion.id}:${labelOf(judge)}`]) || 0) * criterion.weight;
                                }, 0)}</td>)}
                              <td>{scoreText(categoryTotal)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </section>{category.id === dantonCategories.at(-1)?.id && <div className="scoring-table-scroll">
                      <table className="scoring-sheet-table scoring-danton-total-table">
                        <tbody><tr className="scoring-table-summary">
                          <th colSpan={category.judges.length + 2}>TOTAL DANTON PBB + DANTON VARIASI DAN FORMASI</th>
                          <td>{scoreText(dantonCategories.reduce((sum, item) => sum + categoryDraftTotal(item, participant.registrationId, drafts), 0))}</td>
                        </tr></tbody>
                      </table>
                    </div>}</Fragment>;
                  })}
                </div>
                <div className="scoring-sheet-footer">
                  <section className="scoring-penalty-sheet">
                    <h4>PENALTI / PENGURANGAN</h4>
                    <div className="scoring-table-scroll">
                      <table className="scoring-sheet-table scoring-penalty-table">
                        <thead><tr><th>Jenis</th><th>QTY</th><th>JML MINUS</th></tr></thead>
                        <tbody>
                          {penalties.map((penalty) => {
                            const quantity = Number(penaltyDrafts[participant.registrationId]?.[penalty.id] || 0);
                            return <tr key={penalty.id}>
                              <td>{penalty.name}<small>{penalty.value} poin/kejadian</small></td>
                              <td><input type="number" min="0" step="1" value={penaltyDrafts[participant.registrationId]?.[penalty.id] ?? 0} onChange={(event) => {
                                setPenaltyDrafts((current) => ({
                                  ...current,
                                  [participant.registrationId]: {
                                    ...(current[participant.registrationId] || {}),
                                    [penalty.id]: event.target.value
                                  }
                                }));
                                setDeviceSaved(false);
                                setDirtyDraft(true);
                              }} aria-label={`Jumlah ${penalty.name}`} /></td>
                              <td className="scoring-table-total">{quantity * penalty.value}</td>
                            </tr>;
                          })}
                          {!penalties.length && <tr><td colSpan="3" className="scoring-table-empty">Belum ada jenis penalti.</td></tr>}
                          <tr className="scoring-table-summary"><th colSpan="2">TOTAL PENALTI</th><th>{Object.entries(penaltyDrafts[participant.registrationId] || {}).reduce((sum, [penaltyId, quantity]) => sum + (Number(quantity || 0) * (penalties.find((penalty) => penalty.id === penaltyId)?.value || 0)), 0)}</th></tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <div className="scoring-final-summary">
                    <label>Waktu tampil
                      <input type="text" inputMode="numeric" placeholder="09:45" value={performanceTimeDrafts[participant.registrationId] || ""} onChange={(event) => {
                        const nextTime = event.target.value.replace(/[^0-9:]/g, "").slice(0, 5);
                        const maximumTime = parseTimeSeconds(config?.settings?.maxPerformanceTime);
                        const nextTimeValue = parseTimeSeconds(nextTime);
                        if (nextTimeValue !== null && maximumTime !== null && nextTimeValue > maximumTime) {
                          setError(`Waktu tampil tidak boleh melebihi ${config.settings.maxPerformanceTime}.`);
                          return;
                        }
                        setError("");
                        setPerformanceTimeDrafts((current) => ({ ...current, [participant.registrationId]: nextTime }));
                        setDeviceSaved(false);
                        setDirtyDraft(true);
                      }} />
                    </label>
                    <p>Nilai akhir sementara <strong>{scoreText(totals[participant.registrationId] ?? 0)}</strong></p>
                  </div>
                </div>
              </article>
            ))}
          </div>}
          </>}
      </>}
    </section>}

    {isResultTab && eventDetailOpen && <section className="dashboard-panel scoring-panel">
      <div className="panel-heading"><div><span className="eyebrow">{resultTabLabel}</span><h3>{scoring?.event.name || selectedEvent?.name || resultTabLabel}</h3></div><div className="scoring-result-actions"><button className="button button-outline button-small" type="button" onClick={() => exportResults(tab === "master" ? scoring?.masterParticipants || participants : (scoring?.rankings || []).find((item) => item.id === tab)?.participants || [])}><Download size={15} /> Unduh CSV</button><a className="button button-outline button-small" href="/?view=account" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Akun peserta</a><button className="button button-outline button-small" type="button" onClick={() => setEventDetailOpen(false)}>Kembali ke daftar event</button></div></div>
      <div className="scoring-tier-picker" role="tablist" aria-label="Pilih tingkatan hasil">
        {(scoring?.tiers || []).map((tier) => <button className={tier.id === tierId ? "is-active" : ""} key={tier.id} type="button" role="tab" aria-selected={tier.id === tierId} onClick={() => setTierId(tier.id)}>{tier.name}</button>)}
      </div>
      {!scoring && !error ? <p className="empty-inline">Memuat hasil penilaian...</p> : !participants.length ? <p className="empty-inline">Belum ada data peserta untuk ditampilkan.</p> : (() => {
          const resultParticipants = tab === "master"
            ? scoring.masterParticipants || participants
            : (scoring.rankings || []).find((item) => item.id === tab)?.participants || [];
          const group = (scoring.rankings || []).find((item) => item.id === tab);
          const shownCategories = resultCategories;
          const categoryJudges = (category) => judges.filter((judge) => (judge.categoryIds || []).includes(category.id));
          const categoryValueForJudge = (participant, category, judge) => {
            const sourceCategoryIds = new Set((category.sourceCategories || [category]).map((item) => item.id));
            return participant.scores
            .filter((criterion) => sourceCategoryIds.has(criterion.categoryId))
            .reduce((sum, criterion) => sum + (criterion.judgeScores.find((score) => score.label === labelOf(judge))?.value || 0) * criterion.weight, 0);
          };
          const categoryTotalFor = (participant, category) => {
            const sourceCategoryIds = new Set((category.sourceCategories || [category]).map((item) => item.id));
            return participant.categoryTotals.filter((item) => sourceCategoryIds.has(item.id)).reduce((sum, item) => sum + item.total, 0);
          };
          return <div className="scoring-table-scroll">
            {tab !== "master" && <div className="scoring-result-table-head"><span>PERINGKAT {resultTabLabel}</span><span>{group?.comparisonLabel ? `Pembanding: ${group.comparisonLabel}` : "Nilai terbesar ke terkecil"}</span></div>}
            <table className="scoring-master-table scoring-result-grid">
              <thead>
                <tr>
                  <th rowSpan="2">No.</th>
                  {tab !== "master" && <th rowSpan="2">Peringkat</th>}
                  <th rowSpan="2">Nama peserta / pleton</th>
                  <th rowSpan="2">Asal sekolah</th>
                  {shownCategories.map((category) => <th key={category.id} colSpan={(category.sourceCategories ? category.judges : categoryJudges(category)).length + 1}>{category.name}</th>)}
                  {tab !== "master" && <th rowSpan="2">{group?.comparisonLabel || "Pembanding"}</th>}
                  <th rowSpan="2">{tab === "master" ? "Nilai akhir" : "Total"}</th>
                </tr>
                <tr>{shownCategories.flatMap((category) => [...(category.sourceCategories ? category.judges : categoryJudges(category)).map((judge) => <th key={`${category.id}-${judge.id}`}>{labelOf(judge)}</th>), <th key={`${category.id}-total`}>Total</th>])}</tr>
              </thead>
              <tbody>{resultParticipants.map((participant, index) => <tr key={participant.registrationId}>
                <td>{index + 1}</td>
                {tab !== "master" && <td>{participant.rank ?? "—"}</td>}
                <td>{participant.teamName || participant.participantName}</td>
                <td>{participant.institution || "—"}</td>
                {shownCategories.flatMap((category) => [...(category.sourceCategories ? category.judges : categoryJudges(category)).map((judge) => <td key={`${category.id}-${judge.id}`}>{scoreText(categoryValueForJudge(participant, category, judge))}</td>), <td key={`${category.id}-total`}>{scoreText(categoryTotalFor(participant, category))}</td>])}
                {tab !== "master" && <td>{comparisonText(participant.comparisonValue, group)}</td>}
                <td>{scoreText(tab === "master" ? participant.total : participant.rankingTotal)}</td>
              </tr>)}</tbody>
            </table>
          </div>;
        })()}
    </section>}
  </div>;
}
