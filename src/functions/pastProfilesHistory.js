import { openDB } from "idb";

import { displayText } from "../util/localization";
import { logError } from "../util/logger";
import { SDK, HOOK_PRIORITIES } from "../util/modding";
import { isNonNullObject, parseJSON } from "../util/utils";

/**
 * @param {(memberNumber: number, characterBundle: string, seen: number) => void} openCharacterBundle
 * @returns {Promise<{ saveHistory: (profile: FBCSavedProfile) => Promise<void>; markProfileListOpen: (memberNumber: number) => void; }>}
 */
export default async function initPastProfilesHistory(openCharacterBundle) {
  /** @type {import("idb").IDBPDatabase<{profileHistory: { key: number; value: FBCProfileHistory; indexes: { memberNumber: number; memberNumberSeen: [number, number] } }}>}*/
  const historyDb = await openDB("bce-past-profiles-history", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("profileHistory")) {
        const historyStore = db.createObjectStore("profileHistory", { keyPath: "id", autoIncrement: true });
        historyStore.createIndex("memberNumber", "memberNumber");
        historyStore.createIndex("memberNumberSeen", ["memberNumber", "seen"]);
      }
    },
  });

  const historyDropdownId = "bceProfileHistorySelect";
  const historyDropdownDefault = "latest";
  const historyLimitPerMember = 40;
  let historyLoading = false;
  let historyLoadId = 0;
  let historyMemberNumber = 0;
  let historySheetEnabled = false;
  let selectedHistoryKey = historyDropdownDefault;
  /** @type {FBCProfileHistory[]} */
  let historyEntries = [];
  const historySelect = ElementCreateDropdown(historyDropdownId, [], function onHistorySelectionChange() {
    handleHistorySelectionChange(this.value);
  });
  historySelect.classList.add("bce-hidden");
  historySelect.classList.add("bce-profile-history-select");
  historySelect.disabled = true;

  function clearHistoryOptions() {
    historySelect.replaceChildren();
  }

  /**
   * @param {string} value
   * @param {string} label
   * @returns {void}
   */
  function appendHistoryOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    historySelect.append(option);
  }

  function renderHistoryOptions() {
    clearHistoryOptions();
    if (historyLoading) {
      appendHistoryOption(historyDropdownDefault, displayText("Loading profile history..."));
      historySelect.value = historyDropdownDefault;
      historySelect.disabled = true;
      return;
    }
    if (historyEntries.length === 0) {
      appendHistoryOption(historyDropdownDefault, displayText("Latest profile"));
      historySelect.value = historyDropdownDefault;
      historySelect.disabled = true;
      return;
    }
    const [latestEntry] = historyEntries;
    appendHistoryOption(
      historyDropdownDefault,
      displayText("Latest profile ($seen)", { $seen: new Date(latestEntry.seen).toLocaleString() })
    );
    for (const entry of historyEntries.slice(1)) {
      if (typeof entry.id !== "number") continue;
      appendHistoryOption(String(entry.id), displayText("Version from $seen", { $seen: new Date(entry.seen).toLocaleString() }));
    }
    if (!Array.from(historySelect.options).some(opt => opt.value === selectedHistoryKey)) {
      selectedHistoryKey = historyDropdownDefault;
    }
    historySelect.value = selectedHistoryKey;
    historySelect.disabled = historyEntries.length < 2;
  }

  function showHistoryDropdown() {
    historySelect.classList.remove("bce-hidden");
    ElementPositionFix(historyDropdownId, 36, 710, 45, 470, 60);
  }

  function hideHistoryDropdown() {
    historySelect.classList.add("bce-hidden");
  }

  /**
   * @param {number} memberNumber
   * @returns {Promise<FBCProfileHistory[]>}
   */
  async function getMemberHistory(memberNumber) {
    const entries = await historyDb.getAllFromIndex("profileHistory", "memberNumber", memberNumber);
    entries.sort((a, b) => b.seen - a.seen);
    return entries;
  }

  /**
   * Keep full state in stored snapshots, but ignore appearance/reputation for history-version splitting.
   * @param {string} characterBundle
   * @returns {string}
   */
  function getHistoryComparisonBundle(characterBundle) {
    const parsed = parseJSON(characterBundle);
    if (!isNonNullObject(parsed)) return characterBundle;
    if (!Object.hasOwn(parsed, "Appearance") && !Object.hasOwn(parsed, "Reputation")) return characterBundle;
    const copied = { ...parsed };
    delete copied.Appearance;
    delete copied.Reputation;
    return JSON.stringify(copied);
  }

  function clearActiveSheet() {
    hideHistoryDropdown();
    historySheetEnabled = false;
    historyLoadId += 1;
    historyMemberNumber = 0;
    historyEntries = [];
    historyLoading = false;
    selectedHistoryKey = historyDropdownDefault;
    renderHistoryOptions();
  }

  /**
   * @param {number} memberNumber
   * @returns {Promise<void>}
   */
  async function loadHistoryForMember(memberNumber) {
    historyLoadId += 1;
    const currentLoadId = historyLoadId;
    historyMemberNumber = memberNumber;
    historyLoading = true;
    historyEntries = [];
    selectedHistoryKey = historyDropdownDefault;
    renderHistoryOptions();
    try {
      const loadedEntries = await getMemberHistory(memberNumber);
      if (currentLoadId !== historyLoadId || memberNumber !== historyMemberNumber) return;
      historyEntries = loadedEntries;
      historyLoading = false;
      renderHistoryOptions();
    } catch (e) {
      if (currentLoadId !== historyLoadId) return;
      historyLoading = false;
      historyEntries = [];
      renderHistoryOptions();
      logError("loading profile history", e);
    }
  }

  /**
   * @param {string} value
   * @returns {void}
   */
  function handleHistorySelectionChange(value) {
    selectedHistoryKey = value;
    if (!historySheetEnabled || !InformationSheetSelection?.MemberNumber || InformationSheetSelection.MemberNumber !== historyMemberNumber) return;
    if (value === historyDropdownDefault) {
      const [latestEntry] = historyEntries;
      if (!latestEntry) return;
      markProfileListOpen(latestEntry.memberNumber);
      openCharacterBundle(latestEntry.memberNumber, latestEntry.characterBundle, latestEntry.seen);
      return;
    }
    const selectedId = Number(value);
    if (!Number.isFinite(selectedId)) return;
    const selectedEntry = historyEntries.find(entry => entry.id === selectedId);
    if (!selectedEntry) return;
    markProfileListOpen(selectedEntry.memberNumber);
    openCharacterBundle(selectedEntry.memberNumber, selectedEntry.characterBundle, selectedEntry.seen);
  }

  /**
   * @param {FBCSavedProfile} profile
   * @returns {Promise<void>}
   */
  async function saveHistory(profile) {
    const tx = historyDb.transaction("profileHistory", "readwrite");
    const store = tx.objectStore("profileHistory");
    const memberIndex = store.index("memberNumberSeen");
    const range = IDBKeyRange.bound([profile.memberNumber, 0], [profile.memberNumber, Number.MAX_SAFE_INTEGER]);
    const latestCursor = await memberIndex.openCursor(range, "prev");
    const profileComparisonBundle = getHistoryComparisonBundle(profile.characterBundle);
    const latestComparisonBundle = latestCursor?.value ? getHistoryComparisonBundle(latestCursor.value.characterBundle) : "";
    if (latestCursor?.value && latestComparisonBundle === profileComparisonBundle) {
      latestCursor.value.name = profile.name;
      latestCursor.value.lastNick = profile.lastNick;
      latestCursor.value.seen = profile.seen;
      latestCursor.value.characterBundle = profile.characterBundle;
      await latestCursor.update(latestCursor.value);
    } else {
      await store.add(profile);
    }

    const existingEntries = await memberIndex.getAll(range);
    existingEntries.sort((a, b) => b.seen - a.seen);
    const entriesToDelete = existingEntries.slice(historyLimitPerMember).map(entry => entry.id).filter(id => typeof id === "number");
    await Promise.all(entriesToDelete.map(id => store.delete(id)));
    await tx.done;
  }

  /**
   * @param {number} memberNumber
   * @returns {void}
   */
  function markProfileListOpen(memberNumber) {
    historySheetEnabled = true;
    if (historyMemberNumber === memberNumber) return;
    historyLoadId += 1;
    historyMemberNumber = memberNumber;
    historyEntries = [];
    historyLoading = false;
    selectedHistoryKey = historyDropdownDefault;
    renderHistoryOptions();
  }

  SDK.hookFunction("InformationSheetRun", HOOK_PRIORITIES.AddBehaviour, (args, next) => {
    if (historySheetEnabled && InformationSheetSelection?.MemberNumber === historyMemberNumber) {
      showHistoryDropdown();
      if (historyEntries.length === 0 && !historyLoading) {
        loadHistoryForMember(historyMemberNumber);
      }
    } else {
      hideHistoryDropdown();
    }
    return next(args);
  });

  SDK.hookFunction("InformationSheetExit", HOOK_PRIORITIES.AddBehaviour, (args, next) => {
    clearActiveSheet();
    return next(args);
  });

  SDK.hookFunction("OnlineProfileRun", HOOK_PRIORITIES.AddBehaviour, (args, next) => {
    hideHistoryDropdown();
    return next(args);
  });

  return {
    saveHistory,
    markProfileListOpen,
  };
}
