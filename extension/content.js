let currentSpeed = 1.0
let isYouTube = window.location.hostname.includes("youtube.com")
let speedRanges = []
let rangeBasedEnabled = false
let lastAppliedSpeeds = {}
let extensionEnabled = true
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
        if (request.mode === "ranges" && request.ranges) {
          rangeBasedEnabled = true
          speedRanges = request.ranges
          applySpeedToAllVideos()
        } else if (request.mode === "simple" && request.speed) {
          rangeBasedEnabled = false
          currentSpeed = request.speed
          applySpeedToAllVideos(currentSpeed)
        } else {
          applySpeedToAllVideos()
        }
      }
      sendResponse({ success: true })
    } else if (request.action === "setSpeed") {
      if (!extensionEnabled) {
        sendResponse({ success: false, reason: "Extension disabled" })
        return true
      }

      if (!rangeBasedEnabled) {
        currentSpeed = request.speed
        applySpeedToAllVideos(currentSpeed)
      }

      sendResponse({ success: true })
    } else if (request.action === "updateRangeConfig") {
      rangeBasedEnabled = request.enabled

      if (request.ranges && Array.isArray(request.ranges)) {
        speedRanges = request.ranges
      }

      if (extensionEnabled) {
        applySpeedToAllVideos()
      }
      sendResponse({ success: true })
    } else if (request.action === "resetToDefaults") {
      speedRanges = [
        { point: 0, speed: 1.0 },
        { point: 5, speed: 1.25 },
        { point: 10, speed: 1.5 },
        { point: -1, speed: 2.0 },
      ]

      const data = {}
      data[`${window.location.hostname}_ranges`] = speedRanges
      chrome.storage.sync.set(data)

      if (extensionEnabled) {
        applySpeedToAllVideos()
      }
      sendResponse({ success: true })
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message })
  }
  return true
})

function resetAllVideoSpeeds() {
  const videos = document.querySelectorAll("video")
  videos.forEach((video, index) => {
    try {
      if (video.playbackRate !== 1.0) {
        video.playbackRate = 1.0
      }
      const videoId = video.src || video.currentSrc || `video_${index}`
      delete lastAppliedSpeeds[videoId]
    } catch (e) {
      console.error("Error resetting video speed:", e)
    }
  })
}

function getSpeedForDuration(durationMinutes) {
  if (!extensionEnabled) {
    return 1.0
  }
  if (!rangeBasedEnabled || !speedRanges || speedRanges.length === 0) {
    return currentSpeed
  }

  if (isNaN(durationMinutes) || durationMinutes <= 0) {
    return currentSpeed
  }

  const sortedRanges = [...speedRanges].sort((a, b) => {
    if (a.point === -1) return 1
    if (b.point === -1) return -1
    return a.point - b.point
  })

  for (let i = 0; i < sortedRanges.length - 1; i++) {
    const currentPoint = sortedRanges[i].point
    const nextPoint = sortedRanges[i + 1].point

    if (currentPoint === undefined || currentPoint === null) continue

    if (nextPoint === -1) {
      if (durationMinutes >= currentPoint) {
        return sortedRanges[i].speed
      }
    } else if (durationMinutes >= currentPoint && durationMinutes < nextPoint) {
      return sortedRanges[i].speed
    }
  }

  return currentSpeed
}

function getVideoDurationMinutes(video) {
  if (video.duration && video.duration !== Infinity && !isNaN(video.duration)) {
    return video.duration / 60
  }

  if (isYouTube) {
    try {
      const timeDisplay = document.querySelector(".ytp-time-duration")
      if (timeDisplay) {
        const timeText = timeDisplay.textContent
        const timeParts = timeText.split(":").map(Number)
        let minutes = 0
        if (timeParts.length === 2) {
          minutes = timeParts[0] + timeParts[1] / 60
        } else if (timeParts.length === 3) {
          minutes = timeParts[0] * 60 + timeParts[1] + timeParts[2] / 60
        }

        if (!isNaN(minutes) && minutes > 0) {
          return minutes
        }
      }

      const videoData = document.querySelector("video")
      if (videoData && videoData.dataset && videoData.dataset.durationSeconds) {
        const durationSeconds = parseFloat(videoData.dataset.durationSeconds)
        if (!isNaN(durationSeconds) && durationSeconds > 0) {
          return durationSeconds / 60
        }
      }
    } catch (e) {}
  }

  try {
    const metaDuration = document.querySelector('meta[itemprop="duration"]')
    if (metaDuration) {
      const durationStr = metaDuration.getAttribute("content")
      if (durationStr) {
        const hours = durationStr.match(/(\d+)H/)
        const minutes = durationStr.match(/(\d+)M/)
        const seconds = durationStr.match(/(\d+)S/)

        let totalMinutes = 0
        if (hours && hours[1]) totalMinutes += parseInt(hours[1]) * 60
        if (minutes && minutes[1]) totalMinutes += parseInt(minutes[1])
        if (seconds && seconds[1]) totalMinutes += parseInt(seconds[1]) / 60

        if (totalMinutes > 0) {
          return totalMinutes
        }
      }
    }
  } catch (e) {}

  return -1
}

