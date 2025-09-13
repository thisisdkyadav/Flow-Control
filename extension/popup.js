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
    })
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

  setLastPointButton.addEventListener("click", function () {
    try {
      const newPointValue = parseFloat(newPointInput.value)

      if (isNaN(newPointValue) || newPointValue <= 0) {
        showStatus("Please enter a valid number greater than 0", 3000)
        return
      }

      const infinityIndex = speedRanges.findIndex((r) => r.point === -1)
      if (infinityIndex <= 0) {
        showStatus("Error: Invalid range structure", 3000)
        return
      }

      const lastRegularIndex = infinityIndex - 1

      if (lastRegularIndex > 0 && newPointValue <= speedRanges[lastRegularIndex - 1].point) {
        showStatus(`Value must be greater than ${speedRanges[lastRegularIndex - 1].point}`, 3000)
        return
      }

      speedRanges[lastRegularIndex].point = newPointValue

      saveSpeedRanges()
      renderRanges()

      newPointInput.value = ""

      showStatus("Last breakpoint updated")
    } catch (error) {
      console.error("Error setting last point:", error)
      showStatus("Error updating breakpoint", 3000)
    }
  })

  function renderTimeline() {
    rangeTimeline.innerHTML = ""

    const regularRanges = speedRanges.filter((r) => r.point !== -1)

    if (regularRanges.length === 0) {
      return
    }

    const maxPoint = Math.max(...regularRanges.map((r) => r.point)) || 10

    speedRanges.forEach((range, index) => {
      if (range.point === -1) return

      const position = Math.min(100, Math.max(0, (range.point / maxPoint) * 100))

      const point = document.createElement("div")
      point.className = "range-point"
      point.style.left = `${position}%`
      point.dataset.index = index

      const label = document.createElement("div")
      label.className = "range-point-label"
      label.textContent = `${range.point}m`
      point.appendChild(label)

      rangeTimeline.appendChild(point)

      if (range.point !== 0) {
        makeDraggable(point, index, maxPoint)
      }
    })
  }

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

  function makeDraggable(element, index, maxPoint) {
    element.addEventListener("mousedown", function (e) {
      e.preventDefault()

      const originalPoint = speedRanges[index].point

      function movePoint(event) {
        try {
          const rect = rangeTimeline.getBoundingClientRect()
          const x = event.clientX - rect.left
          let position = Math.max(0, Math.min(x, rect.width)) / rect.width

          let newPoint = Math.round(position * maxPoint * 2) / 2

          const prevPoint = index > 0 ? speedRanges[index - 1].point : 0
          const nextRange = speedRanges.find((r, i) => i > index && r.point !== -1)
          const nextPoint = nextRange ? nextRange.point : maxPoint + 5

          newPoint = Math.max(prevPoint + 0.5, Math.min(newPoint, nextPoint - 0.5))

          element.style.left = `${(newPoint / maxPoint) * 100}%`
          element.querySelector(".range-point-label").textContent = `${newPoint}m`

          speedRanges[index].point = newPoint
        } catch (error) {
          console.error("Error during drag:", error)
          speedRanges[index].point = originalPoint
        }
      }

      function stopMoving() {
        document.removeEventListener("mousemove", movePoint)
        document.removeEventListener("mouseup", stopMoving)
        saveSpeedRanges()
        renderRanges()
      }

      document.addEventListener("mousemove", movePoint)
      document.addEventListener("mouseup", stopMoving)
    })
  }

  function renderRanges() {
    try {
      renderTimeline()

      if (!rangesContainer) {
        console.error("Ranges container not found")
        return
      }

      rangesContainer.innerHTML = ""

      for (let i = 0; i < speedRanges.length - 1; i++) {
        const currentRange = speedRanges[i]
        const nextRange = speedRanges[i + 1]

        const section = document.createElement("div")
        section.className = "range-section"
        if (nextRange.point === -1) {
          section.classList.add("infinity-section")
        }

        const rangeText = nextRange.point === -1 ? `${currentRange.point}+ minutes` : `${currentRange.point} - ${nextRange.point} minutes`

        const deleteButtonHtml = i > 0 && i < speedRanges.length - 2 ? `<button class="delete-range-btn" data-index="${i}" title="Remove breakpoint">&times;</button>` : ""

        section.innerHTML = `
          <div class="range-section-header">
            <span>${rangeText}</span>
            <div class="slider-value">${currentRange.speed.toFixed(2)}x</div>
            ${deleteButtonHtml}
          </div>
          <input type="range" class="speed-range-slider" data-index="${i}"
                min="0.25" max="${MAX_SPEED}" step="0.25" value="${currentRange.speed}">
        `

        rangesContainer.appendChild(section)

        const slider = section.querySelector(".speed-range-slider")
        if (slider) {
          slider.addEventListener("input", function () {
            const speed = parseFloat(this.value)
            section.querySelector(".slider-value").textContent = speed.toFixed(2) + "x"
          })

          slider.addEventListener("change", function () {
            const speed = parseFloat(this.value)
            speedRanges[i].speed = speed
            saveSpeedRanges()
          })
        }

        const deleteButton = section.querySelector(".delete-range-btn")
        if (deleteButton) {
          deleteButton.addEventListener("click", function () {
            const index = parseInt(this.dataset.index)
            removeBreakpoint(index)
          })
        }
      }

      const lastRegularIndex = speedRanges.findIndex((r) => r.point === -1) - 1
      if (lastRegularIndex >= 0 && newPointInput) {
        const lastPoint = speedRanges[lastRegularIndex].point
        newPointInput.placeholder = (lastPoint + 5).toString()
      }
    } catch (error) {
      console.error("Error rendering ranges:", error)
      showStatus("Error rendering ranges. Try reloading.", 3000)
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
