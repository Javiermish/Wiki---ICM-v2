import assert from "node:assert/strict";
import test from "node:test";
import { findTextMatches, MAX_SEARCH_MATCHES, MAX_SEARCH_TEXT } from "../src/components/materials/pdf-search.ts";

test("búsqueda PDF literal sin regex arbitraria ni interpretación de HTML", () => {
  assert.deepEqual(findTextMatches("Una continuidad y CONTINUIDAD.", "continuidad", 2), [
    { page: 2, start: 4, end: 15 }, { page: 2, start: 18, end: 29 },
  ]);
  assert.deepEqual(findTextMatches("x + 2 / x.*", "x.*", 1), [{ page: 1, start: 8, end: 11 }]);
  assert.deepEqual(findTextMatches("<img onerror=alert(1)>", "<img", 1), [{ page: 1, start: 0, end: 4 }]);
  assert.deepEqual(findTextMatches("un texto", "", 1), []);
  assert.deepEqual(findTextMatches("un texto", "inexistente", 1), []);
});

test("los offsets conservan índices UTF-16 válidos para los nodos DOM", () => {
  const text = "🧮 Cálculo y CÁLCULO";
  const matches = findTextMatches(text, "cálculo", 3);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map(({ start, end }) => text.slice(start, end)), ["Cálculo", "CÁLCULO"]);
  assert.ok(matches.every(({ page }) => page === 3));
});

test("la búsqueda acota texto y coincidencias antes de crear resultados masivos", () => {
  assert.equal(findTextMatches("a".repeat(100000), "a", 1).length, MAX_SEARCH_MATCHES);
  assert.equal(findTextMatches("a".repeat(100000), "a", 1, 7).length, 7);
  assert.equal(findTextMatches("a", "a", 1, 0).length, 0);
  assert.deepEqual(findTextMatches("a".repeat(MAX_SEARCH_TEXT) + "oculto", "oculto", 1), []);
});
