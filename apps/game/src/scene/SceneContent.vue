<script setup lang="ts">
import { useLoop, useTres } from '@tresjs/core';
import {
  Color,
  Material,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Vector2,
  Vector3,
  type Group,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { BALL, PADDLE, forward, hitPlaneZ, rightSign, type Side } from '@mobitenis/sim';
import { PLAYER_COLORS } from '../colors.ts';
import type { GameSession } from '../game/session.ts';
import StaticScene from './StaticScene.vue';
import { cameraPose, viewLayout, type View } from './layout.ts';
import { paddleOverrides } from './overrides.ts';

const props = defineProps<{ session: GameSession; sides: Side[] }>();

const ball = shallowRef<Mesh>();
const paddles: [Group | undefined, Group | undefined] = [undefined, undefined];
const avatars: [Group | undefined, Group | undefined] = [undefined, undefined];
const arms: [Mesh | undefined, Mesh | undefined] = [undefined, undefined];
const setRef =
  <T,>(list: [T | undefined, T | undefined], side: Side) =>
  (el: unknown) => {
    list[side] = (el ?? undefined) as T | undefined;
  };

const cameras: [PerspectiveCamera, PerspectiveCamera] = [
  new PerspectiveCamera(60, 1, 0.05, 60),
  new PerspectiveCamera(60, 1, 0.05, 60),
];
/** Distance of the body behind the hitting plane (m). */
const BODY_BACK = 0.75;
const OWN_OPACITY = 0.22;

const colors = [new Color(PLAYER_COLORS[0]), new Color(PLAYER_COLORS[1])];
const ownMaterials: [Material[], Material[]] = [[], []];
let views: View[] = [];

const tres = useTres();
const { render, onBeforeRender } = useLoop();
let last = performance.now();

const up = new Vector3(0, 1, 0);
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQ = new Quaternion();

function bodyZ(side: Side): number {
  return hitPlaneZ(side) - forward(side) * BODY_BACK;
}

function syncScene(): void {
  const m = props.session.match;
  const b = ball.value;
  if (b) b.position.set(m.ball.pos.x, m.ball.pos.y, m.ball.pos.z);
  for (const side of [0, 1] as const) {
    const p = m.players[side];
    const g = paddles[side];
    const override = paddleOverrides[side];
    const f = forward(side);
    if (g) {
      g.position.set(p.paddle.pos.x, p.paddle.pos.y, p.paddle.pos.z);
      // Apply the newest phone pose right away, without waiting for a sim step.
      const lateral = override?.lateral ?? p.lateral;
      const pitch = override?.pitch ?? p.pitch;
      if (override && !p.swing) {
        g.position.x = p.avatarX + lateral * PADDLE.lateralReach * rightSign(side);
      }
      g.rotation.set(-pitch, side === 0 ? 0 : Math.PI, lateral >= 0 ? -0.5 : 0.5, 'YXZ');
    }
    const a = avatars[side];
    if (a) a.position.set(p.avatarX, 0, bodyZ(side));
    const arm = arms[side];
    if (arm && g) {
      tmpA.set(p.avatarX + rightSign(side) * 0.2 * Math.sign(p.lateral || 1), 1.32, bodyZ(side) + f * 0.05);
      tmpB.copy(g.position).sub(tmpA);
      const len = tmpB.length();
      arm.position.copy(tmpA).addScaledVector(tmpB, 0.5);
      tmpQ.setFromUnitVectors(up, tmpB.normalize());
      arm.quaternion.copy(tmpQ);
      arm.scale.set(1, Math.max(len, 0.01), 1);
    }
  }
}

function collectMaterials(root: Object3D | undefined, side: Side): void {
  if (!root) return;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as Material;
      mat.transparent = true;
      ownMaterials[side].push(mat);
    }
  });
}

function setOwnView(side: Side): void {
  for (const s of [0, 1] as const) {
    const opacity = props.sides.length > 0 && s === side ? OWN_OPACITY : 1;
    for (const mat of ownMaterials[s]) {
      (mat as MeshLambertMaterial).opacity = opacity;
      mat.depthWrite = opacity === 1;
    }
  }
}

