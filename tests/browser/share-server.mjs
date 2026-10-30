// Local-only browser fixture. Uses synthetic data and a temporary store.
import express from 'express';
import {shareRouter} from '../../server/travelShares.js';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,unlink,rmdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=await mkdtemp(join(tmpdir(),'travel-share-browser-'));
const app=express();app.use(express.json());app.use('/api/travel-shares',shareRouter({directory}));
const dist=fileURLToPath(new URL('../../dist/',import.meta.url));app.use(express.static(dist));app.get(/.*/,(_req,res)=>res.sendFile(join(dist,'index.html')));
const server=app.listen(5176,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const managementToken=randomBytes(32).toString('hex'),id=createHash('sha256').update(managementToken).digest('hex').slice(0,36),base='http://127.0.0.1:5176';
const plan={title:'浏览器验收·北京三日旅行',startDate:'2030-06-01',endDate:'2030-06-03',budget:999,notes:'PRIVATE_TEST_NOTE',days:[{date:'2030-06-01',activities:[{title:'故宫博物院',time:'09:00',notes:'PRIVATE_BOOKING'}]},{date:'2030-06-02',activities:[{title:'景山公园',time:'10:00'}]},{date:'2030-06-03',activities:[]}]};
const response=await fetch(base+'/api/travel-shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({managementToken,id,plan})});
console.log('CREATE_STATUS',response.status);console.log('PUBLIC_URL',base+'/share/'+id);
process.stdin.setEncoding('utf8');process.stdin.on('data',async input=>{
 if(input.trim()==='revoke'){const r=await fetch(base+'/api/travel-shares/'+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({managementToken})});console.log('REVOKE_STATUS',r.status)}
 if(input.trim()==='exit'){server.closeAllConnections();server.close();for(const name of await readdir(directory)){if(/^[a-f0-9]{36}\.json$/.test(name))await unlink(join(directory,name))}await rmdir(directory);process.exit(0)}
});
