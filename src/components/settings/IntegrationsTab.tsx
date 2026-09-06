import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Plug, RefreshCw } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import type { IntegrationConfig, IntegrationMode, IntegrationProvider, IntegrationSecret } from '../../types'
import { inputCls, Toggle } from '../ui/inputs'

const DESCRIPTIONS: Record<IntegrationProvider, string> = {
  ace: 'US customs filing status per shipment: ISF 10+2, entry summary, release.',
  inttra: 'Ocean network: sailing schedules, booking requests, shipping instructions, track & trace.',
  quickbooks: 'Accounts receivable: pull customer invoices, balances and due dates for your shipments.',
}

const MODES: IntegrationMode[] = ['mock', 'live']

export interface CredentialsPatch {
  baseUrl?: string | null
  secrets?: Record<string, string | null>
}

const fmtWhen = (isoStr: string) =>
  new Date(isoStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const secretLabel = (s: IntegrationSecret): string => {
  if (!s.present) return s.source === 'db' ? 'Stored, unreadable' : 'Missing'
  return s.source === 'db' ? `Saved ····${s.hint}` : 'From deployment'
}

function Pill({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
      }`}
    >
      {children}
    </span>
  )
}

// Values are write-only: the API returns presence and a last-4 hint, never a key, so a stored secret
// shows as a placeholder and an empty field means "leave unchanged".
function CredentialsForm({
  config: c,
  busy,
  onSave,
}: {
  config: IntegrationConfig
  busy: string | null
  onSave: (patch: CredentialsPatch) => void
}) {
  const [baseUrl, setBaseUrl] = useState(c.baseUrl ?? '')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  useEffect(() => setBaseUrl(c.baseUrl ?? ''), [c.baseUrl])

  const disabled = Boolean(busy)
  const editable = c.credentialsEditable

  function submit(e: FormEvent) {
    e.preventDefault()
    const secrets: Record<string, string | null> = {}
    for (const [name, value] of Object.entries(drafts)) if (value.trim()) secrets[name] = value.trim()
    onSave({ baseUrl: baseUrl.trim() || null, secrets })
    setDrafts({})
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
        <KeyRound size={13} />
        Credentials
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium text-slate-500">
          Base URL <span className="font-mono text-slate-400">({c.baseUrlVar})</span>
        </span>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.vendor.example"
          disabled={disabled}
          data-testid={`integration-${c.provider}-baseurl`}
          className={inputCls}
        />
      </label>

      {c.secrets.map((s) => (
        <label key={s.name} className="block">
          <span className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span className="font-mono">{s.name}</span>
            <Pill ok={s.present}>{secretLabel(s)}</Pill>
            {s.updatedAt && <span className="text-slate-400">updated {fmtWhen(s.updatedAt)}</span>}
          </span>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              value={drafts[s.name] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
              placeholder={s.present ? 'Stored · type a new value to replace it' : 'Paste the key'}
              disabled={disabled || !editable}
              data-testid={`integration-${c.provider}-secret-${s.name}`}
              className={inputCls}
            />
            {s.source === 'db' && (
              <button
                type="button"
                onClick={() => onSave({ secrets: { [s.name]: null } })}
                disabled={disabled}
                data-testid={`integration-${c.provider}-clear-${s.name}`}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </label>
      ))}

      {!editable && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
          Credential storage is not configured. Run <span className="font-mono">npx wrangler secret put CREDENTIALS_KEY</span> (or set it in{' '}
          <span className="font-mono">.dev.vars</span>) to save keys from here.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          data-testid={`integration-${c.provider}-save-credentials`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === `${c.provider}:credentials` ? 'Saving…' : 'Save credentials'}
        </button>
        <span className="text-[11px] text-slate-400">Keys are encrypted before storage and never shown again.</span>
      </div>
    </form>
  )
}

function ProviderCard({
  config: c,
  busy,
  onUpdate,
  onSaveCredentials,
  onTest,
}: {
  config: IntegrationConfig
  busy: string | null
  onUpdate: (patch: { enabled?: boolean; mode?: IntegrationMode }) => void
  onSaveCredentials: (patch: CredentialsPatch) => void
  onTest: () => void
}) {
  const secretNames = c.secrets.map((s) => s.name)
  const liveHint = `Live requires a base URL and ${secretNames.join(', ')}`
  const degraded = c.mode === 'live' && c.effectiveMode === 'mock'
  const check = c.lastCheck

  return (
    <div className="rounded-lg border border-slate-200 p-4" data-testid={`integration-${c.provider}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`rounded-lg p-2 ${c.enabled ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            <Plug size={16} />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-slate-800">{c.label}</div>
            <div className="text-[12px] text-slate-500">{DESCRIPTIONS[c.provider]}</div>
          </div>
        </div>
        <span data-testid={`integration-${c.provider}-status`}>
          <Pill ok={c.enabled}>{c.enabled ? `On · ${c.effectiveMode}` : 'Off'}</Pill>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Toggle
          label="Enabled"
          hint={c.enabled ? 'Shipment and booking endpoints use this connector' : 'Endpoints that depend on it return 503'}
          checked={c.enabled}
          onChange={(v) => onUpdate({ enabled: v })}
        />
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <span>
              <span className="block text-[13px] font-medium text-slate-800">Mode</span>
              <span className="block text-[11px] text-slate-400">{c.liveAvailable ? 'Credentials configured' : liveHint}</span>
            </span>
            <span className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={Boolean(busy) || (m === 'live' && !c.liveAvailable)}
                  title={m === 'live' && !c.liveAvailable ? liveHint : undefined}
                  onClick={() => c.mode !== m && onUpdate({ mode: m })}
                  data-testid={`integration-${c.provider}-mode-${m}`}
                  className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize disabled:cursor-not-allowed disabled:opacity-50 ${
                    c.mode === m ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </span>
          </div>
          {degraded && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
              Live was requested but credentials are missing, so the mock adapter is in use.
            </div>
          )}
        </div>
      </div>

      <CredentialsForm config={c} busy={busy} onSave={onSaveCredentials} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTest}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={busy === `${c.provider}:test` ? 'animate-spin' : ''} />
          {busy === `${c.provider}:test` ? 'Testing…' : 'Test connection'}
        </button>
        <span className="text-[12px]" data-testid={`integration-${c.provider}-check`}>
          {check ? (
            <span className={check.ok ? 'text-emerald-600' : 'text-red-600'}>
              {check.ok ? 'OK' : 'Failed'} · {check.mode}
              {check.latencyMs !== undefined && ` · ${check.latencyMs} ms`} · {fmtWhen(check.checkedAt)}
              {!check.ok && ` · ${check.message}`}
            </span>
          ) : (
            <span className="text-slate-400">Never tested</span>
          )}
        </span>
      </div>

      <details className="mt-3 text-[12px] text-slate-500">
        <summary className="cursor-pointer select-none font-medium text-slate-600">Where credentials come from</summary>
        <div className="mt-2 space-y-1.5">
          <div>
            Keys saved above are encrypted with the <span className="font-mono">CREDENTIALS_KEY</span> secret and stored in the database. They take
            effect immediately, with no redeploy.
          </div>
          <div>
            Deployment values are the fallback:{' '}
            {secretNames.map((n) => (
              <code key={n} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                npx wrangler secret put {n}
              </code>
            ))}
            and <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{c.baseUrlVar}</code> in wrangler.jsonc, or{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">.dev.vars</code> locally. Clearing a saved key
            falls back to those.
          </div>
          <div>Then switch the mode to Live and press Test connection. Keys are never shown here or returned by the API.</div>
        </div>
      </details>
    </div>
  )
}

export default function IntegrationsTab() {
  const [items, setItems] = useState<IntegrationConfig[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<IntegrationConfig[]>('/api/integrations')
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load integrations'))
  }, [])

  const replace = (c: IntegrationConfig) => setItems((list) => (list ? list.map((x) => (x.provider === c.provider ? c : x)) : list))

  async function run(key: string, fn: () => Promise<IntegrationConfig>) {
    setError('')
    setBusy(key)
    try {
      replace(await fn())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  if (!items) {
    return (
      <div className="p-5 text-[12px] text-slate-400">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div> : 'Loading integrations…'}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-5">
      <p className="text-[12px] text-slate-500">
        External connectors run in Mock mode (deterministic sample data, no outbound calls) until their credentials are configured. Turning a
        connector off makes the endpoints that depend on it return 503.
      </p>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      {items.map((c) => (
        <ProviderCard
          key={c.provider}
          config={c}
          busy={busy}
          onUpdate={(patch) =>
            void run(`${c.provider}:update`, () => apiFetch<IntegrationConfig>(`/api/integrations/${c.provider}`, { method: 'PUT', json: patch }))
          }
          onSaveCredentials={(patch) =>
            void run(`${c.provider}:credentials`, () =>
              apiFetch<IntegrationConfig>(`/api/integrations/${c.provider}/credentials`, { method: 'PUT', json: patch }),
            )
          }
          onTest={() => void run(`${c.provider}:test`, () => apiFetch<IntegrationConfig>(`/api/integrations/${c.provider}/test`, { method: 'POST' }))}
        />
      ))}
    </div>
  )
}
