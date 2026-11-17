import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GameController } from './game-controller.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {
  playing: !reducedMotion,
  speed: 88,
  currentSpeed: reducedMotion ? 0 : 88,
  distance: 0,
  elapsed: 0,
  travel: 0,
  view: 'cinematic',
  mode: 'drive',
  environment: 0,
  orbit: false,
  sound: false,
  ready: false,
};

const atmospheres = [
  { name: 'Golden hour', caption: 'GOLDEN HOUR', top: '#28352f', horizon: '#a9a99a', fog: '#6b796c', ground: '#475146', mountain: '#3e4d43', light: '#ffdcac', fill: '#bbd4e4', exposure: 1.05, intensity: 3.2, sun: '#fff0ce', night: false },
  { name: 'Blue hour', caption: 'AFTER THE SUNSET', top: '#141e32', horizon: '#77849d', fog: '#35465f', ground: '#293441', mountain: '#263449', light: '#c4d8ff', fill: '#849dcd', exposure: 0.9, intensity: 2, sun: '#b4cfff', night: false },
  { name: 'Midnight', caption: 'UNDER THE STARS', top: '#060c17', horizon: '#23364b', fog: '#142332', ground: '#151e26', mountain: '#142330', light: '#bccfff', fill: '#6d8cbb', exposure: 0.75, intensity: 1.5, sun: '#d9eaff', night: true },
];

let renderer, scene, camera, controls, car, carRig, bodyMaterial, keyLight, fillLight;
let road, roadTexture, roadMarkings, roadside, terrainMaterial, mountainMaterial, sky, stars;
let headlightMaterial, taillightMaterial, headlightGlow, oceanMaterial, pmrem;
let gameController, contactShadow;
let cameraTween = null;
let lastFrame = 0;
let lastHud = 0;
let frameHandle = null;
let audio = null;
let toastTimer;
const wheels = [];
const movingProps = [];
const cameraTarget = new THREE.Vector3(0, 0.62, 0);
const cameraViews = {
  cinematic: { position: [6.7, 2.45, -7.1], target: [0, 0.55, 0] },
  side: { position: [8.9, 1.7, 0.35], target: [0, 0.57, 0] },
  chase: { position: [4.8, 2.7, 7.5], target: [0, 0.6, -0.25] },
};

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2600);
}

function updateProgress(value, label) {
  $('#loader-progress').style.width = `${Math.min(100, value)}%`;
  if (label) $('#loader-label').textContent = label;
}

function showError(message) {
  $('#loader').classList.remove('loaded');
  $('#loader .loader-title').textContent = 'Let’s get you back on the road.';
  $('#loader-label').textContent = message;
  if (!$('#retry-button')) {
    const retry = document.createElement('button');
    retry.id = 'retry-button';
    retry.className = 'view-button active';
    retry.style.marginTop = '25px';
    retry.textContent = 'Try again ↗';
    retry.addEventListener('click', () => window.location.reload());
    $('#loader').append(retry);
  }
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, $('#experience').clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('#viewport').append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    cancelAnimationFrame(frameHandle);
    showError('GRAPHICS CONNECTION LOST. PLEASE TRY AGAIN.');
  });
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#6b796c', 35, 155);
  camera = new THREE.PerspectiveCamera(36, window.innerWidth / $('#experience').clientHeight, 0.1, 600);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 15;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  controls.autoRotateSpeed = 0.6;
  controls.target.copy(cameraTarget);
  setView('cinematic', false);

  controls.addEventListener('start', () => {
    cameraTween = null;
    if (state.orbit) {
      state.orbit = false;
      controls.autoRotate = false;
      $('#orbit-button').setAttribute('aria-pressed', 'false');
    }
    $('#interaction-hint').style.opacity = '0';
  });

  const hemisphere = new THREE.HemisphereLight('#e1ebef', '#262b1c', 2.2);
  scene.add(hemisphere);
  keyLight = new THREE.DirectionalLight('#ffdcac', 3.2);
  keyLight.position.set(-5, 9, -7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 35;
  keyLight.shadow.normalBias = 0.035;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.radius = 3;
  scene.add(keyLight);
  fillLight = new THREE.DirectionalLight('#bbd4e4', 1.6);
  fillLight.position.set(5, 4, 3);
  scene.add(fillLight);
  const rim = new THREE.DirectionalLight('#ecf0df', 2.5);
  rim.position.set(-3, 2, 6);
  scene.add(rim);
}

