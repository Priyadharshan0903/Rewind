import { create } from "zustand";
import type { HttpMethod, Run, RunSummary } from "@shared/types";
import { toSummary } from "@shared/types";
import { newId } from "@shared/id";
import { effectiveRequest, useApp } from "./app";
import { useUi } from "./ui";

interface RunsState {
  // Runbook right panel (per selected request)
  panelRuns: RunSummary[];
  currentRun: Run | null;
  compareId: string | null;
  compareRun: Run | null;
  sending: boolean;
  sendId: string | null;
  sendError: string | null;

  // History page
  allRuns: RunSummary[];
  filterStatus: "all" | "2xx" | "4xx";
  filterMethod: HttpMethod | "all";
  histSelectedId: string | null;
  histDetail: Run | null;

  loadForRequest: (requestId: string) => Promise<void>;
  send: () => Promise<void>;
  cancelSend: () => void;
  setCompare: (id: string | null) => Promise<void>;
  loadAll: () => Promise<void>;
  setFilterStatus: (f: "all" | "2xx" | "4xx") => void;
  setFilterMethod: (m: HttpMethod | "all") => void;
  selectHist: (id: string) => Promise<void>;
  handleAppended: (summary: RunSummary) => void;
}

function dedupe(list: RunSummary[]): RunSummary[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

export const useRuns = create<RunsState>((set, get) => ({
  panelRuns: [],
  currentRun: null,
  compareId: null,
  compareRun: null,
  sending: false,
  sendId: null,
  sendError: null,

  allRuns: [],
  filterStatus: "all",
  filterMethod: "all",
  histSelectedId: null,
  histDetail: null,

  loadForRequest: async (requestId) => {
    const panelRuns = await window.rewind.listRuns({ requestId });
    const currentRun = panelRuns[0]
      ? await window.rewind.getRun(panelRuns[0].id)
      : null;
    const compareId = panelRuns[1]?.id ?? null;
    const compareRun = compareId ? await window.rewind.getRun(compareId) : null;
    set({ panelRuns, currentRun, compareId, compareRun, sendError: null });
  },

  send: async () => {
    const app = useApp.getState();
    const selection = app.selection;
    if (!selection || get().sending) return;
    // Send what the user sees — the unsaved draft if one exists (Postman behavior).
    const request = effectiveRequest(
      app,
      selection.collectionId,
      selection.requestId,
    );
    if (!request) return;
    const sendId = newId();
    set({ sending: true, sendId, sendError: null });
    try {
      const run = await window.rewind.send({
        sendId,
        collectionId: selection.collectionId,
        request,
      });
      // Environment vars may have been updated by the post-response script or captures.
      const boot = await window.rewind.getBoot();
      useApp.setState({ environments: boot.environments });
      const captured = run.captured && Object.keys(run.captured);
      if (captured && captured.length) {
        useUi
          .getState()
          .toast(`Captured ${captured.map((k) => `{{${k}}}`).join(", ")}`);
      }
      set((s) => ({
        sending: false,
        sendId: null,
        currentRun: run,
        panelRuns: dedupe([toSummary(run), ...s.panelRuns]),
        compareId: s.compareId ?? s.panelRuns[0]?.id ?? null,
        compareRun:
          s.compareRun ??
          (s.currentRun && s.currentRun.requestId === run.requestId
            ? s.currentRun
            : null),
      }));
    } catch (err) {
      set({
        sending: false,
        sendId: null,
        sendError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  cancelSend: () => {
    const { sendId } = get();
    if (sendId) void window.rewind.cancel(sendId);
  },

  setCompare: async (id) => {
    if (!id) {
      set({ compareId: null, compareRun: null });
      return;
    }
    set({ compareId: id });
    const compareRun = await window.rewind.getRun(id);
    set({ compareRun });
  },

  loadAll: async () => {
    const { filterStatus, filterMethod } = get();
    const allRuns = await window.rewind.listRuns({
      statusClass: filterStatus,
      method: filterMethod,
    });
    const histSelectedId =
      get().histSelectedId && allRuns.some((r) => r.id === get().histSelectedId)
        ? get().histSelectedId
        : (allRuns[0]?.id ?? null);
    set({ allRuns, histSelectedId });
    if (histSelectedId && get().histDetail?.id !== histSelectedId) {
      set({ histDetail: await window.rewind.getRun(histSelectedId) });
    } else if (!histSelectedId) {
      set({ histDetail: null });
    }
  },

  setFilterStatus: (filterStatus) => {
    set({ filterStatus });
    void get().loadAll();
  },

  setFilterMethod: (filterMethod) => {
    set({ filterMethod });
    void get().loadAll();
  },

  selectHist: async (id) => {
    set({ histSelectedId: id });
    set({ histDetail: await window.rewind.getRun(id) });
  },

  handleAppended: (summary) => {
    const app = useApp.getState();
    set((s) => ({
      allRuns: dedupe([summary, ...s.allRuns]),
      panelRuns:
        app.selection?.requestId === summary.requestId
          ? dedupe([summary, ...s.panelRuns])
          : s.panelRuns,
    }));
  },
}));
