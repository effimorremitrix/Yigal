import { useEffect, useState } from 'react'
import { Plug, RefreshCw } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import type { IntegrationConfig, IntegrationMode, IntegrationProvider } from '../../types'
import { Toggle } from '../ui/inputs'

const DESCRIPTIONS: Record<IntegrationProvider, string> = {
  ace: 'US customs filing status per shipment: ISF 10+2, entry summary, release.',
  inttra: 'Ocean network: sailing schedules, booking requests, shipping instructions, track & trace.',
}

const MODES: IntegrationMode[] = ['mock', 'live']

const fmtWhen = (isoStr: string) =>
  new Date(isoStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

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

function ProviderCard({
  config: c,
  busy,
  onUpdate,
  onTest,
}: {
  config: IntegrationConfig
  busy: string | null
  onUpdate: (patch: { enabled?: boolean; mode?: IntegrationMode }) => void
  onTest: () => void
}) {
  const secretNames = c.secrets.map((s) => s.name)
  const liveHint = `Live requires ${[c.baseUrlVar, ...secretNames].join(', ')}`
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

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-slate-500">
        <span>
          Base URL: <span className="font-mono text-slate-700">{c.baseUrl ?? 'not configured'}</span>
        </span>
        {c.secrets.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="font-mono">{s.name}</span>
            <Pill ok={s.present}>{s.present ? 'Present' : 'Missing'}</Pill>
          </span>
        ))}
      </div>

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
        <summary className="cursor-pointer select-none font-medium text-slate-600">How to add credentials</summary>
        <div className="mt-2 space-y-1.5">
          <div>
            Production: run{' '}
            {secretNames.map((n) => (
              <code key={n} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                npx wrangler secret put {n}
              </code>
            ))}
            and set <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{c.baseUrlVar}</code> under{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">vars</code> in wrangler.jsonc, then redeploy.
          </div>
          <div>
            Local: copy <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">.dev.vars.example</code> to{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">.dev.vars</code> and fill in the values.
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
          onTest={() => void run(`${c.provider}:test`, () => apiFetch<IntegrationConfig>(`/api/integrations/${c.provider}/test`, { method: 'POST' }))}
        />
      ))}
    </div>
  )
}
