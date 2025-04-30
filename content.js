// Initialize when the content script loads
let currentSpeed = 1.0
let isYouTube = window.location.hostname.includes("youtube.com")

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "setSpeed") {
    currentSpeed = request.speed

    // Apply the speed to the current/active video or all videos
    if (request.applyToAll) {
      applySpeedToAllVideos(currentSpeed)
    } else {
      applySpeedToActiveVideo(currentSpeed)
    }

    sendResponse({ success: true })
  }
  return true // Keep the message channel open for asynchronous responses
})

// Apply speed to all videos on the page
function applySpeedToAllVideos(speed) {
  const videos = document.querySelectorAll("video")
  if (videos.length > 0) {
    videos.forEach((video) => {
      video.playbackRate = speed
      // Add an event listener to maintain speed if the video resets
      if (!video.hasAttribute("data-speed-controlled")) {
        video.setAttribute("data-speed-controlled", "true")
        video.addEventListener("ratechange", function () {
          // Only override if the rate was changed by something else
          if (this.playbackRate !== speed) {
            this.playbackRate = speed
          }
        })
      }
    })
  }
}

// Apply speed to the active/focused video
function applySpeedToActiveVideo(speed) {
  // First try to find a video that's currently playing
  const videos = document.querySelectorAll("video")
  let activeVideo = null

  // First, look for videos that are playing
  for (let i = 0; i < videos.length; i++) {
    if (!videos[i].paused) {
      activeVideo = videos[i]
      break
    }
  }

  // If no playing video, take the first one or apply to all
  if (!activeVideo && videos.length > 0) {
    // Just apply to all videos if we can't determine which is active
    applySpeedToAllVideos(speed)
    return
  }

  // Apply speed to the active video
  if (activeVideo) {
    activeVideo.playbackRate = speed
    // Add an event listener to maintain speed if the video resets
    if (!activeVideo.hasAttribute("data-speed-controlled")) {
      activeVideo.setAttribute("data-speed-controlled", "true")
      activeVideo.addEventListener("ratechange", function () {
        // Only override if the rate was changed by something else
        if (this.playbackRate !== speed) {
          this.playbackRate = speed
        }
      })
    }
  }
}

// Watch for video play events to apply speed
function setupVideoPlayListener() {
  document.addEventListener(
    "play",
    function (e) {
      if (e.target.tagName === "VIDEO") {
        // Set the playback rate when any video starts playing
        e.target.playbackRate = currentSpeed
      }
    },
    true
  ) // Use capture to intercept before YouTube handlers
}

// Monitor for new videos added to the page
function setupVideoObserver() {
  // Watch for added video elements
  const observer = new MutationObserver(function (mutations) {
    // Check if we should scan for videos
    let shouldCheckForVideos = false

    mutations.forEach(function (mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        shouldCheckForVideos = true
      }
    })

    if (shouldCheckForVideos) {
      // Find all videos in the document and apply speed
      applySpeedToAllVideos(currentSpeed)
    }
  })

  // Start observing the document with configured parameters
  observer.observe(document.body, { childList: true, subtree: true })

  // Also check for videos periodically (helps with SPAs like YouTube)
  if (isYouTube) {
    setInterval(() => {
      applySpeedToAllVideos(currentSpeed)
    }, 1000) // Check every second on YouTube
  } else {
    // Less frequent check on other sites
    setInterval(() => {
      applySpeedToAllVideos(currentSpeed)
    }, 3000) // Check every 3 seconds on other sites
  }
}

// Special handling for YouTube's navigation system
function setupYouTubeNavObserver() {
  if (!isYouTube) return

  // YouTube uses History API for navigation
  // We need to detect when user navigates to a new video
  let lastUrl = location.href

  // Create an observer to watch for URL changes
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      // Wait for the new video player to load
      setTimeout(() => {
        applySpeedToAllVideos(currentSpeed)
      }, 500)
    }
  })

  // Observe changes to the title, which usually changes on navigation
  urlObserver.observe(document.querySelector("title"), { subtree: true, characterData: true, childList: true })
}

// Initialize when page loads
function init() {
  // Get the current website's hostname
  const hostname = window.location.hostname

  // Get the saved speed for this website
  chrome.storage.sync.get([hostname], function (result) {
    if (result[hostname]) {
      currentSpeed = result[hostname]
    }

    // Apply speed to all existing videos
    applySpeedToAllVideos(currentSpeed)

    // Setup observers
    setupVideoObserver()
    setupVideoPlayListener()

    // YouTube-specific handling
    if (isYouTube) {
      setupYouTubeNavObserver()
    }
  })
}

// Run initialization
init()
