/**
 * Level 0/1 service worker: open Side Panel; context menu stub.
 * Persist state in chrome.storage — workers can sleep anytime.
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "check-video",
    title: chrome.i18n.getMessage("contextCheckVideo") || "Check video with AI",
    contexts: ["page", "video", "link"],
  });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "check-video" || !tab?.windowId) return;
  await chrome.sidePanel.open({ windowId: tab.windowId });
  // Level 2+: start analysis for tab.id / info.linkUrl
});
