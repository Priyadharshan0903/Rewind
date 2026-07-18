import { useEffect, useMemo, useState } from "react";
import type { Run } from "@shared/types";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { CodeView } from "@/components/common/Code";
import { CopyMenu } from "@/components/common/CopyMenu";
import { prettyJson } from "@/lib/format";
import {
  buildDocs,
  pickLatestRuns,
  renderDocsHtml,
  type CollectionDocs,
  type DocEndpoint,
} from "@/lib/docsgen";

export function DocsView(): React.JSX.Element {
  const collections = useApp((s) => s.collections);
  const [collectionId, setCollectionId] = useState<string | null>(
    collections[0]?.id ?? null,
  );
  const [runs, setRuns] = useState<Map<string, Run>>(new Map());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const collection =
    collections.find((c) => c.id === collectionId) ?? collections[0] ?? null;

  // Keep a valid selection if collections change underneath us.
  useEffect(() => {
    if (!collections.some((c) => c.id === collectionId))
      setCollectionId(collections[0]?.id ?? null);
  }, [collections, collectionId]);

  // Pull captured examples from run history whenever the collection changes.
  useEffect(() => {
    if (!collection) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const summaries = await window.rewind.listRuns({});
      const { chosen, counts: c } = pickLatestRuns(summaries);
      const entries = await Promise.all(
        [...chosen.entries()].map(async ([reqId, runId]) => {
          const run = await window.rewind.getRun(runId);
          return [reqId, run] as const;
        }),
      );
      if (cancelled) return;
      const map = new Map<string, Run>();
      for (const [reqId, run] of entries) if (run) map.set(reqId, run);
      setRuns(map);
      setCounts(c);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [collection?.id]);

  const docs = useMemo<CollectionDocs | null>(
    () => (collection ? buildDocs(collection, runs, counts) : null),
    [collection, runs, counts],
  );

  if (!collections.length) {
    return (
      <div className="docs-view">
        <div className="docs-empty">
          No collections yet — create one in the Runbook to generate docs.
        </div>
      </div>
    );
  }

  return (
    <div className="docs-view">
      <DocsNav
        docs={docs}
        collections={collections.map((c) => ({ id: c.id, name: c.name }))}
        collectionId={collection?.id ?? null}
        onPick={setCollectionId}
      />
      <div className="docs-body">
        {docs && <DocsContent docs={docs} loading={loading} />}
      </div>
    </div>
  );
}

function DocsNav({
  docs,
  collections,
  collectionId,
  onPick,
}: {
  docs: CollectionDocs | null;
  collections: { id: string; name: string }[];
  collectionId: string | null;
  onPick: (id: string) => void;
}): React.JSX.Element {
  return (
    <aside className="docs-nav">
      <div className="docs-nav-label">Collection</div>
      <select
        className="docs-select"
        value={collectionId ?? ""}
        onChange={(e) => onPick(e.target.value)}
      >
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {docs && (
        <nav className="docs-toc">
          {docs.groups.map((g) => (
            <div key={g.id}>
              {g.name && <div className="docs-toc-g">{g.name}</div>}
              {g.endpoints.map((e) => (
                <a
                  key={e.requestId}
                  href={`#ep-${e.requestId}`}
                  className="docs-toc-link"
                >
                  <span className={`m method-${e.method.toLowerCase()}`}>
                    {e.method}
                  </span>
                  <span className="docs-toc-path">{e.path}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
      )}
    </aside>
  );
}

function DocsContent({
  docs,
  loading,
}: {
  docs: CollectionDocs;
  loading: boolean;
}): React.JSX.Element {
  const toast = useUi((s) => s.toast);

  const exportHtml = (): void => {
    const html = renderDocsHtml(docs);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docs.name.replace(/[^\w.-]+/g, "-").toLowerCase()}-api-docs.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported API docs");
  };

  return (
    <div className="docs-doc">
      <header className="docs-head">
        <div>
          <h1 className="docs-title">{docs.name}</h1>
          <div className="docs-meta">
            <span className="docs-ver">v{docs.version}</span>
            <span className="docs-dot">·</span>
            {docs.endpointCount} endpoints
            <span className="docs-dot">·</span>
            <span className="docs-captured">
              {docs.exampleCount} with captured examples
            </span>
          </div>
        </div>
        <button className="docs-export" onClick={exportHtml}>
          ⤓ Export HTML
        </button>
      </header>

      {loading && (
        <div className="docs-loading">Reading run history for examples…</div>
      )}

      {docs.variables.length > 0 && (
        <section className="docs-section">
          <h2 className="docs-group">Variables</h2>
          <div className="docs-vars">
            {docs.variables.map((v) => (
              <div key={v.key} className="docs-var">
                <code className="docs-var-key">{`{{${v.key}}}`}</code>
                <code className="docs-var-val">
                  {v.secret ? "••••••••" : v.value || "—"}
                </code>
                {v.secret && <span className="docs-secret">secret</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {docs.groups.map((g) => (
        <section key={g.id} className="docs-section">
          {g.name && <h2 className="docs-group">{g.name}</h2>}
          {g.endpoints.map((e) => (
            <EndpointCard key={e.requestId} ep={e} />
          ))}
        </section>
      ))}
    </div>
  );
}

function EndpointCard({ ep }: { ep: DocEndpoint }): React.JSX.Element {
  const ex = ep.example;
  return (
    <article id={`ep-${ep.requestId}`} className="docs-ep">
      <div className="docs-ep-head">
        <span className={`docs-m method-${ep.method.toLowerCase()}`}>
          {ep.method}
        </span>
        <code className="docs-route">{ep.path}</code>
        {ep.runCount > 0 && (
          <span className="docs-runs">
            {ep.runCount} run{ep.runCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="docs-ep-name">{ep.name}</div>
      <div className="docs-auth">
        <span className="docs-auth-k">Auth</span> {ep.authLabel}
      </div>

      {ep.params.length > 0 && (
        <div className="docs-params">
          <div className="docs-params-h">
            <span>Parameter</span>
            <span>In</span>
            <span>Example</span>
          </div>
          {ep.params.map((p, i) => (
            <div key={i} className="docs-param-row">
              <code>{p.name}</code>
              <span className={`docs-in docs-in-${p.location}`}>
                {p.location}
              </span>
              <span className="docs-param-ex">
                {p.example != null && p.example !== "" ? (
                  <code>{p.example}</code>
                ) : (
                  <span className="docs-muted">—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {ex ? (
        <div className="docs-example">
          <div className="docs-ex-h">
            <span>Example request</span>
            <span className={`docs-ex-src docs-ex-${ex.source}`}>
              {ex.source === "history" ? "● captured" : "○ saved"}
            </span>
          </div>
          <CodeView
            text={`${ex.reqMethod} ${ex.reqUrl}${ex.reqBody ? "\n\n" + prettyJson(ex.reqBody) : ""}`}
            language="json"
            hideLargeNote
          />
          {ex.resBody != null && (
            <>
              <div className="docs-ex-h">
                <span>Example response</span>
                {ex.status != null && (
                  <span
                    className={`docs-status ${ex.status < 400 ? "ok" : "bad"}`}
                  >
                    {ex.status} {ex.statusText ?? ""}
                  </span>
                )}
              </div>
              <CodeView
                text={prettyJson(ex.resBody)}
                language="json"
                hideLargeNote
              />
            </>
          )}
          <div className="docs-ep-actions">
            <CopyMenu
              req={{
                method: ex.reqMethod,
                url: ex.reqUrl,
                headers: ex.reqHeaders,
                bodyText: ex.reqBody,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="docs-noex">
          No example captured yet — send this request once and it appears here.
        </div>
      )}
    </article>
  );
}
