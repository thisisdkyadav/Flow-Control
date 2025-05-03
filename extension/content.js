// Initialize when the content script loads
let currentSpeed = 1.0
let isYouTube = window.location.hostname.includes("youtube.com")
let speedRanges = []
let rangeBasedEnabled = false
let debugMode = false // Set to false to disable console logs
let lastAppliedSpeeds = {} // Track last applied speeds to avoid unnecessary changes

// Simple debug logger
function log(message, ...args) {
  if (debugMode) {
    console.log(`[SpeedController] ${message}`, ...args)
  }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  try {
    log("Message received:", request)

    if (request.action === "setSpeed") {
      currentSpeed = request.speed
      log("Setting fixed speed to:", currentSpeed)

      // Apply the speed to the current/active video or all videos
      if (request.applyToAll) {
        applySpeedToAllVideos(currentSpeed)
      } else {
        applySpeedToActiveVideo(currentSpeed)
      }

      sendResponse({ success: true })
    } else if (request.action === "updateRangeConfig") {
      // Validate range configuration
      if (request.ranges && Array.isArray(request.ranges)) {
        speedRanges = request.ranges
      }

      rangeBasedEnabled = !!request.enabled
      log("Updated range configuration:", { enabled: rangeBasedEnabled, ranges: speedRanges })

      // Apply the appropriate speed based on current settings
      applySpeedToAllVideos()
      sendResponse({ success: true })
    } else if (request.action === "resetToDefaults") {
      // Reset to default ranges
      speedRanges = [
        { point: 0, speed: 1.0 },
        { point: 5, speed: 1.25 },
        { point: 10, speed: 1.5 },
        { point: -1, speed: 2.0 },
      ]

      // Save the default ranges to storage
      const data = {}
      data[`${window.location.hostname}_ranges`] = speedRanges
      chrome.storage.sync.set(data)

      log("Reset to default ranges:", speedRanges)

      // Apply the speeds based on the default ranges
      applySpeedToAllVideos()
      sendResponse({ success: true })
    }
  } catch (error) {
    log("Error handling message:", error)
    sendResponse({ success: false, error: error.message })
  }
  return true
})

// Get appropriate speed based on video duration
function getSpeedForDuration(durationMinutes) {
  // Return the fixed speed if range-based speed is disabled
  if (!rangeBasedEnabled || !speedRanges || speedRanges.length === 0) {
    log("Using fixed speed:", currentSpeed)
    return currentSpeed
  }

  // Handle invalid duration
  if (isNaN(durationMinutes) || durationMinutes <= 0) {
    log("Invalid duration:", durationMinutes, "using current speed")
    return currentSpeed
  }

  // Make sure ranges are sorted properly
  const sortedRanges = [...speedRanges].sort((a, b) => {
    if (a.point === -1) return 1
    if (b.point === -1) return -1
    return a.point - b.point
  })

  log("Getting speed for duration:", durationMinutes, "minutes")

  // Handle continuous ranges
  // Find which range the duration falls into
  for (let i = 0; i < sortedRanges.length - 1; i++) {
    const currentPoint = sortedRanges[i].point
    const nextPoint = sortedRanges[i + 1].point

    // Skip invalid points
    if (currentPoint === undefined || currentPoint === null) continue

    // Handle infinity
    if (nextPoint === -1) {
      if (durationMinutes >= currentPoint) {
        log("Duration is in infinite range starting at", currentPoint, "- using speed:", sortedRanges[i].speed)
        return sortedRanges[i].speed
      }
    }
    // Handle regular range
    else if (durationMinutes >= currentPoint && durationMinutes < nextPoint) {
      log("Duration is in range", currentPoint, "-", nextPoint, "- using speed:", sortedRanges[i].speed)
      return sortedRanges[i].speed
    }
  }

  log("No matching range for duration:", durationMinutes, "- using current speed:", currentSpeed)
  return currentSpeed // Default to current speed if no range matches
}

