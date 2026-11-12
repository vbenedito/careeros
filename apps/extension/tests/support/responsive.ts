/**
 * Responsive layout checks (TEST-01, #142) shared by the landing and the app-page suites.
 * `assertResponsive` runs in the page and fails with one line per problem: the rule, the
 * viewport width, a selector path and the element's box.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

/** Widths every page is checked at (#142): small phone, phone, tablet, laptop, desktop. */
export const WIDTHS = [360, 390, 768, 1024, 1440] as const;
/** Up to this width, interactive elements must be touch-sized. */
export const TOUCH_MAX_WIDTH = 768;
/** Minimum height of a touch target (WCAG 2.5.5 / Apple HIG). */
export const MIN_TOUCH_PX = 44;
/** Tolerance for "horizontally centred", in CSS pixels. */
export const CENTRE_TOLERANCE_PX = 2;

/** Where the screenshots go (uploaded by CI as the `responsive-screenshots` artifact). */
export const SCREENSHOT_DIR = fileURLToPath(
  new URL("../../../../responsive-screenshots/", import.meta.url),
);

export interface ResponsiveOptions {
  /** Groups whose content must be horizontally centred in their parent, line by line. */
  centred?: readonly string[];
  /** Extra selectors held to the touch-target rule (besides buttons, a.btn and toggle labels). */
  touchTargets?: readonly string[];
  /** Subtrees skipped by the overflow and touch-target rules (e.g. a decorative marquee). */
  ignore?: readonly string[];
}

interface Args {
  centred: readonly string[];
  touchTargets: readonly string[];
  ignore: readonly string[];
  minTouch: number;
  touchMax: number;
  tolerance: number;
}

/** Runs in the browser. Self-contained: Playwright serialises it with toString(). */
function collectViolations(args: Args): string[] {
  const out: string[] = [];
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const round = (n: number) => Math.round(n * 10) / 10;
  const box = (r: DOMRect) =>
    `{x: ${round(r.left)}, y: ${round(r.top + window.scrollY)}, w: ${round(r.width)}, h: ${round(r.height)}}`;
  const path = (el: Element) => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) part += `#${node.id}`;
      const classes = [...node.classList].slice(0, 3);
      if (classes.length) part += `.${classes.join(".")}`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  };
  const ignored = (el: Element) => args.ignore.some((s) => el.closest(s));
  const hiddenText = (el: Element) =>
    el.matches(".sr, .sr-only") || el.closest(".sr-only, [aria-hidden=true] .sr-only") !== null;
  const visible = (el: Element) => {
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /** True when an ancestor clips horizontal overflow, so the element cannot widen the page. */
  const clipped = (el: Element) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== "visible") return true;
    }
    return false;
  };

  // 1. No horizontal scroll.
  if (doc.scrollWidth > vw) {
    out.push(`horizontal scroll: document is ${doc.scrollWidth}px wide, viewport ${vw}px`);
  }

  // 2. Nothing visible sticks out of the viewport (outermost offender only), 3. no clipped text.
  const all = [...document.body.querySelectorAll("*")];
  const offenders = new Set<Element>();
  for (const el of all) {
    if (ignored(el) || hiddenText(el) || !visible(el)) continue;
    const style = getComputedStyle(el);
    if (style.position !== "fixed" && !clipped(el)) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 0.5 || r.left < -0.5) {
        offenders.add(el);
        if (!(el.parentElement && offenders.has(el.parentElement))) {
          out.push(`outside the viewport: ${path(el)} ${box(r)} (viewport ${vw}px)`);
        }
      }
    }
    const ownText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
    );
    if (
      ownText &&
      style.overflowX !== "visible" &&
      style.textOverflow !== "ellipsis" &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      out.push(
        `clipped text: ${path(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px ${box(el.getBoundingClientRect())}`,
      );
    }
  }

  // 4. Centred groups: every line of children is centred in the parent's content box.
  for (const selector of args.centred) {
    const groups = [...document.querySelectorAll(selector)].filter(visible);
    if (groups.length === 0) out.push(`centred: no visible element matches ${selector}`);
    for (const group of groups) {
      const parent = group.parentElement;
      if (!parent) continue;
      const ps = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      const left =
        pr.left + Number.parseFloat(ps.borderLeftWidth) + Number.parseFloat(ps.paddingLeft);
      const right =
        pr.right - Number.parseFloat(ps.borderRightWidth) - Number.parseFloat(ps.paddingRight);
      const centre = (left + right) / 2;
      const kids = [...group.children].filter(visible);
      const items = kids.length ? kids : [group];
      const lines = new Map<number, { l: number; r: number }>();
      for (const item of items) {
        const r = item.getBoundingClientRect();
        const key = Math.round(r.top);
        const line = lines.get(key);
        lines.set(
          key,
          line
            ? { l: Math.min(line.l, r.left), r: Math.max(line.r, r.right) }
            : { l: r.left, r: r.right },
        );
      }
      for (const [top, line] of lines) {
        const off = (line.l + line.r) / 2 - centre;
        if (Math.abs(off) > args.tolerance) {
          out.push(
            `not centred: ${selector} line at y=${round(top + window.scrollY)} spans ${round(line.l)}–${round(line.r)}, off by ${round(off)}px in ${path(parent)} (content ${round(left)}–${round(right)})`,
          );
        }
      }
    }
  }

  // 5. Touch targets on narrow screens.
  if (vw <= args.touchMax) {
    const targets = new Set<Element>(
      document.querySelectorAll(
        ["a.btn", "button", "[role=button]", ...args.touchTargets].join(","),
      ),
    );
    for (const label of document.querySelectorAll("label")) {
      const control = label.control;
      if (control instanceof HTMLInputElement && /^(checkbox|radio)$/.test(control.type)) {
        targets.add(label);
      }
    }
    for (const el of targets) {
      if (ignored(el) || hiddenText(el) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < args.minTouch - 0.5) {
        out.push(
          `touch target under ${args.minTouch}px: ${path(el)} "${(el.textContent ?? "").trim().slice(0, 30) || el.getAttribute("aria-label") || ""}" ${box(r)}`,
        );
      }
    }
  }
  return out;
}

/** The problems found on the page as it is now (empty when the layout is fine). */
export async function findResponsiveViolations(
  page: Page,
  options: ResponsiveOptions = {},
): Promise<string[]> {
  return page.evaluate(collectViolations, {
    centred: options.centred ?? [],
    touchTargets: options.touchTargets ?? [],
    ignore: options.ignore ?? [],
    minTouch: MIN_TOUCH_PX,
    touchMax: TOUCH_MAX_WIDTH,
    tolerance: CENTRE_TOLERANCE_PX,
  });
}

/** Fails with every problem found, each prefixed with `label` and the viewport width. */
export async function assertResponsive(
  page: Page,
  options: ResponsiveOptions & { label?: string } = {},
): Promise<void> {
  const problems = await findResponsiveViolations(page, options);
  if (problems.length === 0) return;
  const width = page.viewportSize()?.width ?? "?";
  const where = `${options.label ?? page.url()} @ ${width}px`;
  throw new Error(
    `Responsive check failed (${where}):\n${problems.map((p) => `  - ${p}`).join("\n")}`,
  );
}

/** Saves a full-page PNG as `<name>.png` in SCREENSHOT_DIR (contexts use deviceScaleFactor 1). */
export async function saveScreenshot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}${name}.png`, fullPage: true });
}