function random(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function asphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#454943';
  ctx.fillRect(0, 0, 512, 512);
  const rand = random(84);
  for (let i = 0; i < 65000; i++) {
    const brightness = 35 + Math.floor(rand() * 60);
    ctx.fillStyle = `rgba(${brightness},${brightness + 2},${brightness},${rand() * 0.55})`;
    ctx.fillRect(rand() * 512, rand() * 512, rand() * 1.5 + 0.5, rand() * 2 + 0.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 90);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function addMesh(geometry, material, position, parent = scene) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function createSky() {
  sky = addMesh(new THREE.SphereGeometry(400, 32, 18), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#28352f') },
      horizon: { value: new THREE.Color('#a9a99a') },
      sunColor: { value: new THREE.Color('#fff0ce') },
      sunDirection: { value: new THREE.Vector3(-0.5, 0.11, 0.85).normalize() },
      night: { value: 0 },
    },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor;
      uniform vec3 sunDirection; uniform float night; varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float height = max(direction.y, 0.0);
        vec3 color = mix(horizon, top, pow(smoothstep(0.0, 0.8, height), 0.5));
        float sunDistance = distance(direction, sunDirection);
        float glow = exp(-sunDistance * 7.0) * 0.25;
        float disc = 1.0 - smoothstep(0.018, 0.024, sunDistance);
        color += sunColor * (glow + disc * 1.8) * (1.0 - night * 0.65);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const rand = random(902);
  const positions = [];
  for (let i = 0; i < 600; i++) {
    const angle = rand() * Math.PI * 2;
    const elevation = rand() * 1.3 + 0.12;
    positions.push(Math.cos(angle) * Math.cos(elevation) * 350, Math.sin(elevation) * 350, Math.sin(angle) * Math.cos(elevation) * 350);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#d2e4ff', size: 0.5, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  scene.add(stars);
}

function createWorld() {
  createSky();
  terrainMaterial = new THREE.MeshStandardMaterial({ color: '#475146', roughness: 1 });
  const ground = addMesh(new THREE.PlaneGeometry(600, 600), terrainMaterial, [0, -0.1, 0]);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  roadTexture = asphaltTexture();
  road = addMesh(new THREE.PlaneGeometry(11.8, 440), new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.83, metalness: 0.07 }), [0, -0.045, 0]);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;

  roadMarkings = new THREE.Group();
  scene.add(roadMarkings);
  const markingMat = new THREE.MeshStandardMaterial({ color: '#c6c9b4', roughness: 0.95, transparent: true, opacity: 0.6 });
  for (const x of [-2, 2]) {
    for (let z = -216; z < 216; z += 9) {
      const stripe = addMesh(new THREE.PlaneGeometry(0.085, 3.6), markingMat, [x, -0.032, z], roadMarkings);
      stripe.rotation.x = -Math.PI / 2;
    }
  }
  for (const x of [-5.5, 5.5]) {
    const stripe = addMesh(new THREE.PlaneGeometry(0.09, 440), markingMat, [x, -0.03, 0]);
    stripe.rotation.x = -Math.PI / 2;
  }

  roadside = new THREE.Group();
  scene.add(roadside);
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: '#a3ada3', roughness: 0.38, metalness: 0.7 });
  const postMat = new THREE.MeshStandardMaterial({ color: '#68766b', roughness: 0.8, metalness: 0.4 });
  const reflectorMaterial = new THREE.MeshStandardMaterial({ color: '#e9c58b', emissive: '#ffb768', emissiveIntensity: 0.6, roughness: 0.4 });
  for (const x of [-6.6, 6.6]) {
    addMesh(new THREE.BoxGeometry(0.09, 0.14, 420), barrierMaterial, [x, 0.58, 0]);
    addMesh(new THREE.BoxGeometry(0.06, 0.055, 420), barrierMaterial, [x, 0.42, 0]);
    for (let z = -210; z < 210; z += 10) {
      addMesh(new THREE.BoxGeometry(0.08, 0.65, 0.08), postMat, [x, 0.25, z], roadside);
      addMesh(new THREE.BoxGeometry(0.1, 0.045, 0.12), reflectorMaterial, [x, 0.65, z], roadside);
    }
  }

  mountainMaterial = new THREE.MeshStandardMaterial({ color: '#3e4d43', roughness: 1, flatShading: true });
  const rand = random(71);
  // Faceted, layered headlands frame the road without hiding the car.
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1;
    const height = 12 + rand() * 28;
    const mountain = addMesh(new THREE.ConeGeometry(16 + rand() * 25, height, 7, 3), mountainMaterial, [side * (32 + rand() * 80), height * 0.29 - 5, (i % 4 < 2 ? 1 : -1) * (40 + rand() * 155)]);
    mountain.rotation.y = rand() * 6;
    mountain.scale.x = 1.5 + rand();
  }

  oceanMaterial = new THREE.MeshStandardMaterial({ color: '#536d66', metalness: 0.65, roughness: 0.24, transparent: true, opacity: 0.82 });
  const ocean = addMesh(new THREE.PlaneGeometry(200, 420), oceanMaterial, [-115, -0.07, 0]);
  ocean.rotation.x = -Math.PI / 2;

  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#535b4c', roughness: 1, flatShading: true });
  const grassMat = new THREE.MeshStandardMaterial({ color: '#546348', roughness: 1, side: THREE.DoubleSide });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const grassGeo = new THREE.ConeGeometry(0.4, 1.3, 4);
  for (let i = 0; i < 75; i++) {
    const side = i % 2 ? 1 : -1;
    const z = rand() * 260 - 80;
    const object = addMesh(i % 3 ? rockGeo : grassGeo, i % 3 ? rockMaterial : grassMat, [side * (8 + rand() * 17), i % 3 ? 0 : 0.1, z]);
    const size = 0.2 + rand() * 0.75;
    object.scale.set(size * (1 + rand()), size * 0.8, size);
    object.rotation.y = rand() * Math.PI;
    movingProps.push(object);
  }

  // A soft contact shadow anchors the tires even on lower-end graphics hardware.
  const shadow = new THREE.TextureLoader().load('./assets/ferrari_ao.png');
  const shadowPlane = addMesh(new THREE.PlaneGeometry(2.65, 5.3), new THREE.MeshBasicMaterial({ map: shadow, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, toneMapped: false }), [0, -0.022, 0]);
  shadowPlane.rotation.x = -Math.PI / 2;
  contactShadow = shadowPlane;
}