// Get the video duration in minutes, with fallbacks for unavailable duration
function getVideoDurationMinutes(video) {
  // First try the most direct method
  if (video.duration && video.duration !== Infinity && !isNaN(video.duration)) {
    return video.duration / 60
  }

  // For YouTube, try additional methods
  if (isYouTube) {
    try {
      // Try YouTube-specific methods

      // Method 1: Check the time display
      const timeDisplay = document.querySelector(".ytp-time-duration")
      if (timeDisplay) {
        const timeText = timeDisplay.textContent
        // Parse mm:ss or hh:mm:ss format
        const timeParts = timeText.split(":").map(Number)
        let minutes = 0
        if (timeParts.length === 2) {
          // mm:ss
          minutes = timeParts[0] + timeParts[1] / 60
        } else if (timeParts.length === 3) {
          // hh:mm:ss
          minutes = timeParts[0] * 60 + timeParts[1] + timeParts[2] / 60
        }

        if (!isNaN(minutes) && minutes > 0) {
          log("Estimated duration from time display:", minutes)
          return minutes
        }
      }

      // Method 2: Try to get duration from video player data
      const videoData = document.querySelector("video")
      if (videoData && videoData.dataset && videoData.dataset.durationSeconds) {
        const durationSeconds = parseFloat(videoData.dataset.durationSeconds)
        if (!isNaN(durationSeconds) && durationSeconds > 0) {
          log("Estimated duration from dataset:", durationSeconds / 60)
          return durationSeconds / 60
        }
      }
    } catch (e) {
      log("Error estimating YouTube duration:", e)
    }
  }

  // Look for video duration in the page metadata
  try {
    const metaDuration = document.querySelector('meta[itemprop="duration"]')
    if (metaDuration) {
      // Parse ISO 8601 duration format (PT1H30M15S)
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
          log("Estimated duration from metadata:", totalMinutes)
          return totalMinutes
        }
      }
    }
  } catch (e) {
    log("Error estimating duration from metadata:", e)
  }

  // If we can't determine the duration, return -1 to indicate unknown
  return -1
}

// Apply speed to all videos on the page
function applySpeedToAllVideos(forcedSpeed = null) {
  const videos = document.querySelectorAll("video")
  log("Applying speed to", videos.length, "videos. Forced speed:", forcedSpeed, "Range-based enabled:", rangeBasedEnabled)

  if (videos.length > 0) {
    videos.forEach((video, index) => {
      try {
        // Try to generate a unique identifier for this video
        const videoId = video.src || video.currentSrc || `video_${index}`

        // Get video duration in minutes
        const durationMinutes = getVideoDurationMinutes(video)

        // Determine appropriate speed
        let speed
        if (forcedSpeed !== null) {
          speed = forcedSpeed
        } else if (rangeBasedEnabled && speedRanges.length > 0 && durationMinutes > 0) {
          speed = getSpeedForDuration(durationMinutes)
        } else {
          speed = currentSpeed
        }

        // Check if we've already applied this speed to this video
        if (lastAppliedSpeeds[videoId] === speed && video.playbackRate === speed) {
          // Skip if already at the right speed
          return
        }

        log(`Video ${index}: duration=${durationMinutes > 0 ? durationMinutes.toFixed(2) : "unknown"}min, setting speed=${speed}x`)

        // Try to set the playback rate
        video.playbackRate = speed
        lastAppliedSpeeds[videoId] = speed

        // Add an event listener to maintain speed if the video resets
        if (!video.hasAttribute("data-speed-controlled")) {
          video.setAttribute("data-speed-controlled", "true")

          // Listen for duration changes (important for dynamically loaded videos)
          video.addEventListener("durationchange", function () {
            if (this.duration && this.duration !== Infinity && !isNaN(this.duration)) {
              const newDurationMinutes = this.duration / 60
              log(`Video duration changed: ${newDurationMinutes.toFixed(2)}min`)

              if (!forcedSpeed && rangeBasedEnabled && speedRanges.length > 0) {
                const newSpeed = getSpeedForDuration(newDurationMinutes)
                log(`New speed for updated duration: ${newSpeed}x`)
                if (this.playbackRate !== newSpeed) {
                  this.playbackRate = newSpeed
                  lastAppliedSpeeds[videoId] = newSpeed
                }
              } else if (!forcedSpeed) {
                // Use fixed speed if range-based is disabled
                if (this.playbackRate !== currentSpeed) {
                  this.playbackRate = currentSpeed
                  lastAppliedSpeeds[videoId] = currentSpeed
                }
              }
            }
          })

          // Listen for rate changes to maintain our chosen speed
          video.addEventListener("ratechange", function (event) {
            const videoId = this.src || this.currentSrc || `video_${index}`
            const expectedSpeed = lastAppliedSpeeds[videoId]

            // Only override if we know what speed this should be and it's different
            if (expectedSpeed !== undefined && this.playbackRate !== expectedSpeed) {
              log(`Correcting playback rate back to ${expectedSpeed}x from ${this.playbackRate}x`)
              this.playbackRate = expectedSpeed
            }
          })

          // Also handle the loadeddata event which often means the video is fully loaded
          video.addEventListener("loadeddata", function () {
            const videoId = this.src || this.currentSrc || `video_${index}`
            log("Video loaded data event, duration:", this.duration / 60)

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
              log("Set initial playback speed on load:", targetSpeed)
            }
          })
        }
      } catch (e) {
        log("Error setting playback rate:", e)
      }
    })
  } else {
    log("No videos found on page")
  }
}

