const assert = require('node:assert/strict');
const {test} = require('node:test');

test('installation guidance covers phone browsers, iPad desktop UA and desktop fallback', async () => {
  const {installationSteps} = await import('../src/install-helper.js');
  for (const userAgent of ['iPhone Safari', 'iPhone CriOS', 'iPhone FxiOS']) {
    assert.match(installationSteps({userAgent}).join(' '), /Share.*Add to Home Screen/);
  }
  assert.match(installationSteps({userAgent:'Macintosh Safari',maxTouchPoints:5}).join(' '), /Home Screen/);
  assert.match(installationSteps({userAgent:'Android Firefox/140'}).join(' '), /Firefox.*Install/);
  assert.match(installationSteps({userAgent:'Android Chrome/140'}).join(' '), /Install app/);
  assert.match(installationSteps({userAgent:'Macintosh Safari/600'}).join(' '), /Add to Dock/);
  assert.match(installationSteps({userAgent:'unknown'}).join(' '), /Chrome or Edge/);
});

test('native prompt is retained, consumed once and hidden only on installation or app context', async () => {
  const {setupInstallHelper} = await import('../src/install-helper.js');
  const events = {}, queries = [], button = {};
  const win = {navigator:{},addEventListener(type,fn){events[type]=fn},matchMedia(){
    const query={matches:false,addEventListener(type,fn){this.change=fn}};queries.push(query);return query;
  }};
  let manual = 0, calls = 0;
  const doc = {querySelector(){return button},createElement(){manual++;throw Error('manual path reached')}};
  const helper = setupInstallHelper(win,doc);
  helper.update();assert.equal(button.hidden,false);
  let prevented = false;
  events.beforeinstallprompt({preventDefault(){prevented=true},async prompt(){calls++},userChoice:Promise.resolve({outcome:'dismissed'})});
  await helper.install();assert(prevented);assert.equal(calls,1);assert.equal(button.hidden,false);
  await assert.rejects(helper.install(),/manual path reached/);assert.equal(manual,1);
  events.appinstalled();assert.equal(button.hidden,true);
  await helper.install();assert.equal(calls,1);
  const second=setupInstallHelper(win,doc);queries.at(-4).matches=true;
  queries.at(-4).change();assert.equal(button.hidden,true);
  await second.install();assert.equal(manual,1);
  win.navigator.standalone=true;second.update();assert.equal(button.hidden,true);
});

test('manual dialog renders steps, opens modally, and restores focus; prompt failure falls back', async () => {
  const {setupInstallHelper} = await import('../src/install-helper.js');
  const events={}, dialogs=[];
  let restored=0;
  const focus={isConnected:true,focus(){restored++}};
  const doc={
    activeElement:focus,querySelector(){return {}},body:{append(){}},
    createElement(tag){
      if(tag==='li')return {};
      const steps=[], handlers={}, nodes={};
      const dialog={steps,setAttribute(){},querySelector(selector){return nodes[selector] ||= {append(item){steps.push(item.textContent)}}},
        addEventListener(type,fn){handlers[type]=fn},showModal(){this.modal=true},
        remove(){this.removed=true},close(){handlers.close()}};
      dialogs.push(dialog);return dialog;
    }
  };
  const win={navigator:{userAgent:'Android Firefox/140'},matchMedia(){return {matches:false,addEventListener(){}}},
    addEventListener(type,fn){events[type]=fn}};
  const helper=setupInstallHelper(win,doc);
  await helper.install();
  assert.equal(dialogs[0].modal,true);assert.match(dialogs[0].steps.join(' '),/Firefox.*Install/);
  dialogs[0].querySelector('[data-install-close]').onclick();assert(dialogs[0].removed);assert.equal(restored,1);
  events.beforeinstallprompt({preventDefault(){},prompt(){throw Error('expired')}});
  await helper.install();assert.equal(dialogs.length,2);assert.equal(dialogs[1].modal,true);
});

test('first visit offer remembers choices and leaves manual help available', async () => {
  const {setupInstallHelper}=await import('../src/install-helper.js');
  const storage=new Map(), dialogs=[], queuedClose=[];
  const win={navigator:{userAgent:'Firefox/140 Linux'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){}};
  const doc={querySelector:()=>null,body:{append(){}},createElement(tag){
    if(tag==='li')return {};
    const nodes={},handlers={};
    const dialog={setAttribute(){},querySelector(k){return nodes[k] ||= {append(){}}},
      addEventListener(k,fn){handlers[k]=fn},showModal(){this.open=true},remove(){},
      close(){this.open=false;queuedClose.push(()=>handlers.close())}};
    dialogs.push(dialog);return dialog;
  }};
  let helper=setupInstallHelper(win,doc);
  helper.offerOnce();assert.equal(dialogs.length,1);
  dialogs[0].querySelector('[data-install-no]').onclick();
  assert.equal(storage.get('verdant-install-offer-v1'),'declined');
  helper=setupInstallHelper(win,doc);helper.offerOnce();assert.equal(dialogs.length,1);
  await helper.install();assert.equal(dialogs.length,2);
  dialogs[1].querySelector('[data-install-close]').onclick();
  storage.clear();helper=setupInstallHelper(win,doc);helper.offerOnce();
  dialogs[2].querySelector('[data-install-yes]').onclick();
  assert.equal(storage.get('verdant-install-offer-v1'),'accepted');
  assert.equal(dialogs.length,4);assert.equal(dialogs[2].open,false);
  assert.equal(dialogs[3].open,true);
  for (const close of queuedClose) close();
  await helper.install();
  assert.equal(dialogs.length,4,'late close events must not release the new dialog');
});

test('desktop browsers receive tailored instructions',async()=>{
  const {installationSteps}=await import('../src/install-helper.js');
  assert.match(installationSteps({userAgent:'Linux Firefox/140'}).join(' '),/does not offer built-in/);
  assert.match(installationSteps({userAgent:'Windows Firefox/140'}).join(' '),/Some Firefox versions on Windows/);
  assert.match(installationSteps({userAgent:'Chrome/140'}).join(' '),/Cast, save, and share/);
  assert.match(installationSteps({userAgent:'Chrome/140 Edg/140'}).join(' '),/Edge’s/);
});
