import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { safeNext, validateAuthForm } from '../src/domain/auth.ts';

async function actions(overrides = {}) {
  const calls = [];
  let source = await readFile(new URL('../src/lib/auth/actions.ts',import.meta.url),'utf8');
  source = source.replace(/^import .*?;$/gm,'');
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
  const bindings = {
    redirect:target=>{throw new Error(`redirect:${target}`);}, revalidatePath:()=>{},safeNext,validateAuthForm,
    isSupabaseConfigured:()=>true,requireAccount:async()=>({id:'own-id'}),requireRole:async()=>({id:'admin-id'}),getAccountResult:async()=>({status:'unauthenticated'}),runAuthFlow:async()=>({error:'not used'}),
    createClient:async()=>({
      from:table=>({update:values=>({eq:(column,id)=>({select:()=>({single:async()=>{calls.push({table,values,column,id});return {data:{id}};}})})})}),
      rpc:async(name,args)=>{calls.push({name,args});return {error:null};},
    }), ...overrides,
  };
  const api = new Function(...Object.keys(bindings),`${js};return {updateProfileAction,setModeratorAction,loginAction};`)(...Object.values(bindings));
  return {api,calls};
}
const form = values => {const data = new FormData();for(const [key,value] of Object.entries(values)) data.set(key,value);return data;};

test('login correcto de Auth con DB sin tablas explica configuración y no destruye sesión',async()=>{
  const {api}=await actions({runAuthFlow:async()=>({success:'signed in'}),getAccountResult:async()=>({status:'profile_error'}),createClient:async()=>({auth:{signOut:async()=>{throw new Error('No cerrar sesión válida por perfil ausente');}}})});
  const result=await api.loginAction({},form({email:'a@b.cl',password:'valid password'}));
  assert.match(result.error,/perfil y rol/);
  assert.match(result.error,/base de datos/i);
  assert.doesNotMatch(result.error,/Confirma tu correo/);
});

test('login distingue errores de credenciales, correo, sesión y configuración',async()=>{
  const data=form({email:'a@b.cl',password:'valid password'});
  const bad=await actions({runAuthFlow:async()=>({error:'El correo o la contraseña no son correctos.'}),getAccountResult:async()=>{throw new Error('No consultar perfil tras credenciales incorrectas');}});
  assert.match((await bad.api.loginAction({},data)).error,/contraseña no son correctos/);
  for(const [status,expected] of [['unverified',/Confirma tu correo/],['unauthenticated',/sesión/i],['configuration_error',/configurada/i],['unavailable',/Inténtalo de nuevo/]]) {
    const {api}=await actions({runAuthFlow:async()=>({success:'signed in'}),getAccountResult:async()=>({status})});
    assert.match((await api.loginAction({},data)).error,expected);
  }
  const good=await actions({runAuthFlow:async()=>({success:'signed in'}),getAccountResult:async()=>({status:'authenticated',account:{id:'own'}})});
  await assert.rejects(good.api.loginAction({},form({email:'a@b.cl',password:'valid password',next:'https://evil.invalid'})),/redirect:\/mi-cuenta/);
});

test('acción perfil impone identidad y campos aun con input manipulado (DB doble)',async()=>{
  const {api,calls}=await actions();
  assert.ok((await api.updateProfileAction({},form({displayName:' Ana ',id:'other',role:'admin'}))).success);
  assert.deepEqual(calls,[{table:'profiles',values:{display_name:'Ana'},column:'id',id:'own-id'}]);
  assert.ok((await api.updateProfileAction({},form({displayName:'x'.repeat(81)}))).fieldErrors.displayName);
  assert.equal(calls.length,1);
});

test('acción administrativa autoriza antes de RPC y valida parámetros (DB doble)',async()=>{
  const denied=await actions({requireRole:async()=>{throw new Error('forbidden');}});
  await assert.rejects(denied.api.setModeratorAction({},form({})),/forbidden/);
  assert.equal(denied.calls.length,0);
  const {api,calls}=await actions();
  assert.ok((await api.setModeratorAction({},form({targetUserId:'bad',enabled:'true',reason:'valid reason'}))).error);
  assert.equal(calls.length,0);
  const id='21000000-0000-0000-0000-000000000001';
  assert.ok((await api.setModeratorAction({},form({targetUserId:id,enabled:'true',reason:' Revisión autorizada ',role:'admin',actorId:'other'}))).success);
  assert.deepEqual(calls,[{name:'set_moderator',args:{target_user_id:id,enabled:true,reason:'Revisión autorizada'}}]);
});
