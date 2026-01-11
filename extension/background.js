// Flow Control - Background Script
// Minimal - content script is already declared in manifest.json
chrome.runtime.onInstalled.addListener(() => {
  console.log("Flow Control extension installed")
})
