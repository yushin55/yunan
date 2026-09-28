import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import ImmersiveScene from "./ImmersiveScene";
import "./LoungeScene.css";

export interface LoungePlayer {
  uid: string;
  nickname: string;
  color?: string;
  ready?: boolean;
}

export interface LoungeSceneProps {
  players?: LoungePlayer[];
  activePlayer?: string;
  onPlayerSelect?: (uid: string) => void;
  mode?: "home" | "room" | "immersive";
  selfUid?: string;
  phase?: string;
  focusPlayerUid?: string;
  /** Immersive only: "table" pans and zooms toward the focused player; "mission" frames the table;
   *  "review" does the same as table but keeps the face above the bottom review panel. */
  cameraMode?: "mission" | "table" | "review";
  reducedMotion?: boolean;
  quality?: "high" | "low";
}

const PREVIEW_PLAYERS: LoungePlayer[] = [
  { uid: "preview-1", nickname: "노을", color: "#c98d66", ready: true },
  { uid: "preview-2", nickname: "모카", color: "#aaad83", ready: true },
  { uid: "preview-3", nickname: "구름", color: "#a2b3cf", ready: true },
  { uid: "preview-4", nickname: "초록", color: "#86ad98", ready: true },
  { uid: "preview-5", nickname: "라일락", color: "#b09bbf", ready: true },
  { uid: "preview-6", nickname: "치즈", color: "#d9b263", ready: true },
];

type Character = {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  arm: THREE.Group;
  halo: THREE.Mesh;
  uid: string;
  index: number;
  labelPosition: THREE.Vector3;
};

const PALETTES = [
  "#c98d66",
  "#aaad83",
  "#a2b3cf",
  "#86ad98",
  "#b09bbf",
  "#d9b263",
  "#739dba",
  "#c790a0",
];

/** A self-contained, asset-free Three.js lounge. All visual assets are native geometry. */
export default function LoungeScene(props: LoungeSceneProps) {
  if (props.mode === "immersive") return <ImmersiveScene {...props} />;
  return <LegacyLoungeScene {...props} />;
}

