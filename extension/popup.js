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

  const MAX_SPEED = 4.0
  const MIN_SPEED = 0.1

  let currentHost = ""
  let speedRanges = []
  let activeTab = "simple"
  let isEnabled = true

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const newTab = tab.dataset.tab
      setActiveTab(newTab)
      saveActiveTabState(newTab)
    })
  })

  function setActiveTab(tabName) {
    tabs.forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabName)
    })

    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.toggle("active", content.id === `${tabName}-tab`)
    })

    const isEnabled = tabName !== "off"

    this.isEnabled = isEnabled

    const data = {}
    data[`${currentHost}_enabled`] = isEnabled
    chrome.storage.sync.set(data)

    notifyContentScriptEnabled(isEnabled)

    if (isEnabled && (tabName === "simple" || tabName === "ranges")) {
      notifyContentScript()
    }

    activeTab = tabName
  }

  function saveActiveTabState(tabName) {
    const data = {}
    data[`${currentHost}_active_tab`] = tabName
    chrome.storage.sync.set(data, function () {
      statusElement.textContent = `${tabName === "off" ? "Extension disabled" : tabName === "simple" ? "Simple Speed mode active" : "Range-Based Speed mode active"}`
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)
    })
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
          })
          .catch((error) => {
            console.log("Error sending enabled state to content script:", error)
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
      statusElement.textContent = "Range settings saved"
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)

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
                statusElement.textContent = "Reset to default ranges"
                setTimeout(() => {
                  statusElement.textContent = ""
                }, 2000)
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
      statusElement.textContent = "Error resetting ranges"
    }
  })

  setLastPointButton.addEventListener("click", function () {
    try {
      const newPointValue = parseFloat(newPointInput.value)

      if (isNaN(newPointValue) || newPointValue <= 0) {
        statusElement.textContent = "Please enter a valid number greater than 0"
        return
      }

      const infinityIndex = speedRanges.findIndex((r) => r.point === -1)
      if (infinityIndex <= 0) {
        statusElement.textContent = "Error: Invalid range structure"
        return
      }

      const lastRegularIndex = infinityIndex - 1

      if (lastRegularIndex > 0 && newPointValue <= speedRanges[lastRegularIndex - 1].point) {
        statusElement.textContent = `Value must be greater than ${speedRanges[lastRegularIndex - 1].point}`
        return
      }

      speedRanges[lastRegularIndex].point = newPointValue

      saveSpeedRanges()
      renderRanges()

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

      statusElement.textContent = "Breakpoint removed"
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)
    } catch (error) {
      console.error("Error removing breakpoint:", error)
      statusElement.textContent = "Error removing breakpoint"
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
        slider.addEventListener("input", function () {
          const speed = parseFloat(this.value)
          section.querySelector(".slider-value").textContent = speed.toFixed(2) + "x"
        })

        slider.addEventListener("change", function () {
          const speed = parseFloat(this.value)
          speedRanges[i].speed = speed
          saveSpeedRanges()
        })

        const deleteButton = section.querySelector(".delete-range-btn")
        if (deleteButton) {
          deleteButton.addEventListener("click", function () {
            const index = parseInt(this.dataset.index)
            removeBreakpoint(index)
          })
        }
      }

      const lastRegularIndex = speedRanges.findIndex((r) => r.point === -1) - 1
      if (lastRegularIndex >= 0) {
        const lastPoint = speedRanges[lastRegularIndex].point
        newPointInput.placeholder = (lastPoint + 5).toString()
      }
    } catch (error) {
      console.error("Error rendering ranges:", error)
      statusElement.textContent = "Error rendering ranges. Try reloading."
    }
  }

  addRangeButton.addEventListener("click", function () {
    try {
      const infinityIndex = speedRanges.findIndex((r) => r.point === -1)

      if (infinityIndex === -1 || infinityIndex === 0) {
        statusElement.textContent = "Cannot add breakpoint"
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
      statusElement.textContent = "Error adding breakpoint"
    }
  })

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url)
      currentHost = url.hostname

      chrome.storage.sync.get([currentHost], function (result) {
        if (result[currentHost]) {
          const savedSpeed = result[currentHost]
          speedSlider.value = savedSpeed
          sliderValue.textContent = savedSpeed + "x"
        }
      })

      loadSpeedRanges()

      loadActiveTabState()
    }
  })

  speedSlider.addEventListener("input", function () {
    const speed = parseFloat(this.value)
    sliderValue.textContent = speed.toFixed(2) + "x"
    customSpeedInput.value = ""
  })

  speedSlider.addEventListener("change", function () {
    const speed = parseFloat(this.value)
    saveAndApplySpeed(speed)
  })

  setCustomSpeedButton.addEventListener("click", function () {
    const customSpeed = parseFloat(customSpeedInput.value)
    if (!isNaN(customSpeed) && customSpeed >= MIN_SPEED && customSpeed <= MAX_SPEED * 2) {
      const clampedSpeed = Math.min(Math.max(customSpeed, MIN_SPEED), MAX_SPEED * 2)

      speedSlider.value = clampedSpeed
      sliderValue.textContent = clampedSpeed.toFixed(2) + "x"

      saveAndApplySpeed(clampedSpeed)
      customSpeedInput.value = ""
      statusElement.textContent = `Custom speed ${clampedSpeed.toFixed(2)}x set`
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)
    } else {
      statusElement.textContent = `Invalid speed. Enter between ${MIN_SPEED} and ${MAX_SPEED * 2}.`
      setTimeout(() => {
        statusElement.textContent = ""
      }, 3000)
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

  applyAllButton.addEventListener("click", function () {
    const speed = parseFloat(speedSlider.value)
    saveAndApplySpeed(speed, true)
  })

  function saveAndApplySpeed(speed, applyToAll = false) {
    if (activeTab === "off" || !isEnabled) {
      return
    }

    if (activeTab === "ranges") {
      statusElement.textContent = "Simple speed ignored in Ranges mode"
      setTimeout(() => {
        statusElement.textContent = ""
      }, 2000)
      return
    }

    const validatedSpeed = Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED * 2)

    if (currentHost) {
      const data = {}
      data[currentHost] = validatedSpeed
      chrome.storage.sync.set(data, function () {
        statusElement.textContent = "Speed saved for " + currentHost
        setTimeout(() => {
          statusElement.textContent = ""
        }, 2000)
      })

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs
            .sendMessage(tabs[0].id, {
              action: "setSpeed",
              speed: validatedSpeed,
              applyToAll: applyToAll,
              mode: activeTab,
            })
            .catch((error) => {
              console.log("Could not send message to content script:", error)
            })
        } else {
          console.log("Could not find active tab to send message.")
        }
      })
    }
  }
})
