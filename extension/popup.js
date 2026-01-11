document.addEventListener("DOMContentLoaded", function () {
  const speedSlider = document.getElementById("speed-slider")
  const sliderValue = document.querySelector(".slider-value")
  const resetButton = document.getElementById("reset-button")
  const statusElement = document.getElementById("status")
  const tabs = document.querySelectorAll(".tab")
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
  let activeTab = "simple"
  let isEnabled = true

  // Function to show status messages
  function showStatus(message, duration = 2000) {
    console.log("Status: " + message)
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

    if (isEnabled && tabName === "simple") {
      sendSpeedToContentScript(parseFloat(speedSlider.value))
    }

    activeTab = tabName
  }

  function saveActiveTabState(tabName) {
    const data = {}
    data[`${currentHost}_active_tab`] = tabName
    chrome.storage.sync.set(data)
  }

  function loadActiveTabState() {
    chrome.storage.sync.get([`${currentHost}_active_tab`, `${currentHost}_enabled`], function (result) {
      let savedTab = result[`${currentHost}_active_tab`]

      if (!savedTab && typeof result[`${currentHost}_enabled`] === "boolean") {
        savedTab = result[`${currentHost}_enabled`] ? "simple" : "off"
      }

      if (!savedTab || savedTab === "ranges") {
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
            speed: parseFloat(speedSlider.value),
          })
          .catch((error) => {
            console.error("Failed to send enabled state:", error)
          })
      }
    })
  }

  function sendSpeedToContentScript(speed) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: "setSpeed",
            speed: speed,
          })
          .catch((error) => {
            console.error("Failed to send speed update:", error)
          })
      }
    })
  }

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
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]?.url) {
        currentHost = new URL(tabs[0].url).hostname

        loadCurrentSpeed()
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

    const validatedSpeed = Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED * 2)

    // Update UI first
    speedSlider.value = validatedSpeed
    sliderValue.textContent = validatedSpeed.toFixed(2) + "x"

    // Save to storage
    const data = {}
    data[currentHost] = validatedSpeed
    chrome.storage.sync.set(data)

    // Send message to content script
    sendSpeedToContentScript(validatedSpeed)
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
