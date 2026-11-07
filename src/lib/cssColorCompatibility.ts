/**
 * Compatibility helpers for html2canvas 1.x.
 *
 * Tailwind CSS v4 emits CSS Color 4 oklch() values. html2canvas 1.x does not
 * understand that color syntax, so normalize computed styles in the cloned
 * PDF document only; the live SIPANDU interface remains untouched.
 */

const OKLCH_PATTERN = /oklch\\(\\s*([^()]*)\\)/gi;

function numericToken(token: string, percentageScale = 1): number {
  const normalized = token.trim().toLowerCase();
  if (!normalized || normalized === 'none') return 0;
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  return normalized.endsWith('%') ? (value / 100) * percentageScale : value;
}

function hueInRadians(token: string): number {
  const value = token.trim().toLowerCase();
  const angle = Number.parseFloat(value);
  if (!Number.isFinite(angle)) return 0;
  if (value.endsWith('turn')) return angle * 2 * Math.PI;
  if (value.endsWith('rad')) return angle;
  if (value.endsWith('grad')) return angle * Math.PI / 200;
  return angle * Math.PI / 180;
}

function linearToSrgb(value: number): number {
  const channel = Math.min(1, Math.max(0, value));
  const encoded = channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/** Convert one CSS oklch() color to an html2canvas-compatible rgba() string. */
export function normalizeOklchColor(input: string): string | null {
  const match = /^\\s*oklch\\(\\s*([^()]*)\\)\\s*$/i.exec(input);
  if (!match) return null;

  const [components, alphaComponent] = match[1].split('/');
  const tokens = components.trim().split(/\\s+/);
  if (tokens.length !== 3) return null;

  const lightness = Math.min(1, Math.max(0, numericToken(tokens[0], 1)));
  const chroma = Math.max(0, numericToken(tokens[1], 0.4));
  const hue = hueInRadians(tokens[2]);
  const alpha = alphaComponent === undefined
    ? 1
    : Math.min(1, Math.max(0, numericToken(alphaComponent, 1)));

  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.2914855480 * b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;

  const red = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  const alphaText = Number(alpha.toFixed(3)).toString();

  return `rgba(${red}, ${green}, ${blue}, ${alphaText})`;
}

/** Replace any oklch() color occurrences inside a CSS declaration or gradient. */
export function replaceOklchColors(value: string): string {
  return value.replace(OKLCH_PATTERN, (original) => normalizeOklchColor(original) || original);
}

/**
 * html2canvas 1.x reads computed values from the cloned document. Normalize
 * only declarations that actually resolve to oklch(), and only in that clone.
 */
export function sanitizeHtml2CanvasDocument(clonedDocument: Document): void {
  const view = clonedDocument.defaultView;
  if (!view) return;

  const elements = Array.from(clonedDocument.querySelectorAll('*'));
  for (const element of elements) {
    const computed = view.getComputedStyle(element);
    const inlineStyle = (element as Element & { style?: CSSStyleDeclaration }).style;
    if (!inlineStyle) continue;

    for (let index = 0; index < computed.length; index += 1) {
      const property = computed.item(index);
      const value = computed.getPropertyValue(property);
      if (!/oklch\\s*\\(/i.test(value)) continue;

      const normalized = replaceOklchColors(value);
      if (normalized !== value) {
        inlineStyle.setProperty(property, normalized, 'important');
      }
    }
  }

  // Also normalize inline custom properties that are consumed by descendants.
  for (const element of elements) {
    const inlineStyle = (element as Element & { style?: CSSStyleDeclaration }).style;
    if (!inlineStyle) continue;
    for (let index = 0; index < inlineStyle.length; index += 1) {
      const property = inlineStyle.item(index);
      const value = inlineStyle.getPropertyValue(property);
      if (/oklch\\s*\\(/i.test(value)) {
        inlineStyle.setProperty(property, replaceOklchColors(value), 'important');
      }
    }
  }
}
