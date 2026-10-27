import { Fragment, useEffect, useState } from "react";
import { Award, ChevronDown, ClipboardList, Clock3, Eye, FileText, Gavel, GitCompareArrows, Plus, Save, Trash2, UserPlus } from "lucide-react";

const defaultConfiguration = () => ({
  categories: [
    { id: "pbb", name: "PBB", rankingGroup: "pbb", items: ["Kerapian Baris", "Kesesuaian Gerak", "Ketepatan Formasi"] },
    { id: "danton-pbb", name: "Danton PBB", rankingGroup: "danton", items: ["Formasi", "Konsistensi", "Kecepatan"] },
    { id: "varfor", name: "Varfor", rankingGroup: "varfor", items: ["Variasi", "Keluwesan", "Keselarasan"] },
    { id: "danton-variasi-formasi", name: "Danton Variasi & Formasi", rankingGroup: "danton", items: ["Eksekusi", "Timing", "Kekuatan"] },
    { id: "kostum", name: "Kostum", rankingGroup: "kostum", items: ["Kebersihan", "Kerapian", "Kesesuaian Tema"] }
  ],
  judges: [
    { id: "judge-pbb-1", label: "Juri PBB 1", categoryIds: ["pbb", "danton-pbb"] },
    { id: "judge-pbb-2", label: "Juri PBB 2", categoryIds: ["pbb"] },
    { id: "judge-varfor-1", label: "Juri Varfor 1", categoryIds: ["varfor", "danton-variasi-formasi"] }
  ],
  penalties: [
    { id: "penalty-injak-garis", name: "Injak Garis", value: 50 },
    { id: "penalty-atribut-jatuh", name: "Atribut Jatuh", value: 25 }
  ],
  settings: {
    maxPerformanceTime: "",
    tieBreakers: { overall: null, categories: {} },
    announcement: { enabled: false, title: "", message: "" },
    kejuaraanApproved: false
  }
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"" && quoted && text[index + 1] === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function guessRankingGroup(name) {
  const normalized = name.toLocaleLowerCase("id-ID");
  if (normalized.includes("danton")) return "danton";
  if (normalized.includes("kostum")) return "kostum";
  if (normalized.includes("varfor")) return "varfor";
  if (normalized.includes("pbb")) return "pbb";
  return "pbb";
}

function rankingGroupOfCategory(category) {
  const name = `${category.name || ""} ${category.id || ""}`.toLocaleLowerCase("id-ID");
  if (name.includes("danton")) return "danton";
  if (["pbb", "danton", "varfor", "kostum"].includes(category.rankingGroup)) return category.rankingGroup;
  if (name.includes("kostum")) return "kostum";
  if (name.includes("varfor")) return "varfor";
  if (name.includes("pbb")) return "pbb";
  return null;
}

function normalizeConfiguration(configuration) {
  const fallback = defaultConfiguration();
  const rawSettings = configuration?.settings;
  const categorySource = Array.isArray(configuration?.categories) ? configuration.categories : fallback.categories;
  const normalizeCategory = (category, index) => {
    const id = typeof category.id === "string" && category.id ? category.id : `category-legacy-${index}`;
    const items = Array.isArray(category.items) ? category.items.filter((item) => typeof item === "string") : [];
    const sourceGroups = Array.isArray(category.itemGroups) ? category.itemGroups : [];
    const groups = sourceGroups.filter((group) => group && typeof group === "object").map((group, groupIndex) => ({
      id: typeof group.id === "string" && group.id ? group.id : `group-${id}-${groupIndex + 1}`,
      name: typeof group.name === "string" && group.name.trim() ? group.name : `Bagian ${groupIndex + 1}`,
      items: Array.isArray(group.items) ? group.items.filter((item) => typeof item === "string") : []
    }));
    if (!groups.length) groups.push({ id: `group-${id}-1`, name: "Bagian 1", items: [] });
    const assignedItems = new Set();
    const normalizedGroups = groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => items.includes(item) && !assignedItems.has(item) && assignedItems.add(item))
    }));
    normalizedGroups[0].items.push(...items.filter((item) => !assignedItems.has(item)));
    return {
      ...category,
      id,
      name: typeof category.name === "string" && category.name.trim() ? category.name : `Kategori ${index + 1}`,
      items,
      itemGroups: normalizedGroups
    };
  };
  return {
    ...fallback,
    ...(configuration || {}),
    categories: categorySource.filter((category) => category && typeof category === "object").map(normalizeCategory),
    judges: Array.isArray(configuration?.judges)
      ? configuration.judges.filter((judge) => judge && typeof judge === "object").map((judge, index) => ({
        ...judge,
        id: typeof judge.id === "string" && judge.id ? judge.id : `judge-legacy-${index}`,
        label: typeof judge.label === "string" ? judge.label : typeof judge.name === "string" ? judge.name : "",
        categoryIds: Array.isArray(judge.categoryIds) ? judge.categoryIds.filter((id) => typeof id === "string") : []
      }))
      : fallback.judges,
    penalties: Array.isArray(configuration?.penalties)
      ? configuration.penalties.filter((penalty) => penalty && typeof penalty === "object").map((penalty, index) => ({
        ...penalty,
        id: typeof penalty.id === "string" && penalty.id ? penalty.id : `penalty-legacy-${index}`,
        name: typeof penalty.name === "string" && penalty.name.trim() ? penalty.name : `Penalti ${index + 1}`,
        value: Number.isFinite(Number(penalty.value)) ? Number(penalty.value) : 0
      }))
      : fallback.penalties,
    settings: {
      ...fallback.settings,
      ...(rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {}),
      announcement: {
        ...fallback.settings.announcement,
        ...(rawSettings?.announcement && typeof rawSettings.announcement === "object" ? rawSettings.announcement : {})
      },
      tieBreakers: {
        overall: rawSettings?.tieBreakers?.overall || null,
        categories: rawSettings?.tieBreakers?.categories && typeof rawSettings.tieBreakers.categories === "object"
          ? rawSettings.tieBreakers.categories
          : {}
      }
    }
  };
}

