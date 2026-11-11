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

export function createBlocker(api) {
  let queue = Promise.resolve();
  const serial = operation => { const next = queue.then(operation); queue = next.catch(() => {}); return next; };
  const read = async () => storedState((await api.storage.local.get(BLOCKER_KEY))[BLOCKER_KEY]);
  async function apply(state) {
    const current = await api.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = current.filter(rule => rule.id >= FIRST_RULE && rule.id < FIRST_RULE + MAX_DOMAINS).map(rule => rule.id);
    await api.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: buildBlockRules(state) });
  }
  return {
    restore: () => serial(async () => { const state = await read(); await apply(state); return state; }),
    get: () => serial(read),
    update: message => serial(async () => {
      const previous = await read(); const next = { enabled: previous.enabled, domains: [...previous.domains] };
      if (message.action === 'toggle' && typeof message.enabled === 'boolean') next.enabled = message.enabled;
      else if (message.action === 'add') {
        const domain = normalizeDomain(message.domain);
        if (next.domains.includes(domain)) throw new Error('That website is already in your list.');
        if (next.domains.length >= MAX_DOMAINS) throw new Error('Remove a website before adding another. The limit is 100.');
        next.domains.push(domain);
      } else if (message.action === 'remove') next.domains = next.domains.filter(domain => domain !== normalizeDomain(message.domain));
      else throw new Error('Invalid blocker action.');
      await apply(next);
      try { await api.storage.local.set({ [BLOCKER_KEY]: next }); }
      catch { await apply(previous); throw new Error('Could not save blocking settings. Try again.'); }
      return next;
    }),
  };
}

export function installBlocker(api) {
  const blocker = createBlocker(api);
  const restore = () => { void blocker.restore().catch(() => console.error('Recall could not restore website blocking. Reload the extension.')); };
  api.runtime.onInstalled.addListener(restore);
  api.runtime.onStartup.addListener(restore);
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id || message?.type !== 'recall.blocker') return false;
    const operation = message.action === 'get' ? blocker.get() : blocker.update(message);
    operation.then(state => respond({ ok: true, state })).catch(() => respond({ ok: false, error: 'Could not update website blocking. Reload Recall and try again.' }));
    return true;
  });
  restore();
}
