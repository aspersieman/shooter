/*
 * Shooter - dependency-free canvas game boilerplate.
 *
 * The canvas keeps a fixed internal resolution (see index.html), so all game
 * coordinates below are in "game pixels" regardless of the window size.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const CONFIG = {
    player: { radius: 16, speed: 230, maxHealth: 5, invulnerableFor: 0.8 },
    bullet: { radius: 4, speed: 620, fireInterval: 0.13 },
    enemy: { radius: 14, speed: 60, hitFlashFor: 0.1 },
    spawn: { startInterval: 1.3, minInterval: 0.25, rampSeconds: 120 },
  };

  const MOVEMENT_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  ]);

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  const keys = new Set();
  const mouse = { x: WIDTH / 2, y: HEIGHT / 2, down: false };

  addEventListener('keydown', (event) => {
    if (MOVEMENT_KEYS.has(event.code) || event.code === 'KeyR' || event.code === 'Space') {
      event.preventDefault();
    }
    keys.add(event.code);
  });

  addEventListener('keyup', (event) => keys.delete(event.code));

  // Don't leave the player running / firing if the window loses focus.
  addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    // Convert screen coordinates into fixed game coordinates.
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    mouse.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouse.down = true;
  });

  addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.down = false;
  });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let state;

  function resetGame() {
    state = {
      elapsed: 0,
      score: 0,
      gameOver: false,
      fireCooldown: 0,
      spawnTimer: 0.7,
      player: {
        x: WIDTH / 2,
        y: HEIGHT / 2,
        health: CONFIG.player.maxHealth,
        invulnerableFor: 0,
      },
      bullets: [],
      enemies: [],
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // 0 at the start of the game, 1 after spawn.rampSeconds.
  function difficulty() {
    return Math.min(state.elapsed / CONFIG.spawn.rampSeconds, 1);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  function update(dt) {
    if (state.gameOver) {
      if (keys.has('KeyR')) resetGame();
      return;
    }

    state.elapsed += dt;
    const player = state.player;
    player.invulnerableFor = Math.max(0, player.invulnerableFor - dt);

    // WASD / arrow movement, normalised so diagonals aren't faster.
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      const r = CONFIG.player.radius;
      player.x = clamp(player.x + (dx / length) * CONFIG.player.speed * dt, r, WIDTH - r);
      player.y = clamp(player.y + (dy / length) * CONFIG.player.speed * dt, r, HEIGHT - r);
    }

    // Firing: hold left mouse button for continuous fire.
    state.fireCooldown -= dt;
    if (mouse.down && state.fireCooldown <= 0) {
      fireBullet();
      state.fireCooldown = CONFIG.bullet.fireInterval;
    }

    updateBullets(dt);
    updateEnemies(dt);
  }

  function fireBullet() {
    const player = state.player;
    let dx = mouse.x - player.x;
    let dy = mouse.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    dx /= distance;
    dy /= distance;

    const offset = CONFIG.player.radius + CONFIG.bullet.radius + 2;
    state.bullets.push({
      x: player.x + dx * offset,
      y: player.y + dy * offset,
      vx: dx * CONFIG.bullet.speed,
      vy: dy * CONFIG.bullet.speed,
    });
  }

  function updateBullets(dt) {
    const r = CONFIG.bullet.radius;

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (bullet.x < -r || bullet.x > WIDTH + r || bullet.y < -r || bullet.y > HEIGHT + r) {
        state.bullets.splice(i, 1);
        continue;
      }

      const hitIndex = state.enemies.findIndex((enemy) =>
        circlesOverlap(bullet.x, bullet.y, r, enemy.x, enemy.y, enemy.radius)
      );

      if (hitIndex !== -1) {
        state.bullets.splice(i, 1);
        const enemy = state.enemies[hitIndex];
        enemy.health -= 1;
        enemy.hitFlashFor = CONFIG.enemy.hitFlashFor;
        if (enemy.health <= 0) {
          state.enemies.splice(hitIndex, 1);
          state.score += 1;
        }
      }
    }
  }

  function updateEnemies(dt) {
    const level = difficulty();

    // Spawn zombies from a random edge, faster and tougher over time.
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(level);
      const { startInterval, minInterval } = CONFIG.spawn;
      state.spawnTimer = startInterval + (minInterval - startInterval) * level;
    }

    const player = state.player;

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      enemy.hitFlashFor = Math.max(0, enemy.hitFlashFor - dt);

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      enemy.x += (dx / distance) * enemy.speed * dt;
      enemy.y += (dy / distance) * enemy.speed * dt;

      if (
        circlesOverlap(player.x, player.y, CONFIG.player.radius, enemy.x, enemy.y, enemy.radius) &&
        player.invulnerableFor === 0
      ) {
        player.health -= 1;
        player.invulnerableFor = CONFIG.player.invulnerableFor;
        state.enemies.splice(i, 1); // One hit per zombie; keeps collisions simple.
        if (player.health <= 0) state.gameOver = true;
      }
    }
  }

  function spawnEnemy(level) {
    const radius = CONFIG.enemy.radius;
    const side = Math.floor(Math.random() * 4);
    let x;
    let y;

    if (side === 0) { x = Math.random() * WIDTH; y = -radius; }
    else if (side === 1) { x = WIDTH + radius; y = Math.random() * HEIGHT; }
    else if (side === 2) { x = Math.random() * WIDTH; y = HEIGHT + radius; }
    else { x = -radius; y = Math.random() * HEIGHT; }

    state.enemies.push({
      x,
      y,
      radius,
      speed: CONFIG.enemy.speed * (1 + level * 0.9) * (0.85 + Math.random() * 0.3),
      health: 1 + Math.floor(state.elapsed / 45),
      hitFlashFor: 0,
    });
  }

  function circlesOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const sum = ar + br;
    return dx * dx + dy * dy < sum * sum;
  }

  // ---------------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------------

  function draw() {
    drawBackground();

    for (const enemy of state.enemies) drawEnemy(enemy);
    for (const bullet of state.bullets) drawBullet(bullet);
    drawPlayer();
    drawCrosshair();
    drawHud();

    if (state.gameOver) drawGameOver();
  }

  function drawBackground() {
    ctx.fillStyle = '#14171c';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < WIDTH; x += 40) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, HEIGHT);
    }
    for (let y = 40; y < HEIGHT; y += 40) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WIDTH, y + 0.5);
    }
    ctx.stroke();
  }

  function drawPlayer() {
    const player = state.player;
    const r = CONFIG.player.radius;

    // Aim line from the player toward the crosshair.
    const dx = mouse.x - player.x;
    const dy = mouse.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = 'rgba(170, 210, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + (dx / distance) * (r + 14), player.y + (dy / distance) * (r + 14));
    ctx.stroke();

    // Blink briefly after taking damage.
    if (player.invulnerableFor > 0 && Math.floor(player.invulnerableFor * 12) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }
    ctx.fillStyle = '#4aa3ff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#bfe0ff';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawCrosshair() {
    const x = mouse.x;
    const y = mouse.y;

    ctx.strokeStyle = '#ff5d5d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x - 6, y);
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 6);
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y + 18);
    ctx.stroke();

    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBullet(bullet) {
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, CONFIG.bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemy(enemy) {
    ctx.fillStyle = enemy.hitFlashFor > 0 ? '#ffffff' : '#6ab04c';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2f5d24';
    ctx.stroke();
  }

  function drawHud() {
    const seconds = Math.floor(state.elapsed);
    const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

    ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#dfe6f0';
    ctx.fillText(`SCORE ${state.score}`, 18, 16);
    ctx.fillText(`TIME  ${time}`, 18, 36);

    const health = 'HEALTH ' + '♥'.repeat(Math.max(0, state.player.health));
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff7b7b';
    ctx.fillText(health, WIDTH - 18, 16);
    ctx.textAlign = 'left';
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT / 2 - 30);

    ctx.font = '18px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#dfe6f0';
    ctx.fillText(`Score: ${state.score}`, WIDTH / 2, HEIGHT / 2 + 14);
    ctx.fillStyle = '#9aa5b5';
    ctx.fillText('Press R to restart', WIDTH / 2, HEIGHT / 2 + 48);
    ctx.textAlign = 'left';
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  let lastFrame = performance.now();

  function frame(now) {
    // Cap dt so a suspended tab doesn't teleport enemies on return.
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resetGame();
  requestAnimationFrame(frame);
})();
