document.addEventListener("DOMContentLoaded", function () {
  const speedSlider = document.getElementById("speed-slider")
  const sliderValue = document.querySelector(".slider-value")
  const resetButton = document.getElementById("reset-button")
  const applyAllButton = document.getElementById("apply-all-videos")
  const statusElement = document.getElementById("status")
  const tabs = document.querySelectorAll(".tab")
  const addRangeButton = document.getElementById("add-range-button")
  const resetRangesButton = document.getElementById("reset-ranges-button")
  const rangesContainer = document.getElementById("ranges-container")
  const rangeTimeline = document.getElementById("range-timeline")
  const rangesContent = document.getElementById("ranges-content")
  const newPointInput = document.getElementById("new-point-value")
  const setLastPointButton = document.getElementById("set-last-point")
  const customSpeedInput = document.getElementById("custom-speed-input")
  const setCustomSpeedButton = document.getElementById("set-custom-speed-button")
  const holdingSpeedInput = document.getElementById("holding-speed-input")
  const setHoldingSpeedButton = document.getElementById("set-holding-speed-button")
  const helpButton = document.getElementById("help-button")
  const helpOverlay = document.getElementById("help-overlay")
  const closeHelpButton = document.getElementById("close-help")
  const rangeCountDisplay = document.getElementById("range-count")
  const verticalTimeline = document.getElementById("vertical-timeline")

  const MAX_SPEED = 4.0
  const MIN_SPEED = 0.1

  let currentHost = ""
  let speedRanges = []
  let activeTab = "simple"
  let isEnabled = true

  // Function to show status messages with animation
  function showStatus(message, duration = 2000) {
    // Status messages are disabled, so this function does nothing now
    console.log("Status: " + message) // Log to console instead
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const newTab = tab.dataset.tab
      setActiveTab(newTab)
      saveActiveTabState(newTab)
    })
  })

  // Help modal event listeners
  helpButton.addEventListener("click", () => {
    helpOverlay.classList.add("active")
  })

  closeHelpButton.addEventListener("click", () => {
    helpOverlay.classList.remove("active")
  })

  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) {
      helpOverlay.classList.remove("active")
    }
  })

  function setActiveTab(tabName) {
    // Remove active class from all tabs
    tabs.forEach((t) => {
      t.classList.remove("active")
      if (t.dataset.tab === tabName) {
        t.classList.add("active")
      }
    })

    // Hide all tab contents and show the selected one
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active")
      if (content.id === `${tabName}-tab`) {
        content.classList.add("active")
      }
    })

    const isEnabled = tabName !== "off"
    this.isEnabled = isEnabled

    // Update storage and notify content script
    const data = {}
    data[`${currentHost}_enabled`] = isEnabled
    chrome.storage.sync.set(data)

    notifyContentScriptEnabled(isEnabled)

    if (isEnabled && (tabName === "simple" || tabName === "ranges")) {
      notifyContentScript()
    }

    activeTab = tabName

    // If ranges tab is selected, ensure ranges are rendered
    if (tabName === "ranges") {
      loadSpeedRanges()
    }
  }

  function saveActiveTabState(tabName) {
    const data = {}
    data[`${currentHost}_active_tab`] = tabName
    chrome.storage.sync.set(data)
    // No need to show status message
  }

  function loadActiveTabState() {
    chrome.storage.sync.get([`${currentHost}_active_tab`, `${currentHost}_enabled`], function (result) {
      let savedTab = result[`${currentHost}_active_tab`]

      if (!savedTab && typeof result[`${currentHost}_enabled`] === "boolean") {
        savedTab = result[`${currentHost}_enabled`] ? "simple" : "off"
      }

      if (!savedTab) {
        savedTab = "simple"
      }

      setActiveTab(savedTab)
    })
  }

  function notifyContentScriptEnabled(isEnabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: "setEnabled",
            enabled: isEnabled,
            mode: activeTab,
            speed: activeTab === "simple" ? parseFloat(speedSlider.value) : undefined,
            ranges: activeTab === "ranges" ? speedRanges : undefined,
          })
          .catch((error) => {
            console.error("Failed to send enabled state:", error)
          })
      }
    })
  }

  function updateRangesContentVisibility(isVisible) {
    if (rangesContent) {
      rangesContent.style.opacity = isVisible ? "1" : "0.5"
      rangesContent.style.pointerEvents = isVisible ? "auto" : "none"
    }
  }

  function loadSpeedRanges() {
    chrome.storage.sync.get([`${currentHost}_ranges`], function (result) {
      if (result[`${currentHost}_ranges`] && Array.isArray(result[`${currentHost}_ranges`]) && result[`${currentHost}_ranges`].length > 0) {
        speedRanges = result[`${currentHost}_ranges`]
      } else {
        resetToDefaultRanges()
      }

      sortRanges()

      if (speedRanges.length > 0 && speedRanges[0].point !== 0) {
        speedRanges.unshift({ point: 0, speed: 1.0 })
      }

      if (!speedRanges.some((range) => range.point === -1)) {
        speedRanges.push({ point: -1, speed: 2.0 })
      }

      renderRanges()
      updateRangeCount()
    })
  }

  function resetToDefaultRanges() {
    speedRanges = [
      { point: 0, speed: 1.0 },
      { point: 5, speed: 1.5 },
      { point: -1, speed: 1.5 },
    ]
    if (speedRanges.length >= 2) {
      speedRanges[speedRanges.length - 1].speed = speedRanges[speedRanges.length - 2].speed
    }
    saveSpeedRanges()
    updateRangeCount()
  }

  function sortRanges() {
    speedRanges.sort((a, b) => {
      if (a.point === -1) return 1
      if (b.point === -1) return -1
      return a.point - b.point
    })
  }

  function saveSpeedRanges() {
    sortRanges()

    const data = {}
    data[`${currentHost}_ranges`] = speedRanges
    chrome.storage.sync.set(data, function () {
      showStatus("Range settings saved")
      notifyContentScript()
      updateRangeCount()
    })
  }

  function updateRangeCount() {
    if (rangeCountDisplay) {
      const count = speedRanges.filter(r => r.point !== -1).length
      rangeCountDisplay.textContent = `${count} ranges`
    }
  }

  function notifyContentScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: "updateRangeConfig",
            enabled: activeTab === "ranges",
            ranges: speedRanges,
          })
          .catch((error) => {
            console.log("Error sending message to content script:", error)
          })
      }
    })
  }

  resetRangesButton.addEventListener("click", function () {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs
            .sendMessage(tabs[0].id, {
              action: "resetToDefaults",
            })
            .then((response) => {
              if (response && response.success) {
                loadSpeedRanges()
                showStatus("Reset to default ranges")
              }
            })
            .catch((error) => {
              console.error("Error resetting ranges:", error)
              resetToDefaultRanges()
              renderRanges()
            })
        }
      })
    } catch (error) {
      console.error("Error in reset handler:", error)
      showStatus("Error resetting ranges", 3000)
    }
  })

  // Remove old setLastPointButton listener - no longer needed with vertical timeline

  function removeBreakpoint(index) {
    if (index <= 0 || index >= speedRanges.length - 1 || speedRanges[index].point === -1) {
      return
    }

    try {
      speedRanges.splice(index, 1)

      saveSpeedRanges()
      renderRanges()

      showStatus("Breakpoint removed")
    } catch (error) {
      console.error("Error removing breakpoint:", error)
      showStatus("Error removing breakpoint", 3000)
    }
  }

  function renderRanges() {
    try {
      if (!verticalTimeline) {
        console.error("Vertical timeline container not found")
        return
      }

      verticalTimeline.innerHTML = ""

      // Calculate container height based on number of ranges
      const segmentHeight = 100
      const containerHeight = Math.max(400, speedRanges.length * segmentHeight + 80)
      verticalTimeline.style.height = `${containerHeight}px`

      // Create the timeline bar
      const timelineBar = document.createElement("div")
      timelineBar.className = "timeline-bar"
      timelineBar.style.height = `${containerHeight - 80}px`
      verticalTimeline.appendChild(timelineBar)

      // Generate timeline segments for each range
      speedRanges.forEach((currentRange, i) => {
        const isInfinity = currentRange.point === -1

        // Create timeline segment
        const segment = document.createElement("div")
        segment.className = "timeline-segment"
        segment.style.position = "absolute"
        segment.style.top = `${i * segmentHeight + 40}px`
        segment.style.width = "100%"
        segment.style.height = `${segmentHeight}px`

        // Create breakpoint dot
        const breakpoint = document.createElement("div")
        breakpoint.className = `breakpoint ${isInfinity ? 'infinity' : ''}`
        if (!isInfinity) {
          breakpoint.addEventListener("click", () => editTimepoint(i))
        }

        // Create time control (for non-infinity points)
        if (!isInfinity) {
          const timeControl = document.createElement("div")
          timeControl.className = "time-control"
          
          const timeInput = document.createElement("input")
          timeInput.type = "number"
          timeInput.min = "0"
          timeInput.step = "1"
          timeInput.value = currentRange.point
          timeInput.placeholder = "0"
          timeInput.addEventListener("change", function() {
            updateBreakpointTime(i, parseFloat(this.value) || 0)
          })
          
          const timeLabel = document.createElement("span")
          timeLabel.className = "label"
          timeLabel.textContent = "min"
          
          timeControl.appendChild(timeInput)
          timeControl.appendChild(timeLabel)
          segment.appendChild(timeControl)
        }

        // Create speed control
        const speedControl = document.createElement("div")
        speedControl.className = "speed-control"
        
        const speedInput = document.createElement("input")
        speedInput.type = "number"
        speedInput.min = "0.1"
        speedInput.max = "8.0"
        speedInput.step = "0.1"
        speedInput.value = currentRange.speed.toFixed(1)
        speedInput.placeholder = "1.0"
        speedInput.addEventListener("change", function() {
          updateRangeSpeed(i, parseFloat(this.value) || 1.0)
        })
        
        const speedLabel = document.createElement("span")
        speedLabel.className = "label"
        speedLabel.textContent = "×"
        
        speedControl.appendChild(speedInput)
        speedControl.appendChild(speedLabel)

        // Create range label
        const rangeLabel = document.createElement("div")
        rangeLabel.className = `range-label ${isInfinity ? 'infinity' : ''}`
        if (isInfinity) {
          rangeLabel.textContent = "∞ Beyond last breakpoint"
        } else if (i === 0) {
          rangeLabel.textContent = `0 - ${currentRange.point} min`
        } else {
          const prevPoint = speedRanges[i-1]?.point || 0
          rangeLabel.textContent = `${prevPoint} - ${currentRange.point} min`
        }

        // Add remove button for non-first, non-infinity ranges
        if (i > 0 && !isInfinity) {
          const removeBtn = document.createElement("button")
          removeBtn.className = "remove-breakpoint-btn"
          removeBtn.innerHTML = '<i class="bi bi-x"></i>'
          removeBtn.title = "Remove breakpoint"
          removeBtn.addEventListener("click", () => removeBreakpoint(i))
          segment.appendChild(removeBtn)
        }

        segment.appendChild(breakpoint)
        segment.appendChild(speedControl)
        segment.appendChild(rangeLabel)
        verticalTimeline.appendChild(segment)
      })

      // Add infinity fade effect
      const infinityFade = document.createElement("div")
      infinityFade.className = "infinity-fade"
      infinityFade.style.top = `${(speedRanges.length - 1) * segmentHeight + 20}px`
      verticalTimeline.appendChild(infinityFade)

      updateRangeCount()

    } catch (error) {
      console.error("Error rendering vertical timeline:", error)
      showStatus("Error rendering timeline. Try reloading.", 3000)
    }
  }

  function updateBreakpointTime(index, newTime) {
    if (index === 0 || newTime <= 0) return // Can't change first breakpoint or set negative time
    
    // Validate time is greater than previous and less than next
    const prevTime = index > 0 ? speedRanges[index - 1].point : 0
    const nextRange = speedRanges[index + 1]
    const nextTime = nextRange && nextRange.point !== -1 ? nextRange.point : Infinity
    
    if (newTime > prevTime && newTime < nextTime) {
      speedRanges[index].point = newTime
      saveSpeedRanges()
      renderRanges()
    } else {
      // Reset to original value if invalid
      renderRanges()
      showStatus("Invalid time range", 2000)
    }
  }

  function updateRangeSpeed(index, newSpeed) {
    if (newSpeed >= 0.1 && newSpeed <= 8.0) {
      speedRanges[index].speed = newSpeed
      saveSpeedRanges()
    } else {
      renderRanges() // Reset to original value
      showStatus("Speed must be between 0.1x and 8.0x", 2000)
    }
  }

  function editTimepoint(index) {
    // Allow inline editing of timepoint
    const timeControl = document.querySelector(`.timeline-segment:nth-child(${index + 2}) .time-control input`)
    if (timeControl) {
      timeControl.focus()
      timeControl.select()
    }
  }

  addRangeButton.addEventListener("click", function () {
    try {
      const infinityIndex = speedRanges.findIndex((r) => r.point === -1)

      if (infinityIndex === -1 || infinityIndex === 0) {
        showStatus("Cannot add breakpoint", 3000)
        return
      }

      const lastRegularIndex = infinityIndex - 1
      const lastRegularPoint = speedRanges[lastRegularIndex].point

      const newPoint = lastRegularPoint + 5
      speedRanges.splice(infinityIndex, 0, {
        point: newPoint,
        speed: speedRanges[lastRegularIndex].speed,
      })

      saveSpeedRanges()
      renderRanges()
    } catch (error) {
      console.error("Error adding breakpoint:", error)
      showStatus("Error adding breakpoint", 3000)
    }
  })

  function loadHoldingSpeed() {
    if (!currentHost) return

    chrome.storage.sync.get([`${currentHost}_holding_speed`], function (result) {
      if (result[`${currentHost}_holding_speed`]) {
        const savedSpeed = parseFloat(result[`${currentHost}_holding_speed`])
        if (!isNaN(savedSpeed)) {
          holdingSpeedInput.value = savedSpeed.toFixed(2)
        }
      }
    })
  }

  function init() {
    console.log("currentHost", currentHost)
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]?.url) {
        currentHost = new URL(tabs[0].url).hostname

        loadCurrentSpeed()
        loadSpeedRanges()
        loadActiveTabState()
        loadHoldingSpeed()
      }
    })
  }

  setHoldingSpeedButton.addEventListener("click", function () {
    if (!currentHost) return

    const holdingSpeed = parseFloat(holdingSpeedInput.value)
    if (!isNaN(holdingSpeed) && holdingSpeed >= MIN_SPEED && holdingSpeed <= MAX_SPEED * 2) {
      const clampedSpeed = Math.min(Math.max(holdingSpeed, MIN_SPEED), MAX_SPEED * 2)

      chrome.storage.sync.set({
        [`${currentHost}_holding_speed`]: clampedSpeed,
      })

      holdingSpeedInput.value = clampedSpeed.toFixed(2)
      showStatus(`Holding speed set to ${clampedSpeed.toFixed(2)}x`)
    } else {
      showStatus(`Invalid speed. Enter between ${MIN_SPEED} and ${MAX_SPEED * 2}.`, 3000)
    }
  })

  holdingSpeedInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      event.preventDefault()
      setHoldingSpeedButton.click()
    }
  })

  init()

  speedSlider.addEventListener("input", function () {
    const speed = parseFloat(this.value)
    if (!isNaN(speed)) {
      sliderValue.textContent = speed.toFixed(2) + "x"
      saveAndApplySpeed(speed)
    }
  })

  setCustomSpeedButton.addEventListener("click", function () {
    const customSpeed = parseFloat(customSpeedInput.value)
    if (!isNaN(customSpeed) && customSpeed >= MIN_SPEED && customSpeed <= MAX_SPEED * 2) {
      const clampedSpeed = Math.min(Math.max(customSpeed, MIN_SPEED), MAX_SPEED * 2)

      speedSlider.value = clampedSpeed
      sliderValue.textContent = clampedSpeed.toFixed(2) + "x"

      saveAndApplySpeed(clampedSpeed)
      customSpeedInput.value = ""
      showStatus(`Custom speed ${clampedSpeed.toFixed(2)}x set`)
    } else {
      showStatus(`Invalid speed. Enter between ${MIN_SPEED} and ${MAX_SPEED * 2}.`, 3000)
    }
  })

  customSpeedInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      event.preventDefault()
      setCustomSpeedButton.click()
    }
  })

  resetButton.addEventListener("click", function () {
    speedSlider.value = 1.0
    sliderValue.textContent = "1.0x"
    customSpeedInput.value = ""
    saveAndApplySpeed(1.0)
  })

  function saveAndApplySpeed(speed) {
    if (!currentHost || activeTab === "off" || !isEnabled) {
      return
    }

    if (activeTab === "ranges") {
      showStatus("Simple speed ignored in Ranges mode")
      return
    }

    const validatedSpeed = Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED * 2)

    // Update UI first
    speedSlider.value = validatedSpeed
    sliderValue.textContent = validatedSpeed.toFixed(2) + "x"

    // Save to storage
    const data = {}
    data[currentHost] = validatedSpeed
    chrome.storage.sync.set(data)

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: "setSpeed",
            speed: validatedSpeed,
          })
          .catch((error) => {
            console.error("Failed to send speed update:", error)
          })
      }
    })
  }

  function loadCurrentSpeed() {
    if (!currentHost) return
    chrome.storage.sync.get([currentHost], function (result) {
      if (result[currentHost]) {
        const savedSpeed = parseFloat(result[currentHost])
        if (!isNaN(savedSpeed)) {
          speedSlider.value = savedSpeed
          sliderValue.textContent = savedSpeed.toFixed(2) + "x"
        }
      }
    })
  }
})
