#!/usr/bin/env python3
"""Publish metadata only for completed, locally validated Gemini recordings."""
import argparse,json,subprocess
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('plan',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[1];catalog={};provenance=[]
for t in json.loads(a.plan.read_text()):
    file=root/'assets/bgm/gemini'/f"{t['id']}.mp3"
    if not file.is_file() or file.stat().st_size==0:continue
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration',
        '-of','json',str(file)],text=True))
    duration=float(info['format']['duration'])
    key=('sk-' if t['group']=='existing' and t['id'] not in ['garden','depth','battle'] else '')+t['id']
    catalog[key]={'id':key,'title':t['title'],'tempo':t['bpm'],'style':t['style'],
                  'duration':duration,'file':f"bgm/gemini/{t['id']}.mp3"}
    provenance.append({'id':key,'title':t['title'],'provider':'Gemini / Lyria',
                       'file':file.relative_to(root).as_posix(),
                       'duration':duration,'direction':t['style']})
module='// Only completed Gemini / Lyria recordings are listed here.\nconst catalog='+json.dumps(catalog,ensure_ascii=False,indent=2)+';\n'
module+='for(const track of Object.values(catalog))track.url=new URL(track.file,import.meta.url).href;\nexport const RECORDINGS=Object.freeze(catalog);\n'
(root/'assets/gemini-catalog.mjs').write_text(module)
(root/'assets/bgm/gemini/provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
print(f'{len(catalog)} completed recordings catalogued')
