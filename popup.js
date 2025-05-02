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
  const rangeToggle = document.getElementById("range-toggle")
  const rangeTimeline = document.getElementById("range-timeline")
  const rangesContent = document.getElementById("ranges-content")
  const newPointInput = document.getElementById("new-point-value")
  const setLastPointButton = document.getElementById("set-last-point")

  let currentHost = ""
  let speedRanges = []
  let rangeBasedEnabled = false

  // Tab handling
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"))
      tab.classList.add("active")

      document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.remove("active")
      })
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add("active")
    })
  })

  // Toggle handler for range-based speed
  rangeToggle.addEventListener("change", function () {
    rangeBasedEnabled = this.checked

    // Save the toggle state
    const data = {}
    data[`${currentHost}_range_enabled`] = rangeBasedEnabled
    chrome.storage.sync.set(data)

    // Update UI state
    updateRangesContentVisibility()

    // Notify content script of the toggle state
    notifyContentScript()
  })

  // Update ranges content visibility based on toggle state
  function updateRangesContentVisibility() {
    rangesContent.style.opacity = rangeBasedEnabled ? "1" : "0.5"
    rangesContent.style.pointerEvents = rangeBasedEnabled ? "auto" : "none"
  }

  // Initialize speed ranges from storage
  function loadSpeedRanges() {
    chrome.storage.sync.get([`${currentHost}_ranges`, `${currentHost}_range_enabled`], function (result) {
      // Load toggle state
      rangeBasedEnabled = result[`${currentHost}_range_enabled`] || false
      rangeToggle.checked = rangeBasedEnabled
      updateRangesContentVisibility()

      // Load ranges
      if (result[`${currentHost}_ranges`] && Array.isArray(result[`${currentHost}_ranges`]) && result[`${currentHost}_ranges`].length > 0) {
        speedRanges = result[`${currentHost}_ranges`]
      } else {
        resetToDefaultRanges()
      }

      // Ensure ranges are properly sorted
      sortRanges()

      // Make sure first range starts at 0
      if (speedRanges.length > 0 && speedRanges[0].point !== 0) {
        speedRanges.unshift({ point: 0, speed: 1.0 })
      }

      // Make sure we have at least one range with infinity
      if (!speedRanges.some((range) => range.point === -1)) {
        speedRanges.push({ point: -1, speed: 2.0 })
      }

      renderRanges()
    })
  }

  // Reset to default ranges
  function resetToDefaultRanges() {
    // Default ranges if none exist
    speedRanges = [
      { point: 0, speed: 1.0 },
      { point: 5, speed: 1.25 },
      { point: 10, speed: 1.5 },
      { point: -1, speed: 2.0 }, // -1 is infinity
    ]
    saveSpeedRanges()
  }

  // Sort ranges properly
  function sortRanges() {
    speedRanges.sort((a, b) => {
      // Handle infinity (-1)
      if (a.point === -1) return 1
      if (b.point === -1) return -1
      return a.point - b.point
    })
  }

  // Save speed ranges to storage
  function saveSpeedRanges() {
    // Sort ranges by point value (ascending)
    sortRanges()

    const data = {}
    data[`${currentHost}_ranges`] = speedRanges
    chrome.storage.sync.set(data, function () {
      statusElement.textContent = "Range settings saved"
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)

      notifyContentScript()
    })
  }

  // Notify content script of updates
  function notifyContentScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: "updateRangeConfig",
            enabled: rangeBasedEnabled,
            ranges: speedRanges,
          })
          .catch((error) => {
            console.log("Error sending message to content script:", error)
          })
      }
    })
  }

  // Reset ranges to default - new handler
  resetRangesButton.addEventListener("click", function () {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          // Send message to content script to reset ranges
          chrome.tabs
            .sendMessage(tabs[0].id, {
              action: "resetToDefaults",
            })
            .then((response) => {
              if (response && response.success) {
                // Reload ranges from content script
                loadSpeedRanges()
                statusElement.textContent = "Reset to default ranges"
                setTimeout(() => {
                  statusElement.textContent = ""
                }, 2000)
              }
            })
            .catch((error) => {
              console.error("Error resetting ranges:", error)
              // Fallback: reset locally if communication fails
              resetToDefaultRanges()
              renderRanges()
            })
        }
      })
    } catch (error) {
      console.error("Error in reset handler:", error)
      statusElement.textContent = "Error resetting ranges"
    }
  })

  // Set last breakpoint value manually
  setLastPointButton.addEventListener("click", function () {
    try {
      const newPointValue = parseFloat(newPointInput.value)

      if (isNaN(newPointValue) || newPointValue <= 0) {
        statusElement.textContent = "Please enter a valid number greater than 0"
        return
      }

      // Find the last regular breakpoint and the infinity point
      const infinityIndex = speedRanges.findIndex((r) => r.point === -1)
      if (infinityIndex <= 0) {
        // This shouldn't happen
        statusElement.textContent = "Error: Invalid range structure"
        return
      }

      const lastRegularIndex = infinityIndex - 1

      // Ensure the new point is larger than the previous point
      if (lastRegularIndex > 0 && newPointValue <= speedRanges[lastRegularIndex - 1].point) {
        statusElement.textContent = `Value must be greater than ${speedRanges[lastRegularIndex - 1].point}`
        return
      }

      // Update the last regular point value
      speedRanges[lastRegularIndex].point = newPointValue

      // Save and render
      saveSpeedRanges()
      renderRanges()

      // Clear the input
      newPointInput.value = ""

      statusElement.textContent = "Last breakpoint updated"
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)
    } catch (error) {
      console.error("Error setting last point:", error)
      statusElement.textContent = "Error updating breakpoint"
    }
  })

  // Render timeline with breakpoints
  function renderTimeline() {
    // Clear current timeline
    rangeTimeline.innerHTML = ""

    // Filter out infinity points
    const regularRanges = speedRanges.filter((r) => r.point !== -1)

    if (regularRanges.length === 0) {
      return // No points to render
    }

    // Calculate max point for scaling
    const maxPoint = Math.max(...regularRanges.map((r) => r.point)) || 10 // Fallback to 10 if no points or max is 0

    // Add range points
    speedRanges.forEach((range, index) => {
      if (range.point === -1) return // Skip infinity

      // Calculate position as percentage (ensure it's between 0-100%)
      const position = Math.min(100, Math.max(0, (range.point / maxPoint) * 100))

      const point = document.createElement("div")
      point.className = "range-point"
      point.style.left = `${position}%`
      point.dataset.index = index

      // Add label
      const label = document.createElement("div")
      label.className = "range-point-label"
      label.textContent = `${range.point}m`
      point.appendChild(label)

      // Add delete button for points other than the first (0) and last (infinity)
      // if (range.point !== 0 && index !== 0 && range.point !== -1) {
      //   const deleteButton = document.createElement("div")
      //   deleteButton.className = "delete-point"
      //   deleteButton.innerHTML = "x"
      //   deleteButton.title = "Remove this breakpoint"
      //   deleteButton.addEventListener("click", function (event) {
      //     event.stopPropagation() // Prevent triggering drag
      //     removeBreakpoint(index)
      //   })
      //   point.appendChild(deleteButton)
      // }

      rangeTimeline.appendChild(point)

      // Make point draggable (except for the first point at 0)
      if (range.point !== 0) {
        makeDraggable(point, index, maxPoint)
      }
    })
  }

  // Remove a breakpoint
  function removeBreakpoint(index) {
    // Don't remove first or last (infinity) point
    if (index <= 0 || index >= speedRanges.length - 1 || speedRanges[index].point === -1) {
      return
    }

    try {
      // Remove the breakpoint
      speedRanges.splice(index, 1)

      // Save and render
      saveSpeedRanges()
      renderRanges()

      statusElement.textContent = "Breakpoint removed"
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)
    } catch (error) {
      console.error("Error removing breakpoint:", error)
      statusElement.textContent = "Error removing breakpoint"
    }
  }

  // Make a point draggable
  function makeDraggable(element, index, maxPoint) {
    element.addEventListener("mousedown", function (e) {
      e.preventDefault()

      // Store original position in case we need to revert
      const originalPoint = speedRanges[index].point

      function movePoint(event) {
        try {
          const rect = rangeTimeline.getBoundingClientRect()
          const x = event.clientX - rect.left
          let position = Math.max(0, Math.min(x, rect.width)) / rect.width

          // Calculate new point value
          let newPoint = Math.round(position * maxPoint * 2) / 2 // Round to nearest 0.5

          // Ensure points don't overlap
          const prevPoint = index > 0 ? speedRanges[index - 1].point : 0
          const nextRange = speedRanges.find((r, i) => i > index && r.point !== -1)
          const nextPoint = nextRange ? nextRange.point : maxPoint + 5

          newPoint = Math.max(prevPoint + 0.5, Math.min(newPoint, nextPoint - 0.5))

          // Update position
          element.style.left = `${(newPoint / maxPoint) * 100}%`
          element.querySelector(".range-point-label").textContent = `${newPoint}m`

          // Update range data
          speedRanges[index].point = newPoint
        } catch (error) {
          console.error("Error during drag:", error)
          // Restore original position on error
          speedRanges[index].point = originalPoint
        }
      }

      function stopMoving() {
        document.removeEventListener("mousemove", movePoint)
        document.removeEventListener("mouseup", stopMoving)
        saveSpeedRanges()
        renderRanges() // Re-render everything to ensure consistency
      }

      document.addEventListener("mousemove", movePoint)
      document.addEventListener("mouseup", stopMoving)
    })
  }

  // Render all range sections
  function renderRanges() {
    try {
      // First, render the timeline
      renderTimeline()

      // Then, clear and render the range sections
      rangesContainer.innerHTML = ""

      // Process ranges to create sections
      for (let i = 0; i < speedRanges.length - 1; i++) {
        const currentRange = speedRanges[i]
        const nextRange = speedRanges[i + 1]

        // Create a section between this point and the next
        const section = document.createElement("div")
        section.className = "range-section"
        // Add special class for infinity section
        if (nextRange.point === -1) {
          section.classList.add("infinity-section")
        }

        // Format range text
        const rangeText = nextRange.point === -1 ? `${currentRange.point}+ minutes` : `${currentRange.point} - ${nextRange.point} minutes`

        // Create delete button for this range (except first range)
        const deleteButtonHtml = i > 0 && i < speedRanges.length - 2 ? `<button class="delete-range-btn" data-index="${i}">Remove</button>` : ""

        section.innerHTML = `
          <div class="range-section-header">
            <span>${rangeText}</span>
            <div class="slider-value">${currentRange.speed.toFixed(2)}x</div>
          </div>
          <input type="range" class="speed-range-slider" data-index="${i}" 
                min="0.25" max="3.0" step="0.25" value="${currentRange.speed}">
          ${deleteButtonHtml}
        `

        rangesContainer.appendChild(section)

        // Add event listener for the slider
        const slider = section.querySelector(".speed-range-slider")
        slider.addEventListener("input", function () {
          const speed = parseFloat(this.value)
          section.querySelector(".slider-value").textContent = speed.toFixed(2) + "x"
          speedRanges[i].speed = speed
          saveSpeedRanges()
        })

        // Add event listener for delete button if present
        const deleteButton = section.querySelector(".delete-range-btn")
        if (deleteButton) {
          deleteButton.addEventListener("click", function () {
            const index = parseInt(this.dataset.index)
            removeBreakpoint(index)
          })
        }
      }

      // Update the last point input placeholder to suggest a logical next value
      const lastRegularIndex = speedRanges.findIndex((r) => r.point === -1) - 1
      if (lastRegularIndex >= 0) {
        const lastPoint = speedRanges[lastRegularIndex].point
        newPointInput.placeholder = (lastPoint + 5).toString()
      }
    } catch (error) {
      console.error("Error rendering ranges:", error)
      // Show error in UI
      statusElement.textContent = "Error rendering ranges. Try reloading."
    }
  }

  // Add new breakpoint button handler
  addRangeButton.addEventListener("click", function () {
    try {
      // Find the last non-infinity point
      const infinityIndex = speedRanges.findIndex((r) => r.point === -1)

      if (infinityIndex === -1 || infinityIndex === 0) {
        // No infinity point or it's the first one (should never happen)
        statusElement.textContent = "Cannot add breakpoint"
        return
      }

      const lastRegularIndex = infinityIndex - 1
      const lastRegularPoint = speedRanges[lastRegularIndex].point

      // Insert new breakpoint before infinity
      const newPoint = lastRegularPoint + 5 // 5 minutes later
      speedRanges.splice(infinityIndex, 0, {
        point: newPoint,
        speed: speedRanges[lastRegularIndex].speed, // Copy previous speed
      })

      saveSpeedRanges()
      renderRanges()
    } catch (error) {
      console.error("Error adding breakpoint:", error)
      statusElement.textContent = "Error adding breakpoint"
    }
  })

  // Initialize the current tab's hostname and load settings
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url)
      currentHost = url.hostname

      // Load simple speed setting
      chrome.storage.sync.get([currentHost], function (result) {
        if (result[currentHost]) {
          const savedSpeed = result[currentHost]
          speedSlider.value = savedSpeed
          sliderValue.textContent = savedSpeed + "x"
        }
      })

      // Load range settings
      loadSpeedRanges()
    }
  })

  // Simple speed slider handler
  speedSlider.addEventListener("input", function () {
    const speed = parseFloat(this.value)
    sliderValue.textContent = speed.toFixed(2) + "x"
  })

  speedSlider.addEventListener("change", function () {
    const speed = parseFloat(this.value)
    saveAndApplySpeed(speed)
  })

  // Reset button handler
  resetButton.addEventListener("click", function () {
    speedSlider.value = 1.0
    sliderValue.textContent = "1.0x"
    saveAndApplySpeed(1.0)
  })

  // Apply to all videos button handler
  applyAllButton.addEventListener("click", function () {
    const speed = parseFloat(speedSlider.value)
    saveAndApplySpeed(speed, true)
  })

  // Save and apply speed function
  function saveAndApplySpeed(speed, applyToAll = false) {
    if (currentHost) {
      const data = {}
      data[currentHost] = speed
      chrome.storage.sync.set(data, function () {
        statusElement.textContent = "Speed saved for " + currentHost
        setTimeout(() => {
          statusElement.textContent = ""
        }, 2000)
      })

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "setSpeed",
          speed: speed,
          applyToAll: applyToAll,
        })
      })
    }
  }
})
