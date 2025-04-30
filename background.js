// This background script handles any extension-wide tasks

// Listen for when a tab is updated (e.g., page refresh or navigation)
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  // Only proceed if the page has fully loaded and has a URL we can work with
  if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
    // Execute the content script to make sure it's running for this tab
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      })
      .catch((error) => console.error("Error injecting content script:", error))
  }
})

// Listen for installation or update of the extension
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    // First-time installation - you could show a welcome page or tutorial
    console.log("Video Speed Controller installed")
  } else if (details.reason === "update") {
    // Extension was updated - could show update notes
    console.log("Video Speed Controller updated")
  }
})
