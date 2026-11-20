import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shareRouter } from '../server/travelShares.js';

const identity=()=>{const managementToken=randomBytes(32).toString('hex');return {managementToken,id:createHash('sha256').update(managementToken).digest('hex').slice(0,36)}};
const plan={title:'三日旅行',startDate:'2030-06-01',endDate:'2030-06-03',budget:9000,privateNote:'PRIVATE',days:[{date:'2030-06-01',activities:[{title:'景点',time:'09:00',description:'PRIVATE BOOKING',passport:'SECRET'}]}]};
async function serve(t,options){const app=express();app.use(express.json());app.use('/shares',shareRouter(options));const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});t.after(()=>{server.closeAllConnections();server.close()});return `http://127.0.0.1:${server.address().port}/shares`}
const send=(url,method,body)=>fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('share snapshots persist, exclude private data, and require the capability to revoke',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'travel-share-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const base=await serve(t,{directory});const key=identity();
 assert.equal((await send(base,'POST',{...key,plan})).status,201);
 const publicResponse=await fetch(`${base}/${key.id}`);
 assert.equal(publicResponse.headers.get('cache-control'),'no-store');
 const result=await publicResponse.json();assert.equal(result.plan.name,'三日旅行');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET|budget|tokenHash/);
 const disk=await readFile(join(directory,`${key.id}.json`),'utf8');assert.ok(!disk.includes(key.managementToken));
 const restart=await serve(t,{directory});assert.equal((await fetch(`${restart}/${key.id}`)).status,200);
 assert.equal((await send(`${base}/${key.id}`,'DELETE',{managementToken:identity().managementToken})).status,403);
 assert.equal((await send(`${base}/${key.id}`,'DELETE',key)).status,204);
 assert.equal((await fetch(`${base}/${key.id}`)).status,404);
 assert.equal((await send(base,'POST',{id:key.id,managementToken:identity().managementToken,plan})).status,400,'revoked URLs cannot be hijacked');
});
test('shares expire, reject invalid payloads and remain disabled without storage configuration',async t=>{
 const disabled=await serve(t,{});assert.deepEqual(await (await fetch(`${disabled}/status`)).json(),{enabled:false});assert.equal((await fetch(`${disabled}/anything`)).status,503);
 const directory=await mkdtemp(join(tmpdir(),'travel-share-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let clock=1000;const base=await serve(t,{directory,now:()=>clock});const key=identity();
 assert.equal((await send(base,'POST',{...key,plan:{...plan,days:Array(61).fill(plan.days[0])}})).status,400);
 assert.equal((await send(base,'POST',{...key,plan})).status,201);
 clock+=7*86400000+1;assert.equal((await fetch(`${base}/${key.id}`)).status,404);
});

test('revocation before a delayed create prevents link resurrection',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'travel-share-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const base=await serve(t,{directory});const key=identity();
 assert.equal((await send(`${base}/${key.id}`,'DELETE',key)).status,204);
 assert.equal((await send(base,'POST',{...key,plan})).status,410);
 assert.equal((await fetch(`${base}/${key.id}`)).status,404);
});

test('expired immutable URLs cannot be republished with changed content',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'travel-share-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let clock=1000;const base=await serve(t,{directory,now:()=>clock}),key=identity();
 assert.equal((await send(base,'POST',{...key,plan})).status,201);clock+=7*86400000+1;
 assert.equal((await send(base,'POST',{...identity(),plan})).status,201,'trigger expired-content cleanup');
 assert.equal((await send(base,'POST',{...key,plan:{...plan,title:'changed'}})).status,410);
 assert.equal((await fetch(`${base}/${key.id}`)).status,404);
});

test('legacy links update atomically with the original capability, expiry and public field allowlist', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'travel-share-update-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let clock = Date.now();
  const key = identity();
  const base = await serve(t, { directory, now: () => clock });
  const url = base + '/' + key.id;
  const expiry = clock + 7 * 86400000;
  await writeFile(join(directory, key.id + '.json'), JSON.stringify({
    tokenHash: createHash('sha256').update(key.managementToken).digest('hex'),
    expiresAt: expiry,
    plan: { name: '旧旅行', startDate: plan.startDate, endDate: plan.endDate, days: [] }
  }));
  const original = await (await fetch(url)).json();
  assert.equal(original.version, 1);
  assert.equal(original.updatedAt, clock);
  const patch = { version: original.version, managementToken: key.managementToken, plan };
  assert.equal((await send(url, 'PUT', { ...patch, managementToken: identity().managementToken })).status, 403);
  assert.equal((await send(url, 'PUT', { ...patch, version: undefined })).status, 400);
  assert.equal((await send(url, 'PUT', { ...patch, plan: { ...plan, days: null } })).status, 400);
  assert.deepEqual(await (await fetch(url)).json(), original);

  clock += 4500;
  const contenders = await Promise.all(['前门', '景山'].map(title =>
    send(url, 'PUT', { ...patch, plan: { ...plan, title } })
  ));
  assert.deepEqual(contenders.map(r => r.status).sort(), [200, 409]);
  const publicResult = await (await fetch(url)).json();
  assert.equal(publicResult.version, 2);
  assert.equal(publicResult.expiresAt, expiry);
  assert.equal(publicResult.updatedAt, clock);
  assert.equal(publicResult.plan.name, contenders[0].status === 200 ? '前门' : '景山');
  assert.doesNotMatch(JSON.stringify(publicResult), /PRIVATE|SECRET|budget|managementToken|tokenHash/);
  clock += 3000;
  const repeated = await send(url, 'PUT', { ...patch, version: 2, plan: { ...plan, title: publicResult.plan.name } });
  assert.equal((await repeated.json()).updatedAt, publicResult.updatedAt);
  assert.deepEqual(await (await fetch(url)).json(), publicResult);
  assert.equal((await send(url, 'DELETE', key)).status, 204);
  assert.equal((await send(url, 'PUT', { ...patch, version: 2 })).status, 404);
  assert.equal((await fetch(url)).status, 404);
});

test('update of an expired share cannot extend its lifetime', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'travel-share-expiry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let clock = 1000;
  const base = await serve(t, { directory, now: () => clock });
  const key = identity();
  const initial = await (await send(base, 'POST', { ...key, plan })).json();
  clock = initial.expiresAt;
  assert.equal((await send(base + '/' + key.id, 'PUT', { ...key, version: 1, plan })).status, 404);
});
