import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {amapProxy} from '../server/amapProxy.js';
import {coordinates,searchPlaces,planJourney,reconcileTravelEstimates} from '../src/services/mapPlaces.js';

async function proxy(t,options={}) {
 const app=express();app.use('/_AMapService',amapProxy({key:'public-key',securityCode:'private-code',...options}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));
 return path=>fetch(`http://127.0.0.1:${server.address().port}/_AMapService${path}`);
}
test('map proxy uses fixed origins, overrides credentials and serves valid JSONP executable under nosniff',async t=>{
 const calls=[],fetcher=await proxy(t,{fetchImpl:async(url,options)=>{calls.push({url,options});return new Response('jsonp_1({"infocode":"10000"})',{headers:{'content-type':'application/json;charset=UTF-8'}})}});
 const response=await fetcher('/v3/place/text?callback=jsonp_1&key=attacker&jscode=wrong&keywords=park');
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(calls[0].url.origin,'https://restapi.amap.com');assert.equal(calls[0].url.searchParams.get('key'),'public-key');assert.equal(calls[0].url.searchParams.get('jscode'),'private-code');assert.equal(calls[0].options.redirect,'error');
 assert.ok(!(await response.text()).includes('private-code'));
 const sdk=await fetcher('/sdk?callback=__travelAMap_test_1&v=1');assert.equal(sdk.status,200);assert.equal(calls[1].url.origin,'https://webapi.amap.com');assert.equal(calls[1].url.pathname,'/maps');assert.equal(calls[1].url.searchParams.get('v'),'2.0');assert.equal(calls[1].url.searchParams.has('jscode'),false);
});
test('map proxy rejects unconfigured, unsafe callback and unsupported paths without fetching',async t=>{
 let count=0;const fetcher=await proxy(t,{fetchImpl:async()=>{count++;throw new Error('secret upstream URL')}});
 for(const path of ['/admin','/sdk?callback=alert','/v3/place/text?callback=x%3Balert(1)'])assert.equal((await fetcher(path)).status,400);
 assert.equal(count,0);const error=await fetcher('/v3/place/text');assert.equal(error.status,502);assert.ok(!(await error.text()).includes('secret'));
 const disabled=await proxy(t,{securityCode:''});assert.equal((await disabled('/v3/place/text')).status,503);
});
test('coordinates reject absent and invalid values while retaining valid zero',()=>{
 for(const location of [null,[],[null,null],['',''],[false,0],[181,20],[100,91]])assert.equal(coordinates(location),null);
 assert.deepEqual(coordinates([0,'0']),[0,0]);assert.deepEqual(coordinates({getLng:()=>116.4,getLat:()=>39.9}),[116.4,39.9]);
});
test('place lookup keeps verified POIs only and cancels late responses',async()=>{
 let callback;const loader=async()=>({PlaceSearch:class{search(_,cb){callback=cb}}});
 const request=searchPlaces('park','北京',{loader});await new Promise(setImmediate);
 callback('complete',{poiList:{pois:[{id:'real',name:'公园',location:{lng:116,lat:39}},{id:'bad',name:'缺坐标'}]}});
 const result=await request;assert.equal(result.length,1);assert.equal(result[0].coordinateSystem,'GCJ-02');
 const controller=new AbortController(),cancelled=searchPlaces('park','',{loader,signal:controller.signal});await new Promise(setImmediate);controller.abort();await assert.rejects(cancelled,/取消/);callback('complete',{poiList:{pois:[]}});
});
test('journey estimates round seconds upward, include provenance and reject malformed routes',async()=>{
 let response={routes:[{time:61,distance:50}]};
 const loader=async()=>({Walking:class{search(from,to,done){done('complete',response)}}});
 const route=await planJourney([116,39],[117,40],'walking',{loader});assert.equal(route.minutes,2);assert.equal(route.source,'高德地图');assert.deepEqual(route.destination,[117,40]);
 for(const value of [null,'',-1,'invalid']){response={routes:[{time:value,distance:50}]};await assert.rejects(planJourney([116,39],[117,40],'walking',{loader}),/未找到/)}
});
test('reordering or removing a stop invalidates only old automatic estimates',()=>{
 const a={place:{location:[116,39]},travelMinutes:5,travelEstimate:{origin:[116,39],destination:[117,40]}},b={place:{location:[117,40]},travelMinutes:10};
 const days=[{activities:[a,b]}];reconcileTravelEstimates(days);assert.equal(a.travelMinutes,5);
 days[0].activities.reverse();reconcileTravelEstimates(days);assert.equal(a.travelMinutes,null);assert.equal(a.travelEstimate,undefined);assert.equal(b.travelMinutes,10);
});

test('navigation uses the same confirmed GCJ-02 location and encodes display names',async()=>{
 const {placeLink}=await import('../src/services/mapPlaces.js');
 const url=new URL(placeLink({location:[116.4,39.9],name:'公园 & 南门'}));
 assert.equal(url.origin,'https://uri.amap.com');assert.equal(url.searchParams.get('position'),'116.4,39.9');assert.equal(url.searchParams.get('name'),'公园 & 南门');assert.equal(url.searchParams.get('coordinate'),'gaode');assert.equal(placeLink({name:'未知位置'}),null);
});
