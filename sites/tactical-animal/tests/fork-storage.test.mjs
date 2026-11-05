import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../dist/fork-storage.js',import.meta.url),'utf8');
function storage(entries=[]){const data=new Map(entries);return {get length(){return data.size;},getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null,clear:()=>data.clear()};}
test('retained editor/tool storage supports native operations without touching the original edition',()=>{
 const raw=storage([['farmyard-designer-map','original']]),window={localStorage:raw,sessionStorage:storage()};vm.runInNewContext(code,{window});const s=window.localStorage;
 assert.equal(s.getItem('farmyard-designer-map'),null);s.setItem('farmyard-designer-map','fork');s.example='property';assert.equal(s.example,'property');assert.equal(s.length,2);assert.equal(s.key(0),'farmyard-designer-map');assert.equal(Object.keys(s).length,2);assert.equal(raw.getItem('farmyard-designer-map'),'original');
 s.clear();assert.equal(s.length,0);assert.equal(raw.getItem('farmyard-designer-map'),'original');
});
test('retained folder/library IndexedDB names are isolated too',async()=>{
 const calls=[],window={localStorage:storage(),sessionStorage:storage(),indexedDB:{open:(...args)=>calls.push(['open',...args]),deleteDatabase:(...args)=>calls.push(['delete',...args]),databases:async()=>[{name:'original',version:1},{name:'farmyard-realtime:tools:library',version:2}]}};
 vm.runInNewContext(code,{window});window.indexedDB.open('library',2);window.indexedDB.deleteDatabase('library');assert.equal(calls[0][1],'farmyard-realtime:tools:library');assert.equal(calls[1][1],'farmyard-realtime:tools:library');assert.equal((await window.indexedDB.databases())[0].name,'library');
});
