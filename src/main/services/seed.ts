import type { Collection, Environment, KV, RequestNode, Run, Workspace } from '@shared/types'
import { newId } from '@shared/id'

function kv(key: string, value: string): KV {
  return { id: newId(6), key, value, enabled: true }
}

function req(partial: Omit<RequestNode, 'type' | 'auth' | 'scripts' | 'examples'> & Partial<RequestNode>): RequestNode {
  return {
    type: 'request',
    auth: { mode: 'inherit' },
    scripts: { postResponse: '' },
    examples: [],
    ...partial
  }
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const BASE_HEADERS: [string, string][] = [
  ['Authorization', 'Bearer sk_test_ •••• 2Xq7'],
  ['Content-Type', 'application/json']
]

interface SeedData {
  workspace: Workspace
  environments: Environment[]
  collections: Collection[]
  runFiles: Record<string, string[]>
}

export function buildSeed(): SeedData {
  const stagingId = newId()

  const workspace: Workspace = {
    schemaVersion: 1,
    id: newId(),
    name: 'Payments API',
    activeEnvironmentId: stagingId,
    createdAt: Date.now()
  }

  const environments: Environment[] = [
    {
      id: stagingId,
      name: 'Staging',
      dotColor: 'warn',
      variables: [
        kv('baseUrl', 'https://api.staging.pay.dev'),
        kv('token', 'sk_test_51QxLmMbVg2Xq7'),
        kv('chargeId', 'ch_3PqK8w2eL9')
      ]
    },
    {
      id: newId(),
      name: 'Production',
      dotColor: 'err',
      variables: [kv('baseUrl', 'https://api.pay.dev'), kv('token', 'sk_live_51QxLmMbVg9Fh2')]
    },
    {
      id: newId(),
      name: 'Local',
      dotColor: 'ok',
      variables: [kv('baseUrl', 'http://localhost:4010'), kv('token', 'sk_test_local')]
    }
  ]

  const createCharge = req({
    id: 'req-create-charge',
    name: 'Create charge',
    method: 'POST',
    url: '${baseUrl}/v1/charges',
    headers: [kv('Content-Type', 'application/json'), kv('Idempotency-Key', '${$uuid}')],
    body: {
      mode: 'json',
      text: [
        '{',
        '  "amount": 2500,',
        '  "currency": "usd",',
        '  "customer": "cus_9x2LkQm",',
        '  "description": "Pro plan — July",',
        '  "capture": true',
        '}'
      ].join('\n')
    },
    scripts: { postResponse: 'vars.set("chargeId", res.json.id)\nassert(res.status === 201)' }
  })

  const collection: Collection = {
    id: 'col-payments',
    name: 'Payments API',
    version: 'v2',
    items: [
      {
        id: 'fld-charges',
        type: 'folder',
        name: 'Charges',
        children: [
          createCharge,
          req({
            id: 'req-list-charges',
            name: 'List charges',
            method: 'GET',
            url: '${baseUrl}/v1/charges?limit=20',
            headers: [],
            body: { mode: 'none', text: '' }
          }),
          req({
            id: 'req-retrieve-charge',
            name: 'Retrieve charge',
            method: 'GET',
            url: '${baseUrl}/v1/charges/${chargeId}',
            headers: [],
            body: { mode: 'none', text: '' }
          }),
          req({
            id: 'req-capture-charge',
            name: 'Capture charge',
            method: 'POST',
            url: '${baseUrl}/v1/charges/${chargeId}/capture',
            headers: [kv('Content-Type', 'application/json'), kv('Idempotency-Key', '${$uuid}')],
            body: { mode: 'json', text: '{\n  "amount": 2500\n}' }
          })
        ]
      },
      {
        id: 'fld-customers',
        type: 'folder',
        name: 'Customers',
        children: [
          req({
            id: 'req-create-customer',
            name: 'Create customer',
            method: 'POST',
            url: '${baseUrl}/v1/customers',
            headers: [kv('Content-Type', 'application/json')],
            body: { mode: 'json', text: '{\n  "email": "dana@acme.dev",\n  "name": "Dana R."\n}' }
          }),
          req({
            id: 'req-list-customers',
            name: 'List customers',
            method: 'GET',
            url: '${baseUrl}/v1/customers?limit=20',
            headers: [],
            body: { mode: 'none', text: '' }
          })
        ]
      },
      { id: 'fld-refunds', type: 'folder', name: 'Refunds', children: [] },
      { id: 'fld-disputes', type: 'folder', name: 'Disputes', children: [] }
    ]
  }

  const now = Date.now()
  const min = 60_000
  const yesterday = (h: number, m: number, s: number) => {
    const d = new Date(now - 24 * 60 * min)
    d.setHours(h, m, s, 0)
    return d.getTime()
  }
  const envName = 'Staging'
  const base = 'https://api.staging.pay.dev'

  const mkRun = (r: Omit<Run, 'envId' | 'envName' | 'collectionId'>): Run => ({
    ...r,
    collectionId: collection.id,
    envId: stagingId,
    envName
  })

  const runs: Run[] = [
    mkRun({
      id: newId(),
      ts: now - 5 * min,
      requestId: 'req-create-charge',
      requestName: 'Create charge',
      durationMs: 184,
      request: {
        method: 'POST',
        url: `${base}/v1/charges`,
        headers: [...BASE_HEADERS, ['Idempotency-Key', 'idk_71c9f2ab']],
        bodyText:
          '{\n  "amount": 2500,\n  "currency": "usd",\n  "customer": "cus_9x2LkQm",\n  "description": "Pro plan — July",\n  "capture": true\n}'
      },
      response: {
        status: 201,
        statusText: 'Created',
        headers: [
          ['content-type', 'application/json'],
          ['request-id', 'req_8fKw2p'],
          ['ratelimit-remaining', '98']
        ],
        bodyText:
          '{\n  "id": "ch_3PqK8w2eL9",\n  "object": "charge",\n  "amount": 2500,\n  "currency": "usd",\n  "status": "succeeded",\n  "customer": "cus_9x2LkQm",\n  "receipt_url": "https://pay.dev/rcpt_81",\n  "created": 1752655338\n}',
        bodyTruncated: false,
        sizeBytes: 1454
      },
      script: {
        assertions: [{ expr: 'res.status === 201', pass: true }],
        varsSet: { chargeId: 'ch_3PqK8w2eL9' },
        logs: []
      }
    }),
    mkRun({
      id: newId(),
      ts: now - 16 * min,
      requestId: 'req-create-charge',
      requestName: 'Create charge',
      durationMs: 201,
      request: {
        method: 'POST',
        url: `${base}/v1/charges`,
        headers: [...BASE_HEADERS, ['Idempotency-Key', 'idk_5fa2c1d0']],
        bodyText: '{\n  "amount": 2000,\n  "currency": "usd",\n  "customer": "cus_9x2LkQm",\n  "capture": true\n}'
      },
      response: {
        status: 201,
        statusText: 'Created',
        headers: [
          ['content-type', 'application/json'],
          ['request-id', 'req_7hJq1x'],
          ['ratelimit-remaining', '99']
        ],
        bodyText:
          '{\n  "id": "ch_2NwB5r8kD4",\n  "object": "charge",\n  "amount": 2000,\n  "currency": "usd",\n  "status": "succeeded",\n  "customer": "cus_9x2LkQm",\n  "created": 1752654662\n}',
        bodyTruncated: false,
        sizeBytes: 1413
      },
      script: {
        assertions: [{ expr: 'res.status === 201', pass: true }],
        varsSet: { chargeId: 'ch_2NwB5r8kD4' },
        logs: []
      }
    }),
    mkRun({
      id: newId(),
      ts: now - 35 * min,
      requestId: 'req-create-charge',
      requestName: 'Create charge',
      durationMs: 96,
      request: {
        method: 'POST',
        url: `${base}/v1/charges`,
        headers: [...BASE_HEADERS, ['Idempotency-Key', 'idk_2bc80e11']],
        bodyText: '{\n  "amount": 2000,\n  "currency": "usd",\n  "customer": "cus_4hTqPa",\n  "capture": true\n}'
      },
      response: {
        status: 402,
        statusText: 'Payment Required',
        headers: [
          ['content-type', 'application/json'],
          ['request-id', 'req_3xVn9s'],
          ['ratelimit-remaining', '99']
        ],
        bodyText:
          '{\n  "error": {\n    "type": "card_error",\n    "code": "card_declined",\n    "message": "Your card was declined."\n  }\n}',
        bodyTruncated: false,
        sizeBytes: 420
      },
      script: {
        assertions: [{ expr: 'res.status === 201', pass: false, message: 'expected 201, got 402' }],
        varsSet: {},
        logs: []
      }
    }),
    mkRun({
      id: newId(),
      ts: now - 49 * min,
      requestId: 'req-list-customers',
      requestName: 'List customers',
      durationMs: 88,
      request: {
        method: 'GET',
        url: `${base}/v1/customers/cus_9x2LkQm`,
        headers: BASE_HEADERS,
        bodyText: ''
      },
      response: {
        status: 200,
        statusText: 'OK',
        headers: [
          ['content-type', 'application/json'],
          ['request-id', 'req_1pLm4t'],
          ['cache-control', 'no-store']
        ],
        bodyText:
          '{\n  "id": "cus_9x2LkQm",\n  "object": "customer",\n  "email": "dana@acme.dev",\n  "name": "Dana R.",\n  "default_source": "card_visa_4242",\n  "created": 1749071120\n}',
        bodyTruncated: false,
        sizeBytes: 942
      }
    }),
    mkRun({
      id: newId(),
      ts: yesterday(18, 3, 29),
      requestId: 'req-create-charge',
      requestName: 'Create charge',
      durationMs: 176,
      request: {
        method: 'POST',
        url: `${base}/v1/charges`,
        headers: [...BASE_HEADERS, ['Idempotency-Key', 'idk_90aa41b7']],
        bodyText: '{\n  "amount": 1200,\n  "currency": "usd",\n  "customer": "cus_4hTqPa",\n  "capture": true\n}'
      },
      response: {
        status: 201,
        statusText: 'Created',
        headers: [
          ['content-type', 'application/json'],
          ['request-id', 'req_5wYt3k'],
          ['ratelimit-remaining', '97']
        ],
        bodyText:
          '{\n  "id": "ch_1MjA3q6hC2",\n  "object": "charge",\n  "amount": 1200,\n  "currency": "usd",\n  "status": "succeeded",\n  "customer": "cus_4hTqPa",\n  "created": 1752569009\n}',
        bodyTruncated: false,
        sizeBytes: 1341
      },
      script: {
        assertions: [{ expr: 'res.status === 201', pass: true }],
        varsSet: { chargeId: 'ch_1MjA3q6hC2' },
        logs: []
      }
    }),
    mkRun({
      id: newId(),
      ts: yesterday(18, 3, 2),
      requestId: 'req-create-customer',
      requestName: 'Create customer',
      durationMs: 176,
      request: {
        method: 'POST',
        url: `${base}/v1/customers`,
        headers: BASE_HEADERS,
        bodyText: '{\n  "email": "dana@acme.dev",\n  "name": "Dana R."\n}'
      },
      response: {
        status: 201,
        statusText: 'Created',
        headers: [
          ['content-type', 'application/json'],
          ['request-id', 'req_6qRs8u'],
          ['ratelimit-remaining', '97']
        ],
        bodyText:
          '{\n  "id": "cus_9x2LkQm",\n  "object": "customer",\n  "email": "dana@acme.dev",\n  "created": 1752595409\n}',
        bodyTruncated: false,
        sizeBytes: 901
      }
    }),
    mkRun({
      id: newId(),
      ts: yesterday(17, 40, 11),
      requestId: 'req-list-charges',
      requestName: 'List charges',
      durationMs: 132,
      request: {
        method: 'GET',
        url: `${base}/v1/charges?limit=20`,
        headers: BASE_HEADERS,
        bodyText: ''
      },
      response: {
        status: 200,
        statusText: 'OK',
        headers: [
          ['content-type', 'application/json'],
          ['request-id', 'req_9dFg2w'],
          ['ratelimit-remaining', '98']
        ],
        bodyText:
          '{\n  "object": "list",\n  "url": "/v1/charges",\n  "has_more": true,\n  "data": [\n    { "id": "ch_3PqK8w2eL9" },\n    { "id": "ch_2NwB5r8kD4" },\n    { "id": "ch_1MjA3q6hC2" }\n  ]\n}',
        bodyTruncated: false,
        sizeBytes: 6350
      }
    })
  ]

  const runFiles: Record<string, string[]> = {}
  for (const run of [...runs].sort((a, b) => a.ts - b.ts)) {
    const day = dayKey(run.ts)
    ;(runFiles[day] ??= []).push(JSON.stringify(run))
  }

  return { workspace, environments, collections: [collection], runFiles }
}
