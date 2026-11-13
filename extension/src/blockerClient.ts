import type { BlockerState } from '../public/blocker.js'

type Message = { action: 'get' } | { action: 'set'; state: BlockerState }
/** Talks to the extension's background worker, which holds Chrome's live blocking rules. */
export async function blockerRequest(message: Message): Promise<BlockerState> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) throw new Error('Website blocking works in the installed Chrome extension. Build and reload Recall to use it.')
  const manifest = chrome.runtime.getManifest()
  if (!manifest.background || !('service_worker' in manifest.background) || manifest.background.type !== 'module' || !manifest.permissions?.includes('declarativeNetRequest')) throw new Error('Recall needs an extension reload to activate website blocking.')
  let result
  try { result = await chrome.runtime.sendMessage({ type: 'recall.blocker', ...message }) }
  catch { throw new Error('Cannot reach the blocker. Reload Recall at chrome://extensions and reopen the panel.') }
  if (!result?.ok || typeof result.state?.enabled !== 'boolean' || !Array.isArray(result.state?.domains)) throw new Error('Could not update blocking. Check that Recall has its new permissions and reload it.')
  return result.state
}
