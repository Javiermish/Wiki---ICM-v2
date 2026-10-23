import assert from 'node:assert/strict';
import test from 'node:test';
import { safeNext, validateAuthForm, isRole } from '../src/domain/auth.ts';

test('destinos de autenticación solo aceptan rutas internas conocidas', () => {
  for (const value of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/login','/auth/confirm','/mi-cuenta\r\nLocation:x', '/mi-cuenta?next=https://evil.test']) assert.equal(safeNext(value), '/mi-cuenta');
  for (const value of ['/mi-cuenta','/moderacion','/admin/usuarios','/mis-aportes','/favoritos']) assert.equal(safeNext(value), value);
});

test('registro valida correo, contraseña confirmada y descarta roles suministrados', () => {
  const valid = {email:'a@example.org',password:'correct horse battery',passwordConfirm:'correct horse battery',displayName:'Ana',role:'admin'};
  assert.deepEqual(validateAuthForm('register',valid), {});
  assert.ok(validateAuthForm('register',{...valid,email:'no'}).email);
  assert.ok(validateAuthForm('register',{...valid,password:'short'}).password);
  assert.ok(validateAuthForm('register',{...valid,passwordConfirm:'different'}).passwordConfirm);
  assert.ok(validateAuthForm('profile',{displayName:'x'.repeat(81)}).displayName);
  assert.deepEqual(validateAuthForm('login',{email:'a@example.org',password:'legacy'}), {});
  assert.ok(validateAuthForm('password',{password:'x'.repeat(129),passwordConfirm:'x'.repeat(129)}).password);
});

test('roles desconocidos nunca se convierten en privilegios', () => {
  for (const role of ['student','moderator','admin']) assert.equal(isRole(role),true);
  for (const role of [null,'ADMIN','owner',{},'']) assert.equal(isRole(role),false);
});
