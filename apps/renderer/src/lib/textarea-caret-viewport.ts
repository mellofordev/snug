/**
 * Maps a caret index in a <textarea> to viewport coordinates (for floating UI).
 * Ported from `textarea-caret` / `textarea-caret-position` mirror-div technique.
 */

const PROPS = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "MozTabSize"
] as const;

function px(computed: CSSStyleDeclaration, key: keyof CSSStyleDeclaration): number {
  const v = computed[key] as string | undefined;
  return v ? parseInt(v, 10) || 0 : 0;
}

/**
 * Caret rectangle in **viewport** space for the character at `position`
 * (selectionStart index: caret sits before `value[position]`).
 */
export function getTextareaCaretViewportRect(
  element: HTMLTextAreaElement,
  position: number
): { left: number; top: number; bottom: number; height: number } {
  const pos = Math.max(0, Math.min(position, element.value.length));

  const isFirefox =
    typeof window !== "undefined" &&
    (window as unknown as { mozInnerScreenX?: number }).mozInnerScreenX != null;
  const computed = getComputedStyle(element);

  const div = document.createElement("div");
  const ds = div.style;
  ds.position = "absolute";
  ds.visibility = "hidden";
  ds.whiteSpace = "pre-wrap";
  ds.wordWrap = "break-word";
  ds.wordBreak = computed.wordBreak || "normal";

  const fromEl = computed as unknown as Record<string, string>;
  const toDiv = ds as unknown as Record<string, string>;
  for (const key of PROPS) {
    toDiv[key] = fromEl[key] ?? "";
  }

  ds.width = `${element.clientWidth}px`;

  if (isFirefox) {
    if (element.scrollHeight > px(computed, "height")) ds.overflowY = "scroll";
  } else {
    ds.overflow = "hidden";
  }

  div.textContent = element.value.substring(0, pos);

  const span = document.createElement("span");
  span.textContent = element.value.substring(pos) || ".";
  div.appendChild(span);

  document.body.appendChild(div);

  const innerTop = span.offsetTop + px(computed, "borderTopWidth");
  const innerLeft = span.offsetLeft + px(computed, "borderLeftWidth");
  const lineHeight = px(computed, "lineHeight") || 16;

  document.body.removeChild(div);

  const taRect = element.getBoundingClientRect();

  const left = taRect.left + innerLeft - element.scrollLeft;
  const top = taRect.top + innerTop - element.scrollTop;
  const height = lineHeight;

  return { left, top, bottom: top + height, height };
}
