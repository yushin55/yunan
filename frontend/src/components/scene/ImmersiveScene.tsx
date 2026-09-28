import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { LoungePlayer, LoungeSceneProps } from "./LoungeScene";
import "./ImmersiveScene.css";

type Avatar = {
  uid: string;
  root: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  halo: THREE.Mesh;
  label: THREE.Vector3;
  index: number;
};

const DEMO_PLAYERS: LoungePlayer[] = [
  { uid: "demo-1", nickname: "루카", color: "#a56b53" },
  { uid: "demo-2", nickname: "올리브", color: "#7e987c" },
  { uid: "demo-3", nickname: "모카", color: "#b88f6e" },
  { uid: "demo-4", nickname: "니나", color: "#667f9c" },
  { uid: "demo-5", nickname: "초록", color: "#a78297" },
];

const SKIN = ["#e0ae8a", "#b98060", "#f0c6a0", "#cb9476", "#a66c52"];
const HAIR = ["#35271f", "#6d4330", "#23282a", "#9a6941", "#402e32"];
const COATS = ["#a56b53", "#7e987c", "#b88f6e", "#667f9c", "#a78297"];

function seatAngles(count: number) {
  if (count <= 1) return [0];
  const span = count >= 5 ? 2.28 : count === 4 ? 1.98 : count === 3 ? 1.55 : 1.05;
  return Array.from({ length: count }, (_, index) =>
    -span / 2 + (span * index) / (count - 1),
  );
}

