import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Ellipsis,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react";
import type {
  Collection,
  FolderNode,
  RequestNode,
  TreeNode,
} from "@shared/types";
import { buildCurl } from "@shared/codegen";
import { mergedVars, useApp } from "@/stores/app";
import { useRuns } from "@/stores/runs";
import { useUi, type ContextItem } from "@/stores/ui";
import { resolveForCodegen } from "@/lib/resolve";

function collectRequests(items: TreeNode[]): RequestNode[] {
  const out: RequestNode[] = [];
  for (const node of items) {
    if (node.type === "request") out.push(node);
    else out.push(...collectRequests(node.children));
  }
  return out;
}

/** Inline-renamable label; editing is driven by ui.renamingId so context menus can trigger it. */
function EditableLabel({
  id,
  value,
  onRename,
  className,
}: {
  id: string;
  value: string;
  onRename: (name: string) => void;
  className?: string;
}): React.JSX.Element {
  const editing = useUi((s) => s.renamingId === id);
  const setRenamingId = useUi((s) => s.setRenamingId);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (editing) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return (
      <span
        className={className}
        title="Double-click to rename"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setRenamingId(id);
        }}
      >
        {value}
      </span>
    );
  }
  const commit = (): void => {
    setRenamingId(null);
    if (draft.trim() && draft.trim() !== value) onRename(draft.trim());
  };
  return (
    <input
      className="rename-input"
      value={draft}
      autoFocus
      spellCheck={false}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setRenamingId(null);
      }}
    />
  );
}

function useContextMenu(): (e: React.MouseEvent, items: ContextItem[]) => void {
  const openContextMenu = useUi((s) => s.openContextMenu);
  return (e, items) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, items);
  };
}

export function Sidebar(): React.JSX.Element {
  const collections = useApp((s) => s.collections);
  const addCollection = useApp((s) => s.addCollection);
  const openEnvEditor = useUi((s) => s.openEnvEditor);
  const toast = useUi((s) => s.toast);
  const onContext = useContextMenu();
  const importOpenApi = useImportOpenApi();
  const importPostman = useImportPostman();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = (): void => searchRef.current?.focus();
    window.addEventListener("rewind:focus-search", focus);
    return () => window.removeEventListener("rewind:focus-search", focus);
  }, []);

  // Postman-style menu for right-clicking empty sidebar space.
  const emptyAreaMenu: ContextItem[] = [
    { label: "New collection", action: () => addCollection() },
    {
      label: "New environment",
      action: () => {
        const id = useApp.getState().addEnvironment();
        openEnvEditor(id);
      },
    },
    { label: "Edit variables…", action: () => openEnvEditor() },
    { sep: true },
    { label: "Import OpenAPI…", action: () => void importOpenApi() },
    { label: "Import from Postman…", action: () => void importPostman() },
    {
      label: "Import workspace…",
      action: async () => {
        const result = await window.rewind.importBundle();
        if (result.error) toast(result.error, "error");
        else if (result.ok && result.boot) {
          useApp.getState().applyBoot(result.boot);
          void useRuns.getState().loadAll();
          toast("Workspace imported");
        }
      },
    },
    {
      label: "Export workspace…",
      action: async () => {
        const result = await window.rewind.exportBundle({
          includeHistory: true,
        });
        if (result.path) toast(`Exported to ${result.path}`);
        else if (result.error) toast(result.error, "error");
      },
    },
  ];

  return (
    <div className="sidebar" onContextMenu={(e) => onContext(e, emptyAreaMenu)}>
      <div className="sb-search-wrap">
        <div className="sb-search">
          <Search className="sb-search-icon" size={15} strokeWidth={2} />
          <input
            ref={searchRef}
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
          />
          <span className="kbd">⌘P</span>
        </div>
      </div>
      <div className="sb-label-row">
        <span className="micro-label">COLLECTIONS</span>
        <button
          className="sb-add"
          title="New collection"
          onClick={addCollection}
        >
          <Plus size={16} strokeWidth={2.2} />
        </button>
      </div>
      <div className="sb-tree">
        {query.trim() ? (
          <SearchResults
            collections={collections}
            query={query.trim().toLowerCase()}
          />
        ) : (
          collections.map((c) => <CollectionBlock key={c.id} collection={c} />)
        )}
        {!collections.length && (
          <div className="sb-empty">No collections yet — hit + above</div>
        )}
        {!query.trim() && <SidebarHints />}
      </div>
      <div className="sb-footer">
        <ImportOpenApiButton />
        <ImportPostmanButton />
      </div>
    </div>
  );
}

