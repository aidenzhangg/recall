export const BLOCKER_KEY: string
export const MAX_DOMAINS: number
export type BlockerState = { enabled: boolean; domains: string[] }
export function normalizeDomain(value: string): string
export function buildBlockRules(state: BlockerState): chrome.declarativeNetRequest.Rule[]
