import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
await mkdir('artifacts/validation',{recursive:true});
const commit='c'.repeat(40), targets=['x86_64-pc-windows-msvc','aarch64-apple-darwin','x86_64-apple-darwin','x86_64-unknown-linux-gnu'];
async function fixture(version, desktop) {
 const root=await mkdtemp(resolve('artifacts/validation/release-fixture-')), input=join(root,'input'), output=join(root,'output');
 const licenses=join(input,'gatherpack-linux-x64-checksums-and-licenses'); await mkdir(licenses,{recursive:true});
 for(const target of targets){
  await writeFile(join(licenses,target+'-provenance.json'),JSON.stringify({version,commit,dirty:false,target,run:123}));
  if(target.endsWith('apple-darwin')) await writeFile(join(licenses,'macos-install-'+target+'.json'),JSON.stringify({passed:true,commit,target}));
 }
 const sums=[];
 for(const [i,ext] of ['.exe','.dmg','.dmg','.deb','.AppImage','-corresponding-source.tar'].entries()){
  const name=`gatherpack-${version}-fixture-${i}${ext}`, bytes=Buffer.from(name);
  await writeFile(join(licenses,name),bytes); sums.push(createHash('sha256').update(bytes).digest('hex')+'  '+name);
 }
 await writeFile(join(licenses,'SHA256SUMS.txt'),sums.join('\n')+'\n');
 for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md','third-party.md','Rust-COPYRIGHT-library.html'])await writeFile(join(licenses,name),'fixture');
 await writeFile(join(licenses,'license-audit.json'),JSON.stringify({missingLicenseText:[]}));
 if(desktop){const folder=join(input,'native-validation-x86_64-pc-windows-msvc');await mkdir(folder);await writeFile(join(folder,'windows-installer-report.json'),JSON.stringify({passed:true,installerSHA256:sums[0].split(' ')[0],desktopValidation:{passed:true,commit,checks:Array.from({length:26},()=>({passed:true}))}}));}
 const run=spawnSync(process.execPath,['scripts/prepare-verified-release.mjs',input,output],{env:{...process.env,BUILD_COMMIT:commit,BUILD_RUN_ID:'123',MACOS_RUN_ID:'456',GH_REPO:'fixture/repo'},encoding:'utf8'});
 return {run,output};
}
for(const version of ['1.0.0','1.0.1-alpha.1']){
 const {run,output}=await fixture(version,true);assert.equal(run.status,0,run.stderr);
 assert.equal(await readFile(join(output,'release-tag.txt'),'utf8'),'v'+version);
 assert.equal(await readFile(join(output,'release-prerelease.txt'),'utf8'),String(version.includes('-')));
}
assert.notEqual((await fixture('1.0.0',false)).run.status,0,'stable release must reject missing Windows desktop evidence');
console.log('Release preparation: stable/alpha metadata and required stable Windows evidence passed.');