// Apply speed to the active/focused video
function applySpeedToActiveVideo(forcedSpeed = null) {
  // First try to find a video that's currently playing
  const videos = document.querySelectorAll("video")
  let activeVideo = null

  // First, look for videos that are playing
  for (let i = 0; i < videos.length; i++) {
    if (!videos[i].paused) {
      activeVideo = videos[i]
      log("Found active playing video:", i)
      break
    }
  }

  // If no playing video, take the first one or apply to all
  if (!activeVideo && videos.length > 0) {
    log("No active video found, applying to all videos")
    // Just apply to all videos if we can't determine which is active
    applySpeedToAllVideos(forcedSpeed)
    return
  }

  // Apply speed to the active video
  if (activeVideo) {
    const durationMinutes = getVideoDurationMinutes(activeVideo)

    let speed
    if (forcedSpeed !== null) {
      speed = forcedSpeed
    } else if (rangeBasedEnabled && speedRanges.length > 0 && durationMinutes > 0) {
      speed = getSpeedForDuration(durationMinutes)
    } else {
      speed = currentSpeed
    }

    log(`Applying speed ${speed}x to active video (duration: ${durationMinutes.toFixed(2)}min)`)
    activeVideo.playbackRate = speed

    // Set up event listeners if not already done
    if (!activeVideo.hasAttribute("data-speed-controlled")) {
      activeVideo.setAttribute("data-speed-controlled", "true")

      // Same event listeners as in applySpeedToAllVideos function
      activeVideo.addEventListener("durationchange", function () {
        if (this.duration && this.duration !== Infinity && !isNaN(this.duration)) {
          const newDurationMinutes = this.duration / 60
          log(`Active video duration changed: ${newDurationMinutes.toFixed(2)}min`)

          if (!forcedSpeed && rangeBasedEnabled && speedRanges.length > 0) {
            const newSpeed = getSpeedForDuration(newDurationMinutes)
            log(`New speed for active video: ${newSpeed}x`)
            if (this.playbackRate !== newSpeed) {
              this.playbackRate = newSpeed
            }
          } else if (!forcedSpeed) {
            // Use fixed speed if range-based is disabled
            this.playbackRate = currentSpeed
          }
        }
      })

      activeVideo.addEventListener("ratechange", function (event) {
        let targetSpeed
        if (forcedSpeed !== null) {
          targetSpeed = forcedSpeed
        } else if (rangeBasedEnabled && speedRanges.length > 0) {
          targetSpeed = getSpeedForDuration(getVideoDurationMinutes(this))
        } else {
          targetSpeed = currentSpeed
        }

        if (this.playbackRate !== targetSpeed) {
          log(`Correcting active video playback rate to ${targetSpeed}x`)
          this.playbackRate = targetSpeed
        }
      })

      activeVideo.addEventListener("loadeddata", function () {
        let targetSpeed
        if (forcedSpeed !== null) {
          targetSpeed = forcedSpeed
        } else if (rangeBasedEnabled && speedRanges.length > 0) {
          targetSpeed = getSpeedForDuration(this.duration / 60)
        } else {
          targetSpeed = currentSpeed
        }

        this.playbackRate = targetSpeed
        log("Set initial playback speed on active video load:", targetSpeed)
      })
    }
  } else {
    log("No active video found and no videos on page")
  }
}

