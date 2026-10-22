"""Build the small, self-hosted FluidR3 sample banks (Python 3 + ffmpeg).

python tools/build-music-samples.py --source-dir /path/to/downloaded-fonts
The source files are the upstream <name>-mp3.js files, renamed to <name>.js.
Without --source-dir, downloads the pinned upstream blobs and verifies their SHA.
"""
import argparse, array, base64, hashlib, json, pathlib, re, subprocess, urllib.request

BANKS = {
    'guitar': ('overdriven_guitar', '7e67435e9155b354b72bbbba4609b08b35402696', list(range(36, 85, 6))),
    'fingerbass': ('electric_bass_finger', '7214a164862702b81e90bb8c0f1ebfc8d0a69897', list(range(24, 59, 6))),
    'concertpiano': ('acoustic_grand_piano', '5eb408d4a7be57810a954540a9f9d0ac3690b0a2', list(range(48, 91, 6))),
    'bowedstrings': ('string_ensemble_1', '131b50dd9a5ed173d0e0455644865bfe47c6ccfb', list(range(30, 85, 6))),
    'violin': ('violin', '2c3ab10668e373a62610748e244161d7e37a441a', list(range(55, 86, 6))),
    'trumpet': ('trumpet', 'f48ce49203318cb3b6f449d8dfd1794a5667cbe9', list(range(48, 85, 6))),
    'upright': ('acoustic_bass', '1981e3c2cc7806a81f60a8ef16c7620b0cdf77a2', list(range(24, 59, 6))),
    'timpani': ('timpani', 'edebd5d2e66fb0a0dfae98859d976b21a3508e39', list(range(30, 55, 6))),
}

def run(args, data):
    return subprocess.run(['ffmpeg', '-v', 'error', *args], input=data, stdout=subprocess.PIPE, check=True).stdout

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--source-dir', type=pathlib.Path); args = parser.parse_args()
    dest = pathlib.Path(__file__).resolve().parents[1] / 'music-studio' / 'samples'; dest.mkdir(exist_ok=True)
    for instrument, (name, expected_sha, pitches) in BANKS.items():
        if args.source_dir:
            raw = (args.source_dir / (name + '.js')).read_bytes()
        else:
            url = 'https://api.github.com/repos/gleitz/midi-js-soundfonts/git/blobs/' + expected_sha
            with urllib.request.urlopen(url) as response: raw = base64.b64decode(json.load(response)['content'])
        sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if expected_sha and sha != expected_sha: raise ValueError('Upstream sample changed: ' + name)
        match = re.search(r'MIDI\.Soundfont\.\w+\s*=\s*(\{[\s\S]*\})', raw.decode())
        data = json.loads(re.sub(r',\s*}', '}', match[1])); samples = {}
        for pitch in pitches:
            note = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][pitch % 12] + str(pitch // 12 - 1)
            encoded = base64.b64decode(data[note].split(',', 1)[1])
            pcm = array.array('f', run(['-i','pipe:0','-t','2.6','-ac','1','-ar','22050','-f','f32le','pipe:1'], encoded))
            peak = max(map(abs, pcm)); pcm = array.array('f', (x * .7 / peak for x in pcm))
            mp3 = run(['-f','f32le','-ar','22050','-ac','1','-i','pipe:0','-af','afade=t=out:st=2.48:d=0.12',
                       '-c:a','libmp3lame','-b:a','48k','-f','mp3','pipe:1'], pcm.tobytes())
            samples[str(pitch)] = base64.b64encode(mp3).decode()
        result = {'version':1, 'source':{'soundfont':'FluidR3_GM','instrument':name,'blob':sha,
                  'license':'CC BY 3.0 US','url':'https://github.com/gleitz/midi-js-soundfonts'}, 'samples':samples}
        path = dest / (instrument + '.json'); path.write_text(json.dumps(result, separators=(',',':')) + '\n')
        print(instrument, len(samples), path.stat().st_size)

if __name__ == '__main__': main()