function tieBreakerValue(selection) {
  if (selection?.type === "time") return "time";
  if (selection?.type === "category") return `category:${selection.categoryId}`;
  if (selection?.type === "group") return `group:${selection.categoryId}:${selection.groupId}`;
  return "";
}

function parseTieBreaker(value) {
  if (value === "time") return { type: "time" };
  if (value.startsWith("category:")) return { type: "category", categoryId: value.slice("category:".length) };
  if (value.startsWith("group:")) {
    const [, categoryId, groupId] = value.split(":");
    return { type: "group", categoryId, groupId };
  }
  return null;
}

function ConfigurationCard({ id, icon: Icon, title, description, summary, open, onToggle, onSave, busy, children, saveLabel = "Simpan perubahan" }) {
  const contentId = `scoring-config-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return <section className={`scoring-config-card${open ? " is-open" : ""}`}>
    <button className="scoring-config-card-trigger" type="button" aria-expanded={open} aria-controls={contentId} onClick={onToggle}>
      <span className="scoring-config-card-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="scoring-config-card-copy"><strong>{title}</strong><small>{description}</small></span>
      {summary && <span className="scoring-config-card-summary">{summary}</span>}
      <ChevronDown className="scoring-config-card-chevron" size={18} aria-hidden="true" />
    </button>
    {open && <div className="scoring-config-card-content" id={contentId}>
      {children}
      {onSave && <div className="scoring-config-card-footer">
        <button className="button button-primary button-small" type="button" disabled={busy} onClick={onSave}><Save size={15} /> {busy ? "Menyimpan..." : saveLabel}</button>
      </div>}
    </div>}
  </section>;
}

export default function ScoringFormatConfiguration({
  configuration,
  formats = [],
  tiers = [],
  activeTier,
  eventId,
  formatId,
  onFormatChange,
  onDeleteFormat,
  onSave,
  onApply,
  participants = [],
  onAddParticipant,
  busy = false,
  announcementOnly = false
}) {
  const [draft, setDraft] = useState(() => normalizeConfiguration(configuration));
  const [formatName, setFormatName] = useState("Format Penilaian");
  const [newCategory, setNewCategory] = useState("");
  const [newJudge, setNewJudge] = useState("");
  const [newPenalty, setNewPenalty] = useState({ name: "", value: "" });
  const [manualRows, setManualRows] = useState(() => [{ id: crypto.randomUUID(), teamName: "" }]);
  const [itemDraft, setItemDraft] = useState({});
  const [openCards, setOpenCards] = useState({});
  const [openCategories, setOpenCategories] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (configuration !== undefined || eventId) setDraft(normalizeConfiguration(configuration));
  }, [configuration, eventId]);

  useEffect(() => {
    const selectedFormat = formats.find((format) => format.id === formatId);
    if (selectedFormat) setFormatName(selectedFormat.name);
  }, [formats, formatId]);

  useEffect(() => {
    setManualRows([{ id: crypto.randomUUID(), teamName: "" }]);
  }, [eventId]);

  const toggleCard = (cardId) => setOpenCards((current) => ({ ...current, [cardId]: !current[cardId] }));
  const toggleCategory = (categoryId) => setOpenCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  const setTieBreaker = (key, value) => setDraft((current) => ({
    ...current,
    settings: {
      ...current.settings,
      tieBreakers: key === "overall"
        ? { ...current.settings.tieBreakers, overall: parseTieBreaker(value) }
        : { ...current.settings.tieBreakers, categories: { ...current.settings.tieBreakers.categories, [key]: parseTieBreaker(value) } }
    }
  }));
  const comparisonTargets = [...new Map(draft.categories.map((category) => {
    const group = rankingGroupOfCategory(category);
    return [group === "danton" ? "danton" : category.id, group === "danton"
      ? { id: "danton", name: "Danton" }
      : category];
  })).values()];
  const comparisonSources = draft.categories.filter((category) => rankingGroupOfCategory(category) !== "danton");
  const dantonSources = draft.categories.filter((category) => rankingGroupOfCategory(category) === "danton");
  const renderComparisonOptions = () => <>
    <option value="">Tidak digunakan</option>
    <option value="time">Waktu tampil</option>
    {comparisonSources.map((category) => <optgroup key={category.id} label={category.name}>
      <option value={`category:${category.id}`}>Total {category.name}</option>
      {category.itemGroups.map((group) => <option key={group.id} value={`group:${category.id}:${group.id}`}>Bagian: {group.name}</option>)}
    </optgroup>)}
    {dantonSources.length > 0 && <optgroup label="Danton">
      <option value="category:danton">Total Danton (PBB + Variasi dan Formasi)</option>
      {dantonSources.flatMap((category) => category.itemGroups.map((group) => <option key={`${category.id}-${group.id}`} value={`group:${category.id}:${group.id}`}>Bagian {category.name}: {group.name}</option>))}
    </optgroup>}
  </>;

  const patchCategory = (categoryId, changes) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId ? { ...category, ...changes } : category)
  }));

  const addItemGroup = (categoryId) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId
      ? { ...category, itemGroups: [...category.itemGroups, { id: `group-${crypto.randomUUID()}`, name: `Bagian ${category.itemGroups.length + 1}`, items: [] }] }
      : category)
  }));

  const patchItemGroup = (categoryId, groupId, changes) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId
      ? { ...category, itemGroups: category.itemGroups.map((group) => group.id === groupId ? { ...group, ...changes } : group) }
      : category)
  }));

  const assignItemGroup = (categoryId, groupId, item, checked) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId
      ? { ...category, itemGroups: category.itemGroups.map((group) => {
        const remainingItems = group.items.filter((groupItem) => groupItem !== item);
        return { ...group, items: checked && group.id === groupId ? [...remainingItems, item] : remainingItems };
      }) }
      : category)
  }));

  const removeItem = (categoryId, item) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId
      ? {
        ...category,
        items: category.items.filter((categoryItem) => categoryItem !== item),
        itemGroups: category.itemGroups.map((group) => ({ ...group, items: group.items.filter((groupItem) => groupItem !== item) }))
      }
      : category)
  }));

  const removeItemGroup = (categoryId, groupId) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category) => {
      if (category.id !== categoryId || category.itemGroups.length < 2) return category;
      const removedGroup = category.itemGroups.find((group) => group.id === groupId);
      const remainingGroups = category.itemGroups.filter((group) => group.id !== groupId).map((group) => ({ ...group, items: [...group.items] }));
      remainingGroups[0].items.push(...(removedGroup?.items || []));
      return { ...category, itemGroups: remainingGroups };
    })
  }));

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    const categoryId = `category-${crypto.randomUUID()}`;
    setDraft((current) => ({
      ...current,
      categories: [...current.categories, { id: categoryId, name, rankingGroup: guessRankingGroup(name), items: [], itemGroups: [{ id: `group-${categoryId}-1`, name: "Bagian 1", items: [] }] }]
    }));
    setOpenCards((current) => ({ ...current, categories: true }));
    setOpenCategories((current) => ({ ...current, [categoryId]: true }));
    setNewCategory("");
  };

  const addItem = (categoryId) => {
    const name = (itemDraft[categoryId] || "").trim();
    if (!name) return;
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((category) => category.id === categoryId
        ? {
          ...category,
          items: [...category.items, name],
          itemGroups: category.itemGroups.map((group, index) => index === 0 ? { ...group, items: [...group.items, name] } : group)
        }
        : category)
    }));
    setItemDraft((current) => ({ ...current, [categoryId]: "" }));
    setOpenCategories((current) => ({ ...current, [categoryId]: true }));
  };

  const addJudge = () => {
    const label = newJudge.trim();
    if (!label) return;
    setDraft((current) => ({
      ...current,
      judges: [...current.judges, { id: `judge-${crypto.randomUUID()}`, label, categoryIds: [] }]
    }));
    setNewJudge("");
  };

  const toggleJudgeCategory = (judgeId, categoryId) => {
    setDraft((current) => ({
      ...current,
      judges: current.judges.map((judge) => {
        if (judge.id !== judgeId) return judge;
        const categoryIds = judge.categoryIds || [];
        return {
          ...judge,
          categoryIds: categoryIds.includes(categoryId)
            ? categoryIds.filter((id) => id !== categoryId)
            : [...categoryIds, categoryId]
        };
      })
    }));
  };

  const addPenalty = () => {
    const name = newPenalty.name.trim();
    const value = Number(newPenalty.value);
    if (!name || newPenalty.value === "" || !Number.isFinite(value) || value < 0) {
      setError("Nama dan nilai pengurangan pinalti harus valid.");
      return;
    }
    setDraft((current) => ({
      ...current,
      penalties: [...current.penalties, { id: `penalty-${crypto.randomUUID()}`, name, value }]
    }));
    setNewPenalty({ name: "", value: "" });
    setError("");
  };

  const exportCsv = () => {
    const content = [
      ["Kategori", "Bagian", "Item Penilaian"],
      ...draft.categories.flatMap((category) => category.items.map((item) => [
        category.name,
        category.itemGroups.find((group) => group.items.includes(item))?.name || "Bagian 1",
        item
      ]))
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "format-penilaian.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      const headers = rows[0]?.map((header) => header.trim().toLocaleLowerCase("id-ID")) || [];
      const categoryColumn = headers.findIndex((header) => header.includes("kategori"));
      const itemColumn = headers.findIndex((header) => header.includes("item"));
      const groupColumn = headers.findIndex((header) => header.includes("bagian") || header.includes("kelompok"));
      if (rows.length < 2 || categoryColumn < 0 || itemColumn < 0) {
        throw new Error("CSV harus memiliki header Kategori dan Item Penilaian; kolom Bagian bersifat opsional.");
      }
      const categories = [];
      const byName = new Map();
      rows.slice(1).forEach((row) => {
        const categoryValue = row[categoryColumn] || "";
        const itemValue = row[itemColumn] || "";
        const groupValue = groupColumn >= 0 ? (row[groupColumn] || "").trim() : "";
        const name = categoryValue.trim();
        const item = itemValue.trim();
        if (!name || !item) return;
        let category = byName.get(name);
        if (!category) {
          const existing = draft.categories.find((entry) => entry.name.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"));
          category = {
            ...(existing || {}),
            id: existing?.id || `import-${crypto.randomUUID()}`,
            name,
            rankingGroup: existing?.rankingGroup || guessRankingGroup(name),
            items: [],
            itemGroups: []
          };
          byName.set(name, category);
          categories.push(category);
        }
        const groupName = groupValue || "Bagian 1";
        let group = category.itemGroups.find((entry) => entry.name.toLocaleLowerCase("id-ID") === groupName.toLocaleLowerCase("id-ID"));
        if (!group) {
          group = { id: `group-${crypto.randomUUID()}`, name: groupName, items: [] };
          category.itemGroups.push(group);
        }
        category.items.push(item);
        group.items.push(item);
      });
      if (!categories.length) throw new Error("Tidak ada baris item penilaian yang dapat diimpor.");
      setDraft((current) => {
        const oldCategoriesByName = new Map(current.categories.map((category) => [category.name.toLocaleLowerCase("id-ID"), category]));
        const nextCategories = categories.map((category) => ({
          ...(oldCategoriesByName.get(category.name.toLocaleLowerCase("id-ID")) || {}),
          ...category,
          id: oldCategoriesByName.get(category.name.toLocaleLowerCase("id-ID"))?.id || category.id
        }));
        const nextIdByName = new Map(nextCategories.map((category) => [category.name.toLocaleLowerCase("id-ID"), category.id]));
        const oldNameById = new Map(current.categories.map((category) => [category.id, category.name.toLocaleLowerCase("id-ID")]));
        return {
          ...current,
          categories: nextCategories,
          judges: current.judges.map((judge) => ({
            ...judge,
            categoryIds: (judge.categoryIds || []).map((id) => nextIdByName.get(oldNameById.get(id))).filter(Boolean)
          }))
        };
      });
      setError("");
    } catch (importError) {
      setError(importError.message);
    } finally {
      event.currentTarget.value = "";
    }
  };

  const save = async () => {
    if (!formatName.trim()) {
      setError("Isi nama format sebelum menyimpan.");
      return;
    }
    if (!draft.categories.length || draft.categories.some((category) => !category.name.trim())) {
      setError("Setiap kategori harus memiliki nama.");
      return;
    }
    if (new Set(draft.categories.map((category) => category.name.trim().toLocaleLowerCase("id-ID"))).size !== draft.categories.length) {
      setError("Nama kategori tidak boleh berulang.");
      return;
    }
    if (new Set(draft.judges.map((judge) => (judge.label || "").trim().toLocaleLowerCase("id-ID"))).size !== draft.judges.length
      || draft.judges.some((judge) => !(judge.label || "").trim())) {
      setError("Setiap label juri harus diisi dan tidak boleh berulang.");
      return;
    }
    if (draft.settings.maxPerformanceTime && !/^\d{2}:[0-5]\d$/.test(draft.settings.maxPerformanceTime)) {
      setError("Waktu maksimal harus menggunakan format MM:SS, misalnya 09:45.");
      return;
    }
    if (draft.categories.some((category) => {
      const names = category.items.map((item) => item.trim().toLocaleLowerCase("id-ID"));
      const groups = category.itemGroups || [];
      const groupNames = groups.map((group) => group.name.trim().toLocaleLowerCase("id-ID"));
      const groupedItems = groups.flatMap((group) => group.items);
      return names.some((name) => !name)
        || new Set(names).size !== names.length
        || !groups.length
        || groupNames.some((name) => !name)
        || new Set(groupNames).size !== groupNames.length
        || groupedItems.length !== category.items.length
        || category.items.some((item) => groupedItems.filter((groupItem) => groupItem === item).length !== 1);
    })) {
      setError("Setiap kategori harus memiliki nama kelompok yang unik dan setiap item harus masuk tepat ke satu kelompok.");
      return;
    }
    try {
      setError("");
      const configuration = {
        ...draft,
        categories: draft.categories.map((category) => {
          const savedCategory = { ...category };
          delete savedCategory.maxTime;
          return savedCategory;
        })
      };
      await onSave(formatName.trim(), configuration, formatId || "");
    } catch {
      // The parent displays the backend error.
    }
  };

  const selectFormat = (selectedId) => {
    onFormatChange(selectedId);
    const selectedFormat = formats.find((format) => format.id === selectedId);
    if (selectedFormat) {
      setFormatName(selectedFormat.name);
      setDraft(normalizeConfiguration(selectedFormat.configuration));
    }
  };

  const addManualParticipant = async (event) => {
    event.preventDefault();
    const names = manualRows.map((row) => row.teamName.trim()).filter(Boolean);
    if (!names.length) {
      setError("Isi setidaknya satu nama tim.");
      return;
    }
    if (new Set(names.map((name) => name.toLocaleLowerCase("id-ID"))).size !== names.length) {
      setError("Nama tim dalam daftar tidak boleh berulang.");
      return;
    }
    try {
      await onAddParticipant({
        participants: names.map((teamName) => ({ participantName: teamName, teamName }))
      });
      setManualRows([{ id: crypto.randomUUID(), teamName: "" }]);
      setError("");
    } catch {
      // The parent displays the backend error.
    }
  };

  const announcementCard = <ConfigurationCard
    id="announcement"
    icon={FileText}
    title="Pengumuman lomba"
    description="Publikasikan informasi resmi pada akun peserta event."
    summary={draft.settings.announcement.enabled ? "Tayang di akun peserta" : "Belum dipublikasikan"}
    open
    onToggle={() => {}}
    onSave={save}
    busy={busy}
    saveLabel="Simpan pengumuman"
  >
    <label className="scoring-config-settings scoring-config-announcement-toggle">
      <span>Tampilkan pada akun peserta</span>
      <input type="checkbox" checked={Boolean(draft.settings.announcement.enabled)} onChange={(event) => setDraft((current) => ({
        ...current,
        settings: { ...current.settings, announcement: { ...current.settings.announcement, enabled: event.target.checked } }
      }))} />
    </label>
    <label className="scoring-config-field">Judul pengumuman
      <input maxLength="120" value={draft.settings.announcement.title} onChange={(event) => setDraft((current) => ({
        ...current,
        settings: { ...current.settings, announcement: { ...current.settings.announcement, title: event.target.value } }
      }))} placeholder="Hasil lomba" />
    </label>
    <label className="scoring-config-field">Isi pengumuman
      <textarea maxLength="2000" rows="4" value={draft.settings.announcement.message} onChange={(event) => setDraft((current) => ({
        ...current,
        settings: { ...current.settings, announcement: { ...current.settings.announcement, message: event.target.value } }
      }))} placeholder="Informasi untuk peserta..." />
    </label>
  </ConfigurationCard>;

  if (announcementOnly) return <div className="scoring-config-stack">
    {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
    {announcementCard}
  </div>;

  return <div className="scoring-config-stack">
    {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}

    <ConfigurationCard
      id="format"
      icon={FileText}
      title="Format penilaian"
      description="Pilih format tersimpan atau beri nama konfigurasi ini."
      summary={formatId ? "Format tersimpan" : "Format baru"}
      open={Boolean(openCards.format)}
      onToggle={() => toggleCard("format")}
      onSave={save}
      busy={busy}
      saveLabel={formatId ? "Simpan format" : "Simpan format baru"}
    >
      {eventId && <p className="scoring-config-note">Event dipilih · {activeTier?.name || tiers[0]?.name || "Tingkat 1"}. Pilih tingkatan sebelum menentukan nama dan isi format.</p>}
      <div className="scoring-config-form-grid">
        <label className="scoring-config-field">Nama format
          <input value={formatName} maxLength="100" onChange={(event) => setFormatName(event.target.value)} aria-label="Nama format" />
        </label>
        {formats.length > 0 && <label className="scoring-config-field">Format tersimpan
          <select value={formatId || ""} onChange={(event) => selectFormat(event.target.value)} aria-label="Pilih format tersimpan">
            <option value="">Format baru</option>
            {formats.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}
          </select>
        </label>}
      </div>
      {eventId && <div className="scoring-config-card-actions">
        <button className="button button-outline button-small" type="button" disabled={busy || !formatId} onClick={onApply}><Award size={15} /> Terapkan ke event</button>
        {formatId && <button className="reject-button" type="button" disabled={busy} onClick={() => {
          if (window.confirm("Hapus format penilaian ini? Format yang sedang digunakan event tidak dapat dihapus.")) onDeleteFormat?.(formatId);
        }}><Trash2 size={15} /> Hapus format</button>}
      </div>}
      <p className="scoring-config-note">Penyimpanan memperbarui format terpilih atau membuat format baru. Event yang sudah memiliki nilai tidak dapat menerima perubahan konfigurasi.</p>
    </ConfigurationCard>

    <ConfigurationCard
      id="categories"
      icon={ClipboardList}
      title="Kategori dan item penilaian"
      description="Atur kategori, bagian, dan item yang dinilai."
      summary={`${draft.categories.length} kategori`}
      open={Boolean(openCards.categories)}
      onToggle={() => toggleCard("categories")}
      onSave={save}
      busy={busy}
      saveLabel="Simpan kategori dan item"
    >
      <div className="scoring-config-actions">
        <button className="button button-outline button-small" type="button" onClick={exportCsv}>Export CSV</button>
        <label className="button button-outline button-small">Import CSV<input className="visually-hidden" type="file" accept=".csv,text/csv" onChange={importCsv} /></label>
      </div>
      <form className="scoring-config-add-row" onSubmit={(event) => { event.preventDefault(); addCategory(); }}>
        <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Nama kategori baru" aria-label="Nama kategori baru" />
        <button className="button button-outline button-small" type="submit"><Plus size={15} /> Tambah kategori</button>
      </form>
      <div className="scoring-config-nested-list">
        {draft.categories.map((category, categoryIndex) => (
          <ConfigurationCard
            key={category.id}
            id={`category-${category.id}`}
            icon={ClipboardList}
            title={category.name || `Kategori ${categoryIndex + 1}`}
            description="Nama kategori, kelompok item, dan kriteria penilaian."
            summary={`${category.items.length} item`}
            open={Boolean(openCategories[category.id])}
            onToggle={() => toggleCategory(category.id)}
            onSave={save}
            busy={busy}
            saveLabel="Simpan kategori"
          >
            <div className="scoring-config-form-grid">
              <label className="scoring-config-field">Nama kategori
                <input value={category.name} onChange={(event) => patchCategory(category.id, { name: event.target.value })} aria-label={`Nama kategori ${category.name}`} />
              </label>
            </div>
            <div className="scoring-config-group-list">
              <div className="scoring-config-subheading"><strong>Bagian pada tabel</strong><span>Kelompokkan item tanpa mengubah namanya.</span></div>
              {category.itemGroups.map((group) => <div className="scoring-config-group-row" key={group.id}>
                <input value={group.name} maxLength="80" aria-label={`Nama bagian ${group.name}`} onChange={(event) => patchItemGroup(category.id, group.id, { name: event.target.value })} />
                <span>{group.items.length} item</span>
                <button className="reject-button scoring-config-icon-delete" type="button" disabled={category.itemGroups.length < 2} aria-label={`Hapus bagian ${group.name}`} onClick={() => removeItemGroup(category.id, group.id)}><Trash2 size={15} /></button>
              </div>)}
              <button className="button button-outline button-small" type="button" onClick={() => addItemGroup(category.id)}><Plus size={15} /> Tambah bagian</button>
            </div>
            <div className="scoring-config-item-list">
              <div className="scoring-config-subheading"><strong>Item penilaian</strong><span>{category.items.length} item</span></div>
              {category.items.map((item, index) => <div className="scoring-item-row" key={`${category.id}-${index}`}>
                <span className="scoring-item-number">{String(index + 1).padStart(2, "0")}</span>
                <strong className="scoring-item-copy">{item}</strong>
                <select className="scoring-item-group-select" value={category.itemGroups.find((group) => group.items.includes(item))?.id || category.itemGroups[0]?.id || ""} aria-label={`Bagian untuk ${item}`} onChange={(event) => assignItemGroup(category.id, event.target.value, item, true)}>
                  {category.itemGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
                <button className="reject-button scoring-config-icon-delete" type="button" aria-label={`Hapus item ${item}`} onClick={() => removeItem(category.id, item)}><Trash2 size={15} /></button>
              </div>)}
              {!category.items.length && <p className="scoring-category-empty">Belum ada item penilaian.</p>}
            </div>
            <form className="scoring-config-add-row" onSubmit={(event) => { event.preventDefault(); addItem(category.id); }}>
              <input value={itemDraft[category.id] || ""} onChange={(event) => setItemDraft((current) => ({ ...current, [category.id]: event.target.value }))} placeholder="Nama item penilaian" aria-label={`Item baru untuk ${category.name}`} />
              <button className="button button-outline button-small" type="submit"><Plus size={15} /> Tambah item</button>
            </form>
            <button className="reject-button scoring-config-remove" type="button" onClick={() => setDraft((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== category.id), judges: current.judges.map((judge) => ({ ...judge, categoryIds: (judge.categoryIds || []).filter((id) => id !== category.id) })) }))}><Trash2 size={15} /> Hapus kategori</button>
          </ConfigurationCard>
        ))}
      </div>
    </ConfigurationCard>

    <ConfigurationCard
      id="judges"
      icon={Gavel}
      title="Pengaturan juri"
      description="Kelola label juri dan kategori yang boleh dinilai."
      summary={`${draft.judges.length} juri`}
      open={Boolean(openCards.judges)}
      onToggle={() => toggleCard("judges")}
      onSave={save}
      busy={busy}
      saveLabel="Simpan pengaturan juri"
    >
      <form className="scoring-config-add-row" onSubmit={(event) => { event.preventDefault(); addJudge(); }}>
        <input value={newJudge} onChange={(event) => setNewJudge(event.target.value)} placeholder="Contoh: Juri PBB 1" aria-label="Label juri baru" />
        <button className="button button-outline button-small" type="submit"><Plus size={15} /> Tambah juri</button>
      </form>
      <div className="scoring-config-nested-list">
        {draft.judges.map((judge) => (
          <ConfigurationCard
            key={judge.id}
            id={`judge-${judge.id}`}
            icon={Gavel}
            title={judge.label || judge.name || "Juri tanpa label"}
            description="Pilih kategori yang menjadi tanggung jawab juri."
            summary={`${(judge.categoryIds || []).length} kategori`}
            open={Boolean(openCategories[`judge-${judge.id}`])}
            onToggle={() => toggleCategory(`judge-${judge.id}`)}
            onSave={save}
            busy={busy}
            saveLabel="Simpan juri"
          >
            <label className="scoring-config-field">Label juri
              <input value={judge.label || judge.name || ""} onChange={(event) => setDraft((current) => ({ ...current, judges: current.judges.map((item) => item.id === judge.id ? { ...item, label: event.target.value } : item) }))} aria-label="Label juri" />
            </label>
            <div className="scoring-category-access scoring-judge-category-list">
              {draft.categories.map((category) => <label key={`${judge.id}-${category.id}`}>
                <input type="checkbox" checked={(judge.categoryIds || []).includes(category.id)} onChange={() => toggleJudgeCategory(judge.id, category.id)} />
                {category.name}
              </label>)}
            </div>
            <button className="reject-button scoring-config-remove" type="button" onClick={() => setDraft((current) => ({ ...current, judges: current.judges.filter((item) => item.id !== judge.id) }))}><Trash2 size={15} /> Hapus juri</button>
          </ConfigurationCard>
        ))}
      </div>
    </ConfigurationCard>

    <ConfigurationCard
      id="penalties"
      icon={Award}
      title="Jenis punishment / penalti"
      description="Atur pengurangan nilai untuk pelanggaran."
      summary={`${draft.penalties.length} jenis`}
      open={Boolean(openCards.penalties)}
      onToggle={() => toggleCard("penalties")}
      onSave={save}
      busy={busy}
      saveLabel="Simpan penalti"
    >
      <div className="scoring-config-nested-list">
        {draft.penalties.map((penalty) => (
          <ConfigurationCard
            key={penalty.id}
            id={`penalty-${penalty.id}`}
            icon={Award}
            title={penalty.name}
            description="Nama penalti dan jumlah pengurangan poin."
            summary={`-${penalty.value} poin`}
            open={Boolean(openCategories[`penalty-${penalty.id}`])}
            onToggle={() => toggleCategory(`penalty-${penalty.id}`)}
            onSave={save}
            busy={busy}
            saveLabel="Simpan penalti"
          >
            <div className="scoring-config-form-grid">
              <label className="scoring-config-field">Nama penalti
                <input value={penalty.name} onChange={(event) => setDraft((current) => ({ ...current, penalties: current.penalties.map((item) => item.id === penalty.id ? { ...item, name: event.target.value } : item) }))} />
              </label>
              <label className="scoring-config-field">Pengurangan poin
                <input type="number" min="0" step="1" value={penalty.value} onChange={(event) => setDraft((current) => ({ ...current, penalties: current.penalties.map((item) => item.id === penalty.id ? { ...item, value: Number(event.target.value) || 0 } : item) }))} />
              </label>
            </div>
            <button className="reject-button scoring-config-remove" type="button" onClick={() => setDraft((current) => ({ ...current, penalties: current.penalties.filter((item) => item.id !== penalty.id) }))}><Trash2 size={15} /> Hapus penalti</button>
          </ConfigurationCard>
        ))}
      </div>
      <form className="scoring-config-add-row" onSubmit={(event) => { event.preventDefault(); addPenalty(); }}>
        <input value={newPenalty.name} onChange={(event) => setNewPenalty((current) => ({ ...current, name: event.target.value }))} placeholder="Nama penalti baru" aria-label="Nama penalti baru" />
        <input type="number" min="0" step="1" value={newPenalty.value} onChange={(event) => setNewPenalty((current) => ({ ...current, value: event.target.value }))} placeholder="Pengurangan poin" aria-label="Pengurangan penalti" />
        <button className="button button-outline button-small" type="submit"><Plus size={15} /> Tambah penalti</button>
      </form>
    </ConfigurationCard>

    <ConfigurationCard
      id="comparison"
      icon={GitCompareArrows}
      title="Nilai pembanding"
      description="Gunakan nilai lain saat skor utama peserta sama."
      summary="Nilai akhir dan kategori"
      open={Boolean(openCards.comparison)}
      onToggle={() => toggleCard("comparison")}
      onSave={save}
      busy={busy}
      saveLabel="Simpan nilai pembanding"
    >
      <label className="scoring-config-field">Pembanding nilai akhir
        <select value={tieBreakerValue(draft.settings.tieBreakers.overall)} onChange={(event) => setTieBreaker("overall", event.target.value)}>
          {renderComparisonOptions()}
        </select>
      </label>
      <div className="scoring-config-comparison-list">
        {comparisonTargets.map((targetCategory) => {
          return <label className="scoring-config-field" key={targetCategory.id}>Pembanding {targetCategory.name}
            <select value={tieBreakerValue(draft.settings.tieBreakers.categories[targetCategory.id])} onChange={(event) => setTieBreaker(targetCategory.id, event.target.value)}>
              {renderComparisonOptions()}
            </select>
          </label>;
        })}
      </div>
      <p className="scoring-config-note">Skor utama tetap menjadi urutan pertama. Pembanding digunakan hanya ketika skor utama sama; waktu yang melampaui batas tidak dipakai.</p>
    </ConfigurationCard>

    <ConfigurationCard
      id="maximum-time"
      icon={Clock3}
      title="Pengaturan waktu"
      description="Tetapkan batas waktu tampil sebagai acuan penilaian."
      summary={draft.settings.maxPerformanceTime || "Belum dibatasi"}
      open={Boolean(openCards.maximumTime)}
      onToggle={() => toggleCard("maximumTime")}
      onSave={save}
      busy={busy}
      saveLabel="Simpan waktu maksimal"
    >
      <label className="scoring-config-field">Waktu maksimal (MM:SS)
        <input type="text" inputMode="numeric" maxLength="5" placeholder="09:45" value={draft.settings.maxPerformanceTime || ""} onChange={(event) => setDraft((current) => ({ ...current, settings: { ...current.settings, maxPerformanceTime: event.target.value.replace(/[^0-9:]/g, "").slice(0, 5) } }))} aria-label="Waktu maksimal format menit dan detik" />
      </label>
    </ConfigurationCard>
    <ConfigurationCard
      id="participants"
      icon={UserPlus}
      title="Tambah peserta manual"
      description="Admin/Tim Rekap dapat menambahkan nama tim langsung ke event."
      summary={`${participants.filter((participant) => participant.isManual).length} peserta manual`}
      open={Boolean(openCards.participants)}
      onToggle={() => toggleCard("participants")}
    >
      {!eventId && <p className="scoring-config-note">Pilih atau buat event terlebih dahulu untuk menambahkan peserta.</p>}
      <form className="scoring-manual-table-form" onSubmit={addManualParticipant}>
        <div className="scoring-manual-table-scroll">
          <table className="scoring-manual-table">
            <thead><tr><th>No.</th><th>Nama tim</th><th>Aksi</th></tr></thead>
            <tbody>{manualRows.map((row, index) => <tr key={row.id}>
              <td>{String(index + 1).padStart(2, "0")}</td>
              <td><input maxLength="120" disabled={!eventId || busy} value={row.teamName} onChange={(event) => setManualRows((current) => current.map((item) => item.id === row.id ? { ...item, teamName: event.target.value } : item))} aria-label={`Nama tim peserta ${index + 1}`} placeholder="Contoh: Tim Garuda" /></td>
              <td><button className="reject-button scoring-config-icon-delete" type="button" disabled={manualRows.length < 2 || busy} aria-label={`Hapus baris peserta ${index + 1}`} onClick={() => setManualRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 size={15} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="scoring-manual-form-actions">
          <button className="button button-outline button-small" type="button" disabled={!eventId || busy} onClick={() => setManualRows((current) => [...current, { id: crypto.randomUUID(), teamName: "" }])}><Plus size={15} /> Tambah baris</button>
          <button className="button button-primary button-small" type="submit" disabled={!eventId || busy}><UserPlus size={15} /> {busy ? "Menyimpan..." : "Simpan peserta"}</button>
        </div>
      </form>
      <div className="scoring-manual-roster-list">
        <div className="scoring-config-subheading"><strong>Daftar peserta manual</strong><span>{participants.filter((participant) => participant.isManual).length} peserta</span></div>
        {!participants.some((participant) => participant.isManual) && <p className="scoring-config-note">Belum ada peserta manual pada event ini.</p>}
        {participants.filter((participant) => participant.isManual).length > 0 && <div className="scoring-manual-table-scroll">
          <table className="scoring-manual-table scoring-manual-roster-table">
            <thead><tr><th>No.</th><th>Nama tim</th><th>Status</th></tr></thead>
            <tbody>{participants.filter((participant) => participant.isManual).map((participant, index) => <tr key={participant.registrationId}>
              <td>{String(index + 1).padStart(2, "0")}</td>
              <td>{participant.teamName || participant.participantName}</td>
              <td>{participant.complete ? "Nilai lengkap" : "Siap dinilai"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </ConfigurationCard>

    <ConfigurationCard
      id="preview"
      icon={Eye}
      title="Preview input nilai"
      description="Pratinjau tabel yang akan dipakai saat input nilai peserta."
      summary={`${draft.categories.length} tabel`}
      open={Boolean(openCards.preview)}
      onToggle={() => toggleCard("preview")}
    >
      <p className="scoring-config-note">Preview mengikuti draft konfigurasi saat ini. Simpan konfigurasi sebelum menerapkannya ke event.</p>
      <div className="scoring-preview-grid">
        {draft.categories.map((category) => {
          const categoryJudges = draft.judges.filter((judge) => (judge.categoryIds || []).includes(category.id));
          let rowNumber = 0;
          return <section className="scoring-preview-section" key={category.id}>
            <h4>{category.name}</h4>
            <div className="scoring-table-scroll">
              <table className="scoring-sheet-table scoring-preview-table">
                <thead><tr><th>No</th><th>Gerakan / Kriteria</th>{categoryJudges.map((judge) => <th key={judge.id}>{judge.label || judge.name}</th>)}<th>JML</th></tr></thead>
                <tbody>
                  {category.itemGroups.map((group) => <Fragment key={group.id}>
                    <tr className="scoring-table-group"><th colSpan={categoryJudges.length + 3}>{group.name}</th></tr>
                    {group.items.map((item) => <tr key={`${group.id}-${item}`}>
                      <td>{++rowNumber}</td><td>{item}</td>
                      {categoryJudges.map((judge) => <td key={judge.id}><input type="number" disabled aria-label={`Preview ${item}, ${judge.label || judge.name}`} /></td>)}
                      <td className="scoring-table-total">—</td>
                    </tr>)}
                    {group.items.length > 0 && <tr className="scoring-table-group-total"><th colSpan={2}>TOTAL {group.name.toLocaleUpperCase("id-ID")}</th>{categoryJudges.map((judge) => <td key={judge.id}>—</td>)}<td>—</td></tr>}
                  </Fragment>)}
                  {!category.items.length && <tr><td colSpan={categoryJudges.length + 3} className="scoring-table-empty">Belum ada item penilaian.</td></tr>}
                  <tr className="scoring-table-summary"><th colSpan={2}>TOTAL {category.name.toLocaleUpperCase("id-ID")}</th><th colSpan={categoryJudges.length + 1}>—</th></tr>
                </tbody>
              </table>
            </div>
          </section>;
        })}
      </div>
    </ConfigurationCard>
  </div>;
}