/** Fills the empty lower area of the sidebar with a few quiet, always-useful hints. */
function SidebarHints(): React.JSX.Element {
  const hints: { keys: string[]; label: string }[] = [
    { keys: ["⌘", "P"], label: "Search requests" },
    { keys: ["⌘", "⏎"], label: "Send request" },
    { keys: ["⌥", "↵"], label: "New request" },
  ];
  return (
    <div className="sb-hints">
      <div className="sb-hints-title">Shortcuts</div>
      {hints.map((h) => (
        <div key={h.label} className="sb-hint">
          <span className="sb-hint-keys">
            {h.keys.map((k, i) => (
              <span key={i} className="kbd">
                {k}
              </span>
            ))}
          </span>
          <span className="sb-hint-label">{h.label}</span>
        </div>
      ))}
      <div className="sb-hints-note">
        All runs stored locally — nothing leaves this machine.
      </div>
    </div>
  );
}

export function useImportOpenApi(): () => Promise<void> {
  const toast = useUi((s) => s.toast);
  return async () => {
    const result = await window.rewind.importOpenApi();
    if (result.error) {
      toast(result.error, "error");
    } else if (result.collection) {
      useApp.getState().adoptCollection(result.collection);
      toast(
        `Imported “${result.collection.name}” — ${result.counts?.requests ?? 0} requests in ${result.counts?.folders ?? 0} folders`,
      );
    }
  };
}

export function useImportPostman(): () => Promise<void> {
  const toast = useUi((s) => s.toast);
  return async () => {
    const result = await window.rewind.importPostman();
    if (result.error) {
      toast(result.error, "error");
      return;
    }
    if (!result.counts) return;
    const app = useApp.getState();
    for (const collection of result.collections ?? [])
      app.adoptCollection(collection);
    if (result.environments) app.updateEnvironments(result.environments);
    const parts = [
      result.counts.collections &&
        `${result.counts.collections} collection${result.counts.collections > 1 ? "s" : ""} (${result.counts.requests} requests)`,
      result.counts.environments &&
        `${result.counts.environments} environment${result.counts.environments > 1 ? "s" : ""}`,
    ].filter(Boolean);
    toast(`Imported from Postman: ${parts.join(", ")}`);
    for (const warning of (result.warnings ?? []).slice(0, 3))
      toast(warning, "error");
  };
}

function ImportOpenApiButton(): React.JSX.Element {
  const importOpenApi = useImportOpenApi();
  return (
    <button className="import-btn" onClick={() => void importOpenApi()}>
      <Download size={14} strokeWidth={2} /> Import OpenAPI
    </button>
  );
}

function ImportPostmanButton(): React.JSX.Element {
  const importPostman = useImportPostman();
  return (
    <button className="import-btn" onClick={() => void importPostman()}>
      <Download size={14} strokeWidth={2} /> Import from Postman
    </button>
  );
}

function SearchResults({
  collections,
  query,
}: {
  collections: Collection[];
  query: string;
}): React.JSX.Element {
  const matches = useMemo(
    () =>
      collections.flatMap((c) =>
        collectRequests(c.items)
          .filter(
            (r) =>
              r.name.toLowerCase().includes(query) ||
              r.url.toLowerCase().includes(query),
          )
          .map((r) => ({ collectionId: c.id, request: r })),
      ),
    [collections, query],
  );
  if (!matches.length)
    return <div className="sb-empty">No matching requests</div>;
  return (
    <>
      {matches.map((m) => (
        <RequestRow
          key={m.request.id}
          request={m.request}
          collectionId={m.collectionId}
          indent={false}
        />
      ))}
    </>
  );
}

