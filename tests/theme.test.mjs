import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

let moduleInstance = 0;

function freshThemeModule() {
  const url = new URL("../src/lib/theme.ts", import.meta.url);
  url.searchParams.set("theme-test", String(++moduleInstance));
  return import(url.href);
}

function createBrowser({
  stored = null,
  systemDark = false,
  storageThrows = false,
  matchMediaThrows = false,
} = {}) {
  const classes = new Set();
  const mediaListeners = new Set();
  const storageListeners = new Set();
  const writes = [];
  const document = {
    documentElement: {
      classList: {
        contains: (name) => classes.has(name),
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        },
      },
      style: {},
    },
  };
  const media = {
    get matches() {
      return systemDark;
    },
    addEventListener(name, listener) {
      assert.equal(name, "change");
      mediaListeners.add(listener);
    },
    removeEventListener(name, listener) {
      assert.equal(name, "change");
      mediaListeners.delete(listener);
    },
  };
  const storage = {
    getItem(key) {
      assert.equal(key, "wiki-icm-theme-v1");
      return stored;
    },
    setItem(key, value) {
      writes.push([key, value]);
      stored = value;
    },
  };
  const window = {
    get localStorage() {
      if (storageThrows) throw new Error("Storage unavailable");
      return storage;
    },
    matchMedia(query) {
      assert.equal(query, "(prefers-color-scheme: dark)");
      if (matchMediaThrows) throw new Error("Media queries unavailable");
      return media;
    },
    addEventListener(name, listener) {
      assert.equal(name, "storage");
      storageListeners.add(listener);
    },
    removeEventListener(name, listener) {
      assert.equal(name, "storage");
      storageListeners.delete(listener);
    },
  };

  return {
    window,
    document,
    writes,
    assertTheme(theme) {
      assert.equal(classes.has("dark"), theme === "dark");
      assert.equal(document.documentElement.style.colorScheme, theme);
    },
    systemChange(dark) {
      systemDark = dark;
      for (const listener of mediaListeners) listener({ matches: dark });
    },
    storageChange(key, newValue) {
      if (key === "wiki-icm-theme-v1" || key === null) stored = newValue;
      for (const listener of storageListeners) listener({ key, newValue });
    },
    assertUnsubscribed() {
      assert.equal(mediaListeners.size, 0);
      assert.equal(storageListeners.size, 0);
    },
  };
}

async function withBrowser(options, run) {
  const browser = createBrowser(options);
  const descriptors = new Map(
    ["window", "document"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const cleanups = [];

  try {
    for (const key of descriptors.keys()) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: browser[key],
      });
    }
    const theme = await freshThemeModule();
    runInNewContext(theme.themeInitializationScript, {
      window: browser.window,
      document: browser.document,
    });
    await run(theme, browser, (listener = () => {}) => {
      const unsubscribe = theme.subscribeToTheme(listener);
      cleanups.push(unsubscribe);
      return unsubscribe;
    });
  } finally {
    try {
      for (const cleanup of cleanups.reverse()) cleanup();
      browser.assertUnsubscribed();
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  }
}

