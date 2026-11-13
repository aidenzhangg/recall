export const BLOCKER_KEY = 'recall-blocker';
export const MAX_DOMAINS = 100;
const FIRST_RULE = 10000;

export function normalizeDomain(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('Enter a website domain, such as youtube.com.');
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`); }
  catch { throw new Error('Enter a valid website domain.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS website without login details.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') || /^[0-9.]+$/.test(host) || host.includes(':'))
    throw new Error('Use a website domain, not a local address or IP address.');
  if (host.length > 253 || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('Enter a valid website domain without wildcards.');
  return host;
}

export function buildBlockRules(state) {
  if (!state.enabled) return [];
  return state.domains.map((domain, i) => ({ id: FIRST_RULE + i, priority: 1, action: { type: 'block' }, condition: { requestDomains: [domain], resourceTypes: ['main_frame'] } }));
}

function storedState(value) {
  const domains = [];
  for (const candidate of Array.isArray(value?.domains) ? value.domains.slice(0, MAX_DOMAINS) : []) {
    try { const domain = normalizeDomain(candidate); if (!domains.includes(domain)) domains.push(domain); } catch { /* Ignore malformed stored entries. */ }
  }
  return { enabled: value?.enabled === true, domains };
}

// The list of sites belongs to the signed-in account and is sent here by the panel. Nothing is kept in
// extension storage: the only thing in the browser is Chrome's own set of active blocking rules.
export function createBlocker(api) {
  let queue = Promise.resolve();
  const serial = operation => { const next = queue.then(operation); queue = next.catch(() => {}); return next; };
  const ours = rule => rule.id >= FIRST_RULE && rule.id < FIRST_RULE + MAX_DOMAINS;
  async function live() {
    const rules = (await api.declarativeNetRequest.getDynamicRules()).filter(ours);
    return storedState({ enabled: rules.length > 0, domains: rules.flatMap(rule => rule.condition?.requestDomains ?? []) });
  }
  // A list an earlier version saved on this device. It is handed to the panel once so it can move into the account.
  async function legacy() {
    try { const value = (await api.storage.local.get(BLOCKER_KEY))[BLOCKER_KEY]; return value ? storedState(value) : null; }
    catch { return null; }
  }
  return {
    get: () => serial(async () => (await legacy()) ?? live()),
    set: state => serial(async () => {
      const next = storedState(state);
      const current = (await api.declarativeNetRequest.getDynamicRules()).filter(ours);
      await api.declarativeNetRequest.updateDynamicRules({ removeRuleIds: current.map(rule => rule.id), addRules: buildBlockRules(next) });
      try { await api.storage.local.remove(BLOCKER_KEY); } catch { /* Nothing left on the device to remove. */ }
      return next;
    }),
  };
}

export function installBlocker(api) {
  const blocker = createBlocker(api);
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id || message?.type !== 'recall.blocker') return false;
    const operation = message.action === 'get' ? blocker.get() : message.action === 'set' ? blocker.set(message.state) : Promise.reject(new Error('Invalid blocker action.'));
    operation.then(state => respond({ ok: true, state })).catch(() => respond({ ok: false, error: 'Could not update website blocking. Reload Recall and try again.' }));
    return true;
  });
}
