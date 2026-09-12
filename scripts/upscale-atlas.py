#!/usr/bin/env python3
"""Regenerate every runtime atlas with local NCNN; retain logical UV coordinates."""
import argparse, datetime, hashlib, json, os, re, struct, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def png(p):
    b=p.read_bytes()[:33]
    if len(b)<33 or b[:8]!=b'\x89PNG\r\n\x1a\n' or b[12:16]!=b'IHDR': raise ValueError(f'Not PNG: {p}')
    return (*struct.unpack('>II',b[16:24]),b[25])
def local_reference(base,reference):
    if not isinstance(reference,str) or '\\' in reference or ':' in reference:
        raise ValueError('Texture reference must be local and relative')
    path=Path(reference)
    if path.is_absolute() or '..' in path.parts: raise ValueError('Texture reference escapes export directory')
    target=(base/path).resolve()
    if not target.is_relative_to(base.resolve()) or not target.is_file(): raise ValueError(f'Missing/unsafe texture: {reference}')
    return target
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--export',dest='export_dir',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--binary',type=Path,required=True)
    p.add_argument('--models',type=Path,required=True)
    p.add_argument('--model',default='realesr-animevideov3-x4')
    p.add_argument('--java',default=os.environ.get('VALIDATOR_JAVA','java'))
    p.add_argument('--tile',type=int,default=256)
    p.add_argument('--max-texture-size',type=int,default=8192,help='Verified target GPU/runtime limit; default 8192')
    a=p.parse_args()
    if a.max_texture_size < 1024 or a.max_texture_size > 16384:p.error('Texture limit must be 1024..16384, verified on the target runtime')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+',a.model) or a.tile<32: p.error('Invalid model name or tile size')
    manifest_path=a.manifest.resolve();manifest=json.loads(manifest_path.read_text())
    export=a.export_dir.resolve();out=a.output.resolve();binary=a.binary.resolve();models=a.models.resolve()
    if not binary.is_file():p.error('Local upscayl-bin not found')
    weights=[models/(a.model+s) for s in ['.param','.bin']]
    if not all(f.is_file() for f in weights):p.error('Matching NCNN .param and .bin files are required')
    if out.exists() and any(out.iterdir()):p.error('Output is nonempty; select a new revision')
    name=re.sub(r'[^A-Za-z0-9_-]','_',manifest.get('name','Character'))
    settings=json.loads((export/(name+'.model3.json')).read_text())
    textures=[local_reference(export,ref) for ref in settings['FileReferences']['Textures']]
    if not textures:p.error('Export contains no texture pages')
    for texture in textures:
        w,h,kind=png(texture)
        if kind!=6:p.error('Expected an RGBA source atlas')
        if max(w,h)*4>a.max_texture_size:p.error(f'4x atlas exceeds target texture limit {a.max_texture_size}; repack the LOW export into smaller pages first')
    out.mkdir(parents=True,exist_ok=True)
    report={'complete':False,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'method':'Local NCNN neural RGB 4x; independent bicubic alpha; unchanged logical UVs',
            'input_manifest_sha256':sha(manifest_path),'binary_sha256':sha(binary),
            'model':a.model,'weights':{f.name:sha(f) for f in weights},'scale':4,'max_texture_size':a.max_texture_size,'pages':[]}
    report_path=out/'upscale-report.json'
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    hd_pages=[];source_hashes=[]
    try:
        # No parallel GPU inference: finish each page before starting the next.
        for index,texture in enumerate(textures):
            rgb=out/f'page-{index:02d}-rgb.png';sr=out/f'page-{index:02d}-rgb-4x.png';rgba=out/f'page-{index:02d}-rgba-4x.png'
            subprocess.run([a.java,'-Xmx2g','--source','21',str(ROOT/'scripts/AtlasAlpha.java'),'prepare',str(texture),str(rgb)],check=True)
            command=[str(binary),'-i',str(rgb),'-o',str(sr),'-m',str(models),'-n',a.model,'-z','4','-s','4','-t',str(a.tile),'-j','1:1:1','-f','png']
            with (out/f'page-{index:02d}.log').open('w') as log:subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
            subprocess.run([a.java,'-Xmx4g','--source','21',str(ROOT/'scripts/AtlasAlpha.java'),'combine',str(texture),str(sr),str(rgba)],check=True)
            w,h,_=png(texture)
            if png(rgba)!=(w*4,h*4,6):raise ValueError('Output is not exact 4x RGBA')
            source_hashes.append(sha(texture));hd_pages.append(str(rgba))
            report['pages'].append({'source':str(texture),'source_sha256':sha(texture),'source_size':[w,h],
                                    'output':rgba.name,'output_sha256':sha(rgba),'output_size':[w*4,h*4],'command':command})
        # Preserve all authored coordinates. Resolve asset references because the
        # generated recipe lives in a different directory, without rewriting its inputs.
        def absolute_assets(item):
            if isinstance(item,dict):
                for key,value in item.items():
                    if key=='path' and isinstance(value,str):item[key]=str((manifest_path.parent/value).resolve())
                    else:absolute_assets(value)
            elif isinstance(item,list):
                for value in item:absolute_assets(value)
        absolute_assets(manifest)
        manifest.setdefault('config',{}).update(export_texture_pages=hd_pages,export_texture_source_sha256=source_hashes)
        (out/'manifest-hd.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        report['complete']=True
    except Exception as error:
        report['error']=str(error);raise
    finally:report_path.write_text(json.dumps(report,indent=2)+'\n')
    print(out/'manifest-hd.json')
if __name__=='__main__':main()
