import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const declarations = (selector) => Object.fromEntries([...css.match(selector)[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
const light = declarations(/:root\s*\{([\s\S]*?)\n\}/);
const dark = { ...light, ...declarations(/\.dark\s*\{([\s\S]*?)\n\}/) };

function color(tokens, name) {
  const value = tokens[name];
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? color(tokens, reference[1]) : value;
}

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (const [theme, tokens] of Object.entries({ light, dark })) {
  test(`paleta ${theme}: pares de texto usados alcanzan WCAG AA`, () => {
    for (const [foreground, background] of [
      ["--foreground", "--background"], ["--foreground", "--card"],
      ["--muted-foreground", "--background"], ["--muted-foreground", "--card"], ["--muted-foreground", "--muted"],
      ["--primary", "--background"], ["--primary", "--card"],
      ["--primary-foreground", "--primary"], ["--secondary-foreground", "--secondary"],
      ["--hero-foreground", "--hero"], ["--hero-muted", "--hero"], ["--destructive", "--card"],
    ]) {
      const a = luminance(color(tokens, foreground));
      const b = luminance(color(tokens, background));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(ratio >= 4.5, `${foreground} / ${background}: ${ratio.toFixed(2)}:1`);
    }
  });
  test(`paleta ${theme}: bordes de campos y foco alcanzan 3:1`, () => {
    for (const [foreground, background] of [["--input", "--card"], ["--ring", "--background"]]) {
      const a = luminance(color(tokens, foreground));
      const b = luminance(color(tokens, background));
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 3);
    }
  });
}
