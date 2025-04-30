document.addEventListener("DOMContentLoaded", function () {
  const speedSlider = document.getElementById("speed-slider")
  const sliderValue = document.querySelector(".slider-value")
  const resetButton = document.getElementById("reset-button")
  const applyAllButton = document.getElementById("apply-all-videos")
  const statusElement = document.getElementById("status")

  // Get the current tab's hostname to identify the website
  let currentHost = ""

  // Initialize the slider based on the saved value for the current website
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url)
      currentHost = url.hostname

      // Get the saved speed for this website
      chrome.storage.sync.get([currentHost], function (result) {
        if (result[currentHost]) {
          const savedSpeed = result[currentHost]
          speedSlider.value = savedSpeed
          sliderValue.textContent = savedSpeed + "x"
        }
      })
    }
  })

  // Update the displayed value when the slider changes
  speedSlider.addEventListener("input", function () {
    const speed = parseFloat(this.value)
    sliderValue.textContent = speed.toFixed(2) + "x"
  })

  // Apply the selected speed when slider is changed
  speedSlider.addEventListener("change", function () {
    const speed = parseFloat(this.value)
    saveAndApplySpeed(speed)
  })

  // Reset to 1.0x speed
  resetButton.addEventListener("click", function () {
    speedSlider.value = 1.0
    sliderValue.textContent = "1.0x"
    saveAndApplySpeed(1.0)
  })

  // Apply to all videos on the page
  applyAllButton.addEventListener("click", function () {
    const speed = parseFloat(speedSlider.value)
    saveAndApplySpeed(speed, true)
  })

  // Save the speed for the current website and apply it to videos
  function saveAndApplySpeed(speed, applyToAll = false) {
    if (currentHost) {
      // Save the speed for this website
      const data = {}
      data[currentHost] = speed
      chrome.storage.sync.set(data, function () {
        statusElement.textContent = "Speed saved for " + currentHost
        setTimeout(() => {
          statusElement.textContent = ""
        }, 2000)
      })

      // Apply the speed to the current tab's videos
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "setSpeed", speed: speed, applyToAll: applyToAll })
      })
    }
  }
})
