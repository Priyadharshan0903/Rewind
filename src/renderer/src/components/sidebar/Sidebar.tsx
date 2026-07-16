import { useEffect, useMemo, useRef, useState } from 'react'
import type { Collection, FolderNode, RequestNode, TreeNode } from '@shared/types'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'

function collectRequests(items: TreeNode[]): RequestNode[] {
  const out: RequestNode[] = []
  for (const node of items) {
    if (node.type === 'request') out.push(node)
    else out.push(...collectRequests(node.children))
  }
  return out
}

export function Sidebar(): React.JSX.Element {
  const collections = useApp((s) => s.collections)
  const toast = useUi((s) => s.toast)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focus = (): void => searchRef.current?.focus()
    window.addEventListener('relay:focus-search', focus)
    return () => window.removeEventListener('relay:focus-search', focus)
  }, [])

  const collection = collections[0] as Collection | undefined

  return (
    <div className="sidebar">
      <div className="sb-search-wrap">
        <div className="sb-search">
          <span className="sb-search-icon">⌕</span>
          <input
            ref={searchRef}
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          <span className="kbd">⌘P</span>
        </div>
      </div>
      <div className="sb-label-row">
        <span className="micro-label">COLLECTION</span>
        <span className="version-chip">{collection?.version ?? 'v1'}</span>
      </div>
      <div className="sb-tree">
        {collection &&
          (query.trim() ? (
            <SearchResults collection={collection} query={query.trim().toLowerCase()} />
          ) : (
            collection.items.map((node) => <TreeItem key={node.id} node={node} collectionId={collection.id} />)
          ))}
      </div>
      <div className="sb-footer">
        <button className="import-btn" onClick={() => toast('OpenAPI import is coming soon')}>
          ⤓ Import OpenAPI
        </button>
      </div>
    </div>
  )
}

function SearchResults({ collection, query }: { collection: Collection; query: string }): React.JSX.Element {
  const matches = useMemo(
    () =>
      collectRequests(collection.items).filter(
        (r) => r.name.toLowerCase().includes(query) || r.url.toLowerCase().includes(query)
      ),
    [collection, query]
  )
  if (!matches.length) return <div className="sb-empty">No matching requests</div>
  return (
    <>
      {matches.map((r) => (
        <RequestRow key={r.id} request={r} collectionId={collection.id} indent={false} />
      ))}
    </>
  )
}

function TreeItem({ node, collectionId }: { node: TreeNode; collectionId: string }): React.JSX.Element {
  if (node.type === 'request') return <RequestRow request={node} collectionId={collectionId} indent />
  return <FolderRow folder={node} collectionId={collectionId} />
}

function FolderRow({ folder, collectionId }: { folder: FolderNode; collectionId: string }): React.JSX.Element {
  const [open, setOpen] = useState(folder.children.length > 0)
  return (
    <>
      <button className="folder-row" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {folder.name}
      </button>
      {open &&
        folder.children.map((child) =>
          child.type === 'request' ? (
            <RequestRow key={child.id} request={child} collectionId={collectionId} indent />
          ) : (
            <FolderRow key={child.id} folder={child} collectionId={collectionId} />
          )
        )}
      {open && folder.children.length === 0 && <div className="sb-empty sb-empty-indent">Empty folder</div>}
    </>
  )
}

function RequestRow({
  request,
  collectionId,
  indent
}: {
  request: RequestNode
  collectionId: string
  indent: boolean
}): React.JSX.Element {
  const selection = useApp((s) => s.selection)
  const selectRequest = useApp((s) => s.selectRequest)
  const active = selection?.requestId === request.id
  return (
    <button
      className={`req-row ${indent ? 'req-indent' : ''} ${active ? 'req-active' : ''}`}
      onClick={() => selectRequest(collectionId, request.id)}
    >
      <span className={`method method-${request.method.toLowerCase()}`}>{request.method}</span>
      <span className="req-name">{request.name}</span>
    </button>
  )
}
