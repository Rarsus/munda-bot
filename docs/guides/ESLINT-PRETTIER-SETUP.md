# ESLint & Prettier Setup Guide

## Overview

This project uses **ESLint** for code quality and **Prettier** for automatic code formatting. They are fully integrated to work together seamlessly.

---

## Available Commands

### Formatting

```bash
# Format all files with Prettier
npm run format

# Check if files need formatting (without modifying)
npm run format:check
```

### Linting

```bash
# Check code quality with ESLint (no modifications)
npm run lint

# Automatically fix ESLint errors (where possible)
npm run lint:fix
```

### Build & Development

```bash
# Compile TypeScript
npm run build

# Run in watch mode during development
npm run dev

# Start production build
npm start
```

---

## How They Work Together

### ESLint Configuration
- **File**: `eslint.config.js` (ESLint v9 flat config format)
- **Parser**: `@typescript-eslint/parser` for TypeScript support
- **Rules**:
  - Detects code quality issues
  - Integrates with Prettier via `eslint-plugin-prettier`
  - Warns about unused variables and explicit `any` types
  - Allows console statements (no-console: off)

### Prettier Configuration
- **File**: `.prettierrc.json`
- **Rules**:
  - Single quotes (`'`)
  - Semi-colons (`;`)
  - 2-space indentation
  - 100 character line width
  - Trailing commas (ES5 compatible)
  - LF line endings

### Ignored Files
- **File**: `.prettierignore`
- Excludes build outputs, dependencies, environment files, and generated code

---

## Integration Details

### ESLint Plugins
```json
{
  "prettier/prettier": "error",          // Runs Prettier as ESLint rule
  "@typescript-eslint/no-explicit-any": "warn",  // TypeScript warnings
  "@typescript-eslint/no-unused-vars": "warn"    // Unused variable detection
}
```

### How Prettier Fixes Are Applied

When you run `npm run lint:fix`:
1. ESLint detects formatting issues
2. Prettier automatically formats the code
3. ESLint validates the result

When you run `npm run format`:
1. Prettier formats all files
2. No linting rules are applied
3. Pure formatting based on `.prettierrc.json`

---

## Workflow

### During Development
```bash
# Option 1: Format continuously
npm run format:check  # Check what needs fixing
npm run format        # Auto-fix everything

# Option 2: Lint and fix together
npm run lint:fix      # Fixes both formatting and code quality
```

### Before Commit
```bash
# Verify everything is correct
npm run format:check  # ✅ Must pass
npm run lint          # ✅ Should have 0 errors (warnings OK)
npm run build         # ✅ Must compile
```

### CI/CD Integration
```bash
npm run format:check && npm run lint && npm run build
```

---

## Common Scenarios

### Scenario 1: File has formatting issues
```bash
npm run format        # Prettier fixes all formatting
npm run lint          # Verify no code quality issues
```

### Scenario 2: File has code quality issues
```bash
npm run lint:fix      # ESLint fixes + Prettier reformats
# If not auto-fixable, manual review needed
```

### Scenario 3: Before submitting PR
```bash
npm run format        # Format everything
npm run lint          # Check for code issues  
npm run build         # Compilation check
git add -A && git commit -m "..."
```

---

## Configuration Files Reference

### eslint.config.js
```javascript
// ESLint v9 flat configuration format
// Handles both JS/TS linting and Prettier integration
```

### .prettierrc.json
```json
{
  "semi": true,              // Semicolons required
  "singleQuote": true,       // Single quotes
  "tabWidth": 2,             // 2-space indent
  "trailingComma": "es5",    // Trailing commas where valid
  "printWidth": 100,         // Line wrapping length
  "arrowParens": "always",   // Arrow function parens
  "endOfLine": "lf"          // Unix line endings
}
```

### .prettierignore
```
# Excludes build, dependencies, environment, and generated files
node_modules/
dist/
.env*
```

---

## Troubleshooting

### Issue: ESLint and Prettier conflicts
**Solution**: Prettier is the source of truth for formatting. ESLint is disabled for formatting rules via `eslint-config-prettier`.

### Issue: Formatting not applied
**Solution**: 
```bash
npm run format        # Explicitly run Prettier
npm run lint:fix      # Or let ESLint + Prettier handle it
```

### Issue: Too many warnings
**Solution**: These are informational only. Errors must be fixed.
- `no-explicit-any` warnings: Encourage better typing but don't block
- `no-unused-vars` warnings: Can be suppressed with `// eslint-disable-next-line`

### Issue: Build compilation errors
**Solution**: Formatting/linting doesn't affect this. Check TypeScript `tsconfig.json`.

---

## Dependencies

### Main Tools
- `eslint` ^9.16.0 - Code quality linter
- `prettier` ^3.4.2 - Code formatter
- `@typescript-eslint/eslint-plugin` ^8.13.0 - TypeScript support for ESLint
- `@typescript-eslint/parser` ^8.13.0 - TypeScript parser

### Integration
- `eslint-plugin-prettier` ^5.2.1 - Prettier as ESLint rule
- `eslint-config-prettier` ^9.1.0 - Disables ESLint formatting rules
- `@eslint/js` ^9.x.x - ESLint v9 configuration

---

## Running Locally vs CI

### Local Development
```bash
# Quick format check
npm run format:check

# Auto-fix everything
npm run format && npm run lint:fix

# Full validation
npm run format:check && npm run lint && npm run build
```

### CI Pipeline
```bash
npm run format:check  # Fails if any file unformatted
npm run lint          # Fails if errors found
npm run build         # Fails if compilation error
```

---

## Best Practices

1. **Run before committing**:
   ```bash
   npm run format && npm run lint:fix && npm run build
   ```

2. **Use editor integration**: Configure VSCode/IDE to run on save:
   - ESLint extension: `dbaeumer.vscode-eslint`
   - Prettier extension: `esbenp.prettier-vscode`

3. **Don't force disable warnings**: Address `any` types properly

4. **Commit formatted code**: Never commit unformatted files

5. **Check in both config files**: `.eslintrc.json` and `.prettierrc.json`

---

## Further Reading

- [ESLint Documentation](https://eslint.org/)
- [Prettier Documentation](https://prettier.io/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [ESLint + Prettier Integration](https://github.com/prettier/eslint-config-prettier)

---

**Last Updated**: February 27, 2026  
**Status**: ✅ Active and Integrated
