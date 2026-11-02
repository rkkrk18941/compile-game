// 巨獣黙示録：3D の侵攻舞台を、育成画面（legacy/）から呼べるようにする。
import { startStage } from './3d/stage.js';

window.Kyoju3D = {
  current: null,
  async start(opts) { window.Kyoju3D.current?.close(); const st = await startStage(opts); window.Kyoju3D.current = st; return st; },
};
