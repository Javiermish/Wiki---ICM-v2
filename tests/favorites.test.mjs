import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { toPublicCatalog } from "../src/lib/catalog/public-catalog.ts";
import { decodeFavorites, isPublicFavorite } from "../src/domain/favorites.ts";
import { createLocalFavoritesStore, favoritesStorageKey } from "../src/lib/favorites/local-store.ts";

const catalog = toPublicCatalog(demoCatalog);
const regular = { kind: "course", id: "demo-calculo-i" };
const elective = { kind: "course", id: catalog.courses.find(c => c.kind === "elective").id };
const material = { kind: "material", id: "demo-certamen-calculo-2" };
const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
};

test("favoritos admite regulares, electivos y documentos aprobados, no recursos privados ni huérfanos", () => {
  for (const ref of [regular, elective, material]) assert.equal(isPublicFavorite(catalog, ref), true);
  for (const id of ["demo-pending-calculo", "demo-rejected-calculo", "missing"]) {
    assert.equal(isPublicFavorite(demoCatalog, { kind: "material", id }), false);
  }
  assert.equal(isPublicFavorite({ ...demoCatalog, offerings: [] }, material), false);
  assert.equal(isPublicFavorite(catalog, { kind: "request", id: regular.id }), false);
});

test("decodificación recupera referencias válidas, deduplica y no conserva metadatos inyectados", () => {
  const raw = JSON.stringify({ version: 1, items: [regular, regular, elective, { ...material, title: "secreto" }, { kind: "material", id: "demo-pending-calculo" }, null, { kind: "course", id: 42 }] });
  const result = decodeFavorites(raw, catalog);
  assert.deepEqual(result.references, [regular, elective, material]);
  assert.equal(result.recovered, true);
  for (const raw of ["{", "null", "42", "[]", '{"version":2,"items":[]}', "x".repeat(100001)]) {
    assert.deepEqual(decodeFavorites(raw, catalog), { references: [], recovered: true });
  }
  assert.deepEqual(decodeFavorites(null, catalog), { references: [], recovered: false });
});

test("persistencia guarda solo referencias, sobrevive a una nueva instancia y permite quitar sin duplicados", () => {
  const disk = storage();
  const store = createLocalFavoritesStore(() => disk);
  store.hydrate(catalog);
  for (const ref of [regular, elective, material, material]) store.setSaved(ref, true, catalog);
  assert.deepEqual(store.getSnapshot().references, [regular, elective, material]);
  assert.deepEqual(JSON.parse(disk.getItem(favoritesStorageKey)), { version: 1, items: [regular, elective, material] });
  const reloaded = createLocalFavoritesStore(() => disk);
  reloaded.hydrate(catalog);
  assert.deepEqual(reloaded.getSnapshot().references, [regular, elective, material]);
  reloaded.setSaved(material, false, catalog);
  assert.deepEqual(reloaded.getSnapshot().references, [regular, elective]);
  assert.throws(() => reloaded.setSaved({ kind: "material", id: "demo-pending-calculo" }, true, demoCatalog));
  assert.deepEqual(reloaded.getSnapshot().references, [regular, elective]);
});

test("lectura, escritura y acceso al almacenamiento bloqueados conservan la interfaz y advierten", () => {
  for (const getStorage of [() => { throw Error("blocked"); }, () => ({ getItem() { throw Error("denied"); }, setItem() { throw Error("quota"); } })]) {
    const store = createLocalFavoritesStore(getStorage);
    store.hydrate(catalog);
    assert.equal(store.getSnapshot().ready, true);
    assert.ok(store.getSnapshot().warning);
    assert.doesNotThrow(() => store.setSaved(material, true, catalog));
    assert.deepEqual(store.getSnapshot().references, [material]);
    assert.ok(store.getSnapshot().warning);
  }
});

test("corrupción se recupera sin reescribir hasta una acción y suscripciones reflejan cambios", () => {
  const disk = storage();
  disk.setItem(favoritesStorageKey, "malformed");
  const store = createLocalFavoritesStore(() => disk);
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  store.hydrate(catalog);
  assert.ok(store.getSnapshot().warning);
  assert.equal(disk.getItem(favoritesStorageKey), "malformed");
  store.setSaved(regular, true, catalog);
  assert.equal(store.getSnapshot().warning, null);
  assert.equal(changes, 2);
  unsubscribe();
  store.setSaved(regular, false, catalog);
  assert.equal(changes, 2);
});

test("IDs estables sobreviven a reclasificar/archivar y referencias locales ausentes se descartan al recargar", () => {
  const disk = storage();
  const dynamicCourse = { ...catalog.courses[0], id: "local-course", slug: "local-course" };
  const dynamic = { ...catalog, courses: [...catalog.courses, dynamicCourse] };
  const store = createLocalFavoritesStore(() => disk);
  store.hydrate(dynamic);
  store.setSaved(regular, true, dynamic);
  store.setSaved({ kind: "course", id: dynamicCourse.id }, true, dynamic);
  const reclassified = { ...catalog, courses: catalog.courses.map(c => c.id === regular.id ? { ...c, kind: "elective", curricularSemester: null, electiveAreaId: "otro", status: "archived" } : c) };
  const reloaded = createLocalFavoritesStore(() => disk);
  reloaded.hydrate(reclassified);
  assert.deepEqual(reloaded.getSnapshot().references, [regular]);
  assert.ok(reloaded.getSnapshot().warning);
});
