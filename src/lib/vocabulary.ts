import type { BusinessModel } from '../types'

/**
 * One definition of how each business model talks, so no screen invents its own wording and the
 * two vocabularies cannot drift apart.
 *
 * `trader` is Yigal: he buys from producers and sells to importers, and is paid a commission
 * retained out of the producer's side of one all-in price. `operator` is the model Tidelane was
 * originally built on, an operator moving other people's cargo, where the same two transport
 * roles mean a company shipping its own goods and a company receiving them.
 *
 * The roles named here are the transport roles from the bill of lading (`shipper`, `consignee`),
 * which is all the domain model carries. Only the label changes with the mode, never the stored
 * value, so nothing here is part of an API contract.
 */
export interface Vocabulary {
  model: BusinessModel
  modelLabel: string
  /** What the app is for, one clause, used on the login and guide pages. */
  audience: string
  roleLabels: Record<string, string>
  /** Heading for the money block on a shipment. */
  moneyLabel: string
  /** Whether this model shows the commission fields at all. */
  showsCommission: boolean
}

const TRADER: Vocabulary = {
  model: 'trader',
  modelLabel: 'Trader',
  audience: 'traders who buy from producers and sell to importers',
  roleLabels: {
    internal: 'Your company',
    shipper: 'Producer',
    consignee: 'Importer',
    forwarder: 'Freight forwarder',
    carrier: 'Ocean carrier',
  },
  moneyLabel: 'Deal',
  showsCommission: true,
}

const OPERATOR: Vocabulary = {
  model: 'operator',
  modelLabel: 'Freight operator',
  audience: 'large-volume shippers and the forwarders and carriers they work with',
  roleLabels: {
    internal: 'Your company',
    shipper: 'Exporter',
    consignee: 'Consignee',
    forwarder: 'Freight forwarder',
    carrier: 'Ocean carrier',
  },
  moneyLabel: 'Freight',
  showsCommission: false,
}

export const VOCABULARIES: Record<BusinessModel, Vocabulary> = { trader: TRADER, operator: OPERATOR }

export const vocabularyFor = (model: BusinessModel | undefined): Vocabulary => VOCABULARIES[model ?? 'trader']

/** Falls back to the stored role value, so an unknown role shows as itself rather than blank. */
export const roleLabel = (v: Vocabulary, role: string): string => v.roleLabels[role] ?? role

export const fmtUsd = (n: number): string => `$${Math.round(n).toLocaleString()}`