// Watch for video play events to apply speed
function setupVideoPlayListener() {
  document.addEventListener(
    "play",
    function (e) {
      if (e.target.tagName === "VIDEO") {
        log("Video play event detected")

        // Get video duration
        const durationMinutes = getVideoDurationMinutes(e.target)

        // Get and set the appropriate speed when any video starts playing
        let speed
        if (rangeBasedEnabled && speedRanges.length > 0 && durationMinutes > 0) {
          speed = getSpeedForDuration(durationMinutes)
        } else {
          speed = currentSpeed
        }

        log(`Setting speed ${speed}x on playing video (duration: ${durationMinutes.toFixed(2)}min)`)
        e.target.playbackRate = speed
      }
    },
    true
  )
}

// Monitor for new videos added to the page
function setupVideoObserver() {
  // Watch for added video elements
  const observer = new MutationObserver(function (mutations) {
    // Check if we should scan for videos
    let shouldCheckForVideos = false

    mutations.forEach(function (mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        // Check if any of the added nodes are videos or contain videos
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
      // Find all videos and apply appropriate speeds
      log("DOM mutation detected, checking for new videos")
      applySpeedToAllVideos()
    }
  })

  // Start observing the document with configured parameters
  observer.observe(document.body, { childList: true, subtree: true })
  log("Video DOM observer initialized")

  // Also check for videos periodically (helps with SPAs like YouTube)
  const checkInterval = isYouTube ? 1000 : 3000
  log(`Setting periodic video check every ${checkInterval}ms`)

  setInterval(() => {
    // Only log every 5th check to reduce console spam
    const shouldLog = Math.random() < 0.2
    if (shouldLog) log("Periodic video check")
    applySpeedToAllVideos()
  }, checkInterval)
}

// Special handling for YouTube's navigation system
function setupYouTubeNavObserver() {
  if (!isYouTube) return

  log("Setting up YouTube navigation observer")

  // YouTube uses History API for navigation
  let lastUrl = location.href

  // Create an observer to watch for URL changes
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      log("YouTube URL changed from", lastUrl, "to", location.href)
      lastUrl = location.href
      // Wait for the new video player to load
      setTimeout(() => {
        log("Applying speeds after YouTube navigation")
        applySpeedToAllVideos()
      }, 1000) // Increased timeout for better reliability
    }
  })

  // Observe changes to the title, which usually changes on navigation
  const titleElement = document.querySelector("title")
  if (titleElement) {
    urlObserver.observe(titleElement, { subtree: true, characterData: true, childList: true })
    log("YouTube title observer initialized")
  } else {
    log("Could not find title element for YouTube observer")
  }
}

// Initialize when page loads
function init() {
  try {
    // Get the current website's hostname
    const hostname = window.location.hostname
    log("Initializing Speed Controller on", hostname)

    // Load both simple speed and ranges with toggle state
    chrome.storage.sync.get([hostname, `${hostname}_ranges`, `${hostname}_range_enabled`], function (result) {
      try {
        // Set current speed from simple speed setting
        if (result[hostname] && !isNaN(parseFloat(result[hostname]))) {
          currentSpeed = parseFloat(result[hostname])
          log("Loaded saved speed setting:", currentSpeed)
        } else {
          log("No saved speed setting, using default:", currentSpeed)
        }

        // Set ranges if they exist and are valid
        if (result[`${hostname}_ranges`] && Array.isArray(result[`${hostname}_ranges`]) && result[`${hostname}_ranges`].length > 0) {
          speedRanges = result[`${hostname}_ranges`]
          log("Loaded saved speed ranges:", speedRanges)
        } else {
          log("No saved speed ranges or invalid format")
          // Set default ranges
          speedRanges = [
            { point: 0, speed: 1.0 },
            { point: 5, speed: 1.25 },
            { point: 10, speed: 1.5 },
            { point: -1, speed: 2.0 },
          ]
        }

        // Set toggle state
        rangeBasedEnabled = !!result[`${hostname}_range_enabled`]
        log("Range-based speed control enabled:", rangeBasedEnabled)

        // Apply speed to all existing videos
        log("Initial application of speeds to videos")
        applySpeedToAllVideos()

        // Setup observers
        setupVideoObserver()
        setupVideoPlayListener()

        // YouTube-specific handling
        if (isYouTube) {
          log("YouTube detected, setting up specialized handlers")
          setupYouTubeNavObserver()
        }
      } catch (error) {
        log("Error in initialization after storage retrieval:", error)
      }
    })
  } catch (error) {
    log("Error in main initialization:", error)
  }
}

// Run initialization
log("Speed Controller content script loaded")
init()
