import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const EPS = 1e-5;

function constant(samples, stride) {
  for (let i = stride; i < samples.length; i++) {
    if (Math.abs(samples[i] - samples[i % stride]) > EPS) return false;
  }
  return true;
}

// Bake the effect's parametric update(t) into transform keyframe tracks.
// Opacity fades are intentionally not baked — core glTF cannot animate
// material opacity, and the game drives fades at runtime anyway.
function bakeClip(effect, fps = 30) {
  const { root, duration, update } = effect;
  const nodes = [];
  root.traverse((o) => {
    if (o !== root) nodes.push(o);
  });

  const steps = Math.max(2, Math.round(duration * fps));
  const times = [];
  const data = nodes.map(() => ({ pos: [], quat: [], scale: [] }));

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    times.push(t * duration);
    update(t);
    nodes.forEach((n, i) => {
      data[i].pos.push(n.position.x, n.position.y, n.position.z);
      data[i].quat.push(n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w);
      data[i].scale.push(n.scale.x, n.scale.y, n.scale.z);
    });
  }

  const tracks = [];
  nodes.forEach((n, i) => {
    if (!constant(data[i].pos, 3)) tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.position`, times, data[i].pos));
    if (!constant(data[i].quat, 4)) tracks.push(new THREE.QuaternionKeyframeTrack(`${n.name}.quaternion`, times, data[i].quat));
    if (!constant(data[i].scale, 3)) tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.scale`, times, data[i].scale));
  });

  return new THREE.AnimationClip('play', duration, tracks);
}

export async function buildGlb(effect) {
  const clip = bakeClip(effect);

  // Pose at the hero frame so baked material opacities read well in
  // static viewers; transforms come from the clip regardless.
  effect.update(effect.heroT ?? 0);

  const exporter = new GLTFExporter();
  return exporter.parseAsync(effect.root, {
    binary: true,
    animations: clip.tracks.length ? [clip] : [],
  });
}

export async function exportEffect(effect, filename) {
  const buffer = await buildGlb(effect);
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return blob.size;
}
