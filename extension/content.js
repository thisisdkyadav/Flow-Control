// Flow Control - Content Script
// Simplified architecture using chrome.storage.onChanged for sync

const SPEED_INCREMENT = 0.25
const MIN_SPEED = 0.1
const MAX_SPEED = 8.0
const DEFAULT_HOLD_SPEED = 2.0

function getTopLevelHostname() {
  if (window.top === window) return window.location.hostname

  try {
    if (window.top?.location?.hostname) {
      return window.top.location.hostname
    }
  } catch (e) {}

  const ancestorOrigins = window.location.ancestorOrigins
  if (ancestorOrigins && ancestorOrigins.length > 0) {
    const topOrigin = ancestorOrigins[ancestorOrigins.length - 1]
    try {
      return new URL(topOrigin).hostname || window.location.hostname
    } catch (e) {}
  }

  return window.location.hostname
}

// State
let config = { enabled: true, speed: 1.0, holdSpeed: DEFAULT_HOLD_SPEED }
let isHolding = false
let hostname = getTopLevelHostname()
let indicatorTimeout = null

// Speed indicator styles
const style = document.createElement("style")
style.textContent = `
  .flow-speed-indicator {
    position: fixed;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 12px 20px;
    border-radius: 25px;
    font-size: 16px;
    font-weight: bold;
    z-index: 2147483647;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    pointer-events: none;
  }
  .flow-speed-indicator.in-fullscreen {
    position: absolute;
  }
  .flow-speed-indicator.visible { opacity: 1; }
`
document.head.appendChild(style)

// Speed indicator element
const indicator = document.createElement("div")
indicator.className = "flow-speed-indicator"

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

function getIndicatorHost() {
  const fullscreenElement = getFullscreenElement()
  if (fullscreenElement && fullscreenElement instanceof HTMLElement) {
    return fullscreenElement
  }

  if (document.body) return document.body
  return document.documentElement
}

function syncIndicatorHost() {
  const host = getIndicatorHost()
  if (indicator.parentElement !== host) {
    host.appendChild(indicator)
  }

  if (getFullscreenElement()) {
    indicator.classList.add("in-fullscreen")
  } else {
    indicator.classList.remove("in-fullscreen")
  }
}

function showIndicator(speed) {
  syncIndicatorHost()
  indicator.textContent = speed.toFixed(2) + "×"
  indicator.classList.add("visible")
  clearTimeout(indicatorTimeout)
  indicatorTimeout = setTimeout(() => indicator.classList.remove("visible"), 1000)
}

// Apply speed to all videos
function applySpeed() {
  const speed = config.enabled ? (isHolding ? config.holdSpeed : config.speed) : 1.0
  document.querySelectorAll("video").forEach(video => {
    try {
      if (video.playbackRate !== speed) {
        video.playbackRate = speed
      }
    } catch (e) {}
  })
}

// Watch for new videos
const observer = new MutationObserver(mutations => {
  if (!config.enabled) return
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeName === "VIDEO" || (node.querySelector && node.querySelector("video"))) {
        applySpeed()
        return
      }
    }
  }
})

// Listen for storage changes (sync with popup and cross-tab)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes[hostname]) return
  const newConfig = changes[hostname].newValue
  if (newConfig) {
    config = { ...config, ...newConfig }
    applySpeed()
    console.log("Config updated from storage:", config)
  }
})

// Listen for messages from popup (for immediate feedback)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "applySpeed") {
    config = { ...config, ...request.config }
    applySpeed()
    if (request.showIndicator) {
      showIndicator(config.speed)
    }
    console.log("Config updated from popup message:", config)
    sendResponse({ success: true })
  }
  return true
})

// Keyboard shortcuts
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (!config.enabled) return

  // Hold key for temporary speed
  if (e.key === "'") {
    e.preventDefault()
    isHolding = true
    applySpeed()
    showIndicator(config.holdSpeed)
    return
  }

  // Speed adjustment
  if (e.key === "[" || e.key === "]") {
    e.preventDefault()
    let newSpeed = config.speed
    if (e.key === "]") newSpeed = Math.min(MAX_SPEED, config.speed + SPEED_INCREMENT)
    if (e.key === "[") newSpeed = Math.max(MIN_SPEED, config.speed - SPEED_INCREMENT)

    if (newSpeed !== config.speed) {
      config.speed = newSpeed
      chrome.storage.sync.set({ [hostname]: config }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Could not save shortcut speed:", chrome.runtime.lastError.message)
        }
      })
      applySpeed()
      showIndicator(newSpeed)
    }
  }
})

document.addEventListener("keyup", e => {
  if (e.key === "'" && isHolding) {
    e.preventDefault()
    isHolding = false
    applySpeed()
  }
})

// Initialize
function init() {
  syncIndicatorHost()
  document.addEventListener("fullscreenchange", syncIndicatorHost)
  document.addEventListener("webkitfullscreenchange", syncIndicatorHost)

  chrome.storage.sync.get([hostname], result => {
    if (result[hostname]) {
      config = { ...config, ...result[hostname] }
    }
    console.log("Loaded config:", hostname, config)
    applySpeed()
    
    // Start observer
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true })
    }
    
    // Fallback interval for stubborn players
    setInterval(() => {
      if (config.enabled) applySpeed()
    }, 2000)
  })

  // Handle video play events
  document.addEventListener("play", e => {
    if (config.enabled && e.target.tagName === "VIDEO") {
      applySpeed()
    }
  }, true)
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
