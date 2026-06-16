const { desktopCapturer, screen } = require('electron')
const fs = require('fs')
const path = require('path')

let recordingState = null

async function start(outputPath, sourceId, showCursor) {
  // recorder runs in renderer via IPC — this module manages state
  recordingState = {
    outputPath,
    sourceId,
    showCursor,
    startTime: Date.now(),
    resolution: getPrimaryResolution(),
  }
}

async function stop() {
  if (!recordingState) throw new Error('Keine aktive Aufnahme')
  const state = recordingState
  recordingState = null
  return {
    videoPath: state.outputPath,
    recordingStart: state.startTime,
    resolution: state.resolution,
    duration: Date.now() - state.startTime,
  }
}

function getPrimaryResolution() {
  const primary = screen.getPrimaryDisplay()
  return {
    width: primary.size.width * primary.scaleFactor,
    height: primary.size.height * primary.scaleFactor,
  }
}

function getState() {
  return recordingState
}

module.exports = { start, stop, getState }
