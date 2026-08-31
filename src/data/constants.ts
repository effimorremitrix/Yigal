import type { Port } from '../types'

export const PORTS: Record<string, Port> = {
  CNSHA: { code: 'CNSHA', name: 'Shanghai', country: 'China', flag: '🇨🇳', lat: 31.2, lon: 121.5 },
  CNNGB: { code: 'CNNGB', name: 'Ningbo', country: 'China', flag: '🇨🇳', lat: 29.9, lon: 121.6 },
  KRPUS: { code: 'KRPUS', name: 'Busan', country: 'South Korea', flag: '🇰🇷', lat: 35.1, lon: 129.0 },
  SGSIN: { code: 'SGSIN', name: 'Singapore', country: 'Singapore', flag: '🇸🇬', lat: 1.3, lon: 103.8 },
  AEJEA: { code: 'AEJEA', name: 'Jebel Ali', country: 'UAE', flag: '🇦🇪', lat: 25.0, lon: 55.1 },
  ILHFA: { code: 'ILHFA', name: 'Haifa', country: 'Israel', flag: '🇮🇱', lat: 32.8, lon: 35.0 },
  NLRTM: { code: 'NLRTM', name: 'Rotterdam', country: 'Netherlands', flag: '🇳🇱', lat: 51.9, lon: 4.5 },
  DEHAM: { code: 'DEHAM', name: 'Hamburg', country: 'Germany', flag: '🇩🇪', lat: 53.5, lon: 10.0 },
  BEANR: { code: 'BEANR', name: 'Antwerp', country: 'Belgium', flag: '🇧🇪', lat: 51.2, lon: 4.4 },
  GBFXT: { code: 'GBFXT', name: 'Felixstowe', country: 'United Kingdom', flag: '🇬🇧', lat: 51.96, lon: 1.35 },
  USLAX: { code: 'USLAX', name: 'Los Angeles', country: 'United States', flag: '🇺🇸', lat: 33.7, lon: -118.3 },
  USNYC: { code: 'USNYC', name: 'New York', country: 'United States', flag: '🇺🇸', lat: 40.7, lon: -74.0 },
}

export const CARRIERS = [
  { name: 'Meridian Line', scac: 'MERL', vessels: ['Meridian Aurora', 'Meridian Polaris', 'Meridian Vega'] },
  { name: 'Pacific Crown', scac: 'PCRN', vessels: ['Crown Jade', 'Crown Sapphire', 'Crown Onyx'] },
  { name: 'NordBridge', scac: 'NBRG', vessels: ['Nord Valkyrie', 'Nord Skagen', 'Nord Baltica'] },
  { name: 'AzureWave', scac: 'AZWV', vessels: ['Azure Horizon', 'Azure Tempest', 'Azure Mistral'] },
  { name: 'HarborLink', scac: 'HBLK', vessels: ['Harbor Sentinel', 'Harbor Beacon', 'Harbor Compass'] },
] as const

// Waypoints are [lat, lon]; transpacific lons continue past 180 (unwrapped) —
// the map projection wraps them and splits paths at the antimeridian.
type LatLon = [number, number]

const MALACCA_TO_GIBRALTAR: LatLon[] = [
  [1.3, 103.8], // Singapore strait
  [5.5, 95.0], // north of Sumatra
  [6.0, 80.0], // south of Sri Lanka
  [12.5, 48.0], // Gulf of Aden
  [20.0, 38.5], // Red Sea
  [30.0, 32.4], // Suez
  [33.0, 28.0], // eastern Med
  [36.8, 11.5], // Sicily strait
  [37.5, 5.0],
  [35.9, -5.8], // Gibraltar
]

const GIBRALTAR_TO_CHANNEL: LatLon[] = [
  [38.0, -10.2],
  [43.5, -9.8], // Finisterre
  [48.5, -5.5], // Brest
  [50.2, -0.5], // English Channel
]

const SOUTH_CHINA_SEA: LatLon[] = [
  [22.0, 118.0],
  [12.0, 111.0],
  [5.0, 106.0],
]

export interface TradeLane {
  id: string
  origin: string
  destination: string
  via?: string
  transitDays: number
  waypoints: LatLon[]
}

const p = (code: string): LatLon => [PORTS[code].lat, PORTS[code].lon]

