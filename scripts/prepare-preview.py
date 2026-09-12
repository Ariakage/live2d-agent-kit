#!/usr/bin/env python3
"""Prepare an offline real-Core preview from resources the user already obtained.
No SDK download, account action, license acceptance, or model conversion occurs.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import shutil
import sys
from urllib.parse import urlsplit

VENDOR = ('pixi-6.5.10.min.js', 'pixi-live2d-display-0.4.0.min.js')
KIT_ROOT = Path(__file__).resolve().parents[1]


def safe_resource(root, relative):
    if not isinstance(relative, str) or not relative or '\\' in relative:
        raise ValueError(f'Invalid model resource: {relative!r}')
    parsed = urlsplit(relative)
    path = PurePosixPath(relative)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or path.is_absolute() or '..' in path.parts or '%' in relative:
        raise ValueError(f'Resources must use plain relative paths inside the model folder: {relative!r}')
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise ValueError(f'Missing resource or resource escapes model folder: {relative!r}')
    return resolved


def resources(settings):
    refs = settings.get('FileReferences', {})
    if settings.get('Version') != 3 or not isinstance(refs, dict) or not refs.get('Moc') or not refs.get('Textures'):
        raise ValueError('Expected Cubism 3+ model3.json with Moc and Textures references')
    found = []
    for key in ('Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData'):
        if refs.get(key): found.append(refs[key])
    if not isinstance(refs['Textures'], list): raise ValueError('Textures must be an array')
    found.extend(refs['Textures'])
    for expression in refs.get('Expressions', []): found.append(expression['File'])
    for group in refs.get('Motions', {}).values():
        for motion in group:
            found.append(motion['File'])
            if motion.get('Sound'): found.append(motion['Sound'])
    return sorted(set(found))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_destinations(files):
    # A spelling such as ./model.model3.json still targets the normalized entry.
    # Apply case-insensitive rules on every host so a prepared preview is portable.
    destinations = {'model.model3.json': 'normalized model entry point'}
    for relative, _ in files:
        name = PurePosixPath(relative).as_posix().casefold()
        if name in destinations:
            raise ValueError(f'Resources collide at preview destination: {relative!r} and {destinations[name]!r}')
        destinations[name] = relative
    for name, relative in destinations.items():
        if any(parent.as_posix() in destinations for parent in PurePosixPath(name).parents if str(parent) != '.'):
            raise ValueError(f'Resource conflicts with a preview file/directory destination: {relative!r}')


def tracking_files(directory, lock):
    """Accept only the exact, separately acquired files in the published lock."""
    directory = Path(directory).resolve()
    files = []
    for item in lock['files']:
        source = safe_resource(directory, item['path'])
        if source.stat().st_size != item['bytes'] or sha(source) != item['sha256']:
            raise ValueError(f'Tracking dependency differs from pinned bytes: {item["path"]}')
        files.append((item, source))
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--cubism-core', required=True, type=Path)
    parser.add_argument('--vendor-dir', required=True, type=Path)
    parser.add_argument('--tracking-dir', type=Path, help='Optional verified local MediaPipe files from setup-tracking.py; enables explicit camera controls')
    parser.add_argument('--config', type=Path, help='Optional JSON: drawing, regions, inputMapping, label')
    parser.add_argument('--reference', type=Path, help='Optional reference image, copied separately and labeled static')
    parser.add_argument('--download', type=Path, help='Optional local model ZIP download')
    args = parser.parse_args()
    model = args.model.resolve(); root = model.parent; output = args.output.resolve()
    core = args.cubism_core.resolve(); vendor = args.vendor_dir.resolve()
    if not model.is_file() or not core.is_file(): raise ValueError('Model or Cubism Core file does not exist')
    settings = json.loads(model.read_text(encoding='utf-8'))
    files = [(relative, safe_resource(root, relative)) for relative in resources(settings)]
    for name in VENDOR:
        if not (vendor / name).is_file(): raise ValueError(f'Missing dependency: {name} in --vendor-dir; obtain it separately with its license')
    tracking_lock = json.loads((KIT_ROOT/'tools'/'tracking-dependencies.json').read_text()) if args.tracking_dir else None
    tracking = tracking_files(args.tracking_dir, tracking_lock) if tracking_lock else []
    validate_destinations(files)
    if output.exists() and (not output.is_dir() or any(output.iterdir())): raise ValueError('Output must be absent or empty; choose a new folder to avoid overwriting work')
    config = json.loads(args.config.read_text(encoding='utf-8')) if args.config else {}
    drawing = config.get('drawing', {'width':1024,'height':1536})
    if any(not isinstance(drawing.get(k), (int,float)) or not math.isfinite(drawing[k]) or drawing[k] <= 0 for k in ('width','height')):
        raise ValueError('drawing.width and drawing.height must be positive')
    full = {'x':0,'y':0,'w':drawing['width'],'h':drawing['height']}
    regions = {name:config.get('regions', {}).get(name, full) for name in ('full','portrait','face')}
    for name,r in regions.items():
        if any(not isinstance(r.get(k),(int,float)) or not math.isfinite(r[k]) for k in ('x','y','w','h')) or r['w']<=0 or r['h']<=0:
            raise ValueError(f'Invalid region: {name}')
    input_mapping=config.get('inputMapping',{})
    if not isinstance(input_mapping,dict): raise ValueError('inputMapping must be an object')
    for name,mapping in input_mapping.items():
        if mapping is False: continue
        if not isinstance(mapping,dict): raise ValueError(f'Invalid input mapping: {name}')
        if 'target' in mapping and not isinstance(mapping['target'],str): raise ValueError(f'Invalid mapping target: {name}')
        for key in ('inputMin','inputMax','outputMin','outputMax'):
            if key in mapping and (not isinstance(mapping[key],(int,float)) or not math.isfinite(mapping[key])): raise ValueError(f'Invalid mapping endpoint: {name}.{key}')
    for optional in (args.reference,args.download):
        if optional and not optional.is_file(): raise ValueError(f'Optional input does not exist: {optional}')
    if args.reference and args.reference.suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):
        raise ValueError('Reference must be PNG/JPEG/WebP')
    if args.download and args.download.suffix.lower() != '.zip': raise ValueError('Download must be a ZIP')
    template = KIT_ROOT / 'templates' / 'web-preview'
    output.mkdir(parents=True, exist_ok=True)
    for source in template.iterdir():
        if source.is_file(): shutil.copy2(source, output/source.name)
    (output/'model').mkdir(); (output/'vendor').mkdir()
    # Preserve arbitrary original filenames and directories. The entry point alone
    # is normalized; all resources remain relative to its original model directory.
    for relative, source in files:
        target = output/'model'/relative; target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    (output/'model'/'model.model3.json').write_text(json.dumps(settings,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    shutil.copy2(core, output/'vendor'/'live2dcubismcore.min.js')
    for name in VENDOR: shutil.copy2(vendor/name, output/'vendor'/name)
    camera_assets = None
    if tracking:
        for item, source in tracking:
            dest = output/'tracking'/item['path']; dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest)
            if sha(dest) != item['sha256']:
                raise ValueError(f'Tracking dependency changed during copy: {item["path"]}; prepare a new output directory')
        # The tracker resolves these relative to the prepared document URL.
        camera_assets = {'visionModule':'./tracking/vision_bundle.mjs', 'wasmRoot':'./tracking/wasm',
                         'faceModel':'./tracking/models/face_landmarker.task',
                         'poseModel':'./tracking/models/pose_landmarker_lite.task'}
        (output/'tracking'/'dependency-lock.json').write_text(json.dumps(tracking_lock,indent=2)+'\n',encoding='utf-8')
    # Runtime support files and notices are copied only from user-provided folders.
    notices=set()
    for folder in (vendor,core.parent):
        for source in folder.iterdir():
            if source.is_file() and (source.suffix=='.wasm' or 'license' in source.name.lower() or 'notice' in source.name.lower()):
                target=output/'vendor'/source.name
                if target.exists() and sha(target)!=sha(source):
                    target=output/'vendor'/('core-'+source.name)
                shutil.copy2(source,target);notices.add(target.name)
    reference_url=download_url=None
    if args.reference:
        (output/'media').mkdir();dest=output/'media'/('reference'+args.reference.suffix.lower());shutil.copy2(args.reference,dest);reference_url='./media/'+dest.name
    if args.download:
        (output/'downloads').mkdir();shutil.copy2(args.download,output/'downloads'/'model.zip');download_url='./downloads/model.zip'
    values={'DRAWING':drawing,'REGIONS':regions,'MODEL_URL':'./model/model.model3.json','MODEL_LABEL':config.get('label',model.name.removesuffix('.model3.json')),'REFERENCE_URL':reference_url,'DOWNLOAD_URL':download_url,'INPUT_MAPPING':config.get('inputMapping',{}),'CAMERA_ASSETS':camera_assets}
    (output/'view-config.js').write_text('// Generated configuration; drawing dimensions are independent of texture atlas resolution.\n'+''.join(f'export const {key} = {json.dumps(value,ensure_ascii=False)};\n' for key,value in values.items()),encoding='utf-8')
    manifest={'schemaVersion':1,'modelEntry':'model/model.model3.json','config':values,'dependencies':{'core':'user-provided; verify Cubism redistribution terms','pixi':'6.5.10','pixi-live2d-display':'0.4.0'},'copiedNotices':sorted(notices),'files':{str(p.relative_to(output)):sha(p) for p in sorted(output.rglob('*')) if p.is_file()}}
    if tracking_lock: manifest['dependencies']['tracking']={'package':tracking_lock['package'],'lockSha256':sha(output/'tracking'/'dependency-lock.json')}
    (output/'preview-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Prepared {output}\nStart: python3 "{output / "server.py"}" --port 8793')
    if not args.config: print('No crop config supplied: all view buttons initially show the full canvas. Set your own logical dimensions and crop regions.')
    print('Only local inputs were copied. Review third-party terms and notices before sharing this generated folder.')


if __name__=='__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f'ERROR: {error}',file=sys.stderr);sys.exit(1)
