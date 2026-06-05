import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/* ----------------------------------------------------------------------------
 * Guardrail: ban raw color literals in class strings.
 * This is what makes "never inline a literal — use a token" mechanical instead
 * of a matter of willpower. It scans string + template literals for Tailwind
 * color classes that bypass the token layer.
 * -------------------------------------------------------------------------- */
const COLOR_PREFIX =
  'bg|text|border|ring|ring-offset|fill|stroke|from|via|to|shadow|outline|decoration|divide|caret|accent|placeholder'

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

const BANNED = [
  {
    re: new RegExp(`\\b(?:${COLOR_PREFIX})-\\[(?:#|rgb|hsl|oklch|oklab|lab|lch|color\\()`),
    msg: 'an arbitrary color literal (e.g. bg-[#080a0d])',
  },
  {
    re: new RegExp(`\\b(?:${COLOR_PREFIX})-(?:${PALETTE})-\\d{2,3}\\b`),
    msg: 'a raw Tailwind palette color (e.g. text-zinc-100)',
  },
  {
    re: new RegExp(`\\b(?:${COLOR_PREFIX})-(?:white|black)(?:\\/\\[?[\\d.]+%?\\]?)?\\b`),
    msg: 'a raw white/black color (e.g. bg-white/[0.035])',
  },
]

const noRawColors = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw color literals in class strings; require a semantic token from @theme.',
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      if (typeof text !== 'string') return
      for (const { re, msg } of BANNED) {
        const m = re.exec(text)
        if (m) {
          context.report({
            node,
            message: `Avoid ${msg}: "${m[0]}". Use a semantic token (canvas, surface, surface-2, border, text, text-muted, text-faint, accent, good, warn, bad) — define one in @theme if it's missing.`,
          })
          break
        }
      }
    }
    return {
      Literal(node) {
        check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value.raw)
      },
    }
  },
}

const tokens = { rules: { 'no-raw-colors': noRawColors } }

export default tseslint.config(
  { ignores: ['.next', 'next-env.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      tokens,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'tokens/no-raw-colors': 'error',
    },
  },
)
