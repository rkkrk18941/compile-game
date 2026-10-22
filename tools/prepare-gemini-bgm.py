#!/usr/bin/env python3
"""Import an observed Gemini download as a normalized, stereo game soundtrack.

The input must be an audio/video file downloaded through the browser UI.
Generation and download are deliberately not automated by this script.
"""
import argparse,json,subprocess
from pathlib import Path

def run(*args):
    return subprocess.run(args,check=True,capture_output=True,text=True).stdout

def main():
    p=argparse.ArgumentParser()
    p.add_argument('source',type=Path);p.add_argument('destination',type=Path)
    p.add_argument('--title',required=True)
    a=p.parse_args();a.destination.parent.mkdir(parents=True,exist_ok=True)
    # EBU loudness normalization gives each arrangement the same listening level.
    run('ffmpeg','-v','error','-y','-i',str(a.source),'-vn','-af',
        'loudnorm=I=-18:TP=-1.5:LRA=11','-ar','44100','-ac','2',
        '-codec:a','libmp3lame','-b:a','160k','-map_metadata','-1',
        '-metadata','title='+a.title,'-metadata','artist=Gemini / Lyria',str(a.destination))
    info=json.loads(run('ffprobe','-v','error','-show_entries','format=duration,size',
                        '-of','json',str(a.destination)))['format']
    print(json.dumps({'file':str(a.destination.resolve()),'duration':float(info['duration']),
                      'size':int(info['size'])},ensure_ascii=False))

if __name__=='__main__':main()
