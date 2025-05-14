// This background script handles any extension-wide tasks

// Listen for when a tab is updated (e.g., page refresh or navigation)
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      })
      .catch((error) => {
        console.error("Failed to inject content script:", error)
      })
  }
})

// Listen for installation or update of the extension
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
  } else if (details.reason === "update") {
  }
})

// Background script for the Speed Controller extension