async function loadVehicle() {
  const draco = new DRACOLoader();
  draco.setDecoderPath('./vendor/draco/');
  draco.setWorkerLimit(2);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync('./assets/ferrari.glb', (event) => {
    if (event.total) updateProgress(15 + (event.loaded / event.total) * 60, 'SCULPTING EVERY DETAIL');
  });
  car = gltf.scene.children[0];
  carRig = new THREE.Group();
  carRig.add(car);
  scene.add(carRig);
  bodyMaterial = new THREE.MeshPhysicalMaterial({ color: '#aeb9be', metalness: 0.95, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.09, envMapIntensity: 1.3 });
  const detailMaterial = new THREE.MeshStandardMaterial({ color: '#9aa3a9', metalness: 1, roughness: 0.23 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#728992', metalness: 0.15, roughness: 0.08, transparent: true, opacity: 0.8, clearcoat: 1, envMapIntensity: 1.6 });
  car.getObjectByName('body').material = bodyMaterial;
  for (const name of ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim']) {
    const part = car.getObjectByName(name);
    if (part) part.material = detailMaterial;
  }
  const glass = car.getObjectByName('glass');
  if (glass) glass.material = glassMaterial;
  for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
    const wheel = car.getObjectByName(name);
    if (wheel) wheels.push(wheel);
  }
  car.traverse(object => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = false;
      if (object.material?.name?.toLowerCase().includes('glass')) object.castShadow = false;
    }
  });

  headlightMaterial = new THREE.MeshBasicMaterial({ color: '#f2f6e8', toneMapped: false, transparent: true, opacity: 0.85 });
  taillightMaterial = new THREE.MeshBasicMaterial({ color: '#ff3a22', toneMapped: false });
  for (const side of [-1, 1]) {
    // Small light cores reinforce the model's sculpted headlamp assemblies.
    const lightStrip = addMesh(new THREE.BoxGeometry(0.045, 0.018, 0.34), headlightMaterial, [side * 0.72, 0.47, -1.72], carRig);
    lightStrip.rotation.y = side * -0.26;
    const tail = addMesh(new THREE.TorusGeometry(0.068, 0.014, 8, 24), taillightMaterial, [side * 0.72, 0.63, 1.96], carRig);
    tail.rotation.y = 0;
  }
  headlightGlow = new THREE.SpotLight('#e4edff', 0, 24, Math.PI * 0.21, 0.7, 1);
  headlightGlow.position.set(0, 0.6, -1.8);
  headlightGlow.target.position.set(0, 0, -14);
  carRig.add(headlightGlow, headlightGlow.target);
  draco.dispose();
  updateProgress(85, 'FINDING THE PERFECT LIGHT');
}