function updateCamera(view: View): void {
  const cam = cameras[view.side];
  const p = props.session.match.players[view.side];
  const pose = cameraPose(view.side, p.avatarX, view.width / view.height);
  cam.position.set(...pose.position);
  cam.lookAt(...pose.target);
  cam.fov = pose.fov;
  cam.aspect = view.width / view.height;
  cam.updateProjectionMatrix();
}

const size = new Vector2();

onBeforeRender(() => {
  const now = performance.now();
  props.session.advance((now - last) / 1000);
  last = now;
  syncScene();
});

const stopRender = render((notify) => {
  const r = tres.renderer as WebGLRenderer;
  const scene = tres.scene.value;
  r.getSize(size);
  views = viewLayout(size.x, size.y, props.sides);
  r.setScissorTest(true);
  r.shadowMap.autoUpdate = false;
  r.shadowMap.needsUpdate = true; // shadows rendered once, shared by both views
  for (const view of views) {
    updateCamera(view);
    setOwnView(view.side);
    r.setViewport(view.x, view.y, view.width, view.height);
    r.setScissor(view.x, view.y, view.width, view.height);
    r.render(scene, cameras[view.side]);
  }
  r.setScissorTest(false);
  notify();
});

onMounted(() => {
  for (const side of [0, 1] as const) {
    collectMaterials(avatars[side], side);
    collectMaterials(arms[side], side);
  }
  last = performance.now();
  exposeTestHooks();
});

onBeforeUnmount(() => {
  stopRender();
  delete (window as unknown as { __mobitenisScene?: unknown }).__mobitenisScene;
});

/** Read-only hooks for end-to-end tests. */
function exposeTestHooks(): void {
  (window as unknown as { __mobitenisScene: unknown }).__mobitenisScene = {
    views: () => views.map((v) => ({ ...v })),
    /** Paddle x in the side's own camera, -1 (left edge) … 1 (right edge). */
    paddleScreenX(side: Side): number {
      const g = paddles[side];
      const view = views.find((v) => v.side === side);
      if (!g || !view) return NaN;
      updateCamera(view);
      return tmpA.copy(g.position).project(cameras[side]).x;
    },
  };
}

const bodyColor = (side: Side) => `#${colors[side]!.getHexString()}`;
const ballR = BALL.radius;
</script>

<template>
  <StaticScene />

  <TresMesh ref="ball" cast-shadow>
    <TresSphereGeometry :args="[ballR, 16, 12]" />
    <TresMeshLambertMaterial color="#fff6e8" :emissive="'#3a3020'" />
  </TresMesh>

  <TresGroup v-for="side in [0, 1] as const" :key="'p' + side" :ref="setRef(paddles, side)">
    <TresMesh :rotation="[Math.PI / 2, 0, 0]" cast-shadow>
      <TresCylinderGeometry :args="[0.075, 0.075, 0.012, 24]" />
      <TresMeshLambertMaterial :color="side === 0 ? '#c7231b' : '#1b1b1b'" />
    </TresMesh>
    <TresMesh :position="[0, -0.1, 0]" cast-shadow>
      <TresBoxGeometry :args="[0.026, 0.1, 0.022]" />
      <TresMeshLambertMaterial color="#d9b07a" />
    </TresMesh>
  </TresGroup>

  <TresGroup v-for="side in [0, 1] as const" :key="'a' + side" :ref="setRef(avatars, side)">
    <TresMesh :position="[0, 0.42, 0]" cast-shadow>
      <TresCapsuleGeometry :args="[0.13, 0.55, 4, 10]" />
      <TresMeshLambertMaterial color="#2a2f3a" />
    </TresMesh>
    <TresMesh :position="[0, 1.1, 0]" cast-shadow>
      <TresCapsuleGeometry :args="[0.21, 0.42, 4, 12]" />
      <TresMeshLambertMaterial :color="bodyColor(side)" />
    </TresMesh>
    <TresMesh :position="[0, 1.58, 0]" cast-shadow>
      <TresSphereGeometry :args="[0.13, 16, 12]" />
      <TresMeshLambertMaterial color="#f1c9a5" />
    </TresMesh>
  </TresGroup>

  <TresMesh v-for="side in [0, 1] as const" :key="'arm' + side" :ref="setRef(arms, side)" cast-shadow>
    <TresCylinderGeometry :args="[0.04, 0.035, 1, 8]" />
    <TresMeshLambertMaterial :color="bodyColor(side)" />
  </TresMesh>
</template>
