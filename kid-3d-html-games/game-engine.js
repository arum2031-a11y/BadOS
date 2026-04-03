(function () {
  const cfg = window.GAME_CONFIG;
  if (!cfg) {
    throw new Error('GAME_CONFIG not found.');
  }

  const app = document.getElementById('app');
  const hud = document.getElementById('hud');
  const statusEl = document.getElementById('status');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.background || '#87ceeb');

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 14, 18);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 42),
    new THREE.MeshStandardMaterial({ color: cfg.groundColor || '#7dcf6d' })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const bounds = 19;
  const player = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: cfg.playerColor || '#1f7aff' })
  );
  player.position.set(0, 0.6, 0);
  scene.add(player);

  const keys = {};
  window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

  function makeTargetGeometry(type) {
    switch (type) {
      case 'sphere':
        return new THREE.SphereGeometry(0.55, 18, 18);
      case 'cone':
        return new THREE.ConeGeometry(0.55, 1.1, 18);
      case 'torus':
        return new THREE.TorusGeometry(0.45, 0.2, 12, 24);
      case 'cylinder':
        return new THREE.CylinderGeometry(0.45, 0.45, 1, 18);
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }

  const targetGeometry = makeTargetGeometry(cfg.targetShape || 'box');
  const targetMaterial = new THREE.MeshStandardMaterial({ color: cfg.targetColor || '#ff4f4f' });

  function randomPos() {
    return (Math.random() * 2 - 1) * (bounds - 1);
  }

  const targets = [];
  function spawnTarget() {
    const t = new THREE.Mesh(targetGeometry, targetMaterial.clone());
    t.position.set(randomPos(), 0.7, randomPos());
    t.rotation.y = Math.random() * Math.PI * 2;
    scene.add(t);
    targets.push(t);
  }

  const maxTargets = cfg.maxTargets || 10;
  for (let i = 0; i < Math.min(5, maxTargets); i++) spawnTarget();

  const speed = cfg.playerSpeed || 7;
  let score = 0;
  const goal = cfg.goal || 15;
  let timeLeft = cfg.timeLimit || 60;
  let last = performance.now();
  let finished = false;

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function updateHud() {
    hud.innerHTML = `<strong>${cfg.title}</strong><br>Score: ${score}/${goal} | Time: ${Math.ceil(timeLeft)}s<br>${cfg.instructions}`;
  }

  function handleMovement(dt) {
    let vx = 0;
    let vz = 0;
    if (keys['arrowup'] || keys['w']) vz -= 1;
    if (keys['arrowdown'] || keys['s']) vz += 1;
    if (keys['arrowleft'] || keys['a']) vx -= 1;
    if (keys['arrowright'] || keys['d']) vx += 1;

    const len = Math.hypot(vx, vz) || 1;
    player.position.x += (vx / len) * speed * dt;
    player.position.z += (vz / len) * speed * dt;
    player.position.x = Math.max(-bounds, Math.min(bounds, player.position.x));
    player.position.z = Math.max(-bounds, Math.min(bounds, player.position.z));
  }

  function handleTargets(dt, nowMs) {
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      t.rotation.y += dt * 1.8;
      t.position.y = 0.7 + Math.sin((nowMs * 0.002) + i) * 0.15;
      if (player.position.distanceTo(t.position) < 1.2) {
        scene.remove(t);
        targets.splice(i, 1);
        score += 1;
        if (score < goal) spawnTarget();
      }
    }

    while (targets.length < Math.min(5, maxTargets) && score + targets.length < goal) {
      spawnTarget();
    }
  }

  function animate(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!finished) {
      timeLeft -= dt;
      handleMovement(dt);
      handleTargets(dt, now);

      if (score >= goal) {
        finished = true;
        setStatus(`🎉 You win ${cfg.title}! Final score: ${score}`);
      } else if (timeLeft <= 0) {
        finished = true;
        setStatus(`⏰ Time up in ${cfg.title}. Final score: ${score}/${goal}`);
      }
    }

    updateHud();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  updateHud();
  setStatus('Use WASD or Arrow keys to move and collect targets.');
  requestAnimationFrame(animate);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