async function loadEnvironment() {
  const texture = await new RGBELoader().loadAsync('./assets/venice_sunset_1k.hdr');
  texture.mapping = THREE.EquirectangularReflectionMapping;
  pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(texture);
  scene.environment = environment.texture;
  texture.dispose();
  pmrem.dispose();
}

function responsivePosition(position) {
  const mobile = window.innerWidth <= 680;
  const tablet = window.innerWidth <= 1000;
  const distanceFactor = mobile ? 1.58 : tablet ? 1.12 : 1;
  return new THREE.Vector3(...position).multiplyScalar(distanceFactor);
}

function setView(name, animate = true) {
  const preset = cameraViews[name];
  state.view = name;
  const position = responsivePosition(preset.position);
  const target = new THREE.Vector3(...preset.target);
  // Place the vehicle in the open middle of the composition on tall screens.
  if (window.innerWidth <= 680) target.y = 0.95;
  if (animate && !reducedMotion) {
    cameraTween = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), position, target, start: performance.now() };
  } else {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  }
  $$('.view-button[data-view]').forEach(button => {
    const selected = button.dataset.view === name;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setAtmosphere(index, announce = true) {
  state.environment = index;
  const setting = atmospheres[index];
  sky.material.uniforms.top.value.set(setting.top);
  sky.material.uniforms.horizon.value.set(setting.horizon);
  sky.material.uniforms.sunColor.value.set(setting.sun);
  sky.material.uniforms.night.value = setting.night ? 1 : 0;
  scene.fog.color.set(setting.fog);
  terrainMaterial.color.set(setting.ground);
  mountainMaterial.color.set(setting.mountain);
  keyLight.color.set(setting.light);
  keyLight.intensity = setting.intensity;
  fillLight.color.set(setting.fill);
  fillLight.intensity = setting.night ? 1.4 : 1.6;
  renderer.toneMappingExposure = setting.exposure;
  scene.environmentIntensity = setting.night ? 0.4 : 1;
  stars.material.opacity = setting.night ? 0.8 : 0;
  oceanMaterial.color.set(setting.night ? '#172e45' : index === 1 ? '#3b516c' : '#536d66');
  if (headlightGlow) headlightGlow.intensity = setting.night ? 28 : 0;
  $('#environment-caption').textContent = setting.caption;
  $('#environment-name').textContent = setting.name;
  $('#environment-button').setAttribute('aria-label', `Change atmosphere, currently ${setting.name}`);
  $('#environment-button use').setAttribute('href', setting.night ? '#i-moon' : '#i-sun');
  if (announce) toast(`${setting.name}. A whole new feeling.`);
}

function setSpeed(value) {
  state.speed = Math.max(0, Math.min(200, Number(value)));
  $('#speed-slider').value = state.speed;
  $('#speed-slider').style.setProperty('--progress', `${state.speed / 2}%`);
  $('#speed-slider').setAttribute('aria-valuetext', `${state.speed} kilometers per hour`);
  $('#pace-label').textContent = state.speed > 150 ? 'Chasing the horizon.' : state.speed > 100 ? 'Find your freedom.' : state.speed > 40 ? 'A little freedom.' : state.speed > 0 ? 'Take it all in.' : 'Enjoy the moment.';
}

function updatePlayback() {
  const moving = state.playing && state.mode === 'drive';
  $('#play-button').setAttribute('aria-label', moving ? 'Pause driving' : 'Resume driving');
  $('#play-button').setAttribute('aria-pressed', String(!moving));
  $('#play-button use').setAttribute('href', moving ? '#i-pause' : '#i-play');
  $('#scene-status').textContent = state.mode === 'studio' ? 'IN THE STUDIO' : moving && state.speed > 0 ? 'ON THE MOVE' : 'TAKING A MOMENT';
  $$('.route-drawing animateMotion').forEach(element => {
    const svg = element.ownerSVGElement;
    if (moving) svg.unpauseAnimations?.();
    else svg.pauseAnimations?.();
  });
}

function setMode(mode) {
  if (mode === 'game') {
    gameController?.open();
    return;
  }
  if (gameController?.active) {
    gameController.exit(mode);
    return;
  }
  state.mode = mode;
  $('#experience').classList.toggle('studio', mode === 'studio');
  $$('.mode-button').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (mode === 'studio') {
    state.orbit = !reducedMotion;
    controls.autoRotate = state.orbit;
    toast('The studio. Every angle is a good one.');
  } else {
    state.orbit = false;
    controls.autoRotate = false;
    state.playing = true;
    toast('Back on the road.');
  }
  $('#orbit-button').setAttribute('aria-pressed', String(state.orbit));
  updatePlayback();
}

function createEngineAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('Audio is not supported');
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 250;
  filter.Q.value = 0.7;
  const compressor = context.createDynamicsCompressor();
  filter.connect(compressor);
  compressor.connect(master);
  master.connect(context.destination);
  const voices = [1, 2, 3.01, 4.02].map((multiple, i) => {
    const oscillator = context.createOscillator();
    oscillator.type = i % 2 ? 'sine' : 'triangle';
    const gain = context.createGain();
    gain.gain.value = 0.11 / (i + 1);
    oscillator.connect(gain);
    gain.connect(filter);
    oscillator.start();
    return { oscillator, multiple };
  });
  // Filtered noise adds a soft layer of tire and road ambience.
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  const rand = random(42);
  for (let i = 0; i < channel.length; i++) channel[i] = rand() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseGain = context.createGain();
  noiseGain.gain.value = 0.015;
  noise.connect(noiseGain);
  noiseGain.connect(filter);
  noise.start();
  return { context, master, filter, voices, noiseGain };
}

async function toggleSound() {
  try {
    if (!audio) audio = createEngineAudio();
    await audio.context.resume();
    state.sound = !state.sound;
    $('#sound-button').setAttribute('aria-pressed', String(state.sound));
    $('#sound-button').setAttribute('aria-label', state.sound ? 'Mute engine sound' : 'Enable engine sound');
    $('#sound-button use').setAttribute('href', state.sound ? '#i-volume' : '#i-muted');
    toast(state.sound ? 'Sound on. Settle into the drive.' : 'Sound off. A quieter escape.');
  } catch {
    toast('Engine audio is unavailable in this browser.');
  }
}

function resetExperience() {
  if (gameController?.active) {
    gameController.start();
    return;
  }
  state.distance = 0;
  state.travel = 0;
  state.elapsed = 0;
  state.playing = !reducedMotion;
  state.mode = 'drive';
  state.orbit = false;
  controls.autoRotate = false;
  $('#orbit-button').setAttribute('aria-pressed', 'false');
  $('#experience').classList.remove('studio');
  $$('.mode-button').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === 'drive');
    button.setAttribute('aria-pressed', String(button.dataset.mode === 'drive'));
  });
  setSpeed(88);
  setView('cinematic');
  setAtmosphere(0, false);
  $$('.swatch').forEach((button, i) => {
    button.classList.toggle('active', i === 0);
    button.setAttribute('aria-pressed', String(i === 0));
  });
  bodyMaterial.color.set('#aeb9be');
  $('#finish-name').textContent = 'Glacier silver';
  updatePlayback();
  toast('A fresh start. The road is yours.');
}

