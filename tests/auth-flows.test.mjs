import assert from 'node:assert/strict';
import test from 'node:test';
import { runAuthFlow, confirmEmail, confirmAuthCallback, authError } from '../src/lib/auth/flows.ts';

// SDK doubles prove our orchestration, not connectivity or Supabase behavior.
function sdk(overrides = {}) {
  const calls = [];
  const auth = Object.fromEntries(['signUp','signInWithPassword','resetPasswordForEmail','updateUser','signOut','verifyOtp','exchangeCodeForSession'].map(name => [name, async (...args) => { calls.push([name,...args]); return { data: {}, error: null }; }]));
  return { client: {auth:{...auth,...overrides}}, calls };
}
test('registro valida antes de llamar SDK y nunca transmite roles', async () => {
  const {client,calls} = sdk();
  assert.ok((await runAuthFlow(client,'register',{email:'bad'},'https://wiki.example')).fieldErrors.email);
  assert.equal(calls.length,0);
  const result = await runAuthFlow(client,'register',{email:'a@b.cl',password:'long password 123',passwordConfirm:'long password 123',role:'admin'},'https://wiki.example');
  assert.ok(result.success);
  assert.deepEqual(calls[0],['signUp',{email:'a@b.cl',password:'long password 123',options:{emailRedirectTo:'https://wiki.example/auth/confirm'}}]);
  assert.equal(calls.length,1,'signUp no consume el token enviado por correo');
});

test('callback SSR admite type=email y verifica cada token una sola vez', async () => {
  const {client,calls} = sdk();
  assert.equal(await confirmAuthCallback(client,new URLSearchParams({token_hash:'a'.repeat(64),type:'email',next:'https://evil.invalid'})),'/mi-cuenta');
  assert.deepEqual(calls,[['verifyOtp',{token_hash:'a'.repeat(64),type:'email'}]]);
});

test('callback PKCE intercambia code, nunca vuelve a verificar el OTP ya consumido por Auth', async () => {
  const {client,calls} = sdk();
  assert.equal(await confirmAuthCallback(client,new URLSearchParams({code:'test-pkce-code',next:'https://evil.invalid'})),'/mi-cuenta');
  assert.deepEqual(calls,[['exchangeCodeForSession','test-pkce-code']]);
  assert.equal(await confirmAuthCallback(client,new URLSearchParams({code:'recovery-code',next:'/restablecer-contrasena'})),'/restablecer-contrasena');
});

test('callback rechaza formatos ambiguos, duplicados o con error antes de consumir credenciales', async () => {
  const {client,calls} = sdk();
  for (const query of ['','code=','code=x&code=y','code=x&token_hash=abc&type=signup','code=x&type=recovery','token_hash=abc&type=signup&type=recovery','token_hash=abc&token_hash=def&type=email','token_hash=abc&type=email&error=access_denied','code=x&error_code=otp_expired']) {
    assert.equal(await confirmAuthCallback(client,new URLSearchParams(query)),null,query);
  }
  assert.equal(calls.length,0);
});

test('OTP consumido y code sin verifier se rechazan sin retry, fallback ni éxito por sesión existente', async () => {
  let attempts=0;
  const failed=sdk({verifyOtp:async()=>{attempts++;return {error:{code:'otp_expired',message:'One-time token not found'}};},exchangeCodeForSession:async()=>{attempts++;return {error:{code:'flow_state_not_found'}};},getSession:()=>{throw new Error('No confiar en sesión sin verificar');}});
  assert.equal(await confirmAuthCallback(failed.client,new URLSearchParams({token_hash:'used-token',type:'signup'})),null);
  assert.equal(attempts,1);
  assert.equal(await confirmAuthCallback(failed.client,new URLSearchParams({code:'used-code'})),null);
  assert.equal(attempts,2);
});
test('login errores comprensibles y éxito; recuperación no enumera correos', async () => {
  const bad = sdk({signInWithPassword:async()=>({error:{code:'invalid_credentials'}})});
  assert.match((await runAuthFlow(bad.client,'login',{email:'a@b.cl',password:'bad'},'')).error,/correo o la contraseña/i);
  assert.ok((await runAuthFlow(sdk().client,'login',{email:'a@b.cl',password:'ok'},'')).success);
  const {client,calls} = sdk();
  assert.ok((await runAuthFlow(client,'recover',{email:'a@b.cl'},'https://wiki.example')).success);
  assert.equal(calls[0][2].redirectTo,'https://wiki.example/auth/confirm?next=/restablecer-contrasena');
});
test('actualizar contraseña y cerrar sesión propagan fallos sin falso éxito', async () => {
  assert.match(authError('reauthentication_needed'), /Vuelve a iniciar sesión/);
  const {client,calls} = sdk();
  assert.ok((await runAuthFlow(client,'password',{password:'long password 123',passwordConfirm:'long password 123'},'')).success);
  assert.deepEqual(calls[0],['updateUser',{password:'long password 123'}]);
  assert.ok((await runAuthFlow(sdk({signOut:async()=>({error:{code:'network'}})}).client,'logout',{},'')).error);
  assert.ok((await runAuthFlow(client,'logout',{},'')).success);
});
test('OTP signup/recovery usa token_hash y rechaza tipos no admitidos', async () => {
  const {client,calls} = sdk();
  assert.equal(await confirmEmail(client,'a'.repeat(64),'invite'),null);
  assert.equal(calls.length,0);
  assert.equal(await confirmEmail(client,'a'.repeat(64),'signup'),'/mi-cuenta');
  assert.deepEqual(calls[0],['verifyOtp',{token_hash:'a'.repeat(64),type:'signup'}]);
  assert.equal(await confirmEmail(client,'b'.repeat(64),'recovery'),'/restablecer-contrasena');
  assert.equal(await confirmEmail(sdk({verifyOtp:async()=>({error:{}})}).client,'b'.repeat(64),'signup'),null);
});