// Await every subtest: module scenarios temporarily replace browser globals.
test("theme: prepaint and browser store", { concurrency: false }, async (t) => {
  const prepaintCases = [
    ["stored light overrides dark system", { stored: "light", systemDark: true }, "light"],
    ["stored dark overrides light system", { stored: "dark" }, "dark"],
    ["invalid preference follows system", { stored: "invalid", systemDark: true }, "dark"],
    ["missing preference follows system", { systemDark: true }, "dark"],
    ["blocked storage still follows system", { storageThrows: true, systemDark: true }, "dark"],
    ["failed matchMedia defaults to light", { matchMediaThrows: true }, "light"],
    ["both browser APIs failing defaults to light", { storageThrows: true, matchMediaThrows: true }, "light"],
    ["saved preference survives failed matchMedia", { stored: "dark", matchMediaThrows: true }, "dark"],
  ];

  for (const [name, options, expected] of prepaintCases) {
    await t.test(`prepaint: ${name}`, async () => {
      const theme = await freshThemeModule();
      const browser = createBrowser(options);
      runInNewContext(theme.themeInitializationScript, {
        window: browser.window,
        document: browser.document,
      });
      browser.assertTheme(expected);
      assert.deepEqual(browser.writes, []);
      assert.equal(theme.getThemeServerSnapshot(), false);
    });
  }

  await t.test("toggle updates snapshots, notifies and persists both choices", async () => {
    await withBrowser({}, (theme, browser, subscribe) => {
      let notifications = 0;
      subscribe(() => notifications++);
      assert.equal(theme.THEME_STORAGE_KEY, "wiki-icm-theme-v1");
      assert.equal(theme.getThemeSnapshot(), false);
      const beforeToggle = notifications;

      theme.toggleTheme();
      browser.assertTheme("dark");
      assert.equal(theme.getThemeSnapshot(), true);
      assert.ok(notifications > beforeToggle);
      theme.toggleTheme();
      browser.assertTheme("light");
      assert.equal(theme.getThemeSnapshot(), false);
      assert.deepEqual(browser.writes, [
        [theme.THEME_STORAGE_KEY, "dark"],
        [theme.THEME_STORAGE_KEY, "light"],
      ]);
    });
  });

  await t.test("toggle works without storage and keeps the session preference", async () => {
    await withBrowser({ storageThrows: true }, (theme, browser, subscribe) => {
      const unsubscribe = subscribe();
      theme.toggleTheme();
      browser.assertTheme("dark");
      unsubscribe();
      subscribe();
      browser.systemChange(false);
      browser.assertTheme("dark");
      assert.deepEqual(browser.writes, []);
      theme.toggleTheme();
      browser.assertTheme("light");
    });
  });

  await t.test("system changes apply only without an explicit preference", async () => {
    await withBrowser({}, (theme, browser, subscribe) => {
      subscribe();
      browser.systemChange(true);
      browser.assertTheme("dark");
      browser.systemChange(false);
      browser.assertTheme("light");
      theme.toggleTheme();
      browser.systemChange(true);
      browser.systemChange(false);
      browser.assertTheme("dark");
    });
  });

  await t.test("saved manual preference ignores system changes", async () => {
    await withBrowser({ stored: "light" }, (_theme, browser, subscribe) => {
      subscribe();
      browser.systemChange(true);
      browser.assertTheme("light");
    });
  });

  await t.test("storage synchronizes tabs and deletion restores system preference", async () => {
    await withBrowser({ systemDark: true }, (theme, browser, subscribe) => {
      subscribe();
      browser.storageChange(theme.THEME_STORAGE_KEY, "light");
      browser.assertTheme("light");
      browser.storageChange("unrelated-key", "dark");
      browser.assertTheme("light");
      browser.storageChange(theme.THEME_STORAGE_KEY, "dark");
      browser.assertTheme("dark");
      browser.storageChange(theme.THEME_STORAGE_KEY, null);
      browser.systemChange(false);
      browser.assertTheme("light");
      browser.storageChange(theme.THEME_STORAGE_KEY, "invalid");
      browser.systemChange(true);
      browser.assertTheme("dark");
      browser.storageChange(theme.THEME_STORAGE_KEY, "light");
      browser.storageChange(null, null);
      browser.assertTheme("dark");
      assert.deepEqual(browser.writes, []);
    });
  });

  await t.test("unsubscription removes browser and store listeners", async () => {
    await withBrowser({}, (theme, browser, subscribe) => {
      let notifications = 0;
      const unsubscribe = subscribe(() => notifications++);
      unsubscribe();
      browser.assertUnsubscribed();
      const previous = notifications;
      browser.systemChange(true);
      browser.storageChange(theme.THEME_STORAGE_KEY, "dark");
      browser.assertTheme("light");
      theme.toggleTheme();
      assert.equal(notifications, previous);
    });
  });
});
