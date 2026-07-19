import type { Collection, RequestNode, TreeNode } from '@shared/types'
import { newId } from '@shared/id'

export function findRequest(items: TreeNode[], requestId: string): RequestNode | null {
  for (const node of items) {
    if (node.type === 'request' && node.id === requestId) return node
    if (node.type === 'folder') {
      const hit = findRequest(node.children, requestId)
      if (hit) return hit
    }
  }
  return null
}

export function firstRequest(items: TreeNode[]): RequestNode | null {
  for (const node of items) {
    if (node.type === 'request') return node
    if (node.type === 'folder') {
      const hit = firstRequest(node.children)
      if (hit) return hit
    }
  }
  return null
}

export function mapRequest(
  items: TreeNode[],
  requestId: string,
  fn: (r: RequestNode) => RequestNode
): TreeNode[] {
  return items.map((node) => {
    if (node.type === 'request') return node.id === requestId ? fn(node) : node
    return { ...node, children: mapRequest(node.children, requestId, fn) }
  })
}

export function findParentFolder(items: TreeNode[], requestId: string): string | null {
  for (const node of items) {
    if (node.type === 'folder') {
      if (node.children.some((c) => c.type === 'request' && c.id === requestId)) return node.name
      const hit = findParentFolder(node.children, requestId)
      if (hit) return hit
    }
  }
  return null
}

export function findParentFolderId(items: TreeNode[], requestId: string): string | null {
  for (const node of items) {
    if (node.type === 'folder') {
      if (node.children.some((c) => c.type === 'request' && c.id === requestId)) return node.id
      const hit = findParentFolderId(node.children, requestId)
      if (hit) return hit
    }
  }
  return null
}

/** Insert a node at the root or inside the given folder. */
export function insertNode(items: TreeNode[], folderId: string | null, node: TreeNode): TreeNode[] {
  if (!folderId) return [...items, node]
  return items.map((n) =>
    n.type === 'folder'
      ? n.id === folderId
        ? { ...n, children: [...n.children, node] }
        : { ...n, children: insertNode(n.children, folderId, node) }
      : n
  )
}

export function removeNode(items: TreeNode[], nodeId: string): TreeNode[] {
  return items
    .filter((n) => n.id !== nodeId)
    .map((n) => (n.type === 'folder' ? { ...n, children: removeNode(n.children, nodeId) } : n))
}

/** Deep-clone a node with fresh ids; the top node gets a " copy" suffix. */
export function cloneNode(node: TreeNode, suffix = true): TreeNode {
  if (node.type === 'request') {
    return {
      ...node,
      id: newId(),
      name: suffix ? `${node.name} copy` : node.name,
      headers: node.headers.map((h) => ({ ...h, id: newId(6) }))
    }
  }
  return {
    ...node,
    id: newId(),
    name: suffix ? `${node.name} copy` : node.name,
    children: node.children.map((c) => cloneNode(c, false))
  }
}

/** Insert a duplicate of nodeId right after the original, same parent. */
export function duplicateIn(
  items: TreeNode[],
  nodeId: string
): { items: TreeNode[]; created: TreeNode | null } {
  let created: TreeNode | null = null
  const walk = (list: TreeNode[]): TreeNode[] => {
    const idx = list.findIndex((n) => n.id === nodeId)
    if (idx >= 0) {
      created = cloneNode(list[idx])
      const next = [...list]
      next.splice(idx + 1, 0, created)
      return next
    }
    return list.map((n) => (n.type === 'folder' ? { ...n, children: walk(n.children) } : n))
  }
  return { items: walk(items), created }
}

export function collectRequestIds(items: TreeNode[]): string[] {
  const out: string[] = []
  for (const n of items) {
    if (n.type === 'request') out.push(n.id)
    else out.push(...collectRequestIds(n.children))
  }
  return out
}

export function renameFolder(items: TreeNode[], folderId: string, name: string): TreeNode[] {
  return items.map((n) =>
    n.type === 'folder'
      ? n.id === folderId
        ? { ...n, name }
        : { ...n, children: renameFolder(n.children, folderId, name) }
      : n
  )
}

export function findInCollections(
  collections: Collection[],
  requestId: string
): { collection: Collection; request: RequestNode } | null {
  for (const collection of collections) {
    const request = findRequest(collection.items, requestId)
    if (request) return { collection, request }
  }
  return null
}
