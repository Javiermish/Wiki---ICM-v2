export type PdfMatch = { page: number; start: number; end: number };
export const MAX_SEARCH_MATCHES = 1000;
export const MAX_SEARCH_TEXT = 2_000_000;
export const MAX_SEARCH_PAGES = 500;

/** Literal matching, with offsets into the original text (not HTML). */
export function findTextMatches(text: string, query: string, page: number, limit = MAX_SEARCH_MATCHES): PdfMatch[] {
  if (!query || limit <= 0) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found: PdfMatch[] = [];
  for (const match of text.slice(0, MAX_SEARCH_TEXT).matchAll(new RegExp(escaped, "giu"))) {
    found.push({ page, start: match.index, end: match.index + match[0].length });
    if (found.length >= Math.min(limit, MAX_SEARCH_MATCHES)) break;
  }
  return found;
}

/** Mutates only PDF.js-owned text nodes; never parses document/query text as HTML. */
export function highlightMatches(layer: HTMLElement, matches: PdfMatch[], active?: PdfMatch) {
  layer.querySelectorAll("mark[data-reader-match]").forEach((mark) => {
    const parent = mark.parentNode;
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
    parent?.normalize();
  });
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({ node, start: offset, end: offset + node.length });
    offset += node.length;
  }
  let firstActive: HTMLElement | null = null;
  let matchIndex = 0;
  // Replacing nodes does not change the saved offsets or the remaining node references.
  for (const { node, start, end } of nodes) {
    while (matchIndex < matches.length && matches[matchIndex].end <= start) matchIndex += 1;
    const intersections: PdfMatch[] = [];
    for (let index = matchIndex; index < matches.length && matches[index].start < end; index += 1) {
      if (matches[index].end > start) intersections.push(matches[index]);
    }
    if (!intersections.length) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of intersections) {
      const from = Math.max(start, match.start) - start;
      const to = Math.min(end, match.end) - start;
      fragment.append(document.createTextNode(node.data.slice(cursor, from)));
      const mark = document.createElement("mark");
      mark.dataset.readerMatch = "true";
      mark.textContent = node.data.slice(from, to);
      if (match === active) {
        mark.dataset.active = "true";
        firstActive ??= mark;
      }
      fragment.append(mark);
      cursor = to;
    }
    fragment.append(document.createTextNode(node.data.slice(cursor)));
    node.replaceWith(fragment);
  }
  // Scroll the reader only; scrollIntoView would also move the surrounding page.
  if (firstActive) {
    const stage = layer.closest('[aria-label="Documento; desplázate para leer"]');
    if (stage instanceof HTMLElement) {
      const hit = firstActive.getBoundingClientRect();
      const viewport = stage.getBoundingClientRect();
      stage.scrollTop += hit.top - viewport.top - viewport.height / 2;
      stage.scrollLeft += hit.left - viewport.left - viewport.width / 2;
    }
  }
}
