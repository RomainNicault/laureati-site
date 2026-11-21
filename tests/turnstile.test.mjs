import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
const request=(token='')=>new Request('https://laureati.fr/api/turnstile',{method:'POST',headers:{Origin:'https://laureati.fr','Content-Type':'application/json'},body:JSON.stringify({token})});
test('Worker exige Turnstile : absent, refus, action et hôte vérifiés, succès autorisé', async()=>{
 const original=globalThis.fetch; let calls=0;
 try {
  const env={TURNSTILE_SECRET_KEY:'secret-test',ASSETS:{fetch:async()=>new Response('static')}};
  globalThis.fetch=async()=>{calls++;return Response.json({success:false})};
  assert.equal((await worker.fetch(request(),env)).status,400);assert.equal(calls,0);
  assert.equal((await worker.fetch(request('jeton'),env)).status,403);
  globalThis.fetch=async()=>Response.json({success:true,action:'autre',hostname:'laureati.fr'});
  assert.equal((await worker.fetch(request('jeton'),env)).status,403);
  globalThis.fetch=async()=>Response.json({success:true,action:'itineraire',hostname:'tiers.fr'});
  assert.equal((await worker.fetch(request('jeton'),env)).status,403);
  globalThis.fetch=async()=>Response.json({success:true,action:'itineraire',hostname:'laureati.fr'});
  assert.equal((await worker.fetch(request('jeton'),env)).status,200);
  assert.equal((await worker.fetch(request('jeton'),{})).status,503);
 }finally{globalThis.fetch=original;}
});