function bindEvents() {
  $('#speed-slider').addEventListener('input', event => {
    setSpeed(event.target.value);
    updatePlayback();
  });
  $('#play-button').addEventListener('click', () => {
    if (state.mode === 'studio') setMode('drive');
    else {
      state.playing = !state.playing;
      updatePlayback();
    }
  });
  $$('.view-button[data-view]').forEach(button => button.addEventListener('click', () => {
    state.orbit = false;
    controls.autoRotate = false;
    $('#orbit-button').setAttribute('aria-pressed', 'false');
    setView(button.dataset.view);
  }));
  $$('.mode-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $$('.swatch').forEach(button => button.addEventListener('click', () => {
    bodyMaterial.color.set(button.dataset.color);
    $('#finish-name').textContent = button.dataset.name;
    $$('.swatch').forEach(swatch => {
      swatch.classList.toggle('active', swatch === button);
      swatch.setAttribute('aria-pressed', String(swatch === button));
    });
  }));
  $('#environment-button').addEventListener('click', () => setAtmosphere((state.environment + 1) % atmospheres.length));
  $('#orbit-button').addEventListener('click', () => {
    cameraTween = null;
    state.orbit = !state.orbit;
    controls.autoRotate = state.orbit;
    $('#orbit-button').setAttribute('aria-pressed', String(state.orbit));
    toast(state.orbit ? 'Orbit camera on. Take it all in.' : 'Orbit camera off.');
  });
  $('#reset-button').addEventListener('click', resetExperience);
  $('#sound-button').addEventListener('click', toggleSound);
  $('#fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('#experience').requestFullscreen();
    } catch { toast('Fullscreen is unavailable in this browser.'); }
  });
  document.addEventListener('fullscreenchange', () => {
    $('#fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  });
  $('#credits-button').addEventListener('click', () => $('#about-dialog').showModal());
  $('#close-about').addEventListener('click', () => $('#about-dialog').close());
  $('#about-dialog').addEventListener('click', event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  });
  document.addEventListener('keydown', event => {
    if (gameController?.active) return;
    if ($('#about-dialog').open || /INPUT|BUTTON|TEXTAREA|SELECT|A/.test(document.activeElement?.tagName)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      $('#play-button').click();
    } else if (['ArrowRight', 'ArrowLeft'].includes(event.code)) {
      event.preventDefault();
      setSpeed(state.speed + (event.code === 'ArrowRight' ? 5 : -5));
      updatePlayback();
    }
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
      if (audio) audio.context.suspend().catch(() => {});
    } else {
      lastFrame = performance.now();
      if (state.ready && frameHandle === null) frameHandle = requestAnimationFrame(animate);
      if (audio && state.sound) audio.context.resume().catch(() => {});
    }
  });
}

