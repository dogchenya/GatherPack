import {createServer} from 'node:http';
import {createReadStream,existsSync} from 'node:fs';
import {stat,copyFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('artifacts/design/gatherpack-v2');
if(!existsSync(root+'/GatherPack-prototype.html'))throw new Error('Run node scripts/design-prototype.mjs first.');
await copyFile('prototypes/gatherpack-v2/review-template.html',root+'/review.html');
await copyFile('prototypes/gatherpack-v2/README.md',root+'/Design-notes.md');
const types={'.html':'text/html; charset=utf-8','.mp4':'video/mp4','.webm':'video/webm','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8','.zip':'application/zip'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+(pathname==='/'?'/review.html':pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');
  if(req.headers.range){
   const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
   if(!match){res.writeHead(416).end();return;}
   const start=Number(match[1]),end=Math.min(info.size-1,match[2]?Number(match[2]):info.size-1);
   if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':'bytes */'+info.size}).end();return;}
   res.writeHead(206,{'Content-Range':'bytes '+start+'-'+end+'/'+info.size,'Content-Length':end-start+1});
   createReadStream(file,{start,end}).pipe(res);
  }else{res.writeHead(200,{'Content-Length':info.size});createReadStream(file).pipe(res);}
 }catch{res.writeHead(404).end();}
});
server.listen(Number(process.env.PROTOTYPE_PORT||4175),'127.0.0.1',()=>console.log('Design review: http://127.0.0.1:'+server.address().port+'/review.html'));
