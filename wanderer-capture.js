const smooth = (from, to, value) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** First-person capture. The caller owns time, pause and the eventual game over. */
export function createWandererCapture(THREE, { entity, camera, onSnap = () => {}, onComplete = () => {} }) {
  const settings = { duration: 7, playerDistance: .85, startEyeHeight: 1.7,
    liftedEyeHeight: 2.65, reachEnd: .2, liftEnd: .5, breakAt: .84,
    ...entity.metadata?.capture };
  const initialPosition = camera.position.clone();
  const initialRotation = camera.quaternion.clone();
  const originalFov = camera.fov;
  const grip = new THREE.Vector3();
  const face = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredRotation = new THREE.Quaternion();
  let elapsed = 0, snapped = false, completed = false;
  let snapshot = { progress: 0, fade: 0, pressure: 0, stage: 'grab' };

  function update(dt) {
    if (completed) return { ...snapshot };
    elapsed = Math.min(settings.duration, elapsed + Math.max(0, dt));
    const progress = elapsed / settings.duration;
    const lift = smooth(settings.reachEnd, settings.liftEnd, progress);
    entity.animateCapture?.(progress);
    entity.group.updateMatrixWorld(true);
    grip.set(0, settings.startEyeHeight + lift * (settings.liftedEyeHeight - settings.startEyeHeight), settings.playerDistance);
    entity.group.localToWorld(grip);
    face.set(0, 1.93, .07);
    entity.group.localToWorld(face);
    desiredPosition.copy(grip);
    if (progress > settings.liftEnd && progress < settings.breakAt) {
      const struggle = Math.sin(elapsed * 17) * .006 * smooth(.5, .65, progress);
      desiredPosition.x += struggle;
      desiredPosition.y += Math.cos(elapsed * 13) * .004;
    }
    camera.position.copy(desiredPosition);
    camera.lookAt(face);
    desiredRotation.copy(camera.quaternion);
    const reach = smooth(0, settings.reachEnd, progress);
    camera.position.lerpVectors(initialPosition, desiredPosition, reach);
    camera.quaternion.slerpQuaternions(initialRotation, desiredRotation, reach);
    if (progress >= settings.breakAt) {
      const release = smooth(settings.breakAt, settings.breakAt + .035, progress);
      camera.rotateZ(-.24 * release);
      camera.rotateX(-.12 * release);
      camera.position.y -= .08 * release;
      if (!snapped) { snapped = true; onSnap(); }
    }
    camera.fov = originalFov - 6 * smooth(.4, .8, progress);
    camera.updateProjectionMatrix();
    snapshot = { progress, fade: smooth(settings.breakAt + .025, 1, progress),
      pressure: smooth(.25, .8, progress),
      stage: progress < settings.reachEnd ? 'grab' : progress < settings.liftEnd ? 'lift' : progress < settings.breakAt ? 'hold' : 'release' };
    if (progress >= 1) { completed = true; onComplete(); }
    return { ...snapshot };
  }

  return { update, get state() { return { ...snapshot }; },
    dispose() { camera.fov = originalFov; camera.updateProjectionMatrix(); } };
}