function resize() {
  if (gameController?.active) {
    gameController.resize();
    return;
  }
  camera.aspect = window.innerWidth / $('#experience').clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, $('#experience').clientHeight);
  setView(state.view, false);
}

function animate(now) {
  frameHandle = requestAnimationFrame(animate);
  const dt = Math.min((now - (lastFrame || now)) / 1000, 0.05);
  lastFrame = now;
  const gaming = gameController?.active;
  let driving = state.playing && state.mode === 'drive';
  let meters = 0;
  let braking = false;
  if (gaming) {
    const frame = gameController.update(dt, now);
    meters = frame.meters;
    state.currentSpeed = frame.speed;
    state.distance = frame.distance;
    driving = frame.running;
    braking = frame.braking;
  } else {
    const targetSpeed = driving ? state.speed : 0;
    state.currentSpeed = THREE.MathUtils.damp(state.currentSpeed, targetSpeed, driving ? 2.5 : 6, dt);
    if (state.currentSpeed < 0.05) state.currentSpeed = 0;
    meters = (state.currentSpeed / 3.6) * dt;
    state.distance += meters / 1000;
  }
  state.travel += meters;
  state.elapsed += dt;

  // Everything is tied to distance, so wheel rotation and lane movement agree.
  roadTexture.offset.y = (state.travel / (440 / 90)) % 1;
  roadMarkings.position.z = state.travel % 9;
  roadside.position.z = state.travel % 10;
  for (const wheel of wheels) wheel.rotation.x -= meters / 0.325;
  for (const prop of movingProps) {
    prop.position.z += meters;
    if (prop.position.z > 180) prop.position.z -= 260;
  }
  if (carRig && !gaming) {
    const motion = Math.min(state.currentSpeed / 100, 1.5);
    carRig.position.y = reducedMotion ? 0 : Math.sin(state.elapsed * 9) * 0.002 * motion + Math.sin(state.elapsed * 3.6) * 0.003 * motion;
    carRig.rotation.z = reducedMotion ? 0 : Math.sin(state.elapsed * 1.7) * 0.0015 * motion;
  }
  if (contactShadow && carRig) {
    contactShadow.position.x = carRig.position.x;
    contactShadow.rotation.z = -carRig.rotation.y;
  }
  if (taillightMaterial) taillightMaterial.color.set(braking ? '#ff6a43' : '#ce291c');
  if (cameraTween && !gaming) {
    const t = Math.min((now - cameraTween.start) / 1300, 1);
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.position, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.target, eased);
    if (t >= 1) cameraTween = null;
  }
  if (!gaming) controls.update();

  if (audio && audio.context.state === 'running') {
    const time = audio.context.currentTime;
    const amount = state.currentSpeed / 200;
    const frequency = 34 + amount * 50 + Math.sin(state.elapsed * 11) * 0.35;
    audio.master.gain.setTargetAtTime(state.sound && driving ? 0.5 : 0, time, 0.2);
    audio.filter.frequency.setTargetAtTime(180 + amount * 550, time, 0.2);
    audio.noiseGain.gain.setTargetAtTime(0.008 + amount * 0.04, time, 0.2);
    for (const voice of audio.voices) voice.oscillator.frequency.setTargetAtTime(frequency * voice.multiple, time, 0.15);
  }

  if (now - lastHud > 100) {
    $('#speed-value').textContent = Math.round(state.currentSpeed);
    $('#trip-distance').textContent = state.distance.toFixed(2);
    $('#gear').textContent = state.currentSpeed < 1 ? 'N' : `D${Math.min(7, Math.max(1, Math.ceil(state.currentSpeed / 28)))}`;
    lastHud = now;
  }
  renderer.render(scene, camera);
}

