export class Boto {
  /**
   * @param {HTMLElement} root Elemento raiz com classe .boto
   * @param {Object} options
   *  - mode: 'keyframes' | 'sprite'
   *  - framesMap: { [state:string]: { url:string, frames:number, durationMs:number } }
   */
  constructor(root, options = {}) {
    this.root = root
    this.gfx = root.querySelector('.boto-gfx')
    this.state = 'idle'
    this.mode = options.mode || 'keyframes'
    this.framesMap = options.framesMap || {}

    this.applyState('idle')
  }

  applyState(next) {
    this.state = next
    this.root.setAttribute('data-state', next)
    this.root.setAttribute('data-mode', this.mode)

    if (this.mode === 'sprite') {
      const cfg = this.framesMap[next]
      if (cfg?.url) {
        this.gfx.style.backgroundImage = `url(${cfg.url})`
        this.gfx.style.setProperty('--frames', cfg.frames ?? 4)
        this.gfx.style.animationDuration = (cfg.durationMs ?? 600) + 'ms'
        this.gfx.classList.add('sprite-play')
        this.gfx.classList.toggle('sprite-4', (cfg.frames ?? 4) === 4)
        this.gfx.classList.toggle('sprite-6', (cfg.frames ?? 6) === 6)
        this.gfx.classList.toggle('sprite-8', (cfg.frames ?? 8) === 8)
      }
    } else {
      // keyframes: nenhuma imagem, só CSS
      this.gfx.style.removeProperty('background-image')
      this.gfx.classList.remove('sprite-play','sprite-4','sprite-6','sprite-8')
    }
  }
}