function LegacyLoungeScene({
  players,
  activePlayer,
  onPlayerSelect,
  mode = "home",
  reducedMotion = false,
  quality = "high",
}: LoungeSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const selectionRef = useRef(onPlayerSelect);
  const activeRef = useRef(activePlayer);
  const resetRef = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const people = players?.length
    ? players.slice(0, 6)
    : mode === "home"
      ? PREVIEW_PLAYERS
      : [];
  const peopleKey = people.map((p) => `${p.uid}:${p.color ?? ""}`).join("|");
  selectionRef.current = onPlayerSelect;
  activeRef.current = activePlayer;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: quality === "high",
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setFailed(true);
      return;
    }

    setFailed(false);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.75 : 1),
    );
    renderer.setClearColor(0x10151b, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.34;
    renderer.shadowMap.enabled = quality === "high";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "lounge-scene__canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const world = new THREE.Group();
    scene.add(world);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
    const target = new THREE.Vector3(0, 1.35, -0.05);
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    const textures = new Set<THREE.Texture>();
    const clickable: THREE.Object3D[] = [];
    const characters: Character[] = [];

    const mat = (
      color: THREE.ColorRepresentation,
      roughness = 0.72,
      metalness = 0,
    ) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
      });
      materials.add(material);
      return material;
    };
    const basic = (color: THREE.ColorRepresentation, opacity = 1) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity === 1,
      });
      materials.add(material);
      return material;
    };
    const mesh = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      geometries.add(geometry);
      const object = new THREE.Mesh(geometry, material);
      object.position.set(x, y, z);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };
    const box = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      radius = 0.035,
    ) =>
      mesh(
        parent,
        new RoundedBoxGeometry(
          w,
          h,
          d,
          2,
          Math.min(radius, w / 4, h / 4, d / 4),
        ),
        material,
        x,
        y,
        z,
      );
    const cylinder = (
      parent: THREE.Object3D,
      top: number,
      bottom: number,
      h: number,
      material: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      segments = 48,
    ) =>
      mesh(
        parent,
        new THREE.CylinderGeometry(top, bottom, h, segments),
        material,
        x,
        y,
        z,
      );
    const ring = (
      parent: THREE.Object3D,
      radius: number,
      tube: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const object = mesh(
        parent,
        new THREE.TorusGeometry(radius, tube, 8, 80),
        material,
        x,
        y,
        z,
      );
      object.rotation.x = Math.PI / 2;
      return object;
    };
    const timber = mat("#65472f");
    const edgeTimber = mat("#3a2b26");
    const timberLight = mat("#8e6340");
    const brass = mat("#c49a5c", 0.33, 0.67);
    const bronze = mat("#79603f", 0.4, 0.55);
    const dark = mat("#171f26");
    const felt = mat("#426a5c", 0.98);
    const paper = mat("#f2e4c7");
    const wine = mat("#804e49");
    const leaf = mat("#557e61");
    const wall = mat("#273431");
    const panel = mat("#303f37");

    scene.add(new THREE.HemisphereLight("#bfd3e1", "#534330", 2.25));
    const warmKey = new THREE.DirectionalLight("#ffe3b5", 3.2);
    warmKey.position.set(3, 7, 6);
    warmKey.castShadow = quality === "high";
    warmKey.shadow.mapSize.set(2048, 2048);
    warmKey.shadow.camera.left = -6;
    warmKey.shadow.camera.right = 6;
    warmKey.shadow.camera.top = 6;
    warmKey.shadow.camera.bottom = -6;
    warmKey.shadow.normalBias = 0.04;
    warmKey.shadow.bias = -0.00015;
    warmKey.shadow.radius = 4;
    scene.add(warmKey);
    const coolFill = new THREE.DirectionalLight("#aac6df", 1.45);
    coolFill.position.set(-5, 4, -2);
    scene.add(coolFill);
    const tableLight = new THREE.PointLight("#ffc778", 10, 8, 2);
    tableLight.position.set(0, 3.5, 0);
    scene.add(tableLight);

    // A little theatre set: parquet boards, a brass-edged platform and rear wall.
    box(world, 9.1, 0.25, 7.65, edgeTimber, 0, -0.23, -0.12, 0.12);
    box(world, 9.12, 0.025, 7.68, brass, 0, -0.095, -0.12, 0.01);
    const boards = ["#65513d", "#705740", "#785b42", "#624c3a", "#6e523b"].map(
      (c) => mat(c),
    );
    for (let x = 0; x < 15; x += 1) {
      for (let z = 0; z < 5; z += 1) {
        const shift = x % 2 ? 0.52 : 0;
        box(
          world,
          0.592,
          0.07,
          1.49,
          boards[(x * 3 + z) % boards.length],
          -4.2 + x * 0.6,
          -0.045,
          -3.14 + z * 1.5 + shift * (z === 4 ? 0 : 1),
          0.008,
        );
      }
    }
    // Octagonal woven rug anchors the seating circle.
    cylinder(world, 3.08, 3.08, 0.018, mat("#314440"), 0, 0.009, 0, 8);
    ring(world, 2.95, 0.018, mat("#928265"), 0, 0.025, 0);
    ring(world, 2.83, 0.008, mat("#73684f"), 0, 0.026, 0);

    box(world, 9.1, 4.55, 0.2, wall, 0, 2.16, -3.88, 0.01);
    box(world, 9.08, 0.16, 0.29, edgeTimber, 0, 0.11, -3.71, 0.012);
    box(world, 9.08, 0.08, 0.26, brass, 0, 1.25, -3.73, 0.012);
    box(world, 9.08, 0.11, 0.3, edgeTimber, 0, 4.42, -3.75, 0.012);
    for (let i = 0; i < 7; i += 1) {
      box(world, 1.07, 0.93, 0.035, panel, -3.9 + i * 1.3, 0.65, -3.76, 0.01);
      box(
        world,
        0.045,
        1.17,
        0.08,
        timberLight,
        -4.51 + i * 1.3,
        0.64,
        -3.68,
        0.006,
      );
    }

    // Night-blue mullioned windows with a modest city skyline.
    const makeWindow = (x: number) => {
      const frame = new THREE.Group();
      frame.position.set(x, 2.79, -3.72);
      world.add(frame);
      box(frame, 1.42, 2.08, 0.13, edgeTimber);
      box(frame, 1.26, 1.9, 0.035, mat("#172d3d", 0.24), 0, 0, 0.085);
      for (let i = 0; i < 5; i += 1) {
        const height = 0.2 + ((i * 7) % 5) * 0.14;
        box(
          frame,
          0.22,
          height,
          0.015,
          mat(i % 2 ? "#223a4c" : "#2d4657"),
          -0.49 + i * 0.245,
          -0.87 + height / 2,
          0.11,
          0.004,
        );
        for (let j = 0; j < 3; j += 1) {
          if (j * 0.14 < height - 0.08)
            box(
              frame,
              0.035,
              0.04,
              0.016,
              basic("#c3a565", 0.68),
              -0.49 + i * 0.245,
              -0.8 + j * 0.14,
              0.12,
              0.003,
            );
        }
      }
      box(frame, 0.065, 1.96, 0.1, bronze, 0, 0, 0.145, 0.007);
      box(frame, 1.33, 0.065, 0.1, bronze, 0, 0.02, 0.145, 0.007);
      box(frame, 1.58, 0.09, 0.35, timber, 0, -1.06, 0.08, 0.025);
    };
    makeWindow(-2.78);
    makeWindow(2.78);

    // The lounge sign uses a locally drawn texture; there are no remote assets.
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 1024;
    signCanvas.height = 512;
    const signContext = signCanvas.getContext("2d");
    if (signContext) {
      signContext.fillStyle = "#1c2728";
      signContext.fillRect(0, 0, 1024, 512);
      signContext.strokeStyle = "#937a50";
      signContext.lineWidth = 3;
      signContext.strokeRect(24, 24, 976, 464);
      signContext.textAlign = "center";
      signContext.fillStyle = "#e6c58b";
      signContext.font = "600 170px Georgia, serif";
      signContext.fillText("THE OTHER", 512, 215);
      signContext.fillText("SIDE", 512, 389);
      const texture = new THREE.CanvasTexture(signCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.add(texture);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      materials.add(material);
      box(world, 2.22, 1.13, 0.1, brass, 0, 3.01, -3.7, 0.04);
      mesh(
        world,
        new THREE.PlaneGeometry(2.12, 1.03),
        material,
        0,
        3.01,
        -3.637,
      );
    }

    // The little bookshelf and tabletop objects give the room human scale.
    box(world, 1.68, 1.07, 0.56, timber, 3.45, 0.54, -2.96);
    box(world, 1.73, 0.11, 0.64, timberLight, 3.45, 1.1, -2.96);
    box(world, 1.55, 0.4, 0.06, dark, 3.45, 0.76, -2.65);
    box(world, 1.55, 0.34, 0.06, dark, 3.45, 0.27, -2.65);
    const books = ["#855a4c", "#52645a", "#c4ac81", "#5c6e7b", "#a68d65"].map(
      (c) => mat(c),
    );
    for (let i = 0; i < 10; i += 1) {
      const h = 0.23 + (i % 3) * 0.05;
      const b = box(
        world,
        0.09 + (i % 2) * 0.035,
        h,
        0.19,
        books[i % 5],
        2.85 + i * 0.13,
        0.57 + h / 2,
        -2.58,
        0.006,
      );
      b.rotation.z = i > 7 ? -0.13 : 0;
      box(
        world,
        0.055,
        0.008,
        0.004,
        brass,
        2.85 + i * 0.13,
        0.64,
        -2.48,
        0.001,
      );
    }
    cylinder(world, 0.095, 0.075, 0.3, brass, 3.35, 1.32, -2.96, 16);
    cylinder(world, 0.21, 0.31, 0.35, mat("#ac8857"), 3.35, 1.6, -2.96, 20);
    const sideLamp = new THREE.PointLight("#ffbb73", 2.5, 3, 2);
    sideLamp.position.set(3.35, 1.5, -2.96);
    scene.add(sideLamp);

    const makePlant = (x: number, z: number, height: number) => {
      cylinder(world, 0.26, 0.19, 0.45, mat("#b28765"), x, 0.23, z, 8);
      cylinder(world, 0.235, 0.235, 0.028, mat("#342b25"), x, 0.456, z, 16);
      cylinder(
        world,
        0.025,
        0.035,
        height,
        mat("#6c7150"),
        x,
        0.45 + height / 2,
        z,
        6,
      );
      for (let i = 0; i < 9; i += 1) {
        const a = i * 2.399;
        const h = 0.63 + i * (height / 11);
        const object = mesh(
          world,
          new THREE.SphereGeometry(0.22, 5, 3),
          leaf,
          x + Math.sin(a) * 0.19,
          h,
          z + Math.cos(a) * 0.19,
        );
        object.scale.set(0.67, 1.5, 0.35);
        object.rotation.set(Math.sin(a) * 0.7, -a, Math.cos(a) * 0.7);
      }
    };
    makePlant(-3.7, -2.73, 1.42);
    makePlant(4.02, -0.68, 1.04);

    // The poker table: sculpted wooden rim, inset green felt and brass pinstripe.
    cylinder(world, 1.9, 1.85, 0.17, timberLight, 0, 1.21, 0, 64);
    cylinder(world, 1.83, 1.83, 0.08, timber, 0, 1.31, 0, 64);
    cylinder(world, 1.68, 1.68, 0.025, felt, 0, 1.359, 0, 64);
    ring(world, 1.74, 0.012, brass, 0, 1.355, 0);
    ring(world, 1.51, 0.009, mat("#93a281"), 0, 1.376, 0);
    cylinder(world, 0.22, 0.28, 0.92, edgeTimber, 0, 0.58, 0, 8);
    for (let i = 0; i < 4; i += 1) {
      const foot = box(world, 1.54, 0.14, 0.2, timber, 0, 0.13, 0);
      foot.rotation.y = (i * Math.PI) / 2;
      box(
        world,
        0.06,
        0.48,
        0.06,
        brass,
        Math.sin((i * Math.PI) / 2) * 0.2,
        0.63,
        Math.cos((i * Math.PI) / 2) * 0.2,
        0.01,
      );
    }
    // Center cards and a stack of tactile chips.
    for (let i = 0; i < 3; i += 1) {
      const card = box(
        world,
        0.23,
        0.014,
        0.34,
        paper,
        -0.2 + i * 0.22,
        1.39 + i * 0.004,
        -0.09 + i * 0.035,
        0.018,
      );
      card.rotation.y = -0.12 + i * 0.12;
      const emblem = mesh(
        world,
        new THREE.OctahedronGeometry(0.044),
        i === 1 ? wine : dark,
        -0.2 + i * 0.22,
        1.414 + i * 0.004,
        -0.09 + i * 0.035,
      );
      emblem.scale.y = 0.1;
    }
    const chipRed = mat("#a45d4a");
    const chipCream = mat("#ddcca4");
    for (let i = 0; i < 7; i += 1)
      cylinder(
        world,
        0.075,
        0.075,
        0.025,
        i % 2 ? chipCream : chipRed,
        0.38,
        1.393 + i * 0.025,
        0.42,
        16,
      );
    for (let i = 0; i < 4; i += 1)
      cylinder(
        world,
        0.075,
        0.075,
        0.025,
        i % 2 ? chipCream : felt,
        0.58,
        1.393 + i * 0.025,
        0.29,
        16,
      );

    const makeChair = (angle: number) => {
      const chair = new THREE.Group();
      chair.position.set(Math.sin(angle) * 2.33, 0, Math.cos(angle) * 2.33);
      chair.rotation.y = angle + Math.PI;
      world.add(chair);
      const upholstery = mat("#6b4d40");
      box(chair, 0.78, 0.12, 0.67, timber, 0, 0.61, 0);
      box(chair, 0.71, 0.1, 0.62, upholstery, 0, 0.71, 0.015, 0.05);
      box(chair, 0.78, 0.81, 0.14, timber, 0, 1.15, -0.32, 0.055);
      box(chair, 0.63, 0.6, 0.075, upholstery, 0, 1.17, -0.229, 0.06);
      for (const x of [-0.3, 0.3])
        for (const z of [-0.24, 0.24]) {
          box(chair, 0.08, 0.59, 0.08, edgeTimber, x, 0.3, z, 0.01);
          box(chair, 0.084, 0.09, 0.084, brass, x, 0.07, z, 0.01);
        }
    };

    const count = Math.max(6, people.length);
    const skinColors = [
      "#e9bb91",
      "#af795a",
      "#f1cbae",
      "#d5a878",
      "#b88767",
      "#e4b393",
    ];
    const hairColors = [
      "#513526",
      "#292b2c",
      "#aa7545",
      "#3e2f2c",
      "#3e313f",
      "#d1b577",
    ];
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.PI / 6;
      makeChair(angle);
      const person = people[i];
      if (!person) continue;
      const avatar = new THREE.Group();
      avatar.position.set(Math.sin(angle) * 2.27, 0, Math.cos(angle) * 2.27);
      avatar.rotation.y = angle + Math.PI;
      world.add(avatar);
      const skin = mat(skinColors[i % 6]);
      const hair = mat(hairColors[i % 6]);
      const jacket = mat(
        /^#[0-9a-fA-F]{3,8}$/.test(person.color ?? "")
          ? person.color!
          : PALETTES[i % PALETTES.length],
      );
      const trousers = mat(i % 2 ? "#45484c" : "#3e4542");
      const shoes = mat("#272a2b");
      const shirt = mat("#e8d9be");
      const body = new THREE.Group();
      avatar.add(body);
      box(body, 0.59, 0.65, 0.35, jacket, 0, 1.18, 0, 0.06);
      box(body, 0.17, 0.56, 0.02, shirt, 0, 1.2, 0.182, 0.008);
      // Jacket lapels and an understated brass button.
      const leftLapel = box(
        body,
        0.09,
        0.28,
        0.028,
        jacket,
        -0.104,
        1.36,
        0.203,
        0.006,
      );
      leftLapel.rotation.z = 0.25;
      const rightLapel = box(
        body,
        0.09,
        0.28,
        0.028,
        jacket,
        0.104,
        1.36,
        0.203,
        0.006,
      );
      rightLapel.rotation.z = -0.25;
      mesh(body, new THREE.SphereGeometry(0.017, 8, 6), brass, 0, 1.06, 0.216);
      box(body, 0.2, 0.38, 0.18, jacket, -0.37, 1.2, 0.03, 0.045);
      box(body, 0.17, 0.16, 0.2, skin, -0.37, 1.04, 0.14, 0.035);
      for (const x of [-0.16, 0.16]) {
        box(avatar, 0.22, 0.2, 0.45, trousers, x, 0.78, 0.16, 0.035);
        box(avatar, 0.21, 0.45, 0.2, trousers, x, 0.53, 0.31, 0.03);
        box(avatar, 0.23, 0.15, 0.33, shoes, x, 0.3, 0.37, 0.035);
      }

      const head = new THREE.Group();
      head.position.set(0, 1.81, 0);
      body.add(head);
      box(head, 0.47, 0.49, 0.46, skin, 0, 0, 0, 0.075);
      box(head, 0.51, 0.16, 0.49, hair, 0, 0.215, -0.017, 0.06);
      box(head, 0.49, 0.34, 0.12, hair, 0, 0.045, -0.205, 0.025);
      box(head, 0.085, 0.18, 0.14, hair, -0.222, 0.095, 0.12, 0.022);
      box(head, 0.085, 0.14, 0.14, hair, 0.222, 0.11, 0.12, 0.022);
      box(head, 0.06, 0.075, 0.018, dark, -0.105, 0.016, 0.234, 0.012);
      box(head, 0.06, 0.075, 0.018, dark, 0.105, 0.016, 0.234, 0.012);
      box(head, 0.05, 0.045, 0.04, skin, 0, -0.05, 0.24, 0.012);
      box(head, 0.065, 0.014, 0.014, mat("#855e4b"), 0, -0.12, 0.237, 0.004);
      box(head, 0.08, 0.12, 0.12, skin, -0.251, -0.032, 0, 0.032);
      box(head, 0.08, 0.12, 0.12, skin, 0.251, -0.032, 0, 0.032);

      // Distinct silhouettes: a beanie, glasses, curls, a bob and a little cap.
      if (i % 6 === 0) {
        box(head, 0.51, 0.14, 0.49, mat("#915246"), 0, 0.285, -0.015, 0.07);
        box(head, 0.54, 0.085, 0.5, mat("#a86954"), 0, 0.208, -0.008, 0.026);
      } else if (i % 6 === 1) {
        const glasses = mat("#b59860", 0.4, 0.35);
        for (const x of [-0.111, 0.111]) {
          const rim = mesh(
            head,
            new THREE.TorusGeometry(0.085, 0.011, 6, 16),
            glasses,
            x,
            0.018,
            0.256,
          );
          rim.scale.y = 0.8;
        }
        box(head, 0.05, 0.016, 0.022, glasses, 0, 0.025, 0.259, 0.002);
      } else if (i % 6 === 2) {
        for (let curl = 0; curl < 8; curl += 1)
          mesh(
            head,
            new THREE.IcosahedronGeometry(0.1, 1),
            hair,
            -0.19 + (curl % 4) * 0.12,
            0.27 + (curl % 2) * 0.03,
            -0.12 + Math.floor(curl / 4) * 0.23,
          );
      } else if (i % 6 === 3) {
        box(head, 0.115, 0.42, 0.31, hair, -0.232, 0.005, -0.08, 0.03);
        box(head, 0.115, 0.42, 0.31, hair, 0.232, 0.005, -0.08, 0.03);
        box(head, 0.24, 0.075, 0.06, hair, -0.09, 0.169, 0.23, 0.012);
      } else if (i % 6 === 4) {
        cylinder(head, 0.25, 0.28, 0.14, jacket, 0, 0.3, -0.012, 8);
        box(head, 0.37, 0.035, 0.23, jacket, 0, 0.245, 0.22, 0.06);
      } else {
        const fringe = box(head, 0.4, 0.18, 0.2, hair, -0.025, 0.2, 0.15, 0.04);
        fringe.rotation.z = -0.12;
      }

      const arm = new THREE.Group();
      arm.position.set(0.36, 1.32, 0);
      body.add(arm);
      const sleeve = box(arm, 0.2, 0.34, 0.2, jacket, 0, -0.1, 0.1, 0.04);
      sleeve.rotation.x = -0.6;
      box(arm, 0.17, 0.16, 0.2, skin, 0, -0.14, 0.24, 0.04);
      for (let c = 0; c < 2; c += 1) {
        const card = box(
          arm,
          0.18,
          0.25,
          0.014,
          paper,
          -0.035 + c * 0.11,
          -0.005,
          0.28 + c * 0.005,
          0.01,
        );
        card.rotation.z = c ? -0.18 : 0.13;
        const cardBack = box(
          arm,
          0.13,
          0.2,
          0.005,
          wine,
          -0.035 + c * 0.11,
          -0.005,
          0.29 + c * 0.005,
          0.008,
        );
        cardBack.rotation.z = card.rotation.z;
      }

      // A small set of face-down cards and a coaster at each place.
      const place = new THREE.Group();
      place.rotation.y = angle;
      world.add(place);
      for (let c = 0; c < 2; c += 1) {
        const card = box(
          place,
          0.2,
          0.012,
          0.29,
          paper,
          c * 0.16 - 0.08,
          1.397,
          1.14 + c * 0.04,
          0.014,
        );
        card.rotation.y = c * -0.18;
        const back = box(
          place,
          0.166,
          0.003,
          0.247,
          wine,
          c * 0.16 - 0.08,
          1.405,
          1.14 + c * 0.04,
          0.01,
        );
        back.rotation.y = card.rotation.y;
      }
      cylinder(place, 0.1, 0.1, 0.013, bronze, 0.36, 1.39, 1.15, 24);
      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: "#d5b077",
        transparent: true,
        opacity: 0.44,
        roughness: 0.12,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      materials.add(glassMaterial);
      cylinder(place, 0.067, 0.055, 0.14, glassMaterial, 0.36, 1.47, 1.15, 16);
      cylinder(
        place,
        0.052,
        0.05,
        0.065,
        mat("#ac7436", 0.23),
        0.36,
        1.432,
        1.15,
        16,
      );

      const halo = ring(avatar, 0.47, 0.018, basic("#eab46c", 0.7), 0, 0.04, 0);
      halo.visible = false;
      avatar.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.userData.playerUid = person.uid;
          clickable.push(node);
        }
      });
      const labelPosition = new THREE.Vector3(
        avatar.position.x,
        2.43,
        avatar.position.z,
      );
      characters.push({
        root: avatar,
        body,
        head,
        arm,
        halo,
        uid: person.uid,
        index: i,
        labelPosition,
      });
    }

    // A solid brass pendant, kept high enough to reveal the entire table.
    cylinder(world, 0.014, 0.014, 1.8, dark, 0, 4.61, -0.03, 8);
    cylinder(world, 0.16, 0.17, 0.16, bronze, 0, 3.78, -0.03, 24);
    cylinder(
      world,
      0.25,
      0.76,
      0.37,
      mat("#958061", 0.4, 0.58),
      0,
      3.535,
      -0.03,
      48,
    );
    cylinder(world, 0.77, 0.77, 0.05, brass, 0, 3.335, -0.03, 48);
    cylinder(world, 0.69, 0.69, 0.016, basic("#ffe6ae"), 0, 3.303, -0.03, 48);
    // Soft light pool on the felt instead of a heavy bloom post-processing pass.
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext("2d");
    if (glowContext) {
      const gradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(255,213,144,0.12)");
      gradient.addColorStop(0.4, "rgba(255,207,127,0.07)");
      gradient.addColorStop(1, "rgba(255,201,117,0)");
      glowContext.fillStyle = gradient;
      glowContext.fillRect(0, 0, 128, 128);
      const glowTexture = new THREE.CanvasTexture(glowCanvas);
      textures.add(glowTexture);
      const glowMaterial = new THREE.MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materials.add(glowMaterial);
      const pool = mesh(
        world,
        new THREE.PlaneGeometry(3.36, 3.36),
        glowMaterial,
        0,
        1.379,
        0,
      );
      pool.rotation.x = -Math.PI / 2;
      pool.receiveShadow = false;
    }

    // Dust motes are deliberately sparse, a little life without visual noise.
    const particlesGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(45 * 3);
    for (let i = 0; i < 45; i += 1) {
      particlePositions[i * 3] = Math.sin(i * 29.7) * 3.7;
      particlePositions[i * 3 + 1] = 0.6 + (i % 17) * 0.2;
      particlePositions[i * 3 + 2] = Math.cos(i * 12.3) * 2.7;
    }
    particlesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );
    geometries.add(particlesGeometry);
    const particleMaterial = new THREE.PointsMaterial({
      color: "#dfbd80",
      size: 0.025,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    materials.add(particleMaterial);
    const particles = new THREE.Points(particlesGeometry, particleMaterial);
    world.add(particles);

    let width = 1;
    let height = 1;
    let frame = 0;
    let hoverUid: string | null = null;
    let pointerDown = false;
    let dragged = false;
    let pointerStartX = 0;
    let pointerLastX = 0;
    let angleOffset = 0;
    let cameraAngle = 0.29;
    let pointerX = 0;
    let pointerY = 0;
    let isVisible = true;
    let isDocumentVisible = !document.hidden;
    let needsRender = true;
    let lastRenderTime = 0;
    let lastActivePlayer: string | undefined;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stopMotion = reducedMotion || motionQuery.matches;
    const changeMotion = () => {
      stopMotion = reducedMotion || motionQuery.matches;
      needsRender = true;
    };
    motionQuery.addEventListener("change", changeMotion);

    const resize = () => {
      width = Math.max(host.clientWidth, 1);
      height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
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
      const intersection = raycaster.intersectObjects(clickable, false)[0];
      return intersection?.object.userData.playerUid as string | undefined;
    };
    const onPointerMove = (event: PointerEvent) => {
      needsRender = true;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      if (pointerDown) {
        angleOffset = THREE.MathUtils.clamp(
          angleOffset - (event.clientX - pointerLastX) * 0.003,
          -0.7,
          0.7,
        );
        pointerLastX = event.clientX;
        if (Math.abs(event.clientX - pointerStartX) > 5) dragged = true;
        return;
      }
      const uid = pick(event) ?? null;
      if (uid !== hoverUid) {
        hoverUid = uid;
        setHovered(uid);
        renderer.domElement.style.cursor = uid ? "pointer" : "grab";
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = true;
      dragged = false;
      pointerStartX = event.clientX;
      pointerLastX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!dragged) {
        const uid = pick(event);
        if (uid) selectionRef.current?.(uid);
      }
      pointerDown = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = hoverUid ? "pointer" : "grab";
    };
    const onPointerLeave = () => {
      needsRender = true;
      pointerX = 0;
      pointerY = 0;
      hoverUid = null;
      setHovered(null);
    };
    const onPointerCancel = () => {
      pointerDown = false;
      dragged = false;
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    resetRef.current = () => {
      angleOffset = 0;
      pointerX = 0;
      pointerY = 0;
      hoverUid = null;
      setHovered(null);
      needsRender = true;
    };

    const labelVector = new THREE.Vector3();
    const startTime = performance.now();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!isVisible || !isDocumentVisible) return;
      const now = performance.now();
      if (stopMotion && !needsRender && lastActivePlayer === activeRef.current)
        return;
      // Idle movement only needs 30 fps; reduced-motion scenes render on demand.
      if (!stopMotion && now - lastRenderTime < 1000 / 30) return;
      const delta = Math.min((now - lastRenderTime) / 1000, 0.1);
      lastRenderTime = now;
      lastActivePlayer = activeRef.current;
      needsRender = false;
      const time = (now - startTime) / 1000;
      const breathTime = stopMotion ? 0 : time;
      const desiredAngle =
        0.29 + angleOffset + (stopMotion ? 0 : pointerX * 0.045);
      cameraAngle = stopMotion
        ? desiredAngle
        : cameraAngle +
          (desiredAngle - cameraAngle) * (1 - Math.exp(-delta * 3.2));
      const aspect = width / height;
      // Preserve the complete room on phones while letting desktop show its details.
      const distance = aspect < 1.08 ? 13 / Math.max(aspect, 0.66) ** 0.47 : 13;
      const vertical = distance * (mode === "room" ? 0.67 : 0.63);
      camera.position.set(
        Math.sin(cameraAngle) * distance,
        vertical + (stopMotion ? 0 : pointerY * 0.12),
        Math.cos(cameraAngle) * distance,
      );
      camera.lookAt(target);
      camera.updateMatrixWorld();
      for (const character of characters) {
        character.body.position.y =
          Math.sin(breathTime * 1.3 + character.index * 1.8) * 0.016;
        character.head.rotation.y =
          Math.sin(breathTime * 0.55 + character.index * 2) * 0.08;
        character.head.rotation.z =
          Math.sin(breathTime * 0.7 + character.index) * 0.025;
        character.arm.rotation.x =
          Math.sin(breathTime * 0.8 + character.index) * 0.038;
        const selected =
          activeRef.current === character.uid || hoverUid === character.uid;
        character.halo.visible = selected;
        character.root.scale.setScalar(selected ? 1.025 : 1);
        const label = labelRefs.current.get(character.uid);
        if (label) {
          labelVector.copy(character.labelPosition).project(camera);
          label.style.transform = `translate(-50%, -50%) translate(${(labelVector.x * 0.5 + 0.5) * width}px, ${(-labelVector.y * 0.5 + 0.5) * height}px)`;
          label.style.opacity = labelVector.z > 1 ? "0" : "1";
          label.style.zIndex = String(Math.round((1 - labelVector.z) * 1000));
        }
      }
      if (!stopMotion) {
        particles.rotation.y = time * 0.014;
        particles.position.y = Math.sin(time * 0.2) * 0.06;
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
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      onContextRestored,
    );

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", changeMotion);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
      );
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      warmKey.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      scene.clear();
      resetRef.current = () => {};
    };
    // People names and ready states are rendered in HTML and do not rebuild GPU assets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey, mode, reducedMotion, quality]);

  return (
    <div className={`lounge-scene lounge-scene--${mode}`} ref={hostRef}>
      <div className="lounge-scene__ambient" aria-hidden="true" />
      {failed ? (
        <div
          className="lounge-scene__fallback"
          role="img"
          aria-label="따뜻한 조명 아래 친구들이 둘러앉는 원형 게임 테이블"
        >
          <div className="lounge-scene__fallback-lamp" />
          <div className="lounge-scene__fallback-table">
            <span>THE OTHER SIDE</span>
          </div>
          <p>테이블에 모여, 서로의 생각을 발견해요.</p>
        </div>
      ) : (
        <div className="lounge-scene__labels" aria-label="테이블 참가자">
          {people.map((person) => (
            <button
              key={person.uid}
              ref={(node) => {
                if (node) labelRefs.current.set(person.uid, node);
                else labelRefs.current.delete(person.uid);
              }}
              className={`lounge-scene__name${activePlayer === person.uid || hovered === person.uid ? " lounge-scene__name--active" : ""}`}
              onClick={() => onPlayerSelect?.(person.uid)}
              aria-label={`${person.nickname}${person.ready ? ", 준비 완료" : ""}${activePlayer === person.uid ? ", 선택됨" : ""}`}
              aria-pressed={
                onPlayerSelect ? activePlayer === person.uid : undefined
              }
              tabIndex={onPlayerSelect ? 0 : -1}
              style={
                {
                  "--player-color": person.color || "#b8c8bc",
                } as React.CSSProperties
              }
            >
              <span className="lounge-scene__name-dot" />
              {person.nickname}
              {mode === "room" && person.ready && (
                <span className="lounge-scene__ready" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="lounge-scene__bottom">
        <span className="lounge-scene__hint">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4 7.5a7 7 0 0 1 12 0M16 12.5a7 7 0 0 1-12 0M3.5 4v4h4m9 8v-4h-4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          드래그해서 둘러보기
        </span>
        <button
          className="lounge-scene__reset"
          onClick={() => resetRef.current()}
          aria-label="카메라 시점 초기화"
          title="시점 초기화"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4.5 6.5A6 6 0 1 1 4 12M4.5 3v4h4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
