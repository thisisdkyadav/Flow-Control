// Flow Control - Popup Script
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const enabledToggle = document.getElementById("enabled-toggle")
  const speedSlider = document.getElementById("speed-slider")
  const sliderValue = document.querySelector(".slider-value")
  const customSpeedInput = document.getElementById("custom-speed-input")
  const setCustomSpeedBtn = document.getElementById("set-custom-speed-button")
  const holdingSpeedInput = document.getElementById("holding-speed-input")
  const setHoldingSpeedBtn = document.getElementById("set-holding-speed-button")
  const resetButton = document.getElementById("reset-button")
  const helpButton = document.getElementById("help-button")
  const helpOverlay = document.getElementById("help-overlay")
  const closeHelpBtn = document.getElementById("close-help")
  const controlsSection = document.getElementById("controls-section")

  const MAX_SPEED = 8.0
  const MIN_SPEED = 0.1

  let hostname = ""
  let config = { enabled: true, speed: 1.0, holdSpeed: 2.0 }

  // Initialize
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.url) {
      try {
        hostname = new URL(tabs[0].url).hostname
        loadConfig()
      } catch (e) {
        console.error("Invalid URL:", e)
      }
    }
  })

  function loadConfig() {
    if (!hostname) return
    chrome.storage.sync.get([hostname], result => {
      if (result[hostname]) {
        config = { ...config, ...result[hostname] }
      }
      updateUI()
    })
  }

  function updateUI() {
    enabledToggle.checked = config.enabled
    speedSlider.value = Math.min(config.speed, 4.0)
    sliderValue.textContent = config.speed.toFixed(2) + "x"
    holdingSpeedInput.value = config.holdSpeed.toFixed(2)
    controlsSection.classList.toggle("disabled", !config.enabled)
  }

  function saveConfig(showIndicator = false) {
    if (!hostname) return
    
    // Save to storage
    chrome.storage.sync.set({ [hostname]: config }, () => {
      console.log("Saved config:", hostname, config)
    })
    
    // Send message to content script for immediate feedback
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "applySpeed",
          config: config,
          showIndicator: showIndicator
        }).catch(err => {
          console.log("Could not send message:", err.message)
        })
      }
    })
  }

  // Toggle enabled/disabled
  enabledToggle.addEventListener("change", () => {
    config.enabled = enabledToggle.checked
    controlsSection.classList.toggle("disabled", !config.enabled)
    saveConfig()
  })

  // Speed slider
  speedSlider.addEventListener("input", () => {
    const speed = parseFloat(speedSlider.value)
    if (!isNaN(speed)) {
      config.speed = speed
      sliderValue.textContent = speed.toFixed(2) + "x"
      saveConfig(true)
    }
  })

  // Custom speed input
  setCustomSpeedBtn.addEventListener("click", () => {
    const speed = parseFloat(customSpeedInput.value)
    if (!isNaN(speed) && speed >= MIN_SPEED && speed <= MAX_SPEED) {
      config.speed = speed
      speedSlider.value = Math.min(speed, 4.0)
      sliderValue.textContent = speed.toFixed(2) + "x"
      customSpeedInput.value = ""
      saveConfig(true)
    }
  })

  customSpeedInput.addEventListener("keypress", e => {
    if (e.key === "Enter") setCustomSpeedBtn.click()
  })

  // Holding speed input
  setHoldingSpeedBtn.addEventListener("click", () => {
    const speed = parseFloat(holdingSpeedInput.value)
    if (!isNaN(speed) && speed >= MIN_SPEED && speed <= MAX_SPEED) {
      config.holdSpeed = speed
      holdingSpeedInput.value = speed.toFixed(2)
      saveConfig()
    }
  })

  holdingSpeedInput.addEventListener("keypress", e => {
    if (e.key === "Enter") setHoldingSpeedBtn.click()
  })

  // Reset button
  resetButton.addEventListener("click", () => {
    config.speed = 1.0
    speedSlider.value = 1.0
    sliderValue.textContent = "1.00x"
    customSpeedInput.value = ""
    saveConfig(true)
  })

  // Help modal
  helpButton.addEventListener("click", () => helpOverlay.classList.add("active"))
  closeHelpBtn.addEventListener("click", () => helpOverlay.classList.remove("active"))
  helpOverlay.addEventListener("click", e => {
    if (e.target === helpOverlay) helpOverlay.classList.remove("active")
  })

  // Listen for storage changes (when content script updates speed via keyboard)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[hostname]) {
      const newConfig = changes[hostname].newValue
      if (newConfig) {
        config = { ...config, ...newConfig }
        updateUI()
      }
    }
  })
})
