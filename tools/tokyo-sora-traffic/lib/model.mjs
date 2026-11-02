// ゲームの「地図由来の推定」の時間変化（tokyo-sora/src/activity.js の timeActivity）をそのまま読み込む。
// 係数は「観測の時間変化 ÷ 推定の時間変化」なので、推定側の式が変わったら作り直す（記録に使った曲線を残す）。
import fs from 'node:fs';

const SRC = new URL('../../../tokyo-sora/src/activity.js', import.meta.url);
const source = fs.readFileSync(SRC, 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
export const { timeActivity } = mod;

/** 24時間の推定曲線（0〜23時） */
export function modelCurve(kind, weekend = false) {
  return Array.from({ length: 24 }, (_, h) => timeActivity(h, weekend)[kind]);
}
export const MODEL_SOURCE = 'tokyo-sora/src/activity.js timeActivity(hour, weekend)';
