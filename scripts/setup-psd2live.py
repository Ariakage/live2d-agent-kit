#!/usr/bin/env python3
"""Fetch the pinned engine and apply the recorded patch without discarding edits."""
import argparse, hashlib, json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def run(*args, cwd=None, capture=False):
    return subprocess.run(args, cwd=cwd, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory',type=Path,default=ROOT/'.cache/psd2live')
    a=p.parse_args(); dst=a.directory.resolve()
    lock=json.loads((ROOT/'integrations/psd2live/engine-lock.json').read_text())
    patch=ROOT/'patches/psd2live-agent-kit.patch'
    if hashlib.sha256(patch.read_bytes()).hexdigest()!=lock['patch_sha256']:
        p.error('Patch SHA differs from engine-lock.json')
    if dst.exists() and not dst.is_dir():p.error('Engine path is not a directory')
    if not dst.exists() or not any(dst.iterdir()):
        dst.mkdir(parents=True,exist_ok=True)
        run('git','init','-q',str(dst))
        run('git','remote','add','origin',lock['url'],cwd=dst)
    if not (dst/'.git').is_dir():p.error('Existing engine directory is not an isolated Git checkout')
    head=subprocess.run(['git','rev-parse','--verify','HEAD'],cwd=dst,text=True,capture_output=True)
    if head.returncode:
        # A network failure may leave an initialized, empty checkout. Resume only
        # that state, never overwrite user files or a different repository.
        origin=run('git','remote','get-url','origin',cwd=dst,capture=True).strip()
        files={f.name for f in dst.iterdir()} - {'.git','.DS_Store'}
        if origin!=lock['url'] or files:p.error('Unborn checkout has user files or a different origin; use a new directory')
        run('git','fetch','--depth','1','origin',lock['commit'],cwd=dst)
        run('git','checkout','--detach',lock['commit'],cwd=dst)
    def changes():
        tracked=set(run('git','diff','--name-only','HEAD',cwd=dst,capture=True).splitlines())
        extra=set(run('git','ls-files','--others','--exclude-standard',cwd=dst,capture=True).splitlines())
        # Finder metadata is not source code and can appear after opening a folder.
        return tracked | {f for f in extra if Path(f).name!='.DS_Store'}
    if run('git','rev-parse','HEAD',cwd=dst,capture=True).strip()!=lock['commit']:
        p.error('Existing engine is not at the pinned commit; use a new --directory')
    def matches():
        return all((dst/f).is_file() and hashlib.sha256((dst/f).read_bytes()).hexdigest()==sha
                   for f,sha in lock['patched_files'].items())
    if not matches():
        if changes():
            p.error('Existing engine has changes not matching this patch; use a new --directory')
        run('git','apply','--check',str(patch),cwd=dst)
        run('git','apply',str(patch),cwd=dst)
    if not matches():
        p.error('Patched source verification failed')
    if changes()-set(lock['patched_files']):
        p.error('Unexpected engine changes; inspect this checkout or use a new directory')
    print(f'Engine ready: {dst}\nPinned commit: {lock["commit"]}')
if __name__=='__main__': main()
