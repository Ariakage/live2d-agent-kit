#!/usr/bin/env node
// MIT. Register the generated arm sheet from public measurements using JDK 21.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=__dirname;
const g=JSON.parse(fs.readFileSync(path.join(root,'dynamics-regions.json'))).gestures;
if(!g?.enabled)throw new Error('Missing measured gesture profile.');
if(!/^[a-z0-9-]+\.png$/.test(g.registration.source))throw new Error('Sprite source must be a local PNG basename.');
const out=path.resolve(process.argv[2]||path.join(root,'source'));
const points=rows=>rows.map(row=>row.join(',')).join(';');
for(const item of g.registration.parts) {
  if(!/^gesture-(sleeve|hand)-(?:[a-z]+-)?r$/.test(item.name)||!['sleeve','hand'].includes(item.mode))
    throw new Error('Invalid registered sprite name or mode.');
  const result=spawnSync(process.env.VALIDATOR_JAVA||'java',['--source','21',path.join(root,'PrepareArm.java'),
    path.join(root,'source',g.registration.source),out,item.name,item.mode,item.crop.join(','),
    item.anchor.join(','),item.scale.join(','),points([g.restShoulder,g.restWrist]),points(g.registration.sleeveCenterline)],{stdio:'inherit'});
  if(result.error||result.status!==0)throw new Error('Arm registration failed; JDK 21 is required.');
}
