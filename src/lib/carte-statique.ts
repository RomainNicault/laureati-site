import type { Point } from './itineraire.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const france = JSON.parse(readFileSync(resolve('data/geo/france.json'),'utf8')) as number[][][];
export function project(lat:number,lng:number): Point { return {lat: (51.5-lat)*58, lng:(lng+5.5)*42}; }
export const francePath=france.map(r=>r.map(([lng,lat],i)=>{const p=project(lat,lng);return `${i?'L':'M'}${p.lng.toFixed(1)},${p.lat.toFixed(1)}`;}).join(' ')+' Z').join(' ');
