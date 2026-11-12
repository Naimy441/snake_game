// Camera debug (the ` key): two small views in the corner that look at the
// player's camera from outside, one from the side and one from above. The
// camera is drawn as a little body with its view lines (its field of view)
// reaching out over the board, so you can see where it sits on the snake and
// how much of the board it takes in. The snake's head is shown in them even in
// first person (where the real view hides it).
import * as THREE from 'three';

const REACH = 7; // how far the drawn view lines go, in cells
const DEG = 180 / Math.PI;

export class CameraDebug {
  constructor(renderer) {
    this.renderer = renderer;
    this.on = false;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.renderOrder = 999;
    const lineMat = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, fog: false });
    // the view: the four edge rays and the far rectangle (yellow), the line of
    // sight (white) and the horizon line at the eye (cyan)
    this.rays = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat('#ffe14a'));
    this.rays.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3));
    this.sight = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat('#ffffff', 0.8));
    this.sight.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
    // the view as a see-through fan
    this.fan = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false })
    );
    this.fan.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(5 * 3), 3));
    this.fan.geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
    // the camera itself: a box with a lens
    this.body = new THREE.Group();
    const bodyMat = new THREE.MeshBasicMaterial({ color: '#ff3a6a', depthTest: false, fog: false });
    this.body.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), bodyMat));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.08, 16), bodyMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.13;
    this.body.add(lens);
    for (const o of [this.rays, this.sight, this.fan, this.body]) {
      o.renderOrder = 999;
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.body.traverse((o) => (o.renderOrder = 999));
    this.side = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.top = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.label = document.createElement('div');
    this.label.id = 'cam-debug';
    this.label.className = 'hidden';
    document.body.appendChild(this.label);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.size = new THREE.Vector2();
  }

  toggle(scene) {
    this.on = !this.on;
    if (this.on && this.group.parent !== scene) scene.add(this.group);
    this.label.classList.toggle('hidden', !this.on);
    return this.on;
  }

  // Draw the camera and its view into the scene (hidden in the real view).
  sync(cam) {
    cam.updateMatrixWorld();
    const tv = Math.tan((cam.fov / 2) * (Math.PI / 180));
    const th = tv * cam.aspect;
    const o = cam.position;
    const corner = (sx, sy) => this.tmp.set(sx * th * REACH, sy * tv * REACH, -REACH).applyMatrix4(cam.matrixWorld).clone();
    const c = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
    const r = this.rays.geometry.attributes.position;
    let i = 0;
    for (let k = 0; k < 4; k++) {
      r.setXYZ(i++, o.x, o.y, o.z);
      r.setXYZ(i++, c[k].x, c[k].y, c[k].z);
      const n = c[(k + 1) % 4];
      r.setXYZ(i++, c[k].x, c[k].y, c[k].z);
      r.setXYZ(i++, n.x, n.y, n.z);
    }
    r.needsUpdate = true;
    const f = this.fan.geometry.attributes.position;
    f.setXYZ(0, o.x, o.y, o.z);
    c.forEach((p, k) => f.setXYZ(k + 1, p.x, p.y, p.z));
    f.needsUpdate = true;
    const ahead = this.tmp.set(0, 0, -REACH).applyMatrix4(cam.matrixWorld);
    const s = this.sight.geometry.attributes.position;
    s.setXYZ(0, o.x, o.y, o.z);
    s.setXYZ(1, ahead.x, ahead.y, ahead.z);
    // the horizon at eye height, straight ahead (how far down the camera looks)
    cam.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    s.setXYZ(2, o.x, o.y, o.z);
    s.setXYZ(3, o.x + this.fwd.x * REACH, o.y, o.z + this.fwd.z * REACH);
    s.needsUpdate = true;
    this.body.position.copy(o);
    this.body.quaternion.copy(cam.quaternion);
    this.right.set(-this.fwd.z, 0, this.fwd.x);
  }

  // After the frame: the two views in the bottom-right corner.
  render(scene, cam, { head = null, eye = 0, mode = '' } = {}) {
    if (!this.on) return;
    if (this.group.parent !== scene) scene.add(this.group);
    this.sync(cam);
    const r = this.renderer;
    r.getSize(this.size);
    const W = this.size.x;
    const H = this.size.y;
    const w = Math.round(Math.min(W * 0.3, 360));
    const h = Math.round(w * 0.7);
    const pad = 12;
    const o = cam.position;
    const mid = this.tmp.copy(o).addScaledVector(this.fwd, REACH * 0.4);
    // side: from the snake's right, level with the camera
    this.side.aspect = w / h;
    // close in, so it stays inside the walls; it frames the camera, the head
    // under it and the first few cells it looks over
    this.side.fov = 50;
    const near = this.tmp2.copy(o).addScaledVector(this.fwd, 1.6);
    this.side.position.copy(near).addScaledVector(this.right, 4.2).setY(o.y + 0.5);
    this.side.up.set(0, 1, 0);
    this.side.lookAt(near.x, o.y - 0.45, near.z);
    this.side.updateProjectionMatrix();
    // top: straight down, the camera's heading pointing up the view
    this.top.aspect = w / h;
    this.top.fov = 40;
    this.top.position.set(mid.x, o.y + 13, mid.z);
    this.top.up.copy(this.fwd);
    this.top.lookAt(mid.x, 0, mid.z);
    this.top.updateProjectionMatrix();

    const headWas = head ? head.visible : false;
    if (head) head.visible = true;
    this.group.visible = true;
    const autoClear = r.autoClear;
    r.autoClear = false;
    r.setScissorTest(true);
    const views = [[this.side, W - w - pad, pad + h + 8], [this.top, W - w - pad, pad]];
    for (const [c, x, y] of views) {
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      r.clear(true, true, false);
      r.render(scene, c);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.autoClear = autoClear;
    this.group.visible = false;
    if (head) head.visible = headWas;

    const vfov = cam.fov;
    const hfov = 2 * Math.atan(Math.tan((vfov / 2) * (Math.PI / 180)) * cam.aspect) * DEG;
    this.label.style.width = `${w}px`;
    this.label.style.bottom = `${pad + 2 * h + 8}px`;
    this.label.style.right = `${pad}px`;
    this.label.innerHTML =
      `<b>Camera · ${mode || '?'}</b>` +
      `<span>FOV ${vfov.toFixed(1)}° tall · ${hfov.toFixed(0)}° wide</span>` +
      `<span>eye ${eye.toFixed(2)} above the path</span>` +
      `<i>side view (top) · from above (bottom) · press \` to close</i>`;
  }
}
