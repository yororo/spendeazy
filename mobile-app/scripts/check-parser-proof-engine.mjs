// Desktop Edge evidence for the exact embedded worker bundle, never device certification.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { fictionalPdf } from './parser-proof-fixtures.mjs';
const generated = await readFile(new URL('../src/prototypes/parser-proof/generated/html.ts', import.meta.url), 'utf8');
const html = JSON.parse(generated.slice(generated.indexOf(' = ') + 3).trim().replace(/;$/u, ''));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ offline: true });
const requests = [];
context.on('request', request => requests.push(new URL(request.url()).protocol));
async function open() {
  const page = await context.newPage();
  await page.setContent(html.replace('<script>', '<script>window.proofMessages=[];window.ReactNativeWebView={postMessage:data=>window.proofMessages.push(JSON.parse(data))};</script><script>'));
  await page.waitForFunction(() => window.proofMessages.some(message => message.type === 'ready'));
  return page;
}
async function extract(page, bytes, id) {
  await page.evaluate(message => { window.proofMessages=[];window.parserProofReceive(JSON.stringify(message)); }, { type:'extract', id, base64:Buffer.from(bytes).toString('base64') });
  await page.waitForFunction(() => window.proofMessages.some(message => ['result','error'].includes(message.type)), null, { timeout:60000 });
  const result = await page.evaluate(() => window.proofMessages.find(message => ['result','error'].includes(message.type)));
  await page.waitForTimeout(150); // Task destruction finishes asynchronously after its result message.
  return result;
}
const cases = [];
try {
  let page = await open();
  let result = await extract(page, Buffer.from('not a PDF'), 1);
  assert.equal(result.code, 'unreadable'); cases.push({case:'corrupt',outcome:result.code});
  result = await extract(page, fictionalPdf({text:false,image:true}), 2);
  assert.equal(result.type,'result'); assert.equal(result.pages[0].runs.length,0); assert.equal(result.pages[0].images,1);
  cases.push({case:'image-only',emptyTextPages:1,imageOperations:1,outcome:'completeness-warning-input'});
  result = await extract(page, fictionalPdf({image:true}), 3);
  assert.ok(result.pages[0].runs.length>0);assert.equal(result.pages[0].images,1);
  cases.push({case:'mixed-text-image',outcome:'completeness-warning-input'});
  result = await extract(page, fictionalPdf({pages:101}), 4);
  assert.equal(result.code,'page-limit');cases.push({case:'101-pages',outcome:result.code});
  result = await extract(page, fictionalPdf({pages:100}), 5);
  assert.equal(result.type,'result');assert.equal(result.pages.length,100);
  cases.push({case:'100-pages',pages:100,elapsedMs:result.elapsedMs});
  for(let index=0;index<10;index++) {
    result=await extract(page,fictionalPdf(),10+index);assert.equal(result.id,10+index);assert.equal(result.pages.length,1);
  }
  cases.push({case:'10-repeated-extractions',outcome:'correct-operation-results'});
  let finishedBeforeDestruction=false;
  let closing=false;
  let closed;
  const cancelled=new Promise(resolve=>{closed=resolve;});
  await page.exposeFunction('proofCancelSignal',type=>{
    if(type==='result') finishedBeforeDestruction=true;
    if(type==='progress'&&!closing) {
      closing=true;
      void page.close().then(closed);
    }
  });
  await page.evaluate(message=>{
    window.proofMessages=[];
    const original=window.ReactNativeWebView.postMessage;
    window.ReactNativeWebView.postMessage=data=>{
      original(data);
      const value=JSON.parse(data);
      if(value.id===30&&['progress','result'].includes(value.type)) void window.proofCancelSignal(value.type);
    };
    window.parserProofReceive(JSON.stringify(message));
  },{type:'extract',id:30,base64:fictionalPdf({pages:100,lines:500}).toString('base64')}).catch(error=>{if(!closing) throw error;});
  await cancelled;
  assert.equal(finishedBeforeDestruction,false);
  page=await open();result=await extract(page,fictionalPdf(),31);assert.equal(result.id,31);assert.equal(result.pages.length,1);
  cases.push({case:'destroy-page-mid-extraction-and-retry',outcome:'fresh-worker-succeeds'});
  assert.ok(requests.every(protocol=>['blob:','data:'].includes(protocol)));
  const report={runtime:'desktop-edge-only',offline:'context offline before worker load',cases,requestProtocols:[...new Set(requests)]};
  await writeFile(new URL('../.expo/parser-proof-engine-report.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
