import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(path,bindings,exports) {
  const source=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*?;$/gm,'');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replaceAll('export default ','').replaceAll('export ','');
  return new Function(...Object.keys(bindings),`${js};return {${exports}};`)(...Object.values(bindings));
}

test('route confirma una vez y elimina credenciales/destinos del redirect (sin Supabase real)',async()=>{
  let calls=0;
  const {GET,HEAD}=await load('../src/app/auth/confirm/route.ts',{NextResponse,isSupabaseConfigured:()=>true,createClient:async()=>({}),confirmAuthCallback:async(_client,params)=>{calls++;assert.equal(params.get('type'),'email');return '/mi-cuenta';}},'GET,HEAD');
  const request=new NextRequest('https://wiki.example/auth/confirm?token_hash=private-token&type=email&next=https://evil.invalid');
  const response=await GET(request);
  assert.equal(calls,1);
  assert.equal(response.headers.get('location'),'/mi-cuenta');
  assert.equal(response.status,303);
  assert.match(response.headers.get('cache-control'),/private.*no-store/);
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.equal((await HEAD(request)).status,204);
  assert.equal(calls,1,'HEAD no consume tokens de un solo uso');
});

test('route nunca convierte fallo de token en confirmación exitosa',async()=>{
  const {GET}=await load('../src/app/auth/confirm/route.ts',{NextResponse,isSupabaseConfigured:()=>true,createClient:async()=>({}),confirmAuthCallback:async()=>null},'GET');
  const response=await GET(new NextRequest('https://wiki.example/auth/confirm?code=used&next=/mi-cuenta'));
  assert.equal(response.headers.get('location'),'/login?error=confirmation');
});

test('login distingue sesión verificada de enlace rechazado sin afirmar que el token es válido',async()=>{
  let account=null,checked=0;
  const {LoginContent}=await load('../src/app/login/page.tsx',{
    React,Suspense:React.Suspense,
    Link:({children,...props})=>React.createElement('a',props,children),
    AuthShell:({children})=>React.createElement('main',null,children),AuthForm:()=>React.createElement('form'),
    getAccount:async()=>{checked++;return account;},
  },'LoginContent');
  const render=async()=>renderToStaticMarkup(await LoginContent({searchParams:Promise.resolve({error:'confirmation'})}));
  assert.match(await render(),/No se pudo confirmar/);
  account={id:'verified-id'};
  const html=await render();
  assert.match(html,/sesión ya está autenticada/);
  assert.match(html,/no se ha validado/);
  assert.match(html,/href="\/mi-cuenta"/);
  assert.doesNotMatch(html,/Correo confirmado|Confirmación completada/);
  assert.equal(checked,2);
  const profileError=renderToStaticMarkup(await LoginContent({searchParams:Promise.resolve({error:'profile'})}));
  assert.match(profileError,/perfil y rol/);
  assert.match(profileError,/migraciones/);
  assert.doesNotMatch(profileError,/No se pudo confirmar el enlace/);
  const unverified=renderToStaticMarkup(await LoginContent({searchParams:Promise.resolve({error:'unverified'})}));
  assert.match(unverified,/Confirma tu correo/);
  assert.doesNotMatch(unverified,/migraciones/);
});