async function init() {
  try {
    createRenderer();
    createWorld();
    updateProgress(12, 'BUILDING THE SCENIC ROUTE');
    // Lighting can fall back to the scene's three physical lights if the HDR fails.
    await Promise.all([
      loadVehicle(),
      loadEnvironment().catch(() => { scene.environment = null; }),
    ]);
    setAtmosphere(0, false);
    bindEvents();
    gameController = new GameController({
      scene, camera, controls, carRig, car, renderer, reducedMotion,
      onEnter() {
        state.mode = 'game';
        state.orbit = false;
        cameraTween = null;
        controls.autoRotate = false;
        $('#experience').classList.remove('studio');
        $$('.mode-button').forEach(button => {
          button.classList.toggle('active', button.dataset.mode === 'game');
          button.setAttribute('aria-pressed', String(button.dataset.mode === 'game'));
        });
      },
      onExit(mode) {
        state.currentSpeed = 0;
        state.distance = 0;
        state.travel = 0;
        setMode(mode);
        setView('cinematic', false);
        resize();
        $(`.mode-button[data-mode="${mode}"]`)?.focus({ preventScroll: true });
      },
    });
    setSpeed(88);
    updatePlayback();
    state.ready = true;
    updateProgress(100, 'THE ROAD IS YOURS');
    renderer.render(scene, camera);
    $('#loader').classList.add('loaded');
    frameHandle = requestAnimationFrame(animate);
  } catch (error) {
    console.error('Unable to start the driving experience:', error);
    showError(renderer ? 'THE VEHICLE COULD NOT LOAD. PLEASE TRY AGAIN.' : 'WEBGL IS REQUIRED. TRY A BROWSER WITH HARDWARE ACCELERATION.');
  }
}

init();
