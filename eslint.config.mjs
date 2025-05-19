import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import eslintPluginJest from "eslint-plugin-jest";
import eslintJS from "@eslint/js";
import importPlugin from "eslint-plugin-import";

export default [
    // Apply JS recommended rules to all JavaScript files
    eslintJS.configs.recommended,
    {
        files: ["**/*.ts"],
        plugins: {
            "@typescript-eslint": typescriptEslint,
            "import": importPlugin
        },
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: "module",
            parserOptions: {
                project: "./tsconfig.json"
            }
        },
        settings: {
            "import/resolver": {
                typescript: {
                    alwaysTryTypes: true,
                }
            }
        },
        rules: {
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "import",
                format: ["camelCase", "PascalCase"],
            }],
            "curly": ["warn", "all"],
            "eqeqeq": "warn",
            "no-throw-literal": "warn",
            "semi": "warn",
        },
    },
    // Jest configuration for test files
    {
        files: ["**/__tests__/**/*.ts", "**/*.test.ts", "**/__mocks__/**/*.ts", "**/*.mock.ts"],
        plugins: {
            "jest": eslintPluginJest
        },
        languageOptions: {
            globals: {
                jest: "readonly",
                ...eslintPluginJest.environments.globals.globals
            }
        },
        rules: {
            ...eslintPluginJest.configs.recommended.rules,
            "no-undef": "off" // Turn off no-undef for jest files since we've added jest to globals
        }
    }
];