export const LANES: TradeLane[] = [
  {
    id: 'CNSHA-NLRTM',
    origin: 'CNSHA',
    destination: 'NLRTM',
    transitDays: 34,
    waypoints: [p('CNSHA'), [27.0, 121.5], ...SOUTH_CHINA_SEA, ...MALACCA_TO_GIBRALTAR, ...GIBRALTAR_TO_CHANNEL, [51.3, 2.6], p('NLRTM')],
  },
  {
    id: 'CNNGB-USLAX',
    origin: 'CNNGB',
    destination: 'USLAX',
    transitDays: 16,
    waypoints: [p('CNNGB'), [30.5, 128.0], [33.0, 142.0], [38.0, 160.0], [42.0, 180.0], [42.0, 200.0], [38.0, 222.0], [33.7, 241.7]],
  },
  {
    id: 'ILHFA-DEHAM',
    origin: 'ILHFA',
    destination: 'DEHAM',
    transitDays: 14,
    waypoints: [p('ILHFA'), [33.5, 30.0], [34.5, 24.0], [36.8, 11.5], [37.5, 5.0], [35.9, -5.8], ...GIBRALTAR_TO_CHANNEL, [51.5, 2.5], [54.0, 7.5], p('DEHAM')],
  },
  {
    id: 'KRPUS-BEANR',
    origin: 'KRPUS',
    destination: 'BEANR',
    via: 'SGSIN',
    transitDays: 36,
    waypoints: [p('KRPUS'), [32.0, 127.0], ...SOUTH_CHINA_SEA, ...MALACCA_TO_GIBRALTAR, ...GIBRALTAR_TO_CHANNEL, [51.3, 2.4], p('BEANR')],
  },
  {
    id: 'CNSHA-DEHAM',
    origin: 'CNSHA',
    destination: 'DEHAM',
    via: 'SGSIN',
    transitDays: 36,
    waypoints: [p('CNSHA'), [27.0, 121.5], ...SOUTH_CHINA_SEA, ...MALACCA_TO_GIBRALTAR, ...GIBRALTAR_TO_CHANNEL, [51.5, 2.5], [54.0, 7.5], p('DEHAM')],
  },
  {
    id: 'AEJEA-NLRTM',
    origin: 'AEJEA',
    destination: 'NLRTM',
    transitDays: 20,
    waypoints: [p('AEJEA'), [26.3, 56.8], [22.0, 60.0], [14.0, 53.0], [12.5, 48.0], [20.0, 38.5], [30.0, 32.4], [33.0, 28.0], [36.8, 11.5], [37.5, 5.0], [35.9, -5.8], ...GIBRALTAR_TO_CHANNEL, [51.3, 2.6], p('NLRTM')],
  },
  {
    id: 'ILHFA-USNYC',
    origin: 'ILHFA',
    destination: 'USNYC',
    transitDays: 17,
    waypoints: [p('ILHFA'), [33.5, 30.0], [34.5, 24.0], [36.8, 11.5], [37.5, 5.0], [35.9, -5.8], [36.5, -20.0], [38.5, -45.0], [40.0, -65.0], p('USNYC')],
  },
  {
    id: 'CNNGB-GBFXT',
    origin: 'CNNGB',
    destination: 'GBFXT',
    via: 'SGSIN',
    transitDays: 33,
    waypoints: [p('CNNGB'), [27.0, 121.5], ...SOUTH_CHINA_SEA, ...MALACCA_TO_GIBRALTAR, ...GIBRALTAR_TO_CHANNEL, p('GBFXT')],
  },
]

export const CONTAINER_TYPES = ['20DV', '40DV', '40HC', '40RF'] as const

export const COMMODITIES = [
  'Auto parts',
  'Polymer resin',
  'Frozen foods',
  'Textiles & apparel',
  'Industrial machinery',
  'Consumer electronics',
  'Wine & beverages',
  'Chemicals (non-haz)',
  'Furniture',
  'Solar panels',
] as const

export const SHIPPERS = [
  { name: 'Atlas Polymers Ltd', contact: 'Dana Weiss' },
  { name: 'Verdant Foods SA', contact: 'Marc Delacroix' },
  { name: 'Corex Industries', contact: 'Chen Wei' },
  { name: 'Nova Textiles Co', contact: 'Priya Raman' },
  { name: 'Helios Energy Systems', contact: 'Tomas Berger' },
] as const

export const CONSIGNEES = [
  { name: 'EuroTrade GmbH', contact: 'Sabine Krüger' },
  { name: 'Baltic Retail Group', contact: 'Jonas Petraitis' },
  { name: 'WestCoast Distribution Inc', contact: 'Maria Alvarez' },
  { name: 'Northline Imports BV', contact: 'Pieter van Dam' },
] as const

export const FORWARDERS = [
  { name: 'GlobalFreight Partners', contact: 'Amit Shalev' },
  { name: 'SwiftCargo Logistics', contact: 'Laura Bennett' },
  { name: 'OceanBridge Forwarding', contact: 'Kenji Nakamura' },
] as const

export const DELAY_REASONS = [
  'Port congestion at transshipment hub',
  'Vessel schedule slide by carrier',
  'Adverse weather along route',
  'Customs inspection hold at origin',
  'Rolled cargo — overbooked sailing',
] as const
