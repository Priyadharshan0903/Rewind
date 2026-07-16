import type { Collection, RequestNode, TreeNode } from '@shared/types'

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

export function mapRequest(items: TreeNode[], requestId: string, fn: (r: RequestNode) => RequestNode): TreeNode[] {
  return items.map((node) => {
    if (node.type === 'request') return node.id === requestId ? fn(node) : node
    return { ...node, children: mapRequest(node.children, requestId, fn) }
  })
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
