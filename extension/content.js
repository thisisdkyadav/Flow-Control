let currentSpeed = 1.0
let extensionEnabled = true
let isHolding = false
let holdingSpeed = null
const SPEED_INCREMENT = 0.25
const MIN_SPEED = 0.25
const MAX_SPEED = 4.0

// Add speed indicator styles
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  .speed-indicator {
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
  }
  .speed-indicator.visible {
    opacity: 1;
  }
`
document.head.appendChild(styleSheet)

// Create speed indicator element
let speedIndicator = document.createElement("div")
speedIndicator.className = "speed-indicator"
document.body.appendChild(speedIndicator)

let indicatorTimeout = null

function showSpeedIndicator(speed) {
  speedIndicator.textContent = speed.toFixed(2) + "×"
  speedIndicator.classList.add("visible")

  if (indicatorTimeout) {
    clearTimeout(indicatorTimeout)
  }

  indicatorTimeout = setTimeout(() => {
    speedIndicator.classList.remove("visible")
  }, 1000)
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  try {
    if (request.action === "setEnabled") {
      extensionEnabled = request.enabled
      if (!extensionEnabled) {
        resetAllVideoSpeeds()
      } else {
        if (request.speed !== undefined) {
          currentSpeed = request.speed
        }
        applySpeedToAllVideos(currentSpeed)
      }
      sendResponse({ success: true })
    } else if (request.action === "setSpeed") {
      if (!extensionEnabled) {
        sendResponse({ success: false, reason: "Extension disabled" })
        return true
      }

      if (request.speed !== undefined) {
        currentSpeed = request.speed
        applySpeedToAllVideos(currentSpeed)
        showSpeedIndicator(currentSpeed)
      }

      sendResponse({ success: true })
    }
  } catch (error) {
    console.error("Message handler error:", error)
    sendResponse({ success: false, error: error.message })
  }
  return true
})

function resetAllVideoSpeeds() {
  const videos = document.querySelectorAll("video")
  videos.forEach((video) => {
    try {
      if (video.playbackRate !== 1.0) {
        video.playbackRate = 1.0
      }
    } catch (e) {
      console.error("Error resetting video speed:", e)
    }
  })
}

function applySpeedToAllVideos(speed = null) {
  if (!extensionEnabled) {
    resetAllVideoSpeeds()
    return
  }

  const targetSpeed = isHolding ? holdingSpeed : (speed !== null ? speed : currentSpeed)
  const videos = document.querySelectorAll("video")

  videos.forEach((video) => {
    try {
      if (video.playbackRate !== targetSpeed) {
        video.playbackRate = targetSpeed
      }

      if (!video.hasAttribute("data-speed-controlled")) {
        video.setAttribute("data-speed-controlled", "true")

        video.addEventListener("ratechange", function (event) {
          if (!extensionEnabled) return
          const speed = isHolding ? holdingSpeed : currentSpeed
          if (this.playbackRate !== speed && event.isTrusted) {
            this.playbackRate = speed
          }
        })

        video.addEventListener("loadeddata", function () {
          if (!extensionEnabled) return
          const speed = isHolding ? holdingSpeed : currentSpeed
          if (this.playbackRate !== speed) {
            this.playbackRate = speed
          }
        })
      }
    } catch (e) {}
  })
}

function setupVideoPlayListener() {
  document.addEventListener(
    "play",
    function (e) {
      if (!extensionEnabled) return
      if (e.target.tagName === "VIDEO") {
        const speed = isHolding ? holdingSpeed : currentSpeed
        if (e.target.playbackRate !== speed) {
          e.target.playbackRate = speed
        }
      }
    },
    true
  )
}

function setupVideoObserver() {
  const observer = new MutationObserver(function (mutations) {
    if (!extensionEnabled) return
    let shouldCheckForVideos = false

    mutations.forEach(function (mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === "VIDEO") {
            shouldCheckForVideos = true
          } else if (node.querySelector && node.querySelector("video")) {
            shouldCheckForVideos = true
          }
        })
      }
    })

    if (shouldCheckForVideos) {
      applySpeedToAllVideos()
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })

  const isYouTube = window.location.hostname.includes("youtube.com")
  const checkInterval = isYouTube ? 1000 : 3000
  setInterval(() => {
    if (!extensionEnabled) return
    applySpeedToAllVideos()
  }, checkInterval)
}

function setupYouTubeNavObserver() {
  if (!window.location.hostname.includes("youtube.com")) return

  let lastUrl = location.href

  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      setTimeout(() => {
        applySpeedToAllVideos()
      }, 1000)
    }
  })

  const titleElement = document.querySelector("title")
  if (titleElement) {
    urlObserver.observe(titleElement, { subtree: true, characterData: true, childList: true })
  }
}

function init() {
  try {
    const hostname = window.location.hostname

    chrome.storage.sync.get([hostname, `${hostname}_enabled`, `${hostname}_holding_speed`], function (result) {
      try {
        if (typeof result[`${hostname}_enabled`] === "boolean") {
          extensionEnabled = result[`${hostname}_enabled`]
        } else {
          extensionEnabled = true
        }

        if (!extensionEnabled) {
          resetAllVideoSpeeds()
          return
        }

        if (result[hostname] && !isNaN(parseFloat(result[hostname]))) {
          currentSpeed = parseFloat(result[hostname])
        }

        holdingSpeed = result[`${hostname}_holding_speed`] || 2.0

        if (extensionEnabled) {
          applySpeedToAllVideos()
        }

        setupVideoObserver()
        setupVideoPlayListener()
        setupYouTubeNavObserver()
      } catch (error) {
        console.error("Error in storage callback:", error)
      }
    })
  } catch (error) {
    console.error("Error in init:", error)
  }
}

// Add keyboard shortcut handler
document.addEventListener("keydown", function (e) {
  // Check if user is typing in an input field
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
    return
  }

  if (!extensionEnabled) {
    return
  }

  // Handle holding button shortcut
  if (e.key === "'") {
    e.preventDefault()
    isHolding = true
    const hostname = window.location.hostname
    chrome.storage.sync.get([`${hostname}_holding_speed`], function (result) {
      const targetSpeed = result[`${hostname}_holding_speed`] || 2.0
      holdingSpeed = targetSpeed
      applySpeedToAllVideos()
      showSpeedIndicator(targetSpeed)
    })
    return
  }

  if (e.key === "[" || e.key === "]") {
    e.preventDefault()

    // Calculate new speed
    let newSpeed = currentSpeed
    if (e.key === "]") {
      newSpeed = Math.min(MAX_SPEED, currentSpeed + SPEED_INCREMENT)
    } else if (e.key === "[") {
      newSpeed = Math.max(MIN_SPEED, currentSpeed - SPEED_INCREMENT)
    }

    if (newSpeed !== currentSpeed) {
      currentSpeed = newSpeed
      const hostname = window.location.hostname
      chrome.storage.sync.set({
        [hostname]: currentSpeed,
      })
      applySpeedToAllVideos(currentSpeed)
      showSpeedIndicator(newSpeed)
    }
  }
})

// Add keyup handler for the holding button
document.addEventListener("keyup", function (e) {
  if (e.key === "'" && holdingSpeed !== null) {
    e.preventDefault()
    isHolding = false
    applySpeedToAllVideos()
  }
})

init()
