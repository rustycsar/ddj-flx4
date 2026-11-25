# DDJ-FLX4 — 3D Controller Showroom & Custom Skin Studio

Interactive 3D Pioneer DDJ-FLX4 2-channel DJ controller showroom and custom faceplate skin studio built with **Three.js** (PBR studio lighting, procedural textures, and real-time UV faceplate mapping).

## Features

- **Interactive 3D DDJ-FLX4 Model**: Dual illuminated jog wheels, 3-band EQ + Color FX knobs, LED level meters, channel upfaders, crossfader, 16 RGB performance pads, transport buttons, and pitch sliders.
- **Interactive Hardware Feedback**: Click performance pads, transport buttons, or jog wheels directly in the 3D viewport to trigger LED pulses and platter spin boost.
- **Custom Skin Studio**:
  - Drag-and-drop any PNG, JPG, or WEBP skin design directly onto the 3D faceplate.
  - **Live Transform & Finish Controls**: Adjust skin scale, X/Y offset, surface finish (*Matte Vinyl*, *Satin Anodized*, *Gloss Acrylic*), and toggle a hardware silkscreen label overlay on top of custom artwork.
  - **Built-in Studio Presets**: *Factory Satin Black*, *Midnight Neon*, *Acid Chromatic*, and *Brushed Gold*.
  - **1:1 Photoshop UV Blueprint Exporter**: Download a 2048×1128 PNG template with exact hardware cutouts for every jog wheel, knob, fader, pad, and button.
  - **3D Studio Snapshot**: Capture a high-resolution PNG render of your custom-skinned controller from any camera angle.

## Running Locally

Because the app uses ES Modules (`<script type="importmap">`), serve the root folder over any static HTTP server:

```bash
npx serve .
```

## Deployment (Cloudflare Pages)

This project is a zero-build static web application ready for **Cloudflare Pages**:
- **Framework preset**: `None`
- **Build command**: *(leave empty)*
- **Build output directory**: `/` (root)
