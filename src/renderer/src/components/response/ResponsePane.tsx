import type { RequestNode } from "@shared/types";
import { useApp, useMergedVars } from "@/stores/app";
import { useRuns } from "@/stores/runs";
import { useUi } from "@/stores/ui";
import { useEffect, useMemo, useRef } from "react";
import {
  Search,
  PanelRight,
  Bookmark,
  RotateCw,
  Check,
  X,
} from "lucide-react";
import { fmtBytes, fmtMs, prettyJson } from "@/lib/format";
import { resolveForCodegen } from "@/lib/resolve";
import { charWidth, findMatches, normIndex } from "@/lib/find";
import { CodeView, isLargeBody } from "@/components/common/Code";
import { CopyMenu } from "@/components/common/CopyMenu";
import { FindMarksLayer } from "@/components/common/FindBar";

const RESP_FONT = '400 12px "JetBrains Mono", monospace';
const RESP_LINE_H = 21.6; // 12px × 1.8

export function ResponsePane({
  request,
}: {
  request: RequestNode;
}): React.JSX.Element {
  const run = useRuns((s) => s.currentRun);
  const sending = useRuns((s) => s.sending);
  const sendError = useRuns((s) => s.sendError);
  const send = useRuns((s) => s.send);
  const replaceCollection = useApp((s) => s.replaceCollection);
  const patchSettings = useApp((s) => s.patchSettings);
  const historyPanelOpen = useApp((s) => s.settings.historyPanelOpen);
  const vars = useMergedVars();
  const toast = useUi((s) => s.toast);

  // Snippets always reflect the request as currently edited, resolved
  // against collection + environment variables (not a stale stored run).
  const codegenReq = resolveForCodegen(request, vars);

  // Servers often send compact JSON — prettify for display (raw is what's stored).
  const displayBody = useMemo(
    () => (run?.response ? prettyJson(run.response.bodyText) : ""),
    [run?.response],
  );

  const find = useUi((s) => s.find);
  const bodyRef = useRef<HTMLDivElement>(null);
  const findActive = find.open && find.scope === "response" && !!find.query;
  const findText = run?.response ? displayBody : (run?.error ?? "");
  const matches = useMemo(
    () => (findActive ? findMatches(findText, find.query) : []),
    [findActive, findText, find.query],
  );
  const currentMatch = normIndex(find.idx, matches.length);

  useEffect(() => {
    const container = bodyRef.current;
    const m = matches[currentMatch];
    if (!container || !m) return;
    const top = m.line * RESP_LINE_H;
    container.scrollTo({
      top: Math.max(0, top - container.clientHeight / 2),
      left: Math.max(
        0,
        m.col * charWidth(RESP_FONT) - container.clientWidth / 2,
      ),
    });
  }, [matches, currentMatch]);

  const saveExample = async (): Promise<void> => {
    if (!run) return;
    const updated = await window.rewind.saveExample(run.id);
    if (updated) {
      replaceCollection(updated);
      toast("Example saved to request");
    } else {
      toast("Could not save example for this run", "error");
    }
  };

  const failedAsserts =
    run?.script?.assertions.filter((a) => !a.pass).length ?? 0;

  return (
    <div className="response-pane">
      <div className="resp-header">
        {sending ? (
          <span className="status-chip status-pending">Sending…</span>
        ) : run?.response ? (
          <span
            className={`status-chip ${run.response.status < 400 ? "status-ok" : "status-err"}`}
          >
            {run.response.status} {run.response.statusText}
          </span>
        ) : run?.error ? (
          <span className="status-chip status-err">Network error</span>
        ) : (
          <span className="status-chip status-idle">No response</span>
        )}
        {run && !sending && (
          <span className="resp-meta">
            {fmtMs(run.durationMs)}
            {run.response ? ` · ${fmtBytes(run.response.sizeBytes)}` : ""}
          </span>
        )}
        {run?.script && !sending && (
          <span
            className={
              failedAsserts || run.script.error
                ? "assert-chip assert-fail"
                : "assert-chip assert-pass"
            }
            title={
              run.script.error ??
              run.script.assertions
                .map((a) => `${a.pass ? "✓" : "✗"} ${a.expr}`)
                .join("\n")
            }
          >
            {run.script.error ? (
              "script error"
            ) : failedAsserts ? (
              <>
                <X size={12} strokeWidth={2.6} /> {failedAsserts} assert
                {failedAsserts > 1 ? "s" : ""} failed
              </>
            ) : (
              <>
                <Check size={12} strokeWidth={2.6} />{" "}
                {run.script.assertions.length || "script"} ok
              </>
            )}
          </span>
        )}
        {run?.error && !sending && (
          <button
            className="text-btn retry-btn copy-trigger"
            onClick={() => void send()}
          >
            <RotateCw size={14} strokeWidth={2} /> Retry
          </button>
        )}
        <div className="flex-spacer" />
        <button
          className="text-btn icon-tb"
          title="Find in response (⌘F)"
          onClick={() =>
            useUi.getState().setFind({ open: true, scope: "response", idx: 0 })
          }
        >
          <Search size={15} strokeWidth={2} />
        </button>
        <button
          className="text-btn icon-tb"
          title={historyPanelOpen ? "Hide history panel" : "Show history panel"}
          onClick={() => patchSettings({ historyPanelOpen: !historyPanelOpen })}
        >
          <PanelRight size={15} strokeWidth={2} />
        </button>
        <CopyMenu req={codegenReq} />
        <button
          className="text-btn copy-trigger"
          onClick={() => void saveExample()}
          disabled={!run?.response}
        >
          <Bookmark size={15} strokeWidth={2} /> Save example
        </button>
      </div>
      <div className="resp-body" ref={bodyRef}>
        {sendError && <div className="resp-error">IPC error: {sendError}</div>}
        {!run && !sending && !sendError && (
          <div className="resp-empty">
            Send the request to see a response here.{" "}
            <span className="kbd">⌘↩</span>
          </div>
        )}
        {run?.error && <div className="resp-error">{run.error}</div>}
        {run?.response && (
          <>
            {run.response.bodyTruncated && (
              <div className="truncate-note">
                Body truncated for display — full size{" "}
                {fmtBytes(run.response.sizeBytes)}
              </div>
            )}
            {isLargeBody(displayBody) && (
              <div className="truncate-note">
                Large body — syntax highlighting off for speed
              </div>
            )}
            <div className="find-layer-host">
              {findActive && (
                <FindMarksLayer
                  matches={matches}
                  current={currentMatch}
                  queryLen={find.query.length}
                  charW={charWidth(RESP_FONT)}
                  lineH={RESP_LINE_H}
                />
              )}
              <CodeView text={displayBody || "— empty body —"} hideLargeNote />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
