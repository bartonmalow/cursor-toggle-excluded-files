// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		ignores: ['src/env/browser/**/*'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.json',
			},
		},
		rules: {
			// Basic rules that work with ESLint 9
			'no-console': 'off',
			'no-debugger': 'off',
			'no-var': 'error',
			'prefer-const': 'error',
			quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
			semi: ['error', 'always'],

			// TypeScript rules that are compatible with v8
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-function-type': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					args: 'after-used',
					argsIgnorePattern: '^_',
					ignoreRestSiblings: true,
					varsIgnorePattern: '^_$',
				},
			],
		},
	},
	{
		files: ['src/env/browser/**/*.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.browser.json',
			},
		},
		rules: {
			'@typescript-eslint/no-unsafe-function-type': 'off',
		},
	},
	{
		ignores: ['dist/*', 'out/*', '**/@types/*', 'tsconfig*.tsbuildinfo', 'webpack.config*.js'],
	},
];
