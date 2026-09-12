#!/usr/bin/env node
// MIT. Regenerate this reference's deterministic eyebrow decomposition with JDK 21.
// Run in a copied working recipe directory; an optional argument selects its output directory.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=__dirname,brows=JSON.parse(fs.readFileSync(path.join(root,'brow-regions.json'),'utf8'));
const output=path.resolve(process.argv[2]||path.join(root,'source'));
const specifications=['r','l'].map(side=>side+':'+brows[side].centerline.map(p=>p.join(',')).join(';')
  +':'+brows[side].protected_hair_columns_inclusive.map(p=>p.join(',')).join(';'));
const result=spawnSync(process.env.VALIDATOR_JAVA||'java',['--source','21',path.join(root,'PrepareBrows.java'),
  path.join(root,'source/reference.png'),output,...specifications],{stdio:'inherit'});
if(result.error){console.error('JDK 21 is required. Set VALIDATOR_JAVA to its java executable.');process.exit(1);}
process.exit(result.status===0?0:1);
