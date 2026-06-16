# ZoomCast

**Automatic zoom effects for screen recordings — no manual editing required.**

ZoomCast records your screen and tracks every mouse click. On export, it
automatically generates smooth zoom-in and zoom-out animations at each click
position, so your tutorials and demos always look polished.

## Features

- **Auto-zoom** — left click zooms in, right click zooms out
- **2D Export** — FFmpeg zoompan filter, crisp MP4 output
- **3D Cinematic Mode** — Three.js scene with perspective tilt, rounded corners,
  shadow and gradient background (FocuSee-style)
- **Timeline Editor** — drag the playhead, reposition zoom markers, preview in real-time
- **Canvas Settings** — aspect ratio (16:9, 1:1, 4:3, 9:16), background gradients,
  padding, border radius, shadow
- **Cursor Effects** — custom cursor overlays during playback
- **Splash Screen** — DaVinci Resolve-style loading screen on startup

## Built with

Electron · React · Vite · Three.js · FFmpeg · Tailwind CSS

## Installation

Download the latest `ZoomCast-Setup-x.x.x.exe` from
[Releases](../../releases) and run it.

## Development

```bash
npm install
npm run dev

Build installer

npm run build:inno   # requires Inno Setup 6
