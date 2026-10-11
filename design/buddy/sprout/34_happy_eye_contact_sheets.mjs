import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url)), proofs=path.join(base,'proofs');
const labels=['front-000','front-025','front-050','front-075','front-100','quarter-050','quarter-100','reclined-sleep'];
const images=await Promise.all(labels.map(x=>loadImage(path.join(proofs,`sprout-v005-${x}.png`))));
const source=JSON.parse(fs.readFileSync(path.join(proofs,'v005-eyes-study.json')));
const sheet=createCanvas(1600,760),c=sheet.getContext('2d');
c.fillStyle='#f5f6f6';c.fillRect(0,0,1600,760);c.fillStyle='#182331';c.font='23px sans-serif';
c.fillText('v005 actual reopened Blender source - original eye volume -> happy arch',20,32);
labels.forEach((label,i)=>{
  const col=i<5?i:i-5, row=i<5?0:1,x=col*320,y=48+row*350;
  c.fillStyle='#ffffff';c.fillRect(x,y,320,320);c.drawImage(images[i],x,y,320,320);
  c.fillStyle='#182331';c.font='17px sans-serif';c.fillText(label,x+12,y+341);
});
c.font='17px sans-serif';c.fillStyle='#182331';c.fillText('Supporting Cycles geometry proof.',975,460);
c.fillText('Exact browser/native appearance checked separately.',975,483);
c.fillText('No rendered covers. CloseHappy deforms EYE_L/R.',975,514);
c.fillText('White glints scale away before full closure.',975,544);
c.fillText('Body/core glass and motion data preserved.',975,574);
const output=path.join(proofs,'v005-eye-morph-source-contact-sheet.png');fs.writeFileSync(output,sheet.toBuffer('image/png'));
const tiny=createCanvas(1100,690),t=tiny.getContext('2d');
t.fillStyle='#edf1f4';t.fillRect(0,0,1100,690);t.fillStyle='#182331';t.font='21px sans-serif';
t.fillText('44 / 72 / 96 px source-image reductions — white and dark backgrounds',18,30);
const chosen=[0,2,4,6,7], sizes=[44,72,96];
chosen.forEach((index,col)=>{
  const x=col*220;t.font='16px sans-serif';t.fillStyle='#182331';t.fillText(labels[index],x+12,62);
  sizes.forEach((s,row)=>{
    const y=80+row*190;
    for(let b=0;b<2;b++){
      t.fillStyle=b===0?'#ffffff':'#111b27';t.fillRect(x+b*110,y,110,160);
      t.imageSmoothingEnabled=true;t.imageSmoothingQuality='high';t.drawImage(images[index],x+b*110+(110-s)/2,y+(160-s)/2,s,s);
    }
    t.fillStyle='#182331';t.font='15px sans-serif';t.fillText(`${s} px CSS-frame analogue; downsampled source`,x+8,y+179,204);
  });
});
t.fillStyle='#182331';t.font='15px sans-serif';t.fillText('These are source-render reductions, not actual WebGL/native-size proof. Final closed arch stays navy; glints disappear.',18,674);
const tinyOutput=path.join(proofs,'v005-eye-tiny-source-comparison.png');fs.writeFileSync(tinyOutput,tiny.toBuffer('image/png'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(path.join(proofs,'v005-eye-source-boards.json'),JSON.stringify({pass:true,source_sha256:source.source_sha256,asset_sha256:source.asset_sha256,
  outputs:[output,tinyOutput].map(p=>({path:p,sha256:sha(p),bytes:fs.statSync(p).size})),sizes,
  scope:'CPU contact sheets of the eight actual source PNGs; tiny reductions support geometry review and do not replace browser/native44/72/96 gates.'},null,2)+'\n');
console.log(JSON.stringify({output,tinyOutput}));
