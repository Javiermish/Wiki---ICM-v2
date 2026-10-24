import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import { safeNext, isRole } from '../src/domain/auth.ts';

// Load production modules with SDK/Next boundaries replaced, no remote service.
async function load(path, imports, bindings) {
  let source = await readFile(new URL(path, import.meta.url),'utf8');
  source = source.replace(/^import .* from "next\/server";$/gm, '');
  for (const pattern of imports) source = source.replace(pattern,'');
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const dependencies = { connection: async () => {}, ...bindings };
  return new Function(...Object.keys(dependencies), `${js.replaceAll('export ', '')}; return ${path.endsWith('proxy.ts') ? '{proxy}' : '{getAccount,getAccountResult,requireAccount,requireRole}'};`)(...Object.values(dependencies));
}

const sessionImports = [/import "server-only";/,/import[\s\S]*?from "next\/navigation";/,/import[\s\S]*?from "@\/domain\/auth";/,/import[\s\S]*?from "@\/lib\/supabase\/server";/,/import[\s\S]*?from "@\/lib\/supabase\/config";/];

test('sesión espera la petición antes de crear el SDK y no captura señales de prerenderizado', async () => {
  let release, sdkCalls = 0;
  const request = new Promise(resolve => { release = resolve; });
  const bindings = {
    safeNext, isRole, isSupabaseConfigured: () => true,
    redirect: target => { throw new Error(`redirect:${target}`); },
    connection: () => request,
    createClient: async () => { sdkCalls++; return { auth: { getClaims: async () => ({ data: null, error: null }) } }; },
  };
  const {getAccountResult} = await load('../src/lib/auth/session.ts', sessionImports, bindings);
  const result = getAccountResult();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sdkCalls, 0, 'Supabase se inicializó durante el prerenderizado');
  release();
  assert.deepEqual(await result, {status: 'unauthenticated'});
  assert.equal(sdkCalls, 1);

  const interrupted = new Error('Next prerender interrupted');
  const suspended = await load('../src/lib/auth/session.ts', sessionImports, {
    ...bindings, connection: async () => { throw interrupted; },
  });
  await assert.rejects(suspended.getAccountResult(), error => error === interrupted);
  assert.equal(sdkCalls, 1, 'No inicializar SDK si Next suspende el prerenderizado');
});

test('proxy renueva con getClaims y conserva cookies y cabeceras no-cache (SDK doble)', async () => {
  let verified = 0;
  const {proxy} = await load('../src/proxy.ts',[/import[\s\S]*?from "@supabase\/ssr";/,/import[\s\S]*?from "next\/server";/,/import[\s\S]*?from "\.\/lib\/supabase\/config";/],{
    NextResponse, getSupabaseConfig:()=>({url:'https://example.supabase.co',key:'public-test'}),
    createServerClient:(_url,_key,options)=>({auth:{getClaims:async()=>{
      verified++;
      options.cookies.setAll([{name:'sb-test-auth-token',value:'renewed',options:{path:'/',sameSite:'lax',secure:true}}],{'Cache-Control':'private, no-store','Pragma':'no-cache','Expires':'0'});
      return {data:{claims:{sub:'id'}},error:null};
    }}}),
  });
  const request = new NextRequest('https://wiki.example/mi-cuenta');
  const response = await proxy(request);
  assert.equal(verified,1);
  assert.equal(request.cookies.get('sb-test-auth-token').value,'renewed');
  assert.equal(response.cookies.get('sb-test-auth-token').value,'renewed');
  assert.match(response.headers.get('cache-control'),/private, no-store/);
  assert.equal(response.headers.get('pragma'),'no-cache');
});

test('proxy resuelve rutas académicas antes del streaming sin ocultar fallas de DB (SDK doble)', async () => {
  const state = { data: null, error: null, configured: true };
  const filters = [];
  const query = {
    select: () => query,
    eq: (key, value) => { filters.push([key, value]); return query; },
    maybeSingle: async () => ({ data: state.data, error: state.error }),
  };
  const { proxy } = await load('../src/proxy.ts', [/import[\s\S]*?from "@supabase\/ssr";/, /import[\s\S]*?from "next\/server";/, /import[\s\S]*?from "\.\/lib\/supabase\/config";/], {
    NextResponse,
    getSupabaseConfig: () => state.configured ? { url: 'https://example.supabase.co', key: 'public-test' } : null,
    createServerClient: (_url, _key, options) => ({
      auth: { getClaims: async () => options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'renewed', options: { path: '/' } }], { Pragma: 'no-cache' }) },
      from: table => { assert.equal(table, 'courses'); return query; },
    }),
  });
  for (const path of ['/semestres/0', '/semestres/13', '/semestres/01', '/semestres/1x', '/ramos/no-existe', '/ramos/local-no-existe', '/ramos/%FF']) {
    const response = await proxy(new NextRequest(`https://wiki.example${path}?q=qa`));
    assert.equal(response.status, 404, path);
    assert.equal(new URL(response.headers.get('x-middleware-rewrite')).pathname, '/404');
    assert.equal(response.headers.get('x-middleware-next'), null);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(response.cookies.get('sb-test-auth-token').value, 'renewed');
  }
  assert.ok(filters.some(([key, value]) => key === 'status' && value === 'active'));
  assert.ok(filters.some(([key, value]) => key === 'slug' && value === 'local-no-existe'));
  state.data = { id: 'persistent-new-course' };
  for (const path of ['/semestres/1', '/semestres/12', '/ramos/new-db-slug', '/ramos/local-persistent', '/login']) {
    assert.equal((await proxy(new NextRequest(`https://wiki.example${path}`))).status, 200, path);
  }
  state.data = null; state.error = { code: '42P01' };
  assert.equal((await proxy(new NextRequest('https://wiki.example/ramos/calculo-i'))).status, 200, 'DB errors must reach the explicit catalog error UI');
  state.configured = false;
  assert.equal((await proxy(new NextRequest('https://wiki.example/semestres/01'))).status, 404);
  assert.equal((await proxy(new NextRequest('https://wiki.example/ramos/calculo-i'))).status, 200);
});

