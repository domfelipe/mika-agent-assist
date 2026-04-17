/**
 * ESLint rule: no-hardcoded-tailwind-colors
 *
 * Blocks Tailwind color utilities that reference Tailwind's default color
 * palette (e.g. `bg-emerald-500`, `text-blue-600`, `border-red-300/40`,
 * `ring-amber-500`) inside JSX className strings. This forces usage of the
 * semantic design tokens declared in `src/styles.css`
 * (e.g. `bg-success`, `text-destructive`, `border-warning/30`).
 *
 * Allowed:
 *  - Neutral palette: `white`, `black`, `transparent`, `current`, `inherit`
 *  - Semantic tokens: primary, secondary, accent, muted, destructive,
 *    success, warning, info, foreground, background, card, popover, border,
 *    input, ring, sidebar, chart-*, surface
 *
 * Disallowed example: `bg-emerald-500/15`, `text-blue-600`, `border-amber-400`
 * Suggested replacement: `bg-success/15`, `text-info`, `border-warning`
 */

const TAILWIND_COLOR_NAMES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime",
  "green", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia",
  "pink", "rose",
];

// Utility prefixes that take a color value
const COLOR_UTILITY_PREFIXES = [
  "bg", "text", "border", "ring", "outline", "divide",
  "from", "via", "to", "fill", "stroke", "shadow",
  "accent", "caret", "decoration", "placeholder",
];

// Build regex that matches things like:
//   bg-emerald-500
//   text-blue-600/40
//   hover:border-red-300
//   dark:focus:bg-amber-500/20
//   border-t-blue-500
const PREFIX_GROUP = COLOR_UTILITY_PREFIXES.join("|");
const COLOR_GROUP = TAILWIND_COLOR_NAMES.join("|");
const HARDCODED_COLOR_RE = new RegExp(
  // Optional variants like `hover:`, `dark:`, `md:` etc. (any number)
  `(?:^|\\s)(?:[a-z0-9-]+:)*` +
    // Utility prefix, optional side suffix like `-t`, `-x`, `-l`
    `(?:${PREFIX_GROUP})(?:-[trblxy])?` +
    // The forbidden color name
    `-(?:${COLOR_GROUP})` +
    // Required shade (50, 100..900, 950)
    `-(?:50|100|200|300|400|500|600|700|800|900|950)` +
    // Optional opacity modifier `/40`, `/[0.5]`
    `(?:\\/[\\w.[\\]]+)?` +
    `(?=\\s|$)`,
  "g",
);

function checkValue(context, node, value) {
  if (typeof value !== "string" || !value) return;
  const matches = value.match(HARDCODED_COLOR_RE);
  if (!matches) return;
  for (const m of matches) {
    context.report({
      node,
      message:
        `Hardcoded Tailwind color "${m.trim()}" is not allowed. ` +
        `Use a semantic token from src/styles.css (e.g. bg-success, text-destructive, border-warning/30).`,
    });
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded Tailwind palette colors in className; require semantic design tokens.",
    },
    schema: [],
    messages: {},
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== "className") return;
        const v = node.value;
        if (!v) return;
        if (v.type === "Literal") {
          checkValue(context, v, v.value);
        } else if (v.type === "JSXExpressionContainer") {
          walkExpression(context, v.expression);
        }
      },
    };
  },
};

function walkExpression(context, expr) {
  if (!expr) return;
  switch (expr.type) {
    case "Literal":
      checkValue(context, expr, expr.value);
      break;
    case "TemplateLiteral":
      for (const q of expr.quasis) checkValue(context, q, q.value.cooked);
      for (const e of expr.expressions) walkExpression(context, e);
      break;
    case "ConditionalExpression":
      walkExpression(context, expr.consequent);
      walkExpression(context, expr.alternate);
      break;
    case "LogicalExpression":
    case "BinaryExpression":
      walkExpression(context, expr.left);
      walkExpression(context, expr.right);
      break;
    case "ArrayExpression":
      for (const el of expr.elements) walkExpression(context, el);
      break;
    case "ObjectExpression":
      for (const p of expr.properties) {
        if (p.type === "Property") {
          // Tailwind/cn style: { "bg-red-500": isActive }
          if (p.key && p.key.type === "Literal") checkValue(context, p.key, p.key.value);
          walkExpression(context, p.value);
        }
      }
      break;
    case "CallExpression":
      // cn(...), clsx(...), cva(...) — inspect every argument
      for (const a of expr.arguments) walkExpression(context, a);
      break;
    default:
      break;
  }
}

export default {
  rules: {
    "no-hardcoded-tailwind-colors": rule,
  },
};
