from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
p=root/'noclip/src/10-game.js';s=p.read_text()
s=re.sub(r'float flickFn\(float t, float ph\)\{.*?\n\}', 'float flickFn(float t, float ph){ return 1.0; }',s,count=1,flags=re.S)
s=re.sub(r'function N1\(s, t\) \{.*?\n  \}', 'function N1(s,t){ return 1; }',s,count=1,flags=re.S)
s=s.replace('float dirt = mix(0.12, 1.75, decay);','float dirt = 0.0;').replace('vec4 gr = texture(tGrime, wuv/8.0 + vSeed*vec2(0.37, 0.61));','vec4 gr = vec4(0.5,0.0,0.0,0.0);')
s=s.replace('float lightK = (1.0 - blk*0.97) * uLightMul * fl;','float lightK = max(0.8, uLightMul);').replace('float E = E0 * lightK;','float E = max(0.25, E0 * lightK);')
s=s.replace('h = [2, 3, 3, 4, 4][e - 1]','h = [0, 3, 3, 4, 4][e - 1]').replace('u = [1, 2, 2, 3, 3][e - 1]','u = [0, 2, 2, 3, 3][e - 1]')
s=s.replace('t === "frag" ? "bomb" : t === "gl40"','["frag","timerbomb","remotebomb","impactbomb"].includes(t) ? "bomb" : t === "gl40"')
s=s.replace('this.holdItem(t === "frag" ? "bomb" : t)','this.holdItem(["frag","timerbomb","remotebomb","impactbomb"].includes(t) ? "bomb" : t)')
s=s.replace('let c = o.type === "gl40";', 'let c = o.type === "gl40" || o.type === "impactbomb";')
s=s.replace('if (o.type === "bomb" || o.type === "frag")','if (o.type === "bomb" || o.type === "frag" || o.type === "timerbomb")')
s=s.replace('noclip-v1-', 'noclip-clean-v3-')
p.write_text(s)
p=root/'noclip/src/60-places.js';s=p.read_text();s=re.sub(r'first = rr.weighted\(\[.*?\]\);','first = "yellow";',s,count=1,flags=re.S);p.write_text(s)
p=root/'noclip/src/20-heroes.js';s=p.read_text().replace('ml.name}', '(ml?.name || "爆薬専任")}').replace('frac = manual ? 1 - w.mag / w.magMax : 1','frac = 1');s=s.replace('h.stats.maxStamina + 25 * this.level("stam")','h.stats.maxStamina');p.write_text(s)
p=root/'noclip/src/90-main.js';s=p.read_text().replace('bgm: 0.7,','bgm: 0.7,\n      hum: true,\n      humVolume: 0.2,\n      duplicateHeroes: false,').replace('bgm: this.bgm,','bgm: this.bgm,\n              hum: this.hum, humVolume: this.humVolume, duplicateHeroes: this.duplicateHeroes,');s=s.replace('(bt.net.startAll(s), Zo(s, Jo(), { coop: !0 }));','if (bt.net.startAll(s) !== false) Zo(s, bt.net.self()?.mode || Jo(), { coop: !0 });');p.write_text(s)
