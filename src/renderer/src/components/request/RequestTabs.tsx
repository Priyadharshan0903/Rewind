import { useMemo, useRef, useState } from "react";
import { Search, X, Plus, ArrowRight, ChevronDown, ShieldOff } from "lucide-react";
import type {
  Capture,
  FormField,
  KV,
  RequestAuth,
  RequestNode,
} from "@shared/types";
import { newId } from "@shared/id";
import { paramsFromUrl, urlWithParams } from "@shared/params";
import { evalCapture } from "@shared/captures";
import { useApp, useActiveEnv, useMergedVars } from "@/stores/app";
import { useRuns } from "@/stores/runs";
import { useUi, type RequestTab } from "@/stores/ui";
import { CodeEditor } from "@/components/common/Code";
import { useVarSuggest } from "@/components/common/VarSuggest";
import { varHoverHandlers } from "@/components/common/VarPeek";
import { FindBar } from "@/components/common/FindBar";

const TABS: { key: RequestTab; label: string }[] = [
  { key: "params", label: "Params" },
  { key: "body", label: "Body" },
  { key: "headers", label: "Headers" },
  { key: "auth", label: "Auth" },
  { key: "scripts", label: "Scripts" },
];

export function RequestTabs({
  request,
}: {
  request: RequestNode;
}): React.JSX.Element {
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const vars = useMergedVars();
  const savedHeight = useApp((s) => s.settings.requestPaneHeight);
  const responsePaneOpen = useApp((s) => s.settings.responsePaneOpen);
  const patchSettings = useApp((s) => s.patchSettings);
  const contentRef = useRef<HTMLDivElement>(null);
  const inheritsAuth = request.auth.mode === "inherit" && !!vars.token;
  const headerCount =
    request.headers.filter((h) => h.enabled && h.key.trim()).length +
    (inheritsAuth ? 1 : 0);
  const paramCount = (request.params ?? paramsFromUrl(request.url)).filter(
    (p) => p.enabled && p.key.trim(),
  ).length;
  const captureCount = (request.captures ?? []).filter(
    (c) => c.enabled && c.variable.trim(),
  ).length;

  const height = savedHeight;

  // Postman-style splitter: drag to trade request-editor space for response space.
  // The height is written straight to the DOM per frame (re-rendering the whole
  // tab per pointermove stutters); state commits once when the drag ends, and
  // pointer capture keeps the drag alive even outside the window.
  const startDrag = (e: React.PointerEvent): void => {
    e.preventDefault();
    const splitter = e.currentTarget as HTMLElement;
    splitter.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = useApp.getState().settings.requestPaneHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    let latest = startH;
    let frame = 0;
    const onMove = (ev: PointerEvent): void => {
      latest = Math.max(
        90,
        Math.min(
          startH + (ev.clientY - startY),
          Math.round(window.innerHeight * 0.65),
        ),
      );
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (contentRef.current)
            contentRef.current.style.height = `${latest}px`;
        });
      }
    };
    const finish = (): void => {
      splitter.removeEventListener("pointermove", onMove);
      splitter.removeEventListener("pointerup", finish);
      splitter.removeEventListener("lostpointercapture", finish);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (frame) cancelAnimationFrame(frame);
      if (contentRef.current) contentRef.current.style.height = `${latest}px`;
      patchSettings({ requestPaneHeight: latest });
    };
    splitter.addEventListener("pointermove", onMove);
    splitter.addEventListener("pointerup", finish);
    splitter.addEventListener("lostpointercapture", finish);
  };

  return (
    <>
      <div className="tabs-row">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab tab-active" : "tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "headers" && headerCount > 0 && (
              <span className="tab-count">{headerCount}</span>
            )}
            {t.key === "params" && paramCount > 0 && (
              <span className="tab-count">{paramCount}</span>
            )}
            {t.key === "scripts" && captureCount > 0 && (
              <span className="tab-count">{captureCount}</span>
            )}
          </button>
        ))}
        <button
          className="text-btn tabs-find-btn icon-tb"
          title="Find in request body (⌘F)"
          onClick={() => {
            setTab("body");
            useUi.getState().setFind({ open: true, scope: "request", idx: 0 });
          }}
        >
          <Search size={15} strokeWidth={2} />
        </button>
      </div>
      <div
        className="request-area"
        style={responsePaneOpen ? undefined : { flex: 1, minHeight: 0 }}
      >
        <FindBar />
        <div
          ref={contentRef}
          className="tab-content"
          style={responsePaneOpen ? { height } : { height: "auto", flex: 1 }}
        >
          {tab === "params" && <ParamsTab request={request} />}
          {tab === "body" && <BodyTab request={request} />}
          {tab === "headers" && <HeadersTab request={request} />}
          {tab === "auth" && <AuthTab request={request} />}
          {tab === "scripts" && <ScriptsTab request={request} />}
        </div>
      </div>
      {responsePaneOpen && (
        <div
          className="splitter"
          title="Drag to resize · double-click to reset"
          onPointerDown={startDrag}
          onDoubleClick={() => patchSettings({ requestPaneHeight: 196 })}
        >
          <span className="splitter-grip" />
        </div>
      )}
    </>
  );
}

function ParamsTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest);
  // Saved requests may predate the params field — derive rows from the URL until first edit.
  const params = useMemo(
    () => request.params ?? paramsFromUrl(request.url),
    [request.params, request.url],
  );

  return (
    <div className="kv-tab">
      <KvTable
        rows={params}
        keyPlaceholder="param"
        onChange={(next) =>
          updateRequest({ params: next, url: urlWithParams(request.url, next) })
        }
      />
      <div className="tab-hint">
        Rows stay in sync with the query string in the URL bar.
      </div>
    </div>
  );
}

const BODY_MODES: { key: RequestNode["body"]["mode"]; label: string }[] = [
  { key: "none", label: "None" },
  { key: "json", label: "JSON" },
  { key: "text", label: "Text" },
  { key: "urlencoded", label: "Form URL-encoded" },
  { key: "formdata", label: "Form-data" },
];

function BodyTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest);
  const body = request.body;
  const setMode = (mode: RequestNode["body"]["mode"]): void => {
    const next = { ...body, mode };
    if (mode === "json" && !body.text.trim()) next.text = "{\n  \n}";
    if ((mode === "urlencoded" || mode === "formdata") && !body.form?.length) {
      next.form = [
        { id: newId(6), key: "", value: "", enabled: true, type: "text" },
      ];
    }
    updateRequest({ body: next });
  };

  return (
    <div className="body-tab">
      <div className="body-mode-row">
        {BODY_MODES.map((m) => (
          <button
            key={m.key}
            className={
              body.mode === m.key ? "body-mode body-mode-active" : "body-mode"
            }
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {body.mode === "none" && (
        <div className="tab-empty">
          <span>This request has no body.</span>
        </div>
      )}
      {(body.mode === "json" || body.mode === "text") && (
        <CodeEditor
          value={body.text}
          onChange={(text) => updateRequest({ body: { ...body, text } })}
          language="json"
          varSuggest
          findable
        />
      )}
      {(body.mode === "urlencoded" || body.mode === "formdata") && (
        <FormGrid request={request} />
      )}
    </div>
  );
}

function FormGrid({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest);
  const body = request.body;
  const fields = body.form ?? [];
  const withFiles = body.mode === "formdata";

  const commit = (form: FormField[]): void =>
    updateRequest({ body: { ...body, form } });
  const patchField = (id: string, patch: Partial<FormField>): void => {
    commit(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  return (
    <div className="headers-grid">
      <div className="header-row header-labels">
        <span />
        <span className="micro-label">KEY</span>
        <span className="micro-label">VALUE</span>
        <span />
      </div>
      {fields.map((f) => (
        <div
          key={f.id}
          className={f.enabled ? "header-row" : "header-row header-off"}
        >
          <input
            type="checkbox"
            checked={f.enabled}
            onChange={(e) => patchField(f.id, { enabled: e.target.checked })}
          />
          <span className="form-key-wrap">
            <input
              className="header-key code-font"
              placeholder="field"
              value={f.key}
              onChange={(e) => patchField(f.id, { key: e.target.value })}
              spellCheck={false}
            />
            {withFiles && (
              <select
                className="form-type"
                value={f.type}
                onChange={(e) =>
                  patchField(f.id, {
                    type: e.target.value as FormField["type"],
                    value: "",
                  })
                }
              >
                <option value="text">text</option>
                <option value="file">file</option>
              </select>
            )}
          </span>
          {f.type === "file" && withFiles ? (
            <span className="form-file-wrap">
              <button
                className="link-btn"
                onClick={async () => {
                  const path = await window.rewind.pickFile();
                  if (path) patchField(f.id, { value: path });
                }}
              >
                {f.value ? f.value.split("/").pop() : "Choose file…"}
              </button>
              {f.value && (
                <span className="form-file-path code-font">{f.value}</span>
              )}
            </span>
          ) : (
            <input
              className="header-value code-font"
              placeholder="value"
              value={f.value}
              onChange={(e) => patchField(f.id, { value: e.target.value })}
              spellCheck={false}
            />
          )}
          <button
            className="icon-btn"
            title="Remove field"
            onClick={() => commit(fields.filter((x) => x.id !== f.id))}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
      <button
        className="link-btn add-header"
        onClick={() =>
          commit([
            ...fields,
            { id: newId(6), key: "", value: "", enabled: true, type: "text" },
          ])
        }
      >
        <Plus size={13} strokeWidth={2} /> Add field
      </button>
    </div>
  );
}

/**
 * Postman-style key/value grid with a trailing blank add-row. Typing into the
 * blank row promotes it to a real row (it keeps the same React key, so focus is
 * preserved) and a fresh blank row appears below. The value column gets
 * {{variable}} autocomplete + hover peek.
 */
function KvTable({
  rows,
  onChange,
  keyPlaceholder = "key",
}: {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyPlaceholder?: string;
}): React.JSX.Element {
  const [addId, setAddId] = useState(() => newId(6));

  const patch = (id: string, p: Partial<KV>): void => {
    if (rows.some((r) => r.id === id)) {
      onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
    } else {
      // The blank row was edited — promote it, mint a fresh blank id.
      onChange([...rows, { id, key: "", value: "", enabled: true, ...p }]);
      setAddId(newId(6));
    }
  };
  const remove = (id: string): void =>
    onChange(rows.filter((r) => r.id !== id));

  const display: KV[] = [
    ...rows,
    { id: addId, key: "", value: "", enabled: true },
  ];

  return (
    <div className="kv-table">
      <div className="kv-row kv-head">
        <span />
        <span className="micro-label">KEY</span>
        <span className="micro-label">VALUE</span>
        <span className="micro-label">DESCRIPTION</span>
        <span />
      </div>
      {display.map((row) => (
        <KvTableRow
          key={row.id}
          row={row}
          blank={row.id === addId}
          keyPlaceholder={keyPlaceholder}
          patch={patch}
          remove={remove}
        />
      ))}
    </div>
  );
}

function KvTableRow({
  row,
  blank,
  keyPlaceholder,
  patch,
  remove,
}: {
  row: KV;
  blank: boolean;
  keyPlaceholder: string;
  patch: (id: string, p: Partial<KV>) => void;
  remove: (id: string) => void;
}): React.JSX.Element {
  const vars = useMergedVars();
  const suggest = useVarSuggest({
    vars,
    mode: "input",
    font: '400 12px "JetBrains Mono", monospace',
    padLeft: 0,
    apply: (text, caret, el) => {
      patch(row.id, { value: text });
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = caret;
      });
    },
  });

  const rowClass = `kv-row${!blank && !row.enabled ? " kv-off" : ""}${blank ? " kv-blank" : ""}`;
  return (
    <div className={rowClass}>
      <input
        type="checkbox"
        className="kv-check"
        checked={blank ? false : row.enabled}
        disabled={blank}
        onChange={(e) => patch(row.id, { enabled: e.target.checked })}
      />
      <input
        className="kv-input code-font"
        placeholder={keyPlaceholder}
        value={row.key}
        onChange={(e) => patch(row.id, { key: e.target.value })}
        spellCheck={false}
      />
      <input
        className="kv-input code-font"
        placeholder="value"
        value={row.value}
        {...varHoverHandlers({ font: '400 12px "JetBrains Mono", monospace' })}
        onChange={(e) => {
          patch(row.id, { value: e.target.value });
          suggest.check(e.target);
        }}
        onKeyDown={(e) => suggest.onKeyDown(e)}
        onBlur={suggest.onBlur}
        spellCheck={false}
      />
      <input
        className="kv-input kv-desc"
        placeholder="description"
        value={row.description ?? ""}
        onChange={(e) => patch(row.id, { description: e.target.value })}
        spellCheck={false}
      />
      {blank ? (
        <span className="kv-remove-slot" />
      ) : (
        <button
          className="kv-remove"
          title="Remove"
          onClick={() => remove(row.id)}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
      {suggest.dropdown}
    </div>
  );
}

function HeadersTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest);
  const vars = useMergedVars();
  const inheritsAuth = request.auth.mode === "inherit" && !!vars.token;

  return (
    <div className="kv-tab">
      {inheritsAuth && (
        <div className="kv-inherited">
          <span className="kv-inherited-key code-font">Authorization</span>
          <span className="kv-inherited-val code-font">
            Bearer {"{{token}}"} · inherited from environment
          </span>
        </div>
      )}
      <KvTable
        rows={request.headers}
        keyPlaceholder="Header"
        onChange={(next) => updateRequest({ headers: next })}
      />
    </div>
  );
}

function maskToken(token: string): string {
  if (token.length <= 12) return "••••••••";
  return `${token.slice(0, 8)} •••••••••••• ${token.slice(-4)}`;
}

function AuthTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest);
  const env = useActiveEnv();
  const vars = useMergedVars();
  const envToken = vars.token ?? "";
  const fromEnv = env?.variables.some((v) => v.key === "token" && v.enabled);
  const tokenSource = fromEnv
    ? `environment · ${env?.name ?? "—"}`
    : "collection variables";
  const mode = request.auth.mode;
  const setAuth = (patch: Partial<RequestAuth>): void =>
    updateRequest({ auth: { ...request.auth, ...patch } });

  // Postman shows a helper note under the Type selector explaining how the
  // header gets generated for the chosen scheme.
  const helper: Record<typeof mode, string> = {
    inherit:
      "The authorization header will be inherited from your active environment’s {{token}} variable.",
    bearer:
      "The authorization header will be automatically generated when you send the request.",
    basic:
      "The authorization header will be automatically generated when you send the request.",
    apikey:
      "The key-value pair will be added to your request as configured when you send it.",
    none: "This request does not use any authorization.",
  };

  return (
    <div className="auth-tab">
      <div className="auth-left">
        <label className="auth-type">
          <span className="auth-type-label">Auth Type</span>
          <div className="auth-select-wrap">
            <select
              className="auth-select"
              value={mode}
              onChange={(e) => setAuth({ mode: e.target.value as typeof mode })}
            >
              <option value="inherit">Inherit auth from environment</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="apikey">API Key</option>
              <option value="none">No Auth</option>
            </select>
            <ChevronDown className="auth-select-caret" size={14} strokeWidth={2} />
          </div>
        </label>
        <p className="auth-helper">{helper[mode]}</p>
      </div>

      <div className="auth-right">
        {mode === "none" && (
          <div className="auth-none">
            <ShieldOff size={22} strokeWidth={1.5} />
            <span>This request does not use any authorization.</span>
          </div>
        )}

        {mode === "inherit" && (
          <div className="auth-fields">
            <div className="auth-field-row">
              <span className="auth-field-label">Token</span>
              <div className="auth-field-static">
                <span className="auth-token code-font">
                  {envToken ? maskToken(envToken) : "no {{token}} variable"}
                </span>
                <span className="auth-note">
                  {envToken
                    ? `inherited from ${tokenSource}`
                    : "add a {{token}} variable to inherit auth"}
                </span>
              </div>
            </div>
          </div>
        )}

        {mode === "bearer" && (
          <div className="auth-fields">
            <AuthField
              label="Token"
              placeholder="token or {{token}}"
              value={request.auth.token ?? ""}
              onChange={(v) => setAuth({ token: v })}
            />
          </div>
        )}

        {mode === "basic" && (
          <div className="auth-fields">
            <AuthField
              label="Username"
              placeholder="username or {{user}}"
              value={request.auth.username ?? ""}
              onChange={(v) => setAuth({ username: v })}
            />
            <AuthField
              label="Password"
              type="password"
              placeholder="password or {{password}}"
              value={request.auth.password ?? ""}
              onChange={(v) => setAuth({ password: v })}
            />
          </div>
        )}

        {mode === "apikey" && (
          <div className="auth-fields">
            <AuthField
              label="Key"
              placeholder="e.g. X-Api-Key"
              value={request.auth.key ?? ""}
              onChange={(v) => setAuth({ key: v })}
            />
            <AuthField
              label="Value"
              placeholder="value or {{apiKey}}"
              value={request.auth.value ?? ""}
              onChange={(v) => setAuth({ value: v })}
            />
            <div className="auth-field-row">
              <span className="auth-field-label">Add to</span>
              <select
                className="auth-select auth-field-select"
                value={request.auth.addTo ?? "header"}
                onChange={(e) =>
                  setAuth({ addTo: e.target.value as "header" | "query" })
                }
              >
                <option value="header">Header</option>
                <option value="query">Query params</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthField({
  label,
  value,
  placeholder,
  onChange,
  type,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
}): React.JSX.Element {
  return (
    <div className="auth-field-row">
      <span className="auth-field-label">{label}</span>
      <input
        className="auth-field-input code-font"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

function ScriptsTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest);
  return (
    <div className="scripts-tab">
      <CapturesTable request={request} />
      <div className="scripts-editor">
        <div className="scripts-sub">Post-response script</div>
        <CodeEditor
          value={request.scripts.postResponse}
          onChange={(postResponse) =>
            updateRequest({ scripts: { postResponse } })
          }
          language="js"
          placeholder={
            '// runs after captures\nassert(res.status === 201)\nvars.set("token", res.json.token)'
          }
        />
      </div>
    </div>
  );
}

const CAPTURE_SOURCES: { key: Capture["source"]; label: string }[] = [
  { key: "body", label: "Body" },
  { key: "header", label: "Header" },
  { key: "status", label: "Status" },
];

/** No-code request chaining: pull a value from this response into a variable. */
function CapturesTable({
  request,
}: {
  request: RequestNode;
}): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest);
  const currentRun = useRuns((s) => s.currentRun);
  const captures = request.captures ?? [];
  const resp =
    currentRun && currentRun.requestId === request.id
      ? currentRun.response
      : undefined;

  const commit = (next: Capture[]): void => updateRequest({ captures: next });
  const patch = (id: string, p: Partial<Capture>): void =>
    commit(captures.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const add = (): void =>
    commit([
      ...captures,
      { id: newId(6), enabled: true, source: "body", path: "", variable: "" },
    ]);

  return (
    <div className="captures">
      <div className="captures-head">
        <span className="captures-title">Capture variables</span>
        <span className="captures-hint">
          Pull values from this response into variables for the next request.
        </span>
      </div>
      {captures.length > 0 && (
        <div className="captures-grid">
          <div className="capture-row capture-labels">
            <span />
            <span className="micro-label">FROM</span>
            <span className="micro-label">PATH</span>
            <span />
            <span className="micro-label">VARIABLE</span>
            <span className="micro-label">LAST VALUE</span>
            <span />
          </div>
          {captures.map((c) => {
            const ev = resp ? evalCapture(c, resp) : null;
            return (
              <div
                key={c.id}
                className={
                  c.enabled ? "capture-row" : "capture-row capture-off"
                }
              >
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => patch(c.id, { enabled: e.target.checked })}
                />
                <select
                  className="capture-src"
                  value={c.source}
                  onChange={(e) =>
                    patch(c.id, { source: e.target.value as Capture["source"] })
                  }
                >
                  {CAPTURE_SOURCES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  className="capture-path code-font"
                  placeholder={
                    c.source === "header"
                      ? "Header-Name"
                      : c.source === "status"
                        ? "status code"
                        : "data.id"
                  }
                  value={c.source === "status" ? "" : c.path}
                  disabled={c.source === "status"}
                  onChange={(e) => patch(c.id, { path: e.target.value })}
                  spellCheck={false}
                />
                <span className="capture-arrow">
                  <ArrowRight size={14} strokeWidth={2} />
                </span>
                <input
                  className="capture-var code-font"
                  placeholder="variable"
                  value={c.variable}
                  onChange={(e) => patch(c.id, { variable: e.target.value })}
                  spellCheck={false}
                />
                <CaptureValue
                  matched={ev?.matched ?? false}
                  value={ev?.value}
                  hasResp={!!resp}
                />
                <button
                  className="icon-btn"
                  title="Remove"
                  onClick={() => commit(captures.filter((x) => x.id !== c.id))}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button className="link-btn add-header" onClick={add}>
        <Plus size={13} strokeWidth={2} /> Add capture
      </button>
    </div>
  );
}

function CaptureValue({
  matched,
  value,
  hasResp,
}: {
  matched: boolean;
  value?: string;
  hasResp: boolean;
}): React.JSX.Element {
  if (!hasResp)
    return <span className="capture-val capture-muted">send once</span>;
  if (!matched)
    return <span className="capture-val capture-nomatch">no match</span>;
  const text =
    (value ?? "").length > 42 ? (value ?? "").slice(0, 42) + "…" : value;
  return (
    <span className="capture-val capture-ok" title={value}>
      {text}
    </span>
  );
}