function CollectionBlock({
  collection,
}: {
  collection: Collection;
}): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const app = useApp.getState;
  const setRenamingId = useUi((s) => s.setRenamingId);
  const openCollectionVars = useUi((s) => s.openCollectionVars);
  const toast = useUi((s) => s.toast);
  const onContext = useContextMenu();

  const menu: ContextItem[] = [
    {
      label: "Add request",
      action: () => (setOpen(true), app().addRequest(collection.id, null)),
    },
    {
      label: "Add folder",
      action: () => (setOpen(true), app().addFolder(collection.id)),
    },
    { sep: true },
    {
      label: "Edit variables",
      action: () => openCollectionVars(collection.id),
    },
    { label: "Rename", action: () => setRenamingId(collection.id) },
    {
      label: "Duplicate",
      action: () => app().duplicateCollection(collection.id),
    },
    {
      label: "Export",
      action: async () => {
        const result = await window.rewind.exportCollection(collection.id);
        if (result.path) toast(`Exported to ${result.path}`);
        else if (result.error) toast(result.error, "error");
      },
    },
    { sep: true },
    {
      label: "Delete",
      danger: true,
      action: () => {
        if (
          window.confirm(
            `Delete collection “${collection.name}” and everything in it?`,
          )
        ) {
          app().deleteCollection(collection.id);
        }
      },
    },
  ];

  return (
    <div className="col-block">
      <div
        className="col-row"
        onClick={() => setOpen((v) => !v)}
        onContextMenu={(e) => onContext(e, menu)}
      >
        {open ? (
          <ChevronDown className="tree-caret" size={14} strokeWidth={2.2} />
        ) : (
          <ChevronRight className="tree-caret" size={14} strokeWidth={2.2} />
        )}
        <EditableLabel
          id={collection.id}
          value={collection.name}
          onRename={(name) =>
            useApp.getState().renameCollection(collection.id, name)
          }
          className="col-name"
        />
        <span className="version-chip">{collection.version}</span>
        <span className="row-actions">
          <button
            className="row-action"
            title="New request"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
              useApp.getState().addRequest(collection.id, null);
            }}
          >
            <Plus size={16} strokeWidth={2.2} />
          </button>
          <button
            className="row-action"
            title="More options"
            onClick={(e) => {
              e.stopPropagation();
              onContext(e, menu);
            }}
          >
            <Ellipsis size={16} strokeWidth={2.2} />
          </button>
        </span>
      </div>
      {open &&
        collection.items.map((node) =>
          node.type === "request" ? (
            <RequestRow
              key={node.id}
              request={node}
              collectionId={collection.id}
              indent
            />
          ) : (
            <FolderRow
              key={node.id}
              folder={node}
              collectionId={collection.id}
            />
          ),
        )}
      {open && collection.items.length === 0 && (
        <div className="sb-empty sb-empty-indent">
          Empty — right-click to add a request
        </div>
      )}
    </div>
  );
}

