import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["main.js"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			ecmaVersion: 2015,
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.commonjs,
				...globals.node,
			},
		},
		rules: {
			"@typescript-eslint/explicit-module-boundary-types": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": "warn",
		},
	},
);