test('matriz de rutas protegidas: visitante, estudiante, moderador y administrador (SDK doble)', async (t) => {
  const state = { role: null };
  const client = {
    auth: {
      getClaims: async () => ({data: state.role ? {claims: {sub: 'user-id'}} : null, error: null}),
      getUser: async () => ({data: {user: {id: 'user-id', email: 'qa@example.invalid', email_confirmed_at: 'confirmed'}}, error: null}),
    },
    from: table => ({select: () => ({eq: () => ({single: async () => ({data: table === 'profiles' ? {display_name: 'QA'} : {role: state.role}, error: null})})})}),
  };
  const {requireAccount, requireRole} = await load('../src/lib/auth/session.ts', sessionImports, {
    safeNext, isRole, isSupabaseConfigured: () => true, createClient: async () => client,
    redirect: target => { throw new Error(`redirect:${target}`); },
  });
  for (const role of [null, 'student', 'moderator', 'admin']) {
    await t.test(role ?? 'visitor', async () => {
      state.role = role;
      for (const [path, allowed] of [
        ['/moderacion', ['moderator', 'admin']], ['/admin/usuarios', ['admin']],
        ['/mi-cuenta', null], ['/mis-aportes', null], ['/restablecer-contrasena', null],
      ]) {
        const access = () => allowed ? requireRole(allowed, path) : requireAccount(path);
        if (!role) await assert.rejects(access(), {message: `redirect:/login?next=${encodeURIComponent(path)}`});
        else if (allowed && !allowed.includes(role)) await assert.rejects(access(), {message: 'redirect:/mi-cuenta?error=forbidden'});
        else assert.equal((await access()).role, role, path);
      }
    });
  }
});

test('autorización verifica claims y correo y consulta rol actual, no metadata (SDK doble)', async () => {
  const state = {claims:true,confirmed:true,role:'student',owner:'user-id',dbError:null,missing:null,userError:null,configured:true};
  const queried = [];
  const client = {
    auth:{getClaims:async()=>({data:state.claims?{claims:{sub:'user-id',user_metadata:{role:'admin'}}}:null}),getUser:async()=>({error:state.userError,data:{user:{id:state.owner,email:'a@b.cl',email_confirmed_at:state.confirmed?'today':null}}})},
    from:(table)=>({select:()=>({eq:(_column,id)=>({single:async()=>{queried.push([table,id]);return {error:state.dbError,data:state.dbError||state.missing===table?null:table==='profiles'?{display_name:'Ana'}:{role:state.role}};}})})}),
  };
  const {getAccount,getAccountResult,requireAccount,requireRole} = await load('../src/lib/auth/session.ts',[/import "server-only";/,/import[\s\S]*?from "next\/navigation";/,/import[\s\S]*?from "@\/domain\/auth";/,/import[\s\S]*?from "@\/lib\/supabase\/server";/,/import[\s\S]*?from "@\/lib\/supabase\/config";/],{
    redirect:(target)=>{throw new Error(`redirect:${target}`);},safeNext,isRole,createClient:async()=>client,isSupabaseConfigured:()=>state.configured,
  });
  assert.equal((await getAccount()).role,'student');
  assert.deepEqual(queried,[['profiles','user-id'],['user_roles','user-id']]);
  await assert.rejects(requireRole(['admin']),/redirect:\/mi-cuenta\?error=forbidden/);
  state.role='moderator'; assert.equal((await requireRole(['moderator','admin'])).role,'moderator');
  state.role='admin'; assert.equal((await requireRole(['admin'])).role,'admin');
  state.role='owner'; assert.equal(await getAccount(),null);
  state.role='student';state.confirmed=false; assert.equal(await getAccount(),null);
  state.confirmed=true;state.owner='other'; assert.equal(await getAccount(),null);
  state.owner='user-id';state.claims=false;
  await assert.rejects(requireAccount('/admin/usuarios'),/redirect:\/login\?next=%2Fadmin%2Fusuarios/);
  state.claims=true;
  assert.equal((await getAccountResult()).status,'authenticated');
  state.confirmed=false;assert.equal((await getAccountResult()).status,'unverified');
  state.confirmed=true;state.userError={code:'network'};assert.equal((await getAccountResult()).status,'unavailable');
  state.userError=null;
  for (const code of ['PGRST205','42P01','42501','PGRST116']) {
    state.dbError={code,message:'raw private database detail'};
    assert.deepEqual(await getAccountResult(),{status:'profile_error'});
    assert.equal(await getAccount(),null,'no rol student de respaldo cuando falla DB/RLS');
    await assert.rejects(requireAccount('/mi-cuenta'),/error=profile/);
  }
  state.dbError=null;
  for (const table of ['profiles','user_roles']) {state.missing=table;assert.deepEqual(await getAccountResult(),{status:'profile_error'});}
  state.missing=null;state.role='owner';assert.deepEqual(await getAccountResult(),{status:'profile_error'});
  state.configured=false;assert.deepEqual(await getAccountResult(),{status:'configuration_error'});
});