/** The player sits at the near edge of the table; every other avatar faces their seat. */
export default function ImmersiveScene({
  players,
  selfUid,
  activePlayer,
  focusPlayerUid,
  onPlayerSelect,
  phase,
  cameraMode = "table",
  reducedMotion = false,
  quality = "high",
}: LoungeSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const selectRef = useRef(onPlayerSelect);
  const focusRef = useRef(focusPlayerUid ?? activePlayer);
  const phaseRef = useRef(phase);
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;
  const resetRef = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const people = (players?.length ? players : DEMO_PLAYERS)
    .filter((person) => person.uid !== selfUid)
    .slice(0, 5);
  const peopleKey = people
    .map((person) => `${person.uid}:${person.nickname}:${person.color ?? ""}`)
    .join("|");
  const selfColor = players?.find((person) => person.uid === selfUid)?.color;
  selectRef.current = onPlayerSelect;
  focusRef.current = focusPlayerUid ?? activePlayer;
  phaseRef.current = phase;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: quality === "high",
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setFailed(true);
      return;
    }

    setFailed(false);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.7 : 1),
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.52;
    renderer.shadowMap.enabled = quality === "high";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "immersive-scene__canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111c25");
    scene.fog = new THREE.Fog("#111c25", 10, 25);
    const world = new THREE.Group();
    scene.add(world);
    const camera = new THREE.PerspectiveCamera(64, 1, 0.065, 45);
    const ownedGeometries = new Set<THREE.BufferGeometry>();
    const ownedMaterials = new Set<THREE.Material>();
    const ownedTextures = new Set<THREE.Texture>();
    const shapeCache = new Map<string, THREE.BufferGeometry>();
    const materialCache = new Map<string, THREE.MeshStandardMaterial>();
    const selectable: THREE.Object3D[] = [];
    const avatars: Avatar[] = [];

    const material = (
      color: string,
      roughness = 0.72,
      metalness = 0,
      emissive = "#000000",
      emissiveIntensity = 0,
    ) => {
      const key = `${color}:${roughness}:${metalness}:${emissive}:${emissiveIntensity}`;
      const cached = materialCache.get(key);
      if (cached) return cached;
      const result = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        emissive,
        emissiveIntensity,
      });
      materialCache.set(key, result);
      ownedMaterials.add(result);
      return result;
    };
    const geometry = (key: string, make: () => THREE.BufferGeometry) => {
      const cached = shapeCache.get(key);
      if (cached) return cached;
      const created = make();
      shapeCache.set(key, created);
      ownedGeometries.add(created);
      return created;
    };
    const add = (
      parent: THREE.Object3D,
      shape: THREE.BufferGeometry,
      surface: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const part = new THREE.Mesh(shape, surface);
      part.position.set(x, y, z);
      part.castShadow = true;
      part.receiveShadow = true;
      parent.add(part);
      return part;
    };
    const box = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      surface: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      radius = 0.025,
    ) =>
      add(
        parent,
        geometry(`b:${w}:${h}:${d}:${radius}`, () =>
          new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(radius, w / 4, h / 4, d / 4),
          ),
        ),
        surface,
        x,
        y,
        z,
      );
    const cylinder = (
      parent: THREE.Object3D,
      top: number,
      bottom: number,
      h: number,
      surface: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      segments = 32,
    ) =>
      add(
        parent,
        geometry(`c:${top}:${bottom}:${h}:${segments}`, () =>
          new THREE.CylinderGeometry(top, bottom, h, segments),
        ),
        surface,
        x,
        y,
        z,
      );
    const sphere = (
      parent: THREE.Object3D,
      radius: number,
      surface: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      width = 12,
      height = 8,
    ) =>
      add(
        parent,
        geometry(`s:${radius}:${width}:${height}`, () =>
          new THREE.SphereGeometry(radius, width, height),
        ),
        surface,
        x,
        y,
        z,
      );
    const ring = (
      parent: THREE.Object3D,
      radius: number,
      tube: number,
      surface: THREE.Material,
      x: number,
      y: number,
      z: number,
      horizontal = true,
    ) => {
      const result = add(
        parent,
        geometry(`r:${radius}:${tube}`, () =>
          new THREE.TorusGeometry(radius, tube, 8, 64),
        ),
        surface,
        x,
        y,
        z,
      );
      if (horizontal) result.rotation.x = Math.PI / 2;
      return result;
    };

    const darkWood = material("#382a25");
    const brightWood = material("#956342");
    const brass = material("#c69b5e", 0.34, 0.68);
    const mutedBrass = material("#8e744f", 0.48, 0.48);
    const felt = material("#3e7464", 0.97);
    const feltDeep = material("#294c43", 0.96);
    const cream = material("#e7d7b7", 0.86);
    const ink = material("#242625", 0.85);
    const wall = material("#28342f", 0.95);
    const wallPanel = material("#344238", 0.92);
    const red = material("#984e46", 0.78);
    const glass = material("#d9aa72", 0.1, 0.2);

    scene.add(new THREE.HemisphereLight("#b9d4e0", "#4b3327", 2.25));
    const key = new THREE.DirectionalLight("#ffd4a0", 3.0);
    key.position.set(1.3, 5.2, 2.8);
    key.castShadow = quality === "high";
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5.5;
    key.shadow.camera.right = 5.5;
    key.shadow.camera.top = 5.5;
    key.shadow.camera.bottom = -5.5;
    key.shadow.normalBias = 0.045;
    key.shadow.radius = 3;
    scene.add(key);
    const cool = new THREE.DirectionalLight("#89b7d0", 1.4);
    cool.position.set(-3, 3, -3.4);
    scene.add(cool);
    const lampLight = new THREE.PointLight("#ffbf78", 18, 7, 1.8);
    lampLight.position.set(0, 3.28, 0);
    scene.add(lampLight);

    // Complete room walls prevent the camera from ever looking beyond a model set.
    box(world, 11, 0.12, 11, darkWood, 0, -0.095, -0.35, 0.02);
    const floorboards = ["#674a36", "#76523b", "#825b40", "#6e4f3b"].map((c) =>
      material(c),
    );
    for (let i = 0; i < 14; i += 1)
      for (let j = 0; j < 11; j += 1) {
        box(
          world,
          0.75,
          0.025,
          0.96,
          floorboards[(i + j * 3) % floorboards.length],
          -4.88 + i * 0.75,
          -0.018,
          -5.12 + j * 0.96 + (i % 2) * 0.18,
          0.002,
        );
      }
    cylinder(world, 3.17, 3.17, 0.017, feltDeep, 0, 0.02, 0, 12);
    ring(world, 3.0, 0.025, mutedBrass, 0, 0.032, 0);

    box(world, 11, 5.4, 0.22, wall, 0, 2.64, -4.61);
    box(world, 0.22, 5.4, 11, wall, -5.42, 2.64, -0.35);
    box(world, 0.22, 5.4, 11, wall, 5.42, 2.64, -0.35);
    box(world, 11, 0.14, 0.35, darkWood, 0, 1.11, -4.45);
    box(world, 11, 0.1, 0.35, brass, 0, 1.2, -4.46);
    box(world, 11, 0.22, 0.38, darkWood, 0, 4.52, -4.45);
    for (let i = 0; i < 8; i += 1) {
      box(world, 1.18, 1.08, 0.035, wallPanel, -4.55 + i * 1.3, 0.56, -4.485, 0.015);
      box(world, 0.055, 1.19, 0.09, brightWood, -5.2 + i * 1.3, 0.59, -4.38, 0.008);
    }

    const night = material("#172c3a", 0.2, 0.1, "#285773", 0.15);
    const makeWindow = (x: number) => {
      const frame = new THREE.Group();
      frame.position.set(x, 2.91, -4.43);
      world.add(frame);
      box(frame, 1.72, 2.34, 0.12, darkWood);
      box(frame, 1.54, 2.16, 0.035, night, 0, 0, 0.073);
      for (let i = 0; i < 6; i += 1) {
        const height = 0.35 + ((i * 13) % 5) * 0.19;
        box(
          frame,
          0.23,
          height,
          0.012,
          material(i % 2 ? "#233d4b" : "#294753"),
          -0.65 + i * 0.25,
          -1.02 + height / 2,
          0.099,
          0.003,
        );
        for (let j = 0; j < 3; j += 1)
          if (j * 0.15 < height - 0.08)
            box(
              frame,
              0.028,
              0.035,
              0.007,
              material("#e2b977", 0.8, 0, "#d98b46", 0.28),
              -0.65 + i * 0.25,
              -0.92 + j * 0.15,
              0.11,
              0.002,
            );
      }
      box(frame, 0.075, 2.26, 0.14, brightWood, 0, 0, 0.115);
      box(frame, 1.62, 0.075, 0.14, brightWood, 0, 0.02, 0.115);
      box(frame, 1.98, 0.13, 0.38, brightWood, 0, -1.2, 0.1);
    };
    makeWindow(-3.22);
    makeWindow(3.22);

    const signCanvas = document.createElement("canvas");
    signCanvas.width = 800;
    signCanvas.height = 320;
    const signPaint = signCanvas.getContext("2d");
    if (signPaint) {
      signPaint.fillStyle = "#162521";
      signPaint.fillRect(0, 0, 800, 320);
      signPaint.strokeStyle = "#c3a16b";
      signPaint.lineWidth = 4;
      signPaint.strokeRect(17, 17, 766, 286);
      signPaint.textAlign = "center";
      signPaint.fillStyle = "#efce96";
      signPaint.font = "bold 83px Georgia, serif";
      signPaint.fillText("THE OTHER", 400, 142);
      signPaint.fillText("SIDE", 400, 247);
      const signTexture = new THREE.CanvasTexture(signCanvas);
      signTexture.colorSpace = THREE.SRGBColorSpace;
      ownedTextures.add(signTexture);
      const signMaterial = new THREE.MeshBasicMaterial({ map: signTexture });
      ownedMaterials.add(signMaterial);
      box(world, 2.86, 1.25, 0.12, brass, 0, 3.17, -4.39, 0.04);
      add(
        world,
        geometry("sign", () => new THREE.PlaneGeometry(2.76, 1.15)),
        signMaterial,
        0,
        3.17,
        -4.315,
      );
    }

    // A warm pendant reads as a real light source and frames the opposing players.
    const pendant = new THREE.Group();
    world.add(pendant);
    cylinder(pendant, 0.035, 0.035, 0.7, darkWood, 0, 4.66, 0, 10);
    cylinder(pendant, 0.64, 0.9, 0.4, brightWood, 0, 4.11, 0, 32);
    cylinder(pendant, 0.88, 0.88, 0.05, brass, 0, 3.92, 0, 32);
    cylinder(
      pendant,
      0.6,
      0.6,
      0.035,
      material("#fbdba7", 0.3, 0, "#ffc982", 1.2),
      0,
      3.88,
      0,
      32,
    );

    // Back-room furniture and plants break up the wall behind the player circle.
    box(world, 1.25, 1.32, 0.54, darkWood, 4.33, 0.67, -3.7);
    box(world, 1.32, 0.1, 0.64, brightWood, 4.33, 1.37, -3.7);
    for (let i = 0; i < 8; i += 1) {
      const h = 0.28 + (i % 3) * 0.08;
      box(
        world,
        0.11,
        h,
        0.21,
        material(["#88584a", "#c0a377", "#65796a", "#6b7881"][i % 4]),
        3.83 + i * 0.14,
        0.78,
        -3.36,
        0.006,
      );
    }
    const plant = (x: number, z: number) => {
      cylinder(world, 0.25, 0.18, 0.47, material("#a77254"), x, 0.25, z, 10);
      for (let i = 0; i < 9; i += 1) {
        const a = i * 2.4;
        const leaf = sphere(
          world,
          0.19,
          material(i % 3 ? "#54725a" : "#77906b"),
          x + Math.sin(a) * 0.2,
          0.62 + i * 0.11,
          z + Math.cos(a) * 0.15,
          7,
          5,
        );
        leaf.scale.set(0.68, 1.75, 0.5);
        leaf.rotation.z = Math.sin(a) * 0.7;
      }
    };
    plant(-4.55, -3.25);
    plant(4.56, -2.04);

    // The near wooden lip and felt fill the lower part of the first-person view.
    cylinder(world, 2.08, 2.01, 0.18, brightWood, 0, 1.05, 0, 64);
    cylinder(world, 2.0, 2.0, 0.068, darkWood, 0, 1.17, 0, 64);
    cylinder(world, 1.85, 1.85, 0.024, felt, 0, 1.216, 0, 64);
    ring(world, 1.96, 0.018, brass, 0, 1.215, 0);
    ring(world, 1.78, 0.009, material("#93b5a0"), 0, 1.232, 0);
    cylinder(world, 0.26, 0.29, 1.0, darkWood, 0, 0.54, 0, 10);
    for (let i = 0; i < 32; i += 1) {
      const a = (i * Math.PI * 2) / 32;
      cylinder(
        world,
        0.014,
        0.014,
        0.005,
        mutedBrass,
        Math.sin(a) * 1.9,
        1.235,
        Math.cos(a) * 1.9,
        6,
      );
    }
    // The shared clue deck and small chips stay in the real tabletop plane.
    for (let i = 0; i < 3; i += 1) {
      const card = box(
        world,
        0.25,
        0.012,
        0.35,
        cream,
        -0.2 + i * 0.22,
        1.24 + i * 0.003,
        -0.22 + i * 0.03,
        0.015,
      );
      card.rotation.y = -0.15 + i * 0.17;
      const symbol = sphere(world, 0.05, i === 1 ? red : ink, -0.2 + i * 0.22, 1.254 + i * 0.003, -0.22 + i * 0.03, 8, 5);
      symbol.scale.y = 0.1;
    }
    for (let pile = 0; pile < 3; pile += 1)
      for (let i = 0; i < 4 + pile; i += 1)
        cylinder(
          world,
          0.073,
          0.073,
          0.022,
          i % 2 ? cream : red,
          -0.95 + pile * 0.14,
          1.245 + i * 0.024,
          0.13 + pile * 0.08,
          16,
        );
    for (let i = 0; i < 3; i += 1) {
      cylinder(world, 0.1, 0.085, 0.15, glass, 1.03 - i * 0.13, 1.31, -0.17 + i * 0.22, 16);
      cylinder(world, 0.11, 0.11, 0.007, cream, 1.03 - i * 0.13, 1.39, -0.17 + i * 0.22, 16);
    }

    const angles = seatAngles(people.length);
    people.forEach((person, index) => {
      const angle = angles[index];
      const x = Math.sin(angle) * 2.22;
      const z = -Math.cos(angle) * 2.22;
      const root = new THREE.Group();
      root.position.set(x, 0, z);
      root.rotation.y = Math.atan2(-x, 3.25 - z);
      world.add(root);

      const skin = material(SKIN[index % SKIN.length]);
      const hair = material(HAIR[index % HAIR.length]);
      const coat = material(
        /^#[0-9a-fA-F]{3,8}$/.test(person.color ?? "")
          ? person.color!
          : COATS[index % COATS.length],
      );
      const shirt = material(index % 2 ? "#d8d6c2" : "#eee1c9");
      const eyes = material("#1d2428", 0.16);
      const upholstery = material("#735747");

      // A chair behind each torso makes the posture unmistakably seated.
      box(root, 1.1, 1.13, 0.18, darkWood, 0, 1.0, -0.33, 0.055);
      box(root, 0.94, 0.94, 0.06, upholstery, 0, 1.04, -0.214, 0.07);
      box(root, 1.07, 0.12, 0.64, brightWood, 0, 0.66, 0.04, 0.05);
      for (const side of [-1, 1]) {
        box(root, 0.11, 0.65, 0.11, darkWood, side * 0.49, 0.56, 0.12);
        box(root, 0.21, 0.52, 0.48, material("#3b4240"), side * 0.22, 0.74, 0.17, 0.04);
      }

      const torso = new THREE.Group();
      root.add(torso);
      box(torso, 0.91, 0.79, 0.51, coat, 0, 1.39, -0.01, 0.1);
      box(torso, 0.26, 0.65, 0.025, shirt, 0, 1.4, 0.26, 0.008);
      const lapelL = box(torso, 0.12, 0.39, 0.037, coat, -0.16, 1.58, 0.286);
      lapelL.rotation.z = 0.27;
      const lapelR = box(torso, 0.12, 0.39, 0.037, coat, 0.16, 1.58, 0.286);
      lapelR.rotation.z = -0.27;
      sphere(torso, 0.021, brass, 0, 1.16, 0.29, 8, 6);
      box(torso, 0.23, 0.16, 0.18, skin, 0, 1.84, 0.01, 0.035);

      const leftArm = new THREE.Group();
      leftArm.position.set(-0.54, 1.62, 0.02);
      torso.add(leftArm);
      const sleeveL = box(leftArm, 0.3, 0.59, 0.34, coat, -0.015, -0.26, 0.18, 0.06);
      sleeveL.rotation.x = -0.37;
      sleeveL.rotation.z = -0.22;
      box(leftArm, 0.26, 0.2, 0.26, skin, -0.07, -0.55, 0.41, 0.06);

      const rightArm = new THREE.Group();
      rightArm.position.set(0.54, 1.62, 0.02);
      torso.add(rightArm);
      const sleeveR = box(rightArm, 0.3, 0.59, 0.34, coat, 0.015, -0.26, 0.18, 0.06);
      sleeveR.rotation.x = -0.37;
      sleeveR.rotation.z = 0.22;
      box(rightArm, 0.26, 0.2, 0.26, skin, 0.07, -0.55, 0.41, 0.06);

      const head = new THREE.Group();
      head.position.set(0, 2.08, 0.05);
      torso.add(head);
      box(head, 0.72, 0.72, 0.67, skin, 0, 0, 0, 0.1);
      box(head, 0.078, 0.105, 0.025, eyes, -0.145, 0.036, 0.347, 0.013);
      box(head, 0.078, 0.105, 0.025, eyes, 0.145, 0.036, 0.347, 0.013);
      box(head, 0.12, 0.025, 0.02, hair, -0.145, 0.154, 0.348, 0.007);
      box(head, 0.12, 0.025, 0.02, hair, 0.145, 0.154, 0.348, 0.007);
      box(head, 0.095, 0.07, 0.065, skin, 0, -0.062, 0.365, 0.02);
      box(head, 0.13, 0.023, 0.019, material("#865a50"), 0, -0.18, 0.35, 0.005);
      box(head, 0.12, 0.19, 0.14, skin, -0.39, -0.04, 0, 0.045);
      box(head, 0.12, 0.19, 0.14, skin, 0.39, -0.04, 0, 0.045);
      box(head, 0.76, 0.19, 0.71, hair, 0, 0.33, -0.025, 0.09);
      box(head, 0.73, 0.19, 0.19, hair, 0, 0.24, -0.28, 0.055);
      if (index % 5 === 0) {
        box(head, 0.8, 0.23, 0.75, material("#8c4d45"), 0, 0.38, -0.02, 0.11);
        box(head, 0.8, 0.11, 0.79, material("#a96557"), 0, 0.29, 0.02, 0.045);
      } else if (index % 5 === 1) {
        for (let n = 0; n < 5; n += 1)
          sphere(head, 0.135, hair, -0.29 + n * 0.145, 0.36 + (n % 2) * 0.035, 0.18, 8, 6);
      } else if (index % 5 === 2) {
        for (const eyeX of [-0.145, 0.145]) {
          ring(head, 0.115, 0.013, material("#4d4c44", 0.4, 0.2), eyeX, 0.045, 0.365, false);
        }
        box(head, 0.09, 0.02, 0.025, ink, 0, 0.045, 0.37);
      } else if (index % 5 === 3) {
        box(head, 0.16, 0.41, 0.27, hair, -0.34, 0.02, -0.08, 0.045);
        box(head, 0.16, 0.41, 0.27, hair, 0.34, 0.02, -0.08, 0.045);
      } else {
        box(head, 0.79, 0.19, 0.78, material("#77715f"), 0, 0.39, -0.01, 0.09);
        box(head, 0.54, 0.055, 0.28, material("#77715f"), 0, 0.32, 0.39, 0.025);
      }

      // A hidden selection ring lights the person being questioned or chosen.
      const halo = ring(
        root,
        0.52,
        0.028,
        material("#edc27f", 0.4, 0.2, "#eab773", 0.75),
        0,
        2.12,
        -0.2,
        false,
      );
      halo.visible = false;
      root.traverse((part) => {
        if (part instanceof THREE.Mesh && part !== halo) {
          part.userData.playerUid = person.uid;
          selectable.push(part);
        }
      });
      avatars.push({
        uid: person.uid,
        root,
        head,
        leftArm,
        rightArm,
        halo,
        label: new THREE.Vector3(x, 2.73, z),
        index,
      });
    });

    // The unseen local avatar's sleeves and cards remain in the foreground.
    const ownCoat = material(
      /^#[0-9a-fA-F]{3,8}$/.test(selfColor ?? "") ? selfColor! : "#617885",
    );
    const ownSkin = material("#d7a37e");
    for (const side of [-1, 1]) {
      const arm = box(
        world,
        0.34,
        0.27,
        1.15,
        ownCoat,
        side * 0.68,
        1.145,
        2.59,
        0.095,
      );
      arm.rotation.y = side * 0.27;
      box(world, 0.24, 0.16, 0.36, ownSkin, side * 0.47, 1.18, 2.05, 0.075);
      box(world, 0.29, 0.055, 0.17, cream, side * 0.57, 1.21, 2.25, 0.018);
    }
    // A fan of cards faces the camera: you occupy this seat and have a hand to play.
    const cardBack = material("#733f42", 0.6);
    const cardFan = new THREE.Group();
    world.add(cardFan);
    for (let i = 0; i < 3; i += 1) {
      const card = new THREE.Group();
      card.position.set((i - 1) * 0.145, 1.39 + (1 - Math.abs(i - 1)) * 0.035, 2.11 + Math.abs(i - 1) * 0.025);
      card.rotation.z = (i - 1) * -0.16;
      card.rotation.x = -0.23;
      cardFan.add(card);
      box(card, 0.31, 0.43, 0.02, cream, 0, 0, 0, 0.018);
      box(card, 0.275, 0.395, 0.007, cardBack, 0, 0, 0.015, 0.012);
      box(card, 0.215, 0.335, 0.007, mutedBrass, 0, 0, 0.023, 0.004);
      box(card, 0.197, 0.316, 0.007, cardBack, 0, 0, 0.029, 0.003);
      sphere(card, 0.048, brass, 0, 0, 0.038, 8, 6).scale.z = 0.18;
    }

    let width = 1;
    let height = 1;
    let frame = 0;
    let isVisible = true;
    let isDocumentVisible = !document.hidden;
    let needsRender = true;
    let lastRender = 0;
    let lastFocus: string | undefined;
    let lastPhase: string | undefined;
    let hoverUid: string | null = null;
    let down = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let yawTarget = 0;
    let pitchTarget = -0.025;
    let yaw = 0;
    let pitch = -0.025;
    let baseFov = 64;
    let fov = 64;
    let fovTarget = 64;
    let aimedFocus: string | undefined;
    let aimedMode: string | undefined;
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const screen = new THREE.Vector3();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stopMotion = reducedMotion || motionQuery.matches;
    const onMotion = () => {
      stopMotion = reducedMotion || motionQuery.matches;
      needsRender = true;
    };
    motionQuery.addEventListener("change", onMotion);
    const resize = () => {
      width = Math.max(host.clientWidth, 1);
      height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      baseFov = width < 620 ? 86 : width < 900 ? 72 : 64;
      aimedMode = undefined;
      camera.updateProjectionMatrix();
      pendant.visible = width >= 620;
      cardFan.scale.setScalar(width < 620 ? 0.82 : 1);
      cardFan.position.set(0, width < 620 ? 0.18 : 0, width < 620 ? 0.38 : 0);
      needsRender = true;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      needsRender = true;
    });
    visibilityObserver.observe(host);
    const onVisibility = () => {
      isDocumentVisible = !document.hidden;
      needsRender = true;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const pick = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(selectable, false)[0]?.object.userData
        .playerUid as string | undefined;
    };
    const onPointerMove = (event: PointerEvent) => {
      needsRender = true;
      if (down) {
        yawTarget = THREE.MathUtils.clamp(
          yawTarget - (event.clientX - lastX) * 0.0046,
          -0.65,
          0.65,
        );
        pitchTarget = THREE.MathUtils.clamp(
          pitchTarget + (event.clientY - lastY) * 0.003,
          -0.18,
          0.19,
        );
        lastX = event.clientX;
        lastY = event.clientY;
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 6)
          dragging = true;
        return;
      }
      const next = pick(event) ?? null;
      if (next !== hoverUid) {
        hoverUid = next;
        setHovered(next);
        renderer.domElement.style.cursor = next ? "pointer" : "grab";
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      down = true;
      dragging = false;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) {
        const selected = pick(event);
        if (selected) selectRef.current?.(selected);
      }
      down = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = hoverUid ? "pointer" : "grab";
    };
    const onPointerLeave = () => {
      hoverUid = null;
      setHovered(null);
      needsRender = true;
    };
    const onPointerCancel = () => {
      down = false;
      dragging = false;
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    resetRef.current = () => {
      yawTarget = 0;
      pitchTarget = -0.025;
      fovTarget = baseFov;
      hoverUid = null;
      setHovered(null);
      needsRender = true;
    };

    const startTime = performance.now();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!isVisible || !isDocumentVisible) return;
      const now = performance.now();
      if (
        stopMotion &&
        !needsRender &&
        lastFocus === focusRef.current &&
        lastPhase === phaseRef.current &&
        aimedMode === cameraModeRef.current
      )
        return;
      // Behind a mission card the room is dimmed and barely moves; redraw it less often.
      const fps = cameraModeRef.current === "mission" ? 15 : 30;
      if (!stopMotion && now - lastRender < 1000 / fps) return;
      const delta = Math.min((now - lastRender) / 1000, 0.1);
      lastRender = now;
      lastFocus = focusRef.current;
      lastPhase = phaseRef.current;
      needsRender = false;
      const t = stopMotion ? 0 : (now - startTime) / 1000;
      if (aimedFocus !== focusRef.current || aimedMode !== cameraModeRef.current) {
        // Turn the seat toward whoever was picked, then return to the table for missions.
        aimedFocus = focusRef.current;
        aimedMode = cameraModeRef.current;
        const target = avatars.find((avatar) => avatar.uid === aimedFocus);
        if (target && (aimedMode === "table" || aimedMode === "review")) {
          const dx = target.root.position.x;
          const dz = 3.25 - target.root.position.z;
          // In review the panel covers the lower screen, so look lower to lift the face into view.
          const lift = aimedMode === "review" ? (width < 620 ? 0.13 : 0.07) : 0;
          yawTarget = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.65, 0.65);
          pitchTarget = THREE.MathUtils.clamp(Math.atan2(1.96 - 1.68, Math.hypot(dx, dz)) - lift, -0.3, 0.19);
          fovTarget = baseFov * (width < 620 ? 0.66 : 0.72);
        } else {
          yawTarget = 0;
          pitchTarget = aimedMode === "mission" ? -0.06 : -0.025;
          fovTarget = baseFov;
        }
      }
      // Camera moves ease more slowly than drag so focus changes read as a deliberate turn.
      const smooth = stopMotion ? 1 : 1 - Math.exp(-delta * (down ? 8 : 4.6));
      yaw += (yawTarget - yaw) * smooth;
      pitch += (pitchTarget - pitch) * smooth;
      fov += (fovTarget - fov) * smooth;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 1.68 + (stopMotion ? 0 : Math.sin(t * 1.3) * 0.008), 3.25);
      camera.lookAt(
        camera.position.x + Math.sin(yaw) * 5,
        camera.position.y + Math.sin(pitch) * 5,
        camera.position.z - Math.cos(yaw) * 5,
      );
      camera.updateMatrixWorld();
      for (const avatar of avatars) {
        avatar.head.rotation.y = stopMotion
          ? 0
          : Math.sin(t * 0.7 + avatar.index * 1.7) * 0.065;
        avatar.head.rotation.z = stopMotion
          ? 0
          : Math.sin(t * 0.9 + avatar.index) * 0.025;
        avatar.leftArm.rotation.x = stopMotion
          ? 0
          : Math.sin(t * 0.82 + avatar.index) * 0.042;
        avatar.rightArm.rotation.x = stopMotion
          ? 0
          : Math.sin(t * 0.82 + avatar.index + 1.3) * 0.042;
        const focused =
          focusRef.current === avatar.uid || hoverUid === avatar.uid;
        avatar.halo.visible = focused;
        avatar.root.scale.setScalar(focused ? 1.025 : 1);
        const label = labelRefs.current.get(avatar.uid);
        if (label) {
          screen.copy(avatar.label).project(camera);
          const x = (screen.x * 0.5 + 0.5) * width;
          const y = (-screen.y * 0.5 + 0.5) * height;
          label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
          label.style.opacity =
            screen.z < 1 && x > 28 && x < width - 28 && y > 30 && y < height - 40
              ? "1"
              : "0";
          label.style.pointerEvents = label.style.opacity === "1" ? "auto" : "none";
        }
      }
      renderer.render(scene, camera);
    };
    animate();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    const onContextRestored = () => {
      setFailed(false);
      needsRender = true;
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotion);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      ownedGeometries.forEach((item) => item.dispose());
      ownedMaterials.forEach((item) => item.dispose());
      ownedTextures.forEach((item) => item.dispose());
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      scene.clear();
      resetRef.current = () => {};
    };
  }, [peopleKey, selfColor, quality, reducedMotion]);

  return (
    <div className="immersive-scene" ref={hostRef}>
      <div className="immersive-scene__vignette" aria-hidden="true" />
      {failed ? (
        <div className="immersive-scene__fallback" role="img" aria-label="원탁에 앉아 다른 플레이어와 마주 보는 게임 장면">
          <span>THE OTHER SIDE</span>
          <p>테이블 건너편에 친구들이 기다리고 있어요.</p>
        </div>
      ) : (
        <div className="immersive-scene__labels" aria-label="맞은편 플레이어">
          {people.map((person) => (
            <button
              key={person.uid}
              type="button"
              ref={(node) => {
                if (node) labelRefs.current.set(person.uid, node);
                else labelRefs.current.delete(person.uid);
              }}
              className={`immersive-scene__name${focusPlayerUid === person.uid || activePlayer === person.uid || hovered === person.uid ? " immersive-scene__name--active" : ""}`}
              data-player-uid={person.uid}
              onClick={() => onPlayerSelect?.(person.uid)}
              aria-label={`${person.nickname} 플레이어 선택`}
              aria-pressed={onPlayerSelect ? (focusPlayerUid ?? activePlayer) === person.uid : undefined}
              style={{ "--avatar-color": person.color || COATS[0] } as React.CSSProperties}
            >
              <span className="immersive-scene__name-dot" />
              {person.nickname}
            </button>
          ))}
        </div>
      )}
      <div className="immersive-scene__controls">
        <span className="immersive-scene__hint">드래그해서 둘러보기</span>
        <button
          className="immersive-scene__reset"
          type="button"
          onClick={() => resetRef.current()}
          aria-label="정면 보기"
          title="정면 보기"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 11a8 8 0 1 1 2.3 6M4 5v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
