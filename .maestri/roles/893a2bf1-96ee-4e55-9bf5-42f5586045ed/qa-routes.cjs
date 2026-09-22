const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const cli = process.env.MAESTRI_CLI;
const out = __dirname + '/qa-results';
fs.mkdirSync(out, {recursive:true});
function portal(...args) { return execFileSync(cli, ['portal', ...args], {encoding:'utf8', windowsHide:true, timeout:25000}); }
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const routes = ['dashboard','offers','offers/new','channels','integrations','history','settings','settings?tab=profile','settings?tab=links','settings?tab=templates','settings?tab=billing','feedbacks','pricing','checkout','automatizacao-shopee','automatizacao-mercadolivre','politica-de-privacidade','termos-de-uso','politica-de-cookies','admin'];
(async()=>{
  const label=process.argv[2] || 'mobile-dark';
  portal('navigate','UX QA','http://127.0.0.1:5173/dashboard');
  await sleep(2000);
  portal('resize','UX QA',label.startsWith('desktop')?'1440':'390',label.startsWith('desktop')?'900':'844');
  const theme=portal('evaluate','UX QA','document.documentElement.className');
  if(theme.includes('dark') !== label.endsWith('dark')) portal('click','UX QA','#theme-switch');
  for (const route of routes) {
    const id=route.replace(/[^a-z0-9]/g,'-');
    portal('navigate','UX QA','http://127.0.0.1:5173/'+route);
    portal('logs-start','UX QA');
    await sleep(1500);
    const snapshot=portal('snapshot','UX QA');
    const text=portal('evaluate','UX QA','document.body.innerText');
    const metrics=portal('evaluate','UX QA','JSON.stringify({width:innerWidth,content:document.documentElement.scrollWidth,theme:document.documentElement.className})');
    const logs=portal('logs','UX QA');
    fs.writeFileSync(out+'/'+label+'-'+id+'.txt',snapshot+'\n'+text+'\n'+metrics+'\n'+logs);
    const screenshot=portal('screenshot','UX QA').trim();
    if(fs.existsSync(screenshot))fs.copyFileSync(screenshot,out+'/'+label+'-'+id+'.png');
    console.log(label,route,metrics.trim(),logs.includes('error')?'CHECK LOGS':'');
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
