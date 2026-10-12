import { render } from 'preact';
import { App } from './app.jsx';
import { S } from './store.js';
import { bakeTextures } from '../fx/textures.js';
import { FogBackground } from '../fx/fog.js';
import { Particles } from '../fx/particles.js';
import { bindFx } from './fx.js';
import { audio } from '../audio/audio.js';

function boot() {
  bakeTextures();
  const settings = S().settings;
  if (settings.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('reduced');
  const fogCanvas = document.getElementById('fog');
  const fog = new FogBackground(fogCanvas);
  if (!fog.ok) document.documentElement.classList.add('fog-fallback');
  const motes = new Particles(document.getElementById('motes'));
  const applyQuality = (q) => {
    fog.setQuality(q === 'low' ? 'low' : q === 'standard' ? 'standard' : 'high');
    motes.enabled = q !== 'low';
    document.documentElement.dataset.quality = q;
  };
  applyQuality(settings.quality);
  bindFx(fog, motes);
  audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  audio.setMuted(settings.muted);
  window.__mm = { setQuality: applyQuality, fog, motes, audio, state: S };
  // audio needs a user gesture on mobile
  const unlock = () => { audio.unlock(); };
  addEventListener('pointerdown', unlock, { once: false, passive: true });
  addEventListener('keydown', unlock, { once: true });
  // keep the screen awake during a game
  let lock = null;
  const wake = async () => { try { if ('wakeLock' in navigator && !lock && document.visibilityState === 'visible' && S().screen === 'room') { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } } catch { /* ignore */ } };
  document.addEventListener('visibilitychange', wake);
  setInterval(wake, 15000);
  render(<App />, document.getElementById('root'));
  document.getElementById('boot')?.remove();
}

boot();
