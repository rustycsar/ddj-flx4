/* ==========================================================================
   CSAR CREATIVE — 3D CONTROLLER & SKIN SHOWROOM
   Hardware: Pioneer DDJ-Style 2-Channel DJ Controller
   Renderer: Three.js PBR with Studio Environment & Contact Shadows
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';

(function () {
  'use strict';

  // --- State ---
  let scene, camera, renderer, controls, roomEnvTexture;
  let controllerGroup, faceplateMesh, faceplateMaterial;
  let factoryTexture;
  let activeBaseImage = null; // Stores current uploaded image or preset canvas
  let activePresetKey = 'factory';
  const skinTransform = {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    showSilkscreen: true,
    finish: 'satin'
  };
  const interactiveMeshes = [];
  const activePulses = [];
  const spinningPlatters = [];
  const raycaster = new THREE.Raycaster();
  const pointerDownPos = { x: 0, y: 0 };
  let isAutoRotating = true;
  let userIsInteracting = false;
  let resumeRotateTimer = null;
  let activeViewName = 'studio';
  let lastIsPortrait = window.innerWidth < window.innerHeight;
  const currentSkinMeta = { name: 'Factory Satin Black', type: 'Original Finish' };

  // DOM Elements
  const container = document.getElementById('viewport-container');
  const canvas = document.getElementById('webgl-canvas');
  const brandResetBtn = document.getElementById('brand-reset-btn');
  const snapshotBtn = document.getElementById('snapshot-btn');
  const toggleMotionBtn = document.getElementById('toggle-motion-btn');
  const motionDot = document.getElementById('motion-dot');
  const motionLabel = document.getElementById('motion-label');
  const drawer = document.getElementById('skin-drawer');
  const openDrawerBtn = document.getElementById('open-drawer-btn');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const dropzone = document.getElementById('skin-dropzone');
  const fileInput = document.getElementById('skin-file-input');
  const currentSkinNameEl = document.getElementById('current-skin-name');
  const currentSkinTypeEl = document.getElementById('current-skin-type');
  const resetSkinBtn = document.getElementById('reset-skin-btn');
  const exportTemplateBtn = document.getElementById('export-template-btn');
  const finishPills = document.querySelectorAll('.finish-pill[data-finish]');
  const skinScaleInput = document.getElementById('skin-scale-input');
  const skinScaleVal = document.getElementById('skin-scale-val');
  const skinOffsetXInput = document.getElementById('skin-offset-x');
  const skinOffsetXVal = document.getElementById('skin-offset-x-val');
  const skinOffsetYInput = document.getElementById('skin-offset-y');
  const skinOffsetYVal = document.getElementById('skin-offset-y-val');
  const overlayLabelsToggle = document.getElementById('overlay-labels-toggle');
  const toast = document.getElementById('toast');
  const interactionHint = document.getElementById('interaction-hint');
  const hudButtons = document.querySelectorAll('.hud-btn[data-view]');
  const presetCards = document.querySelectorAll('.preset-card[data-preset]');

  // Check prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    isAutoRotating = false;
  }

  // --- Initialize Application ---
  function init() {
    initScene();
    initLighting();
    buildPioneerController();
    initControls();
    initEventListeners();
    updateMotionUI();

    // Check URL parameters for view, preset, or drawer
    const params = new URLSearchParams(window.location.search);
    if (params.get('view')) {
      setCameraView(params.get('view'));
    }
    if (params.get('preset')) {
      const presetKey = params.get('preset');
      if (presetKey !== 'factory') {
        const cvs = generatePresetTexture(presetKey);
        applySkinTexture(cvs, presetKey.toUpperCase() + ' PRESET', 'URL Preset');
        presetCards.forEach(c => c.classList.toggle('active', c.getAttribute('data-preset') === presetKey));
      }
    }
    if (params.has('drawer') && drawer) {
      drawer.classList.add('open');
      if (openDrawerBtn) openDrawerBtn.classList.add('active');
    }

    // Start animation loop
    animate();

    // Fade interaction hint after 6 seconds
    setTimeout(() => {
      if (interactionHint) interactionHint.classList.add('fade-out');
    }, 6000);
  }

  // --- Three.js Scene Setup ---
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    // Initial Studio Hero Angle
    camera.position.set(0, 3.1 * portraitPullback(), 4.4 * portraitPullback());

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // PMREM Studio Environment generator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    roomEnvTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = roomEnvTexture;
  }

  // --- Controlled Studio Lighting ---
  function initLighting() {
    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    // Key Light (Warm soft studio overhead)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(4.5, 7.5, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.radius = 3.5;
    scene.add(keyLight);

    // Fill Light (Cool tint from opposite side)
    const fillLight = new THREE.DirectionalLight(0xb5d0e8, 1.3);
    fillLight.position.set(-6, 4.5, 3);
    scene.add(fillLight);

    // Rim Lights (Edge definition against pure black void)
    const rimLeft = new THREE.DirectionalLight(0xffffff, 1.8);
    rimLeft.position.set(-6, 3.5, -5);
    scene.add(rimLeft);

    const rimRight = new THREE.DirectionalLight(0xcde2ff, 1.6);
    rimRight.position.set(6, 3.5, -5);
    scene.add(rimRight);

    // Soft Studio Ground Contact Shadow
    const shadowGeo = new THREE.PlaneGeometry(7.5, 5.0);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.72 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.01;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Subtle Radial Vignette under controller
    const vignetteGeo = new THREE.PlaneGeometry(8, 6);
    const vignetteCanvas = createVignetteTexture();
    const vignetteMat = new THREE.MeshBasicMaterial({
      map: vignetteCanvas,
      transparent: true,
      depthWrite: false
    });
    const vignettePlane = new THREE.Mesh(vignetteGeo, vignetteMat);
    vignettePlane.rotation.x = -Math.PI / 2;
    vignettePlane.position.y = -0.015;
    scene.add(vignettePlane);
  }

  function createVignetteTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 512;
    cvs.height = 512;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createRadialGradient(256, 256, 60, 256, 256, 250);
    grad.addColorStop(0, 'rgba(18, 18, 22, 0.45)');
    grad.addColorStop(0.5, 'rgba(8, 8, 10, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(cvs);
    return tex;
  }

  // --- Procedural Factory Canvas Texture ---
  function generateFactoryFaceplateTexture() {
    const w = 2048;
    const h = 1128;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');

    // Base dark anodized satin metal
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#191a1d');
    bgGrad.addColorStop(0.5, '#151619');
    bgGrad.addColorStop(1, '#111214');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle brushed metal micro-texture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      const rw = Math.random() * 80 + 20;
      ctx.fillRect(rx, ry, rw, 1);
    }

    // Outer Bevel Edge Frame
    drawSilkscreenOverlay(ctx, w, h);

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  function drawSilkscreenOverlay(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, w - 24, h - 24);

    // Section Vertical Dividers (Deck 1 / Mixer / Deck 2)
    const mixerLeft = w * 0.38;
    const mixerRight = w * 0.62;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(mixerLeft, 30);
    ctx.lineTo(mixerLeft, h - 30);
    ctx.moveTo(mixerRight, 30);
    ctx.lineTo(mixerRight, h - 30);
    ctx.stroke();

    // Brand & Technical Typography
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PIONEER DJ // DDJ-FLX4', w / 2, 70);

    ctx.font = '500 13px ui-monospace, Menlo, Monaco, Consolas, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText('2-CHANNEL PERFORMANCE DJ CONTROLLER // SKIN STUDIO', w / 2, 94);

    // Deck 1 Header
    ctx.textAlign = 'left';
    ctx.font = '700 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('1', 70, 75);

    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText('DECK 1', 110, 68);

    ctx.font = '500 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText('BEAT SYNC / MASTER', 110, 86);

    // Deck 2 Header
    ctx.textAlign = 'right';
    ctx.font = '700 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('2', w - 70, 75);

    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText('DECK 2', w - 110, 68);

    ctx.font = '500 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText('BEAT SYNC / MASTER', w - 110, 86);

    // Jog Wheel Placement Ring Markings
    const jog1X = w * 0.197;
    const jog2X = w * 0.803;
    const jogY = h * 0.48;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(jog1X, jogY, 305, 0, Math.PI * 2);
    ctx.arc(jog2X, jogY, 305, 0, Math.PI * 2);
    ctx.stroke();

    // Mixer Section Markings
    const mixerCenterX = w / 2;
    const ch1X = w * (0.5 - 0.32 / 4.68);
    const ch2X = w * (0.5 + 0.32 / 4.68);

    // Channel labels
    ctx.textAlign = 'center';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('CH 1', ch1X, 145);
    ctx.fillText('CH 2', ch2X, 145);
    ctx.fillText('MASTER', mixerCenterX, 145);

    // EQ Knob Dial Markings aligned with 3D knob Z positions
    const eqLabels = ['TRIM', 'HI', 'MID', 'LOW', 'COLOR FX'];
    const eqZPositions = [-0.75, -0.45, -0.15, 0.15, 0.45];

    eqLabels.forEach((label, idx) => {
      const y = h * (0.5 + eqZPositions[idx] / 2.58);
      drawKnobDial(ctx, ch1X, y, label);
      drawKnobDial(ctx, ch2X, y, label);
    });

    // Master Knob Dial
    drawKnobDial(ctx, mixerCenterX, h * (0.5 - 0.68 / 2.58), 'LEVEL');
    drawKnobDial(ctx, mixerCenterX, h * (0.5 - 0.38 / 2.58), 'HEADPHONES');

    // Fader Scale Markings
    drawFaderScale(ctx, ch1X, h * (0.5 + (0.85 - 0.19) / 2.58), h * (0.38 / 2.58));
    drawFaderScale(ctx, ch2X, h * (0.5 + (0.85 - 0.19) / 2.58), h * (0.38 / 2.58));

    // Crossfader Scale
    drawCrossfaderScale(ctx, mixerCenterX, h * (0.5 + 1.15 / 2.58), w * (0.48 / 4.68));

    // Performance Pad Section Labels
    drawPadLabels(ctx, w * 0.06, h * 0.73, w * 0.26);
    drawPadLabels(ctx, w * 0.68, h * 0.73, w * 0.26);

    // Tempo Slider Scales on outer flanks
    const tempo1X = w * (0.5 + (-1.45 - 0.74) / 4.68);
    const tempo2X = w * (0.5 + (1.45 + 0.74) / 4.68);
    const tempoStartY = h * (0.5 + (-0.05 - 0.375) / 2.58);
    const tempoLen = h * (0.75 / 2.58);
    drawTempoScale(ctx, tempo1X, tempoStartY, tempoLen);
    drawTempoScale(ctx, tempo2X, tempoStartY, tempoLen);
    ctx.restore();
  }

  function drawKnobDial(ctx, x, y, label) {
    ctx.textAlign = 'center';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(label, x, y - 28);

    // Dial arc dots
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 22, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();

    // Center detent tick
    ctx.beginPath();
    ctx.moveTo(x, y - 22);
    ctx.lineTo(x, y - 26);
    ctx.stroke();
  }

  function drawFaderScale(ctx, x, startY, length) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';

    const steps = [10, 8, 6, 4, 2, 0];
    steps.forEach((val, idx) => {
      const y = startY + (idx / (steps.length - 1)) * length;
      ctx.beginPath();
      ctx.moveTo(x - 22, y);
      ctx.lineTo(x - 14, y);
      ctx.moveTo(x + 14, y);
      ctx.lineTo(x + 22, y);
      ctx.stroke();
      ctx.fillText(val.toString(), x - 26, y + 3);
    });
  }

  function drawCrossfaderScale(ctx, x, y, width) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';

    // Center notch
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.stroke();

    // Channel assign markers
    ctx.textAlign = 'left';
    ctx.fillText('A ◄', x - width / 2, y + 4);
    ctx.textAlign = 'right';
    ctx.fillText('► B', x + width / 2, y + 4);
  }

  function drawPadLabels(ctx, startX, y, width) {
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';

    const modes = ['HOT CUE', 'BEAT LOOP', 'SLIP LOOP', 'SAMPLER'];
    const colW = width / 4;
    modes.forEach((mode, i) => {
      ctx.fillText(mode, startX + colW * (i + 0.5), y - 16);
    });
  }

  function drawTempoScale(ctx, x, startY, length) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';

    ctx.fillText('-', x, startY - 10);
    ctx.fillText('+', x, startY + length + 16);

    for (let i = 0; i <= 8; i++) {
      const y = startY + (i / 8) * length;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.stroke();
    }
  }

  // --- Build Realistic 3D Controller ---
  function buildPioneerController() {
    controllerGroup = new THREE.Group();

    // 1. Base Chassis (Satin dark polycarbonate body)
    const baseW = 4.8;
    const baseD = 2.7;
    const baseH = 0.28;

    const chassisGeo = createRoundedBoxGeometry(baseW, baseH, baseD, 0.04, 8);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x111215,
      roughness: 0.65,
      metalness: 0.12
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.18;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    controllerGroup.add(chassis);

    // 4 Corner Rubber Feet
    const footGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x070708, roughness: 0.95 });
    const footOffsets = [
      [-baseW / 2 + 0.25, -baseD / 2 + 0.25],
      [baseW / 2 - 0.25, -baseD / 2 + 0.25],
      [-baseW / 2 + 0.25, baseD / 2 - 0.25],
      [baseW / 2 - 0.25, baseD / 2 - 0.25]
    ];
    footOffsets.forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.015, fz);
      controllerGroup.add(foot);
    });

    // 2. Faceplate (Skin Target Mesh)
    const fpW = 4.68;
    const fpD = 2.58;
    const topSurfaceY = 0.361;

    factoryTexture = generateFactoryFaceplateTexture();

    const faceplateGeo = new THREE.PlaneGeometry(fpW, fpD);
    faceplateGeo.rotateX(-Math.PI / 2);

    faceplateMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.2,
      map: factoryTexture
    });

    faceplateMesh = new THREE.Mesh(faceplateGeo, faceplateMaterial);
    faceplateMesh.position.y = topSurfaceY;
    faceplateMesh.receiveShadow = true;
    controllerGroup.add(faceplateMesh);

    // 3. Dual Jog Wheels (Deck 1 and Deck 2)
    const jog1 = createJogWheel(-1.45, topSurfaceY, -0.05, 0x00e5ff, 1);
    const jog2 = createJogWheel(1.45, topSurfaceY, -0.05, 0xff3d00, 2);
    controllerGroup.add(jog1);
    controllerGroup.add(jog2);

    // 4. Mixer Section (Tactile Hardware)
    buildMixerHardware(controllerGroup, topSurfaceY);

    // 5. Deck Controls (Pads, Play/Cue, Tempo Sliders)
    buildDeckHardware(controllerGroup, topSurfaceY, -1); // Deck 1 (left)
    buildDeckHardware(controllerGroup, topSurfaceY, 1);  // Deck 2 (right)

    // Center and elevate controller slightly
    controllerGroup.position.set(0, 0, 0);
    scene.add(controllerGroup);
  }

  // --- Jog Wheel Construction ---
  function createJogWheel(x, y, z, ringColorHex, deckNum) {
    const jogGroup = new THREE.Group();
    jogGroup.position.set(x, y, z);

    // Outer Knurled Bevel Ring
    const outerRadius = 0.68;
    const outerHeight = 0.055;
    const outerGeo = new THREE.CylinderGeometry(outerRadius, outerRadius + 0.02, outerHeight, 48);
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x1d1f24,
      roughness: 0.45,
      metalness: 0.4
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.position.y = outerHeight / 2;
    outerRing.castShadow = true;
    jogGroup.add(outerRing);

    // Chamfered Aluminum Platter Edge
    const platterRadius = 0.62;
    const platterHeight = 0.02;
    const platterGeo = new THREE.CylinderGeometry(platterRadius, platterRadius, platterHeight, 48);
    const platterMat = new THREE.MeshStandardMaterial({
      color: 0x141518,
      roughness: 0.22,
      metalness: 0.78
    });
    const platter = new THREE.Mesh(platterGeo, platterMat);
    platter.position.y = outerHeight + platterHeight / 2;
    platter.castShadow = true;
    jogGroup.add(platter);

    // Vinyl Top Plate with Micro Concentric Rings
    const vinylRadius = 0.58;
    const vinylGeo = new THREE.CylinderGeometry(vinylRadius, vinylRadius, 0.005, 48);
    const vinylMat = new THREE.MeshStandardMaterial({
      color: 0x0a0b0d,
      roughness: 0.35,
      metalness: 0.3
    });
    const vinyl = new THREE.Mesh(vinylGeo, vinylMat);
    vinyl.position.y = outerHeight + platterHeight + 0.0025;
    jogGroup.add(vinyl);

    // Central Digital Cue Display
    const displayRadius = 0.24;
    const displayHeight = 0.015;
    const displayGeo = new THREE.CylinderGeometry(displayRadius, displayRadius, displayHeight, 36);
    const displayMat = new THREE.MeshStandardMaterial({
      color: 0x050506,
      roughness: 0.08,
      metalness: 0.15
    });
    const display = new THREE.Mesh(displayGeo, displayMat);
    display.position.y = outerHeight + platterHeight + displayHeight / 2 + 0.003;
    jogGroup.add(display);

    // Illuminated Cue Position Ring
    const ringGeo = new THREE.TorusGeometry(0.18, 0.01, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: ringColorHex,
      emissive: ringColorHex,
      emissiveIntensity: 0.85,
      roughness: 0.2
    });
    const cueRing = new THREE.Mesh(ringGeo, ringMat);
    cueRing.rotation.x = Math.PI / 2;
    cueRing.position.y = outerHeight + platterHeight + displayHeight + 0.004;
    jogGroup.add(cueRing);

    // Cue Position Marker Needle
    const needleGeo = new THREE.BoxGeometry(0.015, 0.005, 0.08);
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.9
    });
    const needle = new THREE.Mesh(needleGeo, needleMat);
    needle.position.set(0, outerHeight + platterHeight + displayHeight + 0.005, -0.14);
    jogGroup.add(needle);

    // Register jog wheel for interactive spin and LED pulse
    const spinState = { group: jogGroup, ringMat: ringMat, baseIntensity: 0.85, velocity: 0, deckNum };
    spinningPlatters.push(spinState);
    [outerRing, platter, vinyl, display].forEach(mesh => {
      mesh.userData.interactiveType = 'jog';
      mesh.userData.spinState = spinState;
      mesh.userData.label = `Deck ${deckNum} Jog Platter`;
      interactiveMeshes.push(mesh);
    });

    return jogGroup;
  }

  // --- Mixer Hardware (Knobs, Faders, LEDs) ---
  function buildMixerHardware(parent, baseY) {
    const ch1X = -0.32;
    const ch2X = 0.32;
    const mixerCenterX = 0;

    // Rotary Knobs (Trim, Hi, Mid, Low, Color Filter)
    const eqZPositions = [-0.75, -0.45, -0.15, 0.15, 0.45];
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x18191c,
      roughness: 0.55,
      metalness: 0.25
    });
    const filterKnobMat = new THREE.MeshStandardMaterial({
      color: 0x222428,
      roughness: 0.65,
      metalness: 0.15
    });

    eqZPositions.forEach((z, idx) => {
      const isFilter = (idx === 4);
      const kRadius = isFilter ? 0.075 : 0.062;
      const kHeight = isFilter ? 0.13 : 0.11;
      const mat = isFilter ? filterKnobMat : knobMat;

      // Channel 1 Knob
      createKnob(parent, ch1X, baseY, z, kRadius, kHeight, mat);
      // Channel 2 Knob
      createKnob(parent, ch2X, baseY, z, kRadius, kHeight, mat);
    });

    // Master Volume & Booth Knobs
    createKnob(parent, mixerCenterX, baseY, -0.68, 0.065, 0.11, knobMat);
    createKnob(parent, mixerCenterX, baseY, -0.38, 0.058, 0.10, knobMat);

    // Dual Channel Level Meter LEDs (Stereo ladders between channel strips)
    createLevelMeter(parent, -0.06, baseY + 0.008, 0.0);
    createLevelMeter(parent, 0.06, baseY + 0.008, 0.0);

    // Channel Volume Upfaders
    createFader(parent, ch1X, baseY, 0.85, 0.38, true);
    createFader(parent, ch2X, baseY, 0.85, 0.38, true);

    // Crossfader
    createFader(parent, mixerCenterX, baseY, 1.15, 0.48, false);

    // Headphone Cue Buttons
    createCueButton(parent, ch1X, baseY, 0.62);
    createCueButton(parent, ch2X, baseY, 0.62);
  }

  function createKnob(parent, x, baseY, z, radius, height, material) {
    const knobGroup = new THREE.Group();
    knobGroup.position.set(x, baseY, z);

    // Ribbed cylinder body
    const bodyGeo = new THREE.CylinderGeometry(radius * 0.9, radius, height, 32);
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.y = height / 2;
    body.castShadow = true;
    knobGroup.add(body);

    // White pointer index line
    const lineGeo = new THREE.BoxGeometry(0.008, 0.004, radius * 0.7);
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.6
    });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(0, height + 0.002, -radius * 0.35);
    knobGroup.add(line);

    parent.add(knobGroup);
  }

  function createLevelMeter(parent, x, y, z) {
    const meterGroup = new THREE.Group();
    meterGroup.position.set(x, y, z);

    const numSegs = 7;
    const segW = 0.025;
    const segH = 0.004;
    const segD = 0.018;

    for (let i = 0; i < numSegs; i++) {
      let colorHex = 0x00e676; // green
      if (i >= 4 && i < 6) colorHex = 0xffa000; // amber
      if (i === 6) colorHex = 0xff1744; // red clip

      const segGeo = new THREE.BoxGeometry(segW, segH, segD);
      const segMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: i < 5 ? 0.75 : 0.2, // normal operating level
        roughness: 0.3
      });
      const seg = new THREE.Mesh(segGeo, segMat);
      seg.position.z = (numSegs / 2 - i) * 0.032;
      meterGroup.add(seg);
    }

    parent.add(meterGroup);
  }

  function createFader(parent, x, baseY, z, travelLength, isVertical) {
    const faderGroup = new THREE.Group();
    faderGroup.position.set(x, baseY, z);

    // Recessed track slot
    const slotW = isVertical ? 0.025 : travelLength;
    const slotD = isVertical ? travelLength : 0.025;
    const slotGeo = new THREE.BoxGeometry(slotW, 0.004, slotD);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x060608, roughness: 0.9 });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.y = 0.002;
    faderGroup.add(slot);

    // Tactile Fader Cap
    const capW = isVertical ? 0.09 : 0.045;
    const capH = 0.07;
    const capD = isVertical ? 0.045 : 0.09;
    const capGeo = new THREE.BoxGeometry(capW, capH, capD);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x25272c,
      roughness: 0.35,
      metalness: 0.35
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = capH / 2 + 0.002;
    cap.castShadow = true;

    // Silver index line on top of cap
    const indexLineGeo = new THREE.BoxGeometry(isVertical ? capW * 0.9 : 0.008, 0.003, isVertical ? 0.008 : capD * 0.9);
    const indexLineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.5
    });
    const indexLine = new THREE.Mesh(indexLineGeo, indexLineMat);
    indexLine.position.y = capH / 2 + 0.002;
    cap.add(indexLine);

    faderGroup.add(cap);
    parent.add(faderGroup);
  }

  function createCueButton(parent, x, baseY, z) {
    const btnGeo = new THREE.BoxGeometry(0.08, 0.03, 0.06);
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0x222428,
      emissive: 0xff6600,
      emissiveIntensity: 0.5,
      roughness: 0.4
    });
    const btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.set(x, baseY + 0.015, z);
    btn.castShadow = true;
    parent.add(btn);
  }

  // --- Deck Hardware (Pads, Transport, Pitch Slider) ---
  function buildDeckHardware(parent, baseY, side) {
    // side: -1 for left (Deck 1), +1 for right (Deck 2)
    const deckCenterX = side * 1.45;

    // 8 Performance Pads (2 rows of 4)
    const padW = 0.16;
    const padH = 0.03;
    const padD = 0.13;
    const padGapX = 0.19;
    const padGapZ = 0.16;
    const padStartX = deckCenterX - (padGapX * 1.5);
    const padStartZ = 0.72;

    const padBaseColor = side === -1 ? 0x00b4d8 : 0x9d4edd;
    const deckLabel = side === -1 ? 'Deck 1' : 'Deck 2';

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const padMat = new THREE.MeshStandardMaterial({
          color: 0x222428,
          emissive: padBaseColor,
          emissiveIntensity: 0.35,
          roughness: 0.85
        });
        const padGeo = new THREE.BoxGeometry(padW, padH, padD);
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(
          padStartX + c * padGapX,
          baseY + padH / 2,
          padStartZ + r * padGapZ
        );
        pad.castShadow = true;
        pad.userData.interactiveType = 'pad';
        pad.userData.baseIntensity = 0.35;
        pad.userData.peakIntensity = 2.2;
        pad.userData.targetMat = padMat;
        pad.userData.label = `${deckLabel} Pad ${r * 4 + c + 1}`;
        interactiveMeshes.push(pad);
        parent.add(pad);
      }
    }

    // Circular Transport Buttons (Play/Pause & Cue)
    const btnRadius = 0.11;
    const btnHeight = 0.035;

    // Play / Pause (Bottom outer corner)
    const playX = deckCenterX - side * 0.55;
    const playZ = 1.05;
    createTransportButton(parent, playX, baseY, playZ, btnRadius, btnHeight, 0x00e676, 'PLAY');

    // Cue (Above Play)
    const cueX = playX;
    const cueZ = 0.82;
    createTransportButton(parent, cueX, baseY, cueZ, btnRadius, btnHeight, 0xffab00, 'CUE');

    // Tempo / Pitch Slider (Outer edge of deck)
    const tempoX = deckCenterX + side * 0.74;
    createFader(parent, tempoX, baseY, -0.05, 0.75, true);
  }

  function createTransportButton(parent, x, baseY, z, radius, height, ringColorHex, label) {
    const btnGroup = new THREE.Group();
    btnGroup.position.set(x, baseY, z);

    // Metallic circular button body
    const geo = new THREE.CylinderGeometry(radius, radius, height, 36);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.35,
      metalness: 0.55
    });
    const btn = new THREE.Mesh(geo, mat);
    btn.position.y = height / 2;
    btn.castShadow = true;
    btnGroup.add(btn);

    // Glowing illuminated bezel ring
    const ringGeo = new THREE.TorusGeometry(radius * 0.92, 0.008, 12, 36);
    const ringMat = new THREE.MeshStandardMaterial({
      color: ringColorHex,
      emissive: ringColorHex,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = height + 0.002;
    btnGroup.add(ring);

    const deckSide = x < 0 ? 'Deck 1' : 'Deck 2';
    btn.userData.interactiveType = 'transport';
    btn.userData.baseIntensity = 0.8;
    btn.userData.peakIntensity = 2.6;
    btn.userData.targetMat = ringMat;
    btn.userData.label = `${deckSide} ${label}`;
    btn.userData.deckNum = x < 0 ? 1 : 2;
    btn.userData.isPlay = label === 'PLAY';
    interactiveMeshes.push(btn);

    parent.add(btnGroup);
  }

  // --- Geometry Utility: Rounded Box ---
  function createRoundedBoxGeometry(width, height, depth, radius, smoothness) {
    const shape = new THREE.Shape();
    const eps = 0.00001;
    const radiusMinusEps = radius - eps;

    shape.absarc(-width / 2 + radius, -depth / 2 + radius, radiusMinusEps, Math.PI, 1.5 * Math.PI, true);
    shape.absarc(width / 2 - radius, -depth / 2 + radius, radiusMinusEps, 1.5 * Math.PI, 2 * Math.PI, true);
    shape.absarc(width / 2 - radius, depth / 2 - radius, radiusMinusEps, 0, 0.5 * Math.PI, true);
    shape.absarc(-width / 2 + radius, depth / 2 - radius, radiusMinusEps, 0.5 * Math.PI, Math.PI, true);

    const extrudeSettings = {
      depth: height,
      bevelEnabled: true,
      bevelSegments: smoothness,
      steps: 1,
      bevelSize: radius,
      bevelThickness: radius
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  // --- OrbitControls & Camera Motion ---
  function initControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = isAutoRotating;
    controls.autoRotateSpeed = 0.55; // slow, luxurious product showcase rotation
    controls.minDistance = 1.6;
    controls.maxDistance = 7.5 * portraitPullback();
    controls.maxPolarAngle = Math.PI * 0.48; // clamp above floor
    controls.minPolarAngle = Math.PI * 0.04;

    // Pause auto-rotation when visitor touches/drags
    controls.addEventListener('start', () => {
      userIsInteracting = true;
      clearTimeout(resumeRotateTimer);
    });

    controls.addEventListener('end', () => {
      userIsInteracting = false;
      if (isAutoRotating) {
        resumeRotateTimer = setTimeout(() => {
          // auto-rotate resumes in render loop
        }, 2500);
      }
    });
  }

  // --- Skin Management API & Methods ---
  function buildCompositedSkinCanvas(baseSource) {
    const w = 2048;
    const h = 1128;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');

    // Base dark backing
    ctx.fillStyle = '#121316';
    ctx.fillRect(0, 0, w, h);

    if (baseSource) {
      const scale = skinTransform.scale;
      const drawW = w * scale;
      const drawH = h * scale;
      const dx = (w - drawW) / 2 + (skinTransform.offsetX / 100) * w * 0.5;
      const dy = (h - drawH) / 2 + (skinTransform.offsetY / 100) * h * 0.5;
      ctx.drawImage(baseSource, dx, dy, drawW, drawH);
    }

    if (skinTransform.showSilkscreen) {
      drawSilkscreenOverlay(ctx, w, h);
    }

    return cvs;
  }

  function applySkinTexture(imageOrCanvas, skinName = 'Custom Photoshop Skin', skinType = 'Uploaded Texture', silent = false) {
    let texture;
    if (imageOrCanvas instanceof THREE.Texture) {
      activeBaseImage = imageOrCanvas.image;
      const composited = buildCompositedSkinCanvas(activeBaseImage);
      texture = new THREE.CanvasTexture(composited);
    } else {
      activeBaseImage = imageOrCanvas;
      const composited = buildCompositedSkinCanvas(activeBaseImage);
      texture = new THREE.CanvasTexture(composited);
    }

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    faceplateMaterial.map = texture;
    faceplateMaterial.needsUpdate = true;

    currentSkinMeta.name = skinName;
    currentSkinMeta.type = skinType;
    if (currentSkinNameEl) currentSkinNameEl.textContent = skinName;
    if (currentSkinTypeEl) currentSkinTypeEl.textContent = skinType;

    if (!silent) {
      showToast(`Applied skin: ${skinName}`);
    }
  }

  function refreshActiveSkinTransform() {
    if (!activeBaseImage) {
      // Rebuild from factory base if currently on factory
      activeBaseImage = createFactoryBaseOnlyCanvas();
    }
    applySkinTexture(activeBaseImage, currentSkinMeta.name, currentSkinMeta.type, true);
  }

  function createFactoryBaseOnlyCanvas() {
    const w = 2048;
    const h = 1128;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#191a1d');
    bgGrad.addColorStop(0.5, '#151619');
    bgGrad.addColorStop(1, '#111214');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      const rw = Math.random() * 80 + 20;
      ctx.fillRect(rx, ry, rw, 1);
    }
    return cvs;
  }

  function setSurfaceFinish(finishMode) {
    skinTransform.finish = finishMode;
    finishPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-finish') === finishMode));
    if (!faceplateMaterial) return;

    if (finishMode === 'matte') {
      faceplateMaterial.roughness = 0.72;
      faceplateMaterial.metalness = 0.06;
    } else if (finishMode === 'gloss') {
      faceplateMaterial.roughness = 0.12;
      faceplateMaterial.metalness = 0.25;
    } else {
      // satin anodized default
      faceplateMaterial.roughness = 0.35;
      faceplateMaterial.metalness = 0.2;
    }
    faceplateMaterial.needsUpdate = true;
    showToast(`Surface finish: ${finishMode.toUpperCase()}`);
  }

  function resetTransformControls() {
    skinTransform.scale = 1.0;
    skinTransform.offsetX = 0;
    skinTransform.offsetY = 0;
    if (skinScaleInput) skinScaleInput.value = '100';
    if (skinScaleVal) skinScaleVal.textContent = '100%';
    if (skinOffsetXInput) skinOffsetXInput.value = '0';
    if (skinOffsetXVal) skinOffsetXVal.textContent = '0%';
    if (skinOffsetYInput) skinOffsetYInput.value = '0';
    if (skinOffsetYVal) skinOffsetYVal.textContent = '0%';
  }

  function resetToFactorySkin() {
    activePresetKey = 'factory';
    activeBaseImage = createFactoryBaseOnlyCanvas();
    resetTransformControls();
    applySkinTexture(activeBaseImage, 'Factory Satin Black', 'Original Finish', true);

    presetCards.forEach(c => c.classList.remove('active'));
    const factoryCard = document.querySelector('.preset-card[data-preset="factory"]');
    if (factoryCard) factoryCard.classList.add('active');

    showToast('Restored factory original finish');
  }

  // --- 3D Render Snapshot Exporter ---
  function captureSnapshot() {
    renderer.render(scene, camera);
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const safeName = currentSkinMeta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.download = `ddj-flx4-3d-render-${safeName}.png`;
    link.href = dataUrl;
    link.click();
    showToast('Saved 3D studio render PNG!');
  }

  // --- 1:1 Precision Photoshop UV Blueprint Exporter ---
  function exportPhotoshopGuide() {
    const w = 2048;
    const h = 1128;
    const fpW = 4.68;
    const fpD = 2.58;
    const toU = (x) => (0.5 + x / fpW) * w;
    const toV = (z) => (0.5 + z / fpD) * h;
    const scaleU = (dx) => (dx / fpW) * w;
    const scaleV = (dz) => (dz / fpD) * h;

    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');

    // Guide Background
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, w, h);

    // Subtle 64px UV Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Outer Bleed & Safe Edge
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, w - 28, h - 28);

    // Section Divider Guides (Deck 1 | Mixer | Deck 2)
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.38, 14);
    ctx.lineTo(w * 0.38, h - 14);
    ctx.moveTo(w * 0.62, 14);
    ctx.lineTo(w * 0.62, h - 14);
    ctx.stroke();

    // Header Spec Legend
    ctx.font = '700 18px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#00e5ff';
    ctx.textAlign = 'left';
    ctx.fillText('DDJ-FLX4 — 1:1 UV FACEPLATE SKIN BLUEPRINT (2048 × 1128 PX)', 32, 42);

    ctx.font = '500 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillText('CYAN = SAFE FACEPLATE BOUNDARY & DECK DIVIDERS   |   MAGENTA = 1:1 HARDWARE CUTOUT ZONES', 32, 62);

    // Hardware Cutout Style
    ctx.strokeStyle = '#ff2d55';
    ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.textAlign = 'center';

    // 1. Dual Jog Wheels (x = ±1.45, z = -0.05, r = 0.70)
    [-1.45, 1.45].forEach((jx, idx) => {
      const cx = toU(jx);
      const cy = toV(-0.05);
      const r = scaleU(0.70);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ff2d55';
      ctx.font = '700 14px ui-monospace, monospace';
      ctx.fillText(`JOG WHEEL ${idx + 1} CUTOUT`, cx, cy - 6);
      ctx.font = '500 11px ui-monospace, monospace';
      ctx.fillText(`(Ø ${Math.round(r * 2)} px)`, cx, cy + 12);
      ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
    });

    // 2. Mixer EQ & Filter Knobs (x = ±0.32, z = [-0.75, -0.45, -0.15, 0.15, 0.45])
    const eqLabels = ['TRIM', 'HI', 'MID', 'LOW', 'COLOR FX'];
    const eqZ = [-0.75, -0.45, -0.15, 0.15, 0.45];
    [-0.32, 0.32].forEach((kx) => {
      eqZ.forEach((kz, i) => {
        const cx = toU(kx);
        const cy = toV(kz);
        const kr = scaleU(i === 4 ? 0.08 : 0.066);
        ctx.beginPath();
        ctx.arc(cx, cy, kr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff7b93';
        ctx.font = '600 9px ui-monospace, monospace';
        ctx.fillText(eqLabels[i], cx, cy + 3);
        ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
      });
    });

    // 3. Master Level & Headphones Knobs (x = 0, z = -0.68, -0.38)
    [
      { z: -0.68, label: 'MASTER', r: 0.07 },
      { z: -0.38, label: 'PHONES', r: 0.062 }
    ].forEach((mk) => {
      const cx = toU(0);
      const cy = toV(mk.z);
      const kr = scaleU(mk.r);
      ctx.beginPath();
      ctx.arc(cx, cy, kr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff7b93';
      ctx.font = '600 8px ui-monospace, monospace';
      ctx.fillText(mk.label, cx, cy + 3);
      ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
    });

    // 4. Stereo Level Meters (x = ±0.06, z = 0)
    [-0.06, 0.06].forEach((mx) => {
      const rx = toU(mx - 0.02);
      const ry = toV(-0.12);
      const rw = scaleU(0.04);
      const rh = scaleV(0.24);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    });

    // 5. Headphone Cue Buttons (x = ±0.32, z = 0.62)
    [-0.32, 0.32].forEach((cxPos) => {
      const rx = toU(cxPos - 0.045);
      const ry = toV(0.62 - 0.035);
      const rw = scaleU(0.09);
      const rh = scaleV(0.07);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = '#ff7b93';
      ctx.font = '600 8px ui-monospace, monospace';
      ctx.fillText('CUE', toU(cxPos), toV(0.62) + 3);
      ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
    });

    // 6. Channel Upfaders (x = ±0.32, z = 0.85, travel = 0.38)
    [-0.32, 0.32].forEach((fx, idx) => {
      const rx = toU(fx - 0.05);
      const ry = toV(0.85 - 0.20);
      const rw = scaleU(0.10);
      const rh = scaleV(0.40);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = '#ff7b93';
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.fillText(`CH${idx + 1} FADER`, toU(fx), toV(0.85));
      ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
    });

    // 7. Crossfader (x = 0, z = 1.15, travel = 0.48)
    {
      const rx = toU(-0.26);
      const ry = toV(1.15 - 0.05);
      const rw = scaleU(0.52);
      const rh = scaleV(0.10);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = '#ff7b93';
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.fillText('CROSSFADER CUTOUT', toU(0), toV(1.15) + 3);
      ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
    }

    // 8. Deck 1 & 2 Performance Pads (8 pads per deck), Play/Cue, and Pitch Sliders
    [-1, 1].forEach((side) => {
      const deckCenterX = side * 1.45;
      const padW = 0.16;
      const padD = 0.13;
      const padGapX = 0.19;
      const padGapZ = 0.16;
      const padStartX = deckCenterX - padGapX * 1.5;
      const padStartZ = 0.72;

      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          const px = padStartX + c * padGapX;
          const pz = padStartZ + r * padGapZ;
          const rx = toU(px - padW / 2);
          const ry = toV(pz - padD / 2);
          const rw = scaleU(padW);
          const rh = scaleV(padD);
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = '#ff7b93';
          ctx.font = '600 9px ui-monospace, monospace';
          ctx.fillText(`PAD ${r * 4 + c + 1}`, toU(px), toV(pz) + 3);
          ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
        }
      }

      // Play & Cue Circular Transport Buttons
      const playX = deckCenterX - side * 0.55;
      [
        { z: 0.82, label: 'CUE' },
        { z: 1.05, label: 'PLAY' }
      ].forEach((tb) => {
        const cx = toU(playX);
        const cy = toV(tb.z);
        const tr = scaleU(0.115);
        ctx.beginPath();
        ctx.arc(cx, cy, tr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff7b93';
        ctx.font = '700 10px ui-monospace, monospace';
        ctx.fillText(tb.label, cx, cy + 3);
        ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
      });

      // Pitch / Tempo Slider
      const tempoX = deckCenterX + side * 0.74;
      const rx = toU(tempoX - 0.05);
      const ry = toV(-0.05 - 0.39);
      const rw = scaleU(0.10);
      const rh = scaleV(0.78);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = '#ff7b93';
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.fillText('TEMPO', toU(tempoX), toV(-0.05));
      ctx.fillStyle = 'rgba(255, 45, 85, 0.1)';
    });

    ctx.setLineDash([]);

    // Export as PNG download
    const link = document.createElement('a');
    link.download = 'ddj-flx4-uv-blueprint-2048x1128.png';
    link.href = cvs.toDataURL('image/png');
    link.click();

    showToast('Downloaded 1:1 DDJ-FLX4 UV Blueprint PNG!');
  }

  // --- Preset Skins Generator ---
  function generatePresetTexture(presetKey) {
    const w = 2048;
    const h = 1128;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');

    if (presetKey === 'neon') {
      // Midnight Neon / Cyberpunk VJ Skin
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#060614');
      grad.addColorStop(0.35, '#130429');
      grad.addColorStop(0.7, '#07162c');
      grad.addColorStop(1, '#020b18');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Cyber geometric grid circuit lines
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.32)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const y = 140 + i * 110;
        ctx.moveTo(40, y);
        ctx.lineTo(w - 40, y);
      }
      ctx.stroke();

      // Neon energy rings around jog wheels
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(w * 0.197, h * 0.48, 312, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#d946ef';
      ctx.beginPath();
      ctx.arc(w * 0.803, h * 0.48, 312, 0, Math.PI * 2);
      ctx.stroke();

    } else if (presetKey === 'acid') {
      // Acid / Chromatic Edition
      ctx.fillStyle = '#111113';
      ctx.fillRect(0, 0, w, h);

      // Bold chromatic diagonal stripes
      const colors = ['#ff2d55', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#5856d6'];
      colors.forEach((col, idx) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(idx * 300, 0);
        ctx.lineTo((idx + 1) * 300, 0);
        ctx.lineTo((idx - 1) * 300 + 400, h);
        ctx.lineTo((idx - 2) * 300 + 400, h);
        ctx.closePath();
        ctx.fill();
      });

      // Dark overlay blend to keep contrast
      ctx.fillStyle = 'rgba(10, 10, 14, 0.72)';
      ctx.fillRect(0, 0, w, h);

    } else if (presetKey === 'gold') {
      // Brushed Champagne Gold Luxury Edition
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#1c1a16');
      grad.addColorStop(0.5, '#2e271a');
      grad.addColorStop(1, '#181510');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Gold pinstripes
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(28, 28, w - 56, h - 56);
      ctx.strokeRect(38, 38, w - 76, h - 76);
    }

    return cvs;
  }

  // --- View Presets ---
  function portraitPullback() {
    const aspect = Math.max(window.innerWidth, 1) / Math.max(window.innerHeight, 1);
    if (aspect >= 1.6) return 1;
    return Math.min(3.6, 1.6 / aspect);
  }

  function setCameraView(viewName) {
    hudButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.hud-btn[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    activeViewName = viewName;

    // Base framing, tuned for a wide viewport.
    const views = {
      studio: [0, 3.1, 4.4],   // 3/4 Studio Hero perspective
      top: [0, 4.8, 0.05],     // Top-Down Skin inspection view
      front: [0, 1.2, 3.8],    // Low-slung front angle
      closeup: [0, 2.0, 2.25]  // Mixer & EQ detail close-up
    };
    const base = views[viewName];
    if (!base) return;

    let [x, y, z] = base;
    const pullback = portraitPullback();
    if (pullback > 1) {
      const k = (5.4 * pullback) / Math.hypot(x, y, z);
      x *= k;
      y *= k;
      z *= k;
    }

    animateCameraTo(x, y, z, 0, 0, 0);
  }

  function animateCameraTo(targetX, targetY, targetZ, lookX, lookY, lookZ) {
    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(targetX, targetY, targetZ);
    const startTime = performance.now();
    const duration = 800; // ms

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Smooth cubic ease out
      const ease = 1 - Math.pow(1 - progress, 3);

      camera.position.lerpVectors(startPos, endPos, ease);
      controls.target.set(lookX, lookY, lookZ);
      controls.update();

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // --- Interactive 3D Hardware Raycasting ---
  function onCanvasPointerDown(e) {
    pointerDownPos.x = e.clientX;
    pointerDownPos.y = e.clientY;
  }

  function onCanvasPointerUp(e) {
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) > 6) return; // Ignore orbit drags

    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(interactiveMeshes, false);
    if (!hits.length) return;

    const hitMesh = hits[0].object;
    const info = hitMesh.userData;

    if (info.interactiveType === 'jog' && info.spinState) {
      info.spinState.velocity = 0.14;
      triggerEmissivePulse(info.spinState.ringMat, info.spinState.baseIntensity, 2.4, 550);
      showToast(`${info.label} — Nudge / Spin`);
    } else if (info.interactiveType === 'pad' || info.interactiveType === 'transport') {
      triggerEmissivePulse(info.targetMat, info.baseIntensity, info.peakIntensity, 450);
      if (info.isPlay) {
        const deckJog = spinningPlatters.find(s => s.deckNum === info.deckNum);
        if (deckJog) deckJog.velocity = 0.1;
      }
      showToast(`Triggered ${info.label}`);
    }
  }

  function triggerEmissivePulse(material, baseIntensity, peakIntensity, durationMs) {
    if (!material) return;
    activePulses.push({
      material,
      baseIntensity,
      peakIntensity,
      startTime: performance.now(),
      duration: durationMs
    });
  }

  // --- UI Event Listeners ---
  function initEventListeners() {
    // Window Resize
    window.addEventListener('resize', onWindowResize, false);

    // 3D Hardware Click Interaction
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointerup', onCanvasPointerUp);

    // Brand Badge Reset View
    if (brandResetBtn) {
      brandResetBtn.addEventListener('click', () => setCameraView('studio'));
    }

    // Snapshot Button
    if (snapshotBtn) {
      snapshotBtn.addEventListener('click', captureSnapshot);
    }

    // Motion Toggle Button
    if (toggleMotionBtn) {
      toggleMotionBtn.addEventListener('click', toggleMotion);
    }

    // Keyboard Shortcuts (Space for motion toggle, 1/2/3/4 for views)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleMotion();
      } else if (e.key === '1') {
        setCameraView('studio');
      } else if (e.key === '2') {
        setCameraView('top');
      } else if (e.key === '3') {
        setCameraView('front');
      } else if (e.key === '4') {
        setCameraView('closeup');
      }
    });

    // View Preset HUD Buttons
    hudButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        setCameraView(view);
      });
    });

    // Surface Finish Selector Pills
    finishPills.forEach(pill => {
      pill.addEventListener('click', () => {
        setSurfaceFinish(pill.getAttribute('data-finish'));
      });
    });

    // Skin Scale & Offset Sliders
    if (skinScaleInput) {
      skinScaleInput.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        skinTransform.scale = val / 100;
        if (skinScaleVal) skinScaleVal.textContent = `${val}%`;
        refreshActiveSkinTransform();
      });
    }
    if (skinOffsetXInput) {
      skinOffsetXInput.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        skinTransform.offsetX = val;
        if (skinOffsetXVal) skinOffsetXVal.textContent = `${val}%`;
        refreshActiveSkinTransform();
      });
    }
    if (skinOffsetYInput) {
      skinOffsetYInput.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        skinTransform.offsetY = val;
        if (skinOffsetYVal) skinOffsetYVal.textContent = `${val}%`;
        refreshActiveSkinTransform();
      });
    }
    if (overlayLabelsToggle) {
      overlayLabelsToggle.addEventListener('change', (e) => {
        skinTransform.showSilkscreen = e.target.checked;
        refreshActiveSkinTransform();
      });
    }

    // Skin Drawer Open/Close
    if (openDrawerBtn) {
      openDrawerBtn.addEventListener('click', () => {
        drawer.classList.add('open');
        openDrawerBtn.classList.add('active');
      });
    }

    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener('click', () => {
        drawer.classList.remove('open');
        if (openDrawerBtn) openDrawerBtn.classList.remove('active');
      });
    }

    // Reset Skin Button
    if (resetSkinBtn) {
      resetSkinBtn.addEventListener('click', resetToFactorySkin);
    }

    // Export Photoshop Guide Template
    if (exportTemplateBtn) {
      exportTemplateBtn.addEventListener('click', exportPhotoshopGuide);
    }

    // Preset Selection Cards
    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        presetCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        const presetKey = card.getAttribute('data-preset');
        activePresetKey = presetKey;
        resetTransformControls();
        if (presetKey === 'factory') {
          resetToFactorySkin();
        } else {
          const cvs = generatePresetTexture(presetKey);
          const label = card.querySelector('.preset-label').textContent;
          applySkinTexture(cvs, label, 'Studio Preset');
        }
      });
    });

    // File Upload & Drag-and-Drop
    if (fileInput) {
      fileInput.addEventListener('change', handleFileSelect);
    }

    if (dropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files[0]) {
          processSkinFile(files[0]);
        }
      });
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processSkinFile(file);
  }

  function processSkinFile(file) {
    if (!file.type.match(/^image\//)) {
      showToast('Please upload an image file (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new Image();
      img.onload = function () {
        resetTransformControls();
        applySkinTexture(img, file.name, 'Custom Upload');
        presetCards.forEach(c => c.classList.remove('active'));
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  function toggleMotion() {
    isAutoRotating = !isAutoRotating;
    updateMotionUI();
  }

  function updateMotionUI() {
    if (controls) {
      controls.autoRotate = isAutoRotating;
    }
    if (motionDot && motionLabel && toggleMotionBtn) {
      if (isAutoRotating) {
        motionDot.classList.remove('paused');
        motionLabel.textContent = 'Motion: Slow';
        toggleMotionBtn.setAttribute('aria-label', 'Pause camera rotation (Shortcut: Space)');
      } else {
        motionDot.classList.add('paused');
        motionLabel.textContent = 'Motion: Paused';
        toggleMotionBtn.setAttribute('aria-label', 'Resume camera rotation (Shortcut: Space)');
      }
    }
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);

    if (controls) controls.maxDistance = 7.5 * portraitPullback();

    const isPortrait = width < height;
    if (isPortrait !== lastIsPortrait) {
      lastIsPortrait = isPortrait;
      setCameraView(activeViewName);
    }
  }

  // --- Animation Render Loop ---
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();

    // Update interactive LED pulses
    for (let i = activePulses.length - 1; i >= 0; i--) {
      const p = activePulses[i];
      const t = Math.min((now - p.startTime) / p.duration, 1);
      const decay = 1 - t;
      p.material.emissiveIntensity = p.baseIntensity + (p.peakIntensity - p.baseIntensity) * (decay * decay);
      if (t >= 1) {
        p.material.emissiveIntensity = p.baseIntensity;
        activePulses.splice(i, 1);
      }
    }

    // Update spinning jog platters
    for (let i = 0; i < spinningPlatters.length; i++) {
      const s = spinningPlatters[i];
      if (s.velocity > 0.0005) {
        s.group.rotation.y -= s.velocity;
        s.velocity *= 0.96;
      } else {
        s.velocity = 0;
      }
    }

    // Smooth orbit controls update
    if (controls) {
      controls.autoRotate = isAutoRotating && !userIsInteracting;
      controls.update();
    }

    renderer.render(scene, camera);
  }

  // --- Expose Global API for future tool integration ---
  window.DDJFLX4Studio = {
    applySkin: (source, name) => applySkinTexture(source, name),
    resetToFactory: resetToFactorySkin,
    exportTemplate: exportPhotoshopGuide,
    captureSnapshot: captureSnapshot,
    setSurfaceFinish: setSurfaceFinish,
    toggleMotion: (state) => {
      if (typeof state === 'boolean') isAutoRotating = state;
      else isAutoRotating = !isAutoRotating;
      updateMotionUI();
    },
    setCameraView: setCameraView
  };
  window.CSARController = window.DDJFLX4Studio;

  // Launch once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
