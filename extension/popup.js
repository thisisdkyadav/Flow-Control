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
  const SLIDER_MAX = parseFloat(speedSlider.max) || 4.0
  const DEFAULT_CONFIG = { enabled: true, speed: 1.0, holdSpeed: 2.0 }
  const WRITE_DEBOUNCE_MS = 200

  let hostname = ""
  let config = { ...DEFAULT_CONFIG }
  let pendingWriteTimeout = null

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
    speedSlider.value = Math.min(config.speed, SLIDER_MAX)
    sliderValue.textContent = config.speed.toFixed(2) + "x"
    holdingSpeedInput.value = config.holdSpeed.toFixed(2)
    controlsSection.classList.toggle("disabled", !config.enabled)
  }

  function persistConfig() {
    if (!hostname) return

    chrome.storage.sync.set({ [hostname]: config }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Could not save config:", chrome.runtime.lastError.message)
        return
      }
      console.log("Saved config:", hostname, config)
    })
  }

  function persistConfigDebounced() {
    clearTimeout(pendingWriteTimeout)
    pendingWriteTimeout = setTimeout(() => {
      persistConfig()
      pendingWriteTimeout = null
    }, WRITE_DEBOUNCE_MS)
  }

  function notifyContentScript(showIndicator = false) {
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

  function saveConfig(showIndicator = false, { debounceWrite = false } = {}) {
    if (!hostname) return
    if (debounceWrite) {
      persistConfigDebounced()
    } else {
      clearTimeout(pendingWriteTimeout)
      pendingWriteTimeout = null
      persistConfig()
    }

    notifyContentScript(showIndicator)
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
      saveConfig(true, { debounceWrite: true })
    }
  })
  speedSlider.addEventListener("change", () => saveConfig())

  // Custom speed input
  setCustomSpeedBtn.addEventListener("click", () => {
    const speed = parseFloat(customSpeedInput.value)
    if (!isNaN(speed) && speed >= MIN_SPEED && speed <= MAX_SPEED) {
      config.speed = speed
      speedSlider.value = Math.min(speed, SLIDER_MAX)
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
    config = { ...DEFAULT_CONFIG }
    customSpeedInput.value = ""
    updateUI()
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

  window.addEventListener("beforeunload", () => {
    if (pendingWriteTimeout) {
      clearTimeout(pendingWriteTimeout)
      pendingWriteTimeout = null
      persistConfig()
    }
  })
})
