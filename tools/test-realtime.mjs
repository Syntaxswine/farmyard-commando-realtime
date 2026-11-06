import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {installNativeProbe,inspectWebGL} from '../sites/tactical-animal/browser-tests/native-probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/realtime/native');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
const report={owner:'farmyard-commando-realtime/first-encounter',startedAt:new Date().toISOString(),checks:[],pages:[],helpers:[]};
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const mark=(name,data={})=>{report.checks.push({name,...data});save();console.log('PASS '+name);};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=url.pathname==='/'?'/index.html':url.pathname;
 let file;try{file=path.resolve(site,'.'+decodeURIComponent(name));}catch{res.writeHead(400);return res.end();}
 if(name==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
const released=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(1500,()=>{s.destroy();resolve(false);});});
const identity=(pid,executable)=>({pid,executable,created:process.platform==='win32'?execFileSync('powershell.exe',['-NoLogo','-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim()});
let browserServer,browser,port,wsPort,deadline,closing=false,activePage;
async function close(){
 if(closing)return;closing=true;clearTimeout(deadline);const errors=[];
 for(const [name,fn]of [['browser',()=>browser?.close()],['browserServer',()=>browserServer?.close()]])try{await fn();}catch(e){errors.push({name,message:e.message});}
 server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));
 report.cleanup={httpPort:port,httpReleased:!port||await released(port),wsPort,wsReleased:!wsPort||await released(wsPort),browserProcessExited:!browserServer||browserServer.process().exitCode!==null||browserServer.process().signalCode!==null,errors};
 fs.writeFileSync(path.join(out,'helper-cleanup.json'),JSON.stringify(report.cleanup,null,2)+'\n');save();
}
const snapshot=page=>page.evaluate(async()=>{const url=document.querySelector('script[src*="app.js"]').src;return (await import(url)).inspectRealtime();});
const project=(page,point)=>page.evaluate(async point=>{const url=document.querySelector('script[src*="app.js"]').src;return (await import(url)).projectRealtimePoint(point);},point);
async function wait(page,predicate,label,timeout=20000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await snapshot(page);if(predicate(last))return last;if(last.status==='lost')throw Error('Encounter lost while '+label+': '+JSON.stringify(last));await page.waitForTimeout(100);}throw Error(label+': '+JSON.stringify(last));}
const audioBytes=id=>fs.statSync(path.join(site,'assets/audio/weapon-sfx',id+'.wav')).size;
async function waitForShotAudio(page,id){
  await page.waitForFunction(bytes=>window.__windowNativeProbe.snapshot().audio.some(context=>
    context.decoded.some(clip=>clip.bytes===bytes&&clip.rms>0&&context.starts.some(voice=>
      voice.duration===clip.duration&&voice.state==='running'&&voice.userGestureSeen))
  ),audioBytes(id),{timeout:10000});
}
async function tap(page,selector,phone){if(phone){const b=await page.locator(selector).boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}else await page.locator(selector).click();}
async function pointClick(page,point){
 // Wait for the real follow/zoom camera and never click a HUD switch that
 // happens to cover the requested ground point's screen projection.
 for(let i=0;i<11;i++){
  const p=await page.evaluate(async point=>{
   const app=await import(document.querySelector('script[src*="app.js"]').src);let previous,stable=0,p;
   const end=performance.now()+10000;
   while(performance.now()<end){await new Promise(requestAnimationFrame);p=app.projectRealtimePoint(point);if(p&&previous&&Math.hypot(p.x-previous.x,p.y-previous.y)<.12)stable++;else stable=0;if(stable>=2)return p;previous=p;}return p;
  },point);
  const clear=p?.visible&&await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('#viewport'),p);
  if(clear){await page.mouse.click(p.x,p.y);return;}
  await page.locator('#zoom-out').click();
 }
 throw Error('Requested ground point has no unobstructed screen projection: '+JSON.stringify(point));
}
async function moveTo(page,point){await pointClick(page,{...point,h:0});return wait(page,s=>Math.hypot(s.player.x-point.x,s.player.y-point.y)<.4,'walk to '+JSON.stringify(point),25000);}
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
function capture(page,name){const log={name,errors:[],requests:[]};report.pages.push(log);page.on('pageerror',e=>log.errors.push(e.stack||String(e)));page.on('response',r=>{if(r.status()>=400)log.requests.push({url:r.url(),status:r.status()});});return log;}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;
 report.helpers.push({...identity(process.pid,process.execPath),purpose:'Temporary production static server and acceptance driver',port,source:'tools/test-realtime.mjs',cwd:root,expiry:'10 minutes maximum; earlier on test completion',stop:'finally closes browser and HTTP server'});save();
 deadline=setTimeout(()=>{report.failure='Acceptance deadline expired';void close().finally(()=>process.exit(1));},600000);
 browserServer=await chromium.launchServer({host:'127.0.0.1',headless:true,...process.env.REALTIME_BROWSER_CHANNEL?{channel:process.env.REALTIME_BROWSER_CHANNEL}:{},args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 wsPort=Number(new URL(browserServer.wsEndpoint()).port);report.helpers.push({...identity(browserServer.process().pid,'Chromium'),purpose:'Disposable headless native browser',port:wsPort,expiry:'Current acceptance only',stop:'browserServer.close()'});save();browser=await chromium.connect(browserServer.wsEndpoint());
 for(const phone of [false,true]){
  const name=phone?'phone':'desktop',context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:800,height:600},isMobile:phone,hasTouch:phone,deviceScaleFactor:1});
  await context.addInitScript(installNativeProbe);const page=await context.newPage(),log=capture(page,name);activePage=page;
  await page.goto(`http://127.0.0.1:${port}/game.html`);assert.equal(await page.locator('#operation-select').inputValue(),'quiet-shift');assert.equal(await page.locator('#operation-select option').count(),5);
  const loadoutMode=page.locator('#loadout-fire-mode');assert.equal(await loadoutMode.inputValue(),'auto');
  if(phone)await loadoutMode.selectOption('single');
  await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.locator('#utility button').filter({hasText:'Frag grenades'}).click();await page.locator('#deploy').click();
  let s=await wait(page,s=>s.ready,'initial renderer');
  assert.equal(s.fireMode,phone?'single':'auto');assert.equal(s.autoFire,false);assert.equal(s.phase,'explore');assert.equal(s.shaderFailures,0);await screenshot(page,name+'-start');
  const gl=await page.evaluate(inspectWebGL,'#viewport canvas');assert(gl.available&&!gl.contextLost);mark(name+' full production bootstrap',{gl,operations:5,guards:s.guards.filter(g=>g.hp>0).length});
  await tap(page,'#realtime-aim',phone);assert.equal((await snapshot(page)).aim,'aimed');await tap(page,'#realtime-aim',phone);assert.equal((await snapshot(page)).aim,'full');await tap(page,'#realtime-aim',phone);
  await tap(page,'#end-turn',phone);assert((await snapshot(page)).autoFire);await tap(page,'#end-turn',phone);assert(!(await snapshot(page)).autoFire);mark(name+' persistent aim and fire-at-will controls');
  await tap(page,'#menu',phone);const paused=await snapshot(page);await page.waitForTimeout(250);assert.equal((await snapshot(page)).elapsed,paused.elapsed);await page.getByRole('button',{name:'Continue operation',exact:true}).click();mark(name+' inventory/options pause the actual simulation');
  await tap(page,'#menu',phone);await page.getByRole('button',{name:'Fire control: mode, aim & target priority',exact:true}).click();await page.getByRole('button',{name:'Target: Weakest',exact:true}).click();
  await page.getByRole('button',{name:'Return to operation',exact:true}).click();
  assert.equal((await snapshot(page)).priority,'weakest');
  const weapons=await page.locator('#weapons').boundingBox(),aim=await page.locator('#realtime-aim').boundingBox(),stickBox=await page.locator('#joystick').boundingBox();
  assert(weapons&&aim&&stickBox&&weapons.x>=aim.x+aim.width&&weapons.y+weapons.height<=stickBox.y);
  if(phone)assert(weapons.height>=44);
  await tap(page,'#weapons',phone);
  assert(await page.getByRole('heading',{name:'Weapons.',exact:true}).isVisible());
  const modePaused=(await snapshot(page)).elapsed;
  await page.getByRole('button',{name:'3-round burst',exact:true}).click();
  s=await snapshot(page);assert.equal(s.elapsed,modePaused);assert.equal(s.fireMode,'burst');assert(s.paused);
  if(phone)await screenshot(page,'phone-weapons');
  await page.getByRole('button',{name:'Return to operation',exact:true}).click();
  mark(name+' loadout fire mode and independent Weapons button');
  if(!phone){
    // Automatic defence must already be armed when the deliberate point shot
    // alerts the guards, including while a slow renderer handles later controls.
    await page.locator('#end-turn').click();assert((await snapshot(page)).autoFire);
    // Real point-fire controls create a reload opportunity without injecting state.
    await page.locator('#weapons').click();await page.getByRole('button',{name:'Aim firearm at a point',exact:true}).click();await pointClick(page,{x:5,y:20,h:1.1});
    assert.equal(await page.locator('[data-control="burst"]').getAttribute('aria-pressed'),'true');
    assert(await page.locator('[data-control="single"]').isVisible());
    await page.locator('[data-control="auto"]').click();
    const fire=page.locator('[data-control="fire"]'),box=await fire.boundingBox();
    assert(await fire.isEnabled());await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    try{s=await wait(page,s=>s.triggerHeld&&s.ammo<=27&&s.lastDischarge?.weapon==='assault','held full-auto point fire');}
    finally{await page.mouse.up();}
    assert(!(await snapshot(page)).triggerHeld);assert.equal(s.fireMode,'auto');
    assert(s.lastDischarge.tracerVertices>0&&s.lastDischarge.fromMuzzle&&s.lastDischarge.flash&&s.lastDischarge.pose,JSON.stringify(s.lastDischarge));
    await waitForShotAudio(page,'ak47-shot');
    mark('the held full-auto trigger spends several rounds with native sound and tracer feedback',s.lastDischarge);
    await page.locator('#weapons').click();const reserveBefore=(await snapshot(page)).reserve;await page.getByRole('button',{name:/^Reload AK-47/}).click();s=await wait(page,s=>s.reloading,'timed reload');assert(s.ammo<30);const before=s.player;
    await page.keyboard.down('a');try{s=await wait(page,s=>Math.hypot(s.player.x-before.x,s.player.y-before.y)>.1,'held movement during reload',8000);}finally{await page.keyboard.up('a');}await screenshot(page,'desktop-reload-moving');await wait(page,s=>!s.reloading&&s.reserve<reserveBefore,'completed reload');mark('desktop real shot, timed reload, reserve consumption and movement');
    // The point shot already alerted the guards. Hold the covered arrival area
    // and let them approach; pause immediately after the automatic engagement.
    s=await wait(page,s=>s.kills>0||s.ammo<30,'automatic engagement',25000);assert(s.autoFire);assert.notEqual(s.phase,'enemy');await page.locator('#menu').click();await screenshot(page,'desktop-fire-at-will');mark('desktop fire at will in authored encounter',{ammo:s.ammo,kills:s.kills,phase:s.phase});
    await page.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();assert.equal(await page.locator('#resume').isVisible(),true);await page.locator('#resume').click();s=await wait(page,s=>s.ready,'saved encounter');assert(s.autoFire);assert.equal(s.fireMode,'auto');assert(!s.triggerHeld);mark('desktop real operation save/resume');
  }else{
    const original=await snapshot(page);await tap(page,'#movement-cycle',true);assert((await snapshot(page)).player.sneaking);await tap(page,'#movement-cycle',true);assert(!(await snapshot(page)).player.sneaking);
    const stick=await page.locator('#joystick').boundingBox(),cx=stick.x+stick.width/2,cy=stick.y+stick.height/2,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-25,y:cy+8}]});try{s=await wait(page,s=>Math.hypot(s.player.x-original.player.x,s.player.y-original.player.y)>.1,'held phone movement',8000);}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}mark('phone actual touch movement and sneak');
    // Aim north in world space, using the same native stick controls as a player.
    await tap(page,'#grenade',true);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+49,y:cy-59}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const button=page.locator('#grenade');assert.equal(await button.isDisabled(),false);await tap(page,'#grenade',true);s=await wait(page,s=>s.player.ammo.grenade===2,'real touch grenade throw');await waitForShotAudio(page,'explosion-large');await screenshot(page,'phone-grenade');mark('phone real grenade aim, release and confirmation');await cdp.detach();
  }
  assert.equal(log.errors.length,0,JSON.stringify(log.errors));assert.equal(log.requests.length,0,JSON.stringify(log.requests));await context.close();
 }
 // A separate real loadout must auto-fire flame without entering manual cone aim.
 {
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),log=capture(page,'flamethrower');activePage=page;
  await context.addInitScript(installNativeProbe);await page.goto(`http://127.0.0.1:${port}/game.html`);
  await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.getByRole('button',{name:'Backpack flamethrower',exact:true}).click();assert(await page.locator('#loadout-fire-mode').isHidden());await page.locator('#deploy').click();
  let s=await wait(page,s=>s.ready,'flamethrower renderer');assert(s.automatic);assert.equal(await page.locator('#realtime-aim').isDisabled(),true);assert.equal(await page.locator('#realtime-aim-label').textContent(),'AREA FIRE');assert.equal(await page.locator('#end-turn').isDisabled(),false);await page.locator('#end-turn').click();assert((await snapshot(page)).autoFire);
  await moveTo(page,{x:19,y:23});await moveTo(page,{x:19,y:13.5});s=await wait(page,s=>s.player.ammo.flamethrower<4&&s.kills>0,'automatic flame burst',25000);
  assert(s.autoFire);assert.equal(await page.locator('#flame-aim').isHidden(),true);assert.equal(s.shaderFailures,0);await waitForShotAudio(page,'flame-ignite');await screenshot(page,'flamethrower-fire-at-will');mark('flamethrower Fire at Will uses the production cone and fuel',{fuel:s.player.ammo.flamethrower,kills:s.kills});
  assert.equal(log.errors.length,0,JSON.stringify(log.errors));assert.equal(log.requests.length,0,JSON.stringify(log.requests));await context.close();
 }
 // The editor's proving yard uses the same mode and held-trigger rules.
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage(),log=capture(page,'window-yard');
 await page.goto(`http://127.0.0.1:${port}/window-yard.html`);
 await page.waitForFunction(()=>document.querySelector('#loading').hidden);assert.match(await page.locator('#status').textContent(),/Real time/);
 await page.locator('#fire-mode').selectOption('auto');
 const yardAmmo=page=>page.evaluate(async()=>{
   const entry=await import(document.querySelector('script[src*="window-yard.js"]').src);
   return entry.inspectWindowYard().units[0].ammo.assault;
 });
 const pane=await page.evaluate(async()=>{
   const entry=await import(document.querySelector('script[src*="window-yard.js"]').src);
   return entry.projectWindowYard({x:20,y:21.5,h:1.05});
 });
 assert(pane.visible);await page.touchscreen.tap(pane.x,pane.y);
 const trigger=page.locator('#fire'),touch=await trigger.boundingBox(),cdp=await context.newCDPSession(page);
 assert(await trigger.isEnabled(),await page.locator('#message').textContent());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x+touch.width/2,y:touch.y+touch.height/2}]});
 try{await page.waitForFunction(async()=>{
   const entry=await import(document.querySelector('script[src*="window-yard.js"]').src);
   return entry.inspectWindowYard().units[0].ammo.assault<=27;
 },null,{timeout:15000});}
 finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 await page.waitForFunction(()=>document.querySelector('#fire').disabled);
 const left=await yardAmmo(page);await page.waitForTimeout(550);assert.equal(await yardAmmo(page),left);
 await screenshot(page,'real-time-proving-yard');assert.equal(log.errors.length,0,JSON.stringify(log.errors));assert.equal(log.requests.length,0,JSON.stringify(log.requests));
 mark('editor proving yard uses production full auto and stops on touch release',{ammo:left});await cdp.detach();await context.close();report.success=true;
}catch(error){report.failure=error.stack||String(error);if(activePage&&!activePage.isClosed()){try{report.failureSnapshot=await snapshot(activePage);await screenshot(activePage,'failure');}catch{}}process.exitCode=1;console.error(error.stack||error);}
finally{await close();}
if(report.success)console.log('Real-time native acceptance passed; disposable helpers stopped.');
