"""Add chapter captions and export the verified native recording for README."""
import json
from pathlib import Path
import subprocess

folder = Path('/work/artifacts/validation')
report = json.loads((folder/'product-demo-report.json').read_text())
assert report['passed'] and all(c['passed'] for c in report['checks'])
font = next(Path('/usr/share/fonts/opentype/noto').glob('NotoSansCJK-Regular.ttc'))
filters = ['pad=iw:ih+50:0:50:color=0xedf2ed']
for index, chapter in enumerate(report['chapters']):
    caption = folder/f'demo-caption-{index}.txt'
    caption.write_text('GatherPack  ·  '+chapter['label'],encoding='utf-8')
    end = report['chapters'][index+1]['at'] if index+1<len(report['chapters']) else report['duration']+2
    filters.append(f"drawtext=fontfile={font}:textfile={caption}:fontsize=22:fontcolor=0x294b3c:x=(w-tw)/2:y=12:enable='between(t,{chapter['at']},{end})'")
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(folder/'product-demo-raw.mp4'),'-vf',','.join(filters),'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(folder/'product-demo-v1.0.0.mp4')],check=True)
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(folder/'product-demo-v1.0.0.mp4'),'-filter_complex','fps=8,scale=1120:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4','-loop','0',str(folder/'product-demo-v1.0.0.gif')],check=True)
print('Exported verified native workflow GIF and MP4')
