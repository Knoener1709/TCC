/** Mapa de estados → (linha, frames, loop?, fps?) */
const STATE_MAP = {
  idle:    { row: 0, frames: 4, loop: true,  fps: 6  },
  tap:     { row: 1, frames: 3, loop: false, fps: 18 },
  wave:    { row: 2, frames: 5, loop: false, fps: 14 },
  success: { row: 3, frames: 4, loop: false, fps: 14 },
  error:   { row: 4, frames: 3, loop: false, fps: 12 },
  loading: { row: 5, frames: 5, loop: true,  fps: 10 },
};

const pet = document.querySelector('.pet');

// Espera o DOM carregar antes de inicializar
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM carregado, iniciando...');
  
  // Se a spritesheet não existir, ativa modo DEV (placeholder)
  try {
    const res = await fetch('./sprites/boto.png', { method: 'HEAD' });
    if (!res.ok) throw new Error('no sheet');
    console.log('Sprite encontrada!');
    pet.classList.remove('dev');  // Garante que o modo DEV está desativado
  } catch (err) {
    console.log('Sprite não encontrada, ativando modo DEV');
    pet.classList.add('dev');
  }
});

// Log para debug
console.log('JS carregado e executando!');

let playingOnce = false;

function play(state) {
  const cfg = STATE_MAP[state];
  if (!cfg) return;

  // Atualiza variáveis CSS
  pet.style.setProperty('--row', cfg.row);
  pet.style.setProperty('--frames', cfg.frames);
  pet.style.setProperty('--fps', cfg.fps ?? 12);

  // Duração = frames / fps (s)
  const dur = cfg.frames / (cfg.fps ?? 12);
  pet.style.animationDuration = `${dur}s`;

  // Reinicia a animação
  pet.classList.remove('run');
  void pet.offsetWidth; // reflow
  pet.classList.add('run');

  // Loop ou execução única
  playingOnce = !cfg.loop;
  pet.style.animationIterationCount = cfg.loop ? 'infinite' : '1';
}

// Voltar a idle quando terminar uma animação não-loop
pet.addEventListener('animationend', () => {
  if (playingOnce) {
    playingOnce = false;
    play('idle');
  }
});

// Wire dos botões
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => play(btn.dataset.action));
});

// Atalhos: 1..6
const KEYS = ['idle','tap','wave','success','error','loading'];
window.addEventListener('keydown', (e) => {
  const idx = Number(e.key) - 1;
  if (idx >= 0 && idx < KEYS.length) play(KEYS[idx]);
});

// start
play('idle');
