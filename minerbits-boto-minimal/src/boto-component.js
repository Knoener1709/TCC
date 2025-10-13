// Boto Sprite Web Component - module
// Usage: <boto-component size="64" sheet="sprites/boto.png"></boto-component>
const STATE_MAP = {
  idle:    { row: 0, frames: 4, loop: true,  fps: 6  },
  tap:     { row: 1, frames: 3, loop: false, fps: 18 },
  wave:    { row: 2, frames: 4, loop: false, fps: 14 },
  success: { row: 3, frames: 4, loop: false, fps: 14 },
  error:   { row: 4, frames: 3, loop: false, fps: 12 },
  loading: { row: 5, frames: 5, loop: true,  fps: 10 },
};

async function pickSheetCandidates(){
  const candidates = [
    new URL('sprites/boto.png', document.baseURI).href,
    new URL('./sprites/boto.png', document.baseURI).href,
    new URL('/sprites/boto.png', location.origin).href,
    new URL('boto.png', document.baseURI).href,
  ];
  for(const url of candidates){
    try{
      const r = await fetch(url, { method:'HEAD', cache:'no-store' });
      if(r.ok) return url;
    }catch(e){}
  }
  return null;
}

class BotoSprite extends HTMLElement{
  constructor(){
    super();
    this._size = parseInt(this.getAttribute('size')) || 64; // display size
    this._tile = parseInt(this.getAttribute('tile')) || 64; // source tile size
    this._sheetAttr = this.getAttribute('sheet') || null;

    const shadow = this.attachShadow({mode:'open'});
    const style = document.createElement('style');
    style.textContent = `:host{display:inline-block;line-height:0}canvas{image-rendering:pixelated;display:block}`;
    this._canvas = document.createElement('canvas');
    this._canvas.width = this._size;
    this._canvas.height = this._size;
    shadow.appendChild(style);
    shadow.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');
    this._img = new Image();
    this._loaded = false;

    this._state = 'idle';
    this._frameIndex = 0;
    this._animId = null;
    this._lastTick = 0;
    this._playResolve = null; // used when playing non-loop to resolve promise
  }

  static get observedAttributes(){ return ['size','sheet']; }

  attributeChangedCallback(name, oldV, newV){
    if(name==='size'){ this._size = parseInt(newV)||64; this._canvas.width=this._size; this._canvas.height=this._size; }
    if(name==='sheet'){ this._sheetAttr = newV; this._loadSheet(); }
  }

  connectedCallback(){
    this._canvas.width = this._size;
    this._canvas.height = this._size;
    this._loadSheet();
  }

  disconnectedCallback(){ this.stop(); }

  async _loadSheet(){
    if(this._sheetAttr){
      await this._setImageSrc(this._sheetAttr);
      return;
    }
    const url = await pickSheetCandidates();
    if(url) await this._setImageSrc(url);
    else this._showPlaceholder();
  }

  _setImageSrc(url){
    return new Promise((resolve,reject)=>{
      this._img.onload = ()=>{ 
        this._loaded = true; 
        this._imgWidth = this._img.width; 
        this._imgHeight = this._img.height; 
        // if tile wasn't explicitly provided, attempt to infer it by dividing height by number of rows (6)
        if(!this.hasAttribute('tile')){
          const rows = Object.keys(STATE_MAP).length;
          const inferred = Math.round(this._imgHeight / rows) || this._tile;
          this._tile = inferred;
        }
        this.drawFrame(0,0); resolve(); 
      };
      this._img.onerror = (e)=>{ this._showPlaceholder(); reject(e); };
      try{
        // resolve relative URLs against the document base
        const resolved = new URL(url, document.baseURI).href;
        console.log('[boto-component] loading spritesheet:', resolved);
        // some servers may require crossOrigin for CORS; set it as a best-effort
        this._img.crossOrigin = 'anonymous';
        this._img.src = resolved;
      }catch(err){
        console.warn('[boto-component] invalid sheet URL', url, err);
        this._showPlaceholder();
        reject(err);
      }
    });
  }

  _showPlaceholder(){
    this._ctx.clearRect(0,0,this._canvas.width,this._canvas.height);
    this._ctx.fillStyle = '#b76585';
    this._ctx.fillRect(0,0,this._canvas.width,this._canvas.height);
    this._ctx.fillStyle = '#fff';
    this._ctx.font = '10px monospace';
    this._ctx.textAlign = 'center';
    this._ctx.fillText('no sheet', this._canvas.width/2, this._canvas.height/2);
  }

  drawFrame(frameIndex, row){
    if(!this._loaded) return this._showPlaceholder();
    const sx = frameIndex * this._tile;
    const sy = row * this._tile;
    this._ctx.imageSmoothingEnabled = false;
    this._ctx.clearRect(0,0,this._canvas.width,this._canvas.height);
    this._ctx.drawImage(this._img, sx, sy, this._tile, this._tile, 0, 0, this._canvas.width, this._canvas.height);
  }

  _frameDurationForState(state){
    const cfg = STATE_MAP[state] || STATE_MAP['idle'];
    return 1000 / cfg.fps;
  }

  play(state){
    // returns a promise that resolves when a non-loop finishes, or immediately for loop
    if(!(state in STATE_MAP)) state = 'idle';
    this._state = state;
    this._frameIndex = 0;
    const cfg = STATE_MAP[state];
    this.drawFrame(0, cfg.row);
    // stop previous anim if any
    if(this._animId) cancelAnimationFrame(this._animId);
    // if loop, start continuous animation
    if(cfg.loop){
      this._startLoop(cfg);
      return Promise.resolve();
    }

    // non-loop: return promise and play frames once
    return new Promise((resolve)=>{
      this._playResolve = resolve;
      this._startLoop(cfg);
    });
  }

  // convenience: play once (returns a promise)
  playOnce(state){
    return this.play(state);
  }

  _startLoop(cfg){
    this._lastTick = performance.now();
    const step = (now)=>{
      const elapsed = now - this._lastTick;
      const dur = 1000 / (cfg.fps || 12);
      if(elapsed >= dur){
        this._frameIndex++;
        this._lastTick = now;
        if(this._frameIndex >= cfg.frames){
          if(cfg.loop){ this._frameIndex = 0; }
          else { // finished non-loop
            this.drawFrame(cfg.frames - 1, cfg.row);
            // resolve promise if present
            if(this._playResolve){ this._playResolve(); this._playResolve = null; }
            this.stop();
            this.dispatchEvent(new CustomEvent('ended', { detail:{ state: this._state } }));
            // after non-loop, auto-return to idle
            this.play('idle');
            return;
          }
        }
        const idx = this._frameIndex % cfg.frames;
        this.drawFrame(idx, cfg.row);
      }
      this._animId = requestAnimationFrame(step);
    };
    this._animId = requestAnimationFrame(step);
  }

  stop(){ if(this._animId) cancelAnimationFrame(this._animId); this._animId=null; }
}

customElements.define('boto-component', BotoSprite);

export default BotoSprite;
