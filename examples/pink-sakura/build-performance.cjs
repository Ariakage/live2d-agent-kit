#!/usr/bin/env node
// MIT. Original parameter-only performances for Pink Sakura; no new artwork.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const round=value=>Number(value.toFixed(8));

function parameterMap(parameters) {
  if(!Array.isArray(parameters)||!parameters.length) throw new Error('Native parameter descriptors are required.');
  const result=new Map();
  for(const p of parameters) {
    if(!p||typeof p.id!=='string'||!p.id||result.has(p.id)||
      ![p.min,p.max,p.default].every(Number.isFinite)||p.min>p.default||p.default>p.max)
      throw new Error('Invalid native parameter descriptor.');
    result.set(p.id,p);
  }
  return result;
}
function checkValue(parameters,id,value) {
  const p=parameters.get(id);
  if(!p) throw new Error('Missing native parameter: '+id);
  if(!Number.isFinite(value)||value<p.min||value>p.max)
    throw new Error(`${id}=${value} outside native [${p.min},${p.max}].`);
}
function expression(parameters,{form=0,open=0,left=1,right=1,browLeft=0,browRight=0}) {
  const rows=[
    ['ParamMouthForm',form,'Overwrite'],['ParamMouthOpenY',open,'Add'],
    ['ParamEyeLOpen',left,'Multiply'],['ParamEyeROpen',right,'Multiply'],
    ['ParamBrowLY',browLeft,'Overwrite'],['ParamBrowRY',browRight,'Overwrite']
  ];
  for(const [id,value] of rows)checkValue(parameters,id,value);
  return {Type:'Live2D Expression',FadeInTime:.35,FadeOutTime:.35,
    Parameters:rows.map(([Id,Value,Blend])=>({Id,Value,Blend}))};
}
function motion(parameters,duration,loop,tracks) {
  let segments=0,points=0;
  const Curves=Object.entries(tracks).map(([Id,keys])=>{
    if(keys.length<2||keys[0][0]!==0||keys.at(-1)[0]!==duration)
      throw new Error('Motion must cover its full duration: '+Id);
    if(loop&&keys[0][1]!==keys.at(-1)[1])throw new Error('Loop endpoints differ: '+Id);
    const Segments=[...keys[0]];points++;
    for(let i=0;i<keys.length;i++) {
      const [time,value]=keys[i];checkValue(parameters,Id,value);
      if(!Number.isFinite(time)||time<0||time>duration||(i&&time<=keys[i-1][0]))
        throw new Error('Non-increasing motion time: '+Id);
      if(!i)continue;
      const [before,previous]=keys[i-1],step=(time-before)/3;
      // Horizontal tangents avoid a velocity jump at each deliberate hold.
      Segments.push(1,round(before+step),previous,round(before+2*step),value,time,value);
      segments++;points+=3;
    }
    return {Target:'Parameter',Id,Segments};
  });
  return {Version:3,
    Meta:{Duration:duration,Fps:60,Loop:loop,FadeInTime:.6,FadeOutTime:.6,AreBeziersRestricted:true,
      CurveCount:Curves.length,TotalSegmentCount:segments,TotalPointCount:points,
      UserDataCount:0,TotalUserDataSize:0},Curves};
}
function blinkKeys(duration,events) {
  const keys=[[0,1]];
  for(const [start,close,hold,open] of events) {
    keys.push([start,1],[round(start+close),0],
      [round(start+close+hold),0],[round(start+close+hold+open),1]);
  }
  keys.push([duration,1]);return keys;
}
function idleTracks(kind) {
  const curious=kind==='Curious',sleepy=kind==='Sleepy';
  const swing=(positive,negative)=>[[0,0],[3,positive],[5,positive],[8.7,negative],[10,negative],[12,0]];
  const eyes=sleepy?blinkKeys(12,[[4.4,.18,.16,.32],[9.8,.12,.06,.2]]):
    blinkKeys(12,curious?[[1.9,.075,.025,.13],[7.3,.075,.025,.13]]:
      [[3.7,.075,.025,.13],[9.1,.075,.025,.13]]);
  const tracks={
    ParamAngleX:swing(curious?3.6:sleepy?.45:.8,curious?-2.7:sleepy?-.3:-.55),
    ParamAngleY:sleepy?[[0,0],[4.5,-1.2],[6.2,-1.2],[9.6,-.2],[12,0]]:
      swing(curious?1.2:.35,curious?.3:-.2),
    ParamAngleZ:swing(curious?-1.5:sleepy?.7:.6,curious?1:sleepy?.12:-.45),
    ParamBodyAngleZ:swing(curious?.28:.14,curious?-.2:-.1),
    ParamFloat:swing(sleepy?.1:curious?.24:.18,sleepy?-.08:curious?-.16:-.12),
    ParamWind:[[0,0],[2,0],[4.2,sleepy?.06:curious?.18:.1],
      [5.8,sleepy?.06:curious?.18:.1],[8,.015],[10,sleepy?-.03:curious?-.08:-.06],[12,0]],
    ParamBreath:[[0,0],[2.2,sleepy?.16:.24],[4.8,.02],[7.1,sleepy?.15:.22],[9.8,.015],[12,0]],
    ParamChestExpand:swing(curious?.12:.07,0),
    ParamWaistSway:swing(curious?.1:.06,curious?-.07:-.04),
    ParamShoulderLiftL:swing(curious?.09:.04,0),
    ParamShoulderLiftR:swing(curious?.05:.03,0),
    ParamEyeBallX:swing(curious?.18:.045,curious?-.14:-.035),
    ParamEyeBallY:swing(curious?.07:.02,curious?.025:-.015),
    ParamEyeLOpen:eyes,ParamEyeROpen:eyes
  };
  if(curious) {
    tracks.ParamBrowLY=swing(.13,.04);tracks.ParamBrowRY=swing(.1,.03);
  }
  return tracks;
}
function buildPerformance(nativeParameters) {
  const parameters=parameterMap(nativeParameters);
  const Expressions=Object.fromEntries(Object.entries({
    Smile:{form:.55,browLeft:.03,browRight:.03},
    SoftSmile:{form:.25,left:.98,right:.98},
    WinkLeft:{form:.4,left:0,browLeft:-.03},
    WinkRight:{form:.4,right:0,browRight:-.03},
    Surprised:{form:-.18,open:.3,browLeft:.3,browRight:.3},
    Smug:{form:.48,left:.88,right:.96,browLeft:.15,browRight:-.03},
    Angry:{form:-.48,left:.9,right:.9,browLeft:-.32,browRight:-.32},
    Sleepy:{form:-.04,left:.58,right:.58,browLeft:-.07,browRight:-.07}
  }).map(([name,values])=>[name,expression(parameters,values)]));
  const Motions={};
  for(const name of ['Quiet','Curious','Sleepy'])Motions[name]=motion(parameters,12,true,idleTracks(name));
  const sway=(a,b)=>[[0,0],[4,a],[5.8,a],[9.5,b],[11,b],[15,0],[18,0]];
  const eyes=blinkKeys(18,[[2.8,.075,.025,.13],[8.8,.075,.025,.13],[13.2,.075,.025,.13]]);
  Motions.Airy=motion(parameters,18,false,{
    ParamAngleX:sway(7,-6),ParamAngleY:sway(2,-1.5),ParamAngleZ:sway(1.5,-1.2),
    ParamBodyAngleZ:sway(.3,-.25),ParamFloat:sway(.3,-.2),ParamWind:sway(.28,-.2),
    ParamChestExpand:sway(.12,.04),ParamWaistSway:sway(.12,-.1),
    ParamUpperArmLSwing:sway(.12,-.07),ParamUpperArmRSwing:sway(.08,-.1),
    ParamBreath:[[0,0],[2.3,.28],[5,.02],[7.3,.24],[10,.02],[12.4,.22],[15,0],[18,0]],
    ParamEyeBallX:sway(.08,-.08),ParamEyeBallY:sway(.03,-.02),
    ParamEyeLOpen:eyes,ParamEyeROpen:eyes
  });
  const slowEyes=blinkKeys(2.2,[[.4,.3,.12,.45]]);
  Motions.SlowBlink=motion(parameters,2.2,false,{ParamEyeLOpen:slowEyes,ParamEyeROpen:slowEyes});
  Motions.SpeechBob=motion(parameters,5,false,{
    ParamMouthOpenY:[[0,0],[.5,0],[.8,.22],[1.02,.02],[1.27,.36],[1.48,.04],
      [1.78,.26],[2.15,0],[2.85,0],[3.1,.3],[3.36,.04],[3.67,.38],[4.02,0],[5,0]],
    ParamAngleY:[[0,0],[.55,0],[1.3,-.25],[2.2,-.1],[2.8,-.03],[3.6,-.35],[4.55,0],[5,0]],
    ParamFloat:[[0,0],[.7,0],[1.5,.035],[2.6,.008],[3.8,.05],[4.8,0],[5,0]]
  });
  return {Expressions,Motions};
}
function buildRuntime(runtimeDirectory,reportFile) {
  const root=fs.realpathSync(runtimeDirectory);
  for(const name of ['runtime','source','verification']) {
    const protectedPath=path.join(__dirname,name);
    // A copied source recipe intentionally omits the published runtime directory.
    if(!fs.existsSync(protectedPath))continue;
    const protectedRoot=fs.realpathSync(protectedPath);
    if(root===protectedRoot||root.startsWith(protectedRoot+path.sep))
      throw new Error('Use a fresh candidate runtime; published example/source is protected.');
  }
  const modelFile=path.join(root,'PinkSakura.model3.json');
  if(fs.lstatSync(modelFile).isSymbolicLink())throw new Error('Candidate model JSON must not be a symlink.');
  const model=JSON.parse(fs.readFileSync(modelFile,'utf8'));
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  const mocReference=model.FileReferences?.Moc;
  if(typeof mocReference!=='string'||path.isAbsolute(mocReference))throw new Error('Invalid model MOC reference.');
  const moc=fs.realpathSync(path.resolve(root,mocReference));
  if(!moc.startsWith(root+path.sep))throw new Error('MOC escapes candidate runtime.');
  if(report.validator!=='local-official-cubism-core'||report.passed!==true||
    report.sha256!==sha(fs.readFileSync(moc)))
    throw new Error('A passed native Core report matching this candidate MOC SHA is required.');
  if(model.FileReferences.Expressions?.length)throw new Error('Fresh candidate already contains expressions.');
  const {Expressions,Motions}=buildPerformance(report.parameters);
  const files=new Map();
  const references=model.FileReferences.Motions??={};
  for(const [name,data] of Object.entries(Motions)) {
    if(references[name])throw new Error('Fresh candidate already contains motion group: '+name);
    const file=`PinkSakura.${name.toLowerCase()}.motion3.json`;
    files.set(file,data);references[name]=[{File:file}];
  }
  model.FileReferences.Expressions=Object.entries(Expressions).map(([Name,data])=>{
    const File=`PinkSakura.${Name}.exp3.json`;files.set(File,data);return {Name,File};
  });
  const temporary=modelFile+'.performance-tmp';
  for(const file of [...files.keys(),path.basename(temporary)])
    if(fs.existsSync(path.join(root,file)))throw new Error('Refusing to overwrite candidate file: '+file);
  const written=[];
  try {
    for(const [file,data] of files) {
      const target=path.join(root,file);
      fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n',{flag:'wx'});written.push(target);
    }
    fs.writeFileSync(temporary,JSON.stringify(model,null,2)+'\n',{flag:'wx'});written.push(temporary);
    fs.renameSync(temporary,modelFile);
  } catch(error) {
    for(const file of written)if(fs.existsSync(file))fs.unlinkSync(file);
    throw error;
  }
  return {expressions:Object.keys(Expressions),motions:Object.keys(Motions),
    mocSha256:report.sha256,artworkChanged:false};
}
if(require.main===module) {
  try {
    if(process.argv.length!==4)throw new Error('Usage: node build-performance.cjs CANDIDATE_RUNTIME MATCHING_NATIVE_CORE_REPORT');
    console.log(JSON.stringify(buildRuntime(process.argv[2],process.argv[3]),null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
module.exports={buildPerformance,buildRuntime};
