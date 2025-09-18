import './styles.css'
import './animations/sprites.css'
import './animations/boto.css'

/** Mapa de estados → (linha, frames, loop?, fps?) */
const STATE_MAP = {
  idle:    { row: 0, frames: 4, loop: true,  fps: 6  },  // 4 frames
  tap:     { row: 1, frames: 3, loop: false, fps: 18 },  // 3 frames
  wave:    { row: 2, frames: 5, loop: false, fps: 14 },  // 5 frames
  success: { row: 3, frames: 4, loop: false, fps: 14 },  // 4 frames
  error:   { row: 4, frames: 3, loop: false, fps: 12 },  // 3 frames
  loading: { row: 5, frames: 5, loop: true,  fps: 10 },  // 5 frames
}

const pet = document.querySelector('.pet')

// Se ainda não tiver a imagem /sprites/boto.png, ative o modo DEV (placeholder)
const testImage = new Image()
testImage.src = '/sprites/boto.png'
testImage.decode?.().catch(() => {}).finally(() => {
  if (!testImage.complete || testImage.naturalWidth === 0) {
    pet.classList.add('dev')  // visual de fallback
  }
})

let currentState = 'idle'
let playingOnce = false

function play(state) {
  const cfg = STATE_MAP[state]
  if (!cfg) return

  currentState = state

  // Atualiza variáveis CSS para a animação
  pet.style.setProperty('--row', cfg.row)
  pet.style.setProperty('--frames', cfg.frames)
  pet.style.setProperty('--fps', cfg.fps ?? 12)

  // Duração = frames / fps  (em segundos)
  const dur = cfg.frames / (cfg.fps ?? 12)
  pet.style.animationDuration = `${dur}s`

  // (Re)inicia a animação
  pet.classList.remove('run')   // força reflow pra reiniciar
  // trigger reflow
  void pet.offsetWidth
  pet.classList.add('run')

  // Loop ou "play once"
  playingOnce = !cfg.loop
  pet.style.animationIterationCount = cfg.loop ? 'infinite' : '1'
}

// Voltar ao idle quando uma animação não-loop terminar
pet.addEventListener('animationend', () => {
  if (playingOnce) {
    playingOnce = false
    play('idle')
  }
})

// Botões
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => play(btn.dataset.action))
})

// Atalhos de teclado: 1..6
const KEYS = ['idle','tap','wave','success','error','loading']
window.addEventListener('keydown', (e) => {
  const idx = Number(e.key) - 1
  if (idx >= 0 && idx < KEYS.length) play(KEYS[idx])
})

// Início
play('idle')