function applySpeedToAllVideos(forcedSpeed = null) {
  if (!extensionEnabled) {
    resetAllVideoSpeeds()
    return
  }

  const videos = document.querySelectorAll("video")

  if (videos.length > 0) {
    videos.forEach((video, index) => {
      try {
        const videoId = video.src || video.currentSrc || `video_${index}`

        const durationMinutes = getVideoDurationMinutes(video)

        let speed
        if (forcedSpeed !== null) {
          speed = forcedSpeed
        } else if (rangeBasedEnabled && speedRanges.length > 0 && durationMinutes > 0) {
          speed = getSpeedForDuration(durationMinutes)
        } else {
          speed = currentSpeed
        }

        if (lastAppliedSpeeds[videoId] === speed && video.playbackRate === speed) {
          return
        }

        video.playbackRate = speed
        lastAppliedSpeeds[videoId] = speed

        if (!video.hasAttribute("data-speed-controlled")) {
          video.setAttribute("data-speed-controlled", "true")

          video.addEventListener("durationchange", function () {
            if (!extensionEnabled) return
            if (this.duration && this.duration !== Infinity && !isNaN(this.duration)) {
              const newDurationMinutes = this.duration / 60

              if (!forcedSpeed && rangeBasedEnabled && speedRanges.length > 0) {
                const newSpeed = getSpeedForDuration(newDurationMinutes)
                if (this.playbackRate !== newSpeed) {
                  this.playbackRate = newSpeed
                  lastAppliedSpeeds[videoId] = newSpeed
                }
              } else if (!forcedSpeed) {
                if (this.playbackRate !== currentSpeed) {
                  this.playbackRate = currentSpeed
                  lastAppliedSpeeds[videoId] = currentSpeed
                }
              }
            }
          })

          video.addEventListener("ratechange", function (event) {
            if (!extensionEnabled) return
            const videoId = this.src || this.currentSrc || `video_${index}`
            const expectedSpeed = lastAppliedSpeeds[videoId]

            if (expectedSpeed !== undefined && this.playbackRate !== expectedSpeed) {
              if (event.isTrusted) {
                this.playbackRate = expectedSpeed
              } else {
                this.playbackRate = expectedSpeed
              }
            }
          })

          video.addEventListener("loadeddata", function () {
            if (!extensionEnabled) return
            const videoId = this.src || this.currentSrc || `video_${index}`

            let targetSpeed
            if (forcedSpeed !== null) {
              targetSpeed = forcedSpeed
            } else if (rangeBasedEnabled && speedRanges.length > 0 && this.duration) {
              targetSpeed = getSpeedForDuration(this.duration / 60)
            } else {
              targetSpeed = currentSpeed
            }

            if (this.playbackRate !== targetSpeed) {
              this.playbackRate = targetSpeed
              lastAppliedSpeeds[videoId] = targetSpeed
            }
          })
        }
      } catch (e) {}
    })
  }
}

function setupVideoPlayListener() {
  document.addEventListener(
    "play",
    function (e) {
      if (!extensionEnabled) return
      if (e.target.tagName === "VIDEO") {
        const durationMinutes = getVideoDurationMinutes(e.target)

        let speed
        if (rangeBasedEnabled && speedRanges.length > 0 && durationMinutes > 0) {
          speed = getSpeedForDuration(durationMinutes)
        } else {
          speed = currentSpeed
        }

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

  const checkInterval = isYouTube ? 1000 : 3000
  setInterval(() => {
    if (!extensionEnabled) return
    applySpeedToAllVideos()
  }, checkInterval)
}

function setupYouTubeNavObserver() {
  if (!isYouTube) return

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

    chrome.storage.sync.get([hostname, `${hostname}_ranges`, `${hostname}_enabled`, `${hostname}_active_tab`], function (result) {
      try {
        if (typeof result[`${hostname}_enabled`] === "boolean") {
          extensionEnabled = result[`${hostname}_enabled`]
        } else if (result[`${hostname}_active_tab`] === "off") {
          extensionEnabled = false
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

        if (result[`${hostname}_ranges`] && Array.isArray(result[`${hostname}_ranges`]) && result[`${hostname}_ranges`].length > 0) {
          speedRanges = result[`${hostname}_ranges`]
        } else {
          speedRanges = [
            { point: 0, speed: 1.0 },
            { point: 5, speed: 1.25 },
            { point: 10, speed: 1.5 },
            { point: -1, speed: 2.0 },
          ]
        }

        rangeBasedEnabled = result[`${hostname}_active_tab`] === "ranges"

        if (extensionEnabled) {
          applySpeedToAllVideos()
        } else {
          resetAllVideoSpeeds()
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

  if (e.key === "[" || e.key === "]") {
    e.preventDefault()

    // Switch to simple mode if in ranges mode
    if (rangeBasedEnabled) {
      rangeBasedEnabled = false
      const hostname = window.location.hostname
      chrome.storage.sync.set({
        [`${hostname}_active_tab`]: "simple",
      })
    }

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
      showSpeedIndicator(newSpeed) // Show the speed indicator
    }
  }
})

init()