function FolderRow({
  folder,
  collectionId,
}: {
  folder: FolderNode;
  collectionId: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(folder.children.length > 0);
  const app = useApp.getState;
  const setRenamingId = useUi((s) => s.setRenamingId);
  const onContext = useContextMenu();
  // Subtly highlight the folder that directly holds the currently-selected request.
  const holdsActive = useApp(
    (s) =>
      !!s.selection &&
      folder.children.some(
        (c) => c.type === "request" && c.id === s.selection?.requestId,
      ),
  );

  const menu: ContextItem[] = [
    {
      label: "Add request",
      action: () => (setOpen(true), app().addRequest(collectionId, folder.id)),
    },
    {
      label: "Add folder",
      action: () => (setOpen(true), app().addFolder(collectionId)),
    },
    { sep: true },
    { label: "Rename", action: () => setRenamingId(folder.id) },
    {
      label: "Duplicate",
      action: () => app().duplicateNode(collectionId, folder.id),
    },
    { sep: true },
    {
      label: "Delete",
      danger: true,
      action: () => {
        const n = folder.children.length;
        if (
          window.confirm(
            `Delete folder “${folder.name}”${n ? ` and its ${n} item${n > 1 ? "s" : ""}` : ""}?`,
          )
        ) {
          app().deleteNode(collectionId, folder.id);
        }
      },
    },
  ];

  return (
    <>
      <div
        className={`folder-row ${holdsActive ? "folder-holds-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        onContextMenu={(e) => onContext(e, menu)}
      >
        {open ? (
          <ChevronDown className="tree-caret" size={14} strokeWidth={2.2} />
        ) : (
          <ChevronRight className="tree-caret" size={14} strokeWidth={2.2} />
        )}
        <EditableLabel
          id={folder.id}
          value={folder.name}
          onRename={(name) =>
            useApp.getState().renameFolderNode(collectionId, folder.id, name)
          }
        />
        <span className="row-actions">
          <button
            className="row-action"
            title="New request in folder"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
              useApp.getState().addRequest(collectionId, folder.id);
            }}
          >
            <Plus size={16} strokeWidth={2.2} />
          </button>
          <button
            className="row-action"
            title="More options"
            onClick={(e) => {
              e.stopPropagation();
              onContext(e, menu);
            }}
          >
            <Ellipsis size={16} strokeWidth={2.2} />
          </button>
        </span>
      </div>
      {open &&
        folder.children.map((child) =>
          child.type === "request" ? (
            <RequestRow
              key={child.id}
              request={child}
              collectionId={collectionId}
              indent
            />
          ) : (
            <FolderRow
              key={child.id}
              folder={child}
              collectionId={collectionId}
            />
          ),
        )}
      {open && folder.children.length === 0 && (
        <div className="sb-empty sb-empty-indent">Empty folder</div>
      )}
    </>
  );
}

function RequestRow({
  request,
  collectionId,
  indent,
}: {
  request: RequestNode;
  collectionId: string;
  indent: boolean;
}): React.JSX.Element {
  const selection = useApp((s) => s.selection);
  const dirty = useApp((s) => !!s.drafts[request.id]);
  const setRenamingId = useUi((s) => s.setRenamingId);
  const toast = useUi((s) => s.toast);
  const onContext = useContextMenu();
  const active = selection?.requestId === request.id;

  const menu: ContextItem[] = [
    {
      label: "Send",
      action: () => {
        useApp.getState().selectRequest(collectionId, request.id);
        void useRuns.getState().send();
      },
    },
    {
      label: "Copy as cURL",
      action: async () => {
        const state = useApp.getState();
        const vars = mergedVars(state, collectionId);
        await navigator.clipboard.writeText(
          buildCurl(
            resolveForCodegen(state.drafts[request.id] ?? request, vars),
          ),
        );
        toast("Copied as cURL");
      },
    },
    { sep: true },
    { label: "Rename", action: () => setRenamingId(request.id) },
    {
      label: "Duplicate",
      action: () => useApp.getState().duplicateNode(collectionId, request.id),
    },
    { sep: true },
    {
      label: "Delete",
      danger: true,
      action: () => {
        if (window.confirm(`Delete request “${request.name}”?`)) {
          useApp.getState().deleteNode(collectionId, request.id);
        }
      },
    },
  ];

  return (
    <div
      className={`req-row ${indent ? "req-indent" : ""} ${active ? "req-active" : ""}`}
      onClick={() => useApp.getState().selectRequest(collectionId, request.id)}
      onContextMenu={(e) => onContext(e, menu)}
    >
      <span className={`method method-${request.method.toLowerCase()}`}>
        {request.method}
      </span>
      <span className="req-name">
        <EditableLabel
          id={request.id}
          value={request.name}
          onRename={(name) =>
            useApp.getState().renameRequest(collectionId, request.id, name)
          }
        />
      </span>
      {dirty && <span className="dirty-dot" title="Unsaved changes" />}
      <span className="row-actions">
        <button
          className="row-action"
          title="More options"
          onClick={(e) => {
            e.stopPropagation();
            onContext(e, menu);
          }}
        >
          <Ellipsis size={16} strokeWidth={2.2} />
        </button>
      </span>
    </div>
  );
}
