type CaretPosition = {
  top: number;
  left: number;
  lineHeight: number;
};

const CARET_STYLE_PROPS = [
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
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontFamily",
  "lineHeight",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
] as const;

export const getCaretPosition = (
  textarea: HTMLTextAreaElement,
  position: number,
): CaretPosition | null => {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordBreak = "break-word";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  for (const prop of CARET_STYLE_PROPS) {
    mirror.style[prop] = style[prop];
  }
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);
  const lineHeight =
    Number.parseFloat(style.lineHeight) ||
    Number.parseFloat(style.fontSize) * 1.2 ||
    16;
  return {
    top: markerRect.top - mirrorRect.top,
    left: markerRect.left - mirrorRect.left,
    lineHeight,
  };
};
