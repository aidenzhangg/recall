import { installBlocker } from './blocker.js';
installBlocker(chrome);

// Keep opening the panel inside the toolbar click's user gesture.
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
    console.error('Recall could not open its side panel:', error);
  });
});

// The explicit click handler above owns opening, avoiding competing toggle behavior.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
  console.error('Recall could not configure its toolbar action:', error);
});