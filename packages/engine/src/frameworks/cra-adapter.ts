import path from 'path';
import fs from 'fs-extra';
import type { FrameworkAdapter, MigrationOptions, MigrationStep } from '../core/types.js';

export class CRAAdapter implements FrameworkAdapter {
  name = 'cra';

  async detect(projectPath: string): Promise<boolean> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      return !!(packageJson.dependencies?.['react-scripts'] || packageJson.devDependencies?.['react-scripts']);
    }
    return false;
  }

  async generateConfig(projectPath: string, options: MigrationOptions): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];

    // CRA projects typically don't need additional config files
    // But we can suggest migration to Vite for better performance
    steps.push({
      type: 'create',
      description: 'Create migration guide for CRA to Vite (optional)',
      target: 'MIGRATION_TO_VITE.md',
      content: this.getMigrationGuideTemplate(),
      required: false
    });

    return steps;
  }

  fixPackageJsonScripts(packageJson: any): any {
    // CRA scripts are typically already configured correctly
    packageJson.scripts = packageJson.scripts || {};
    
    if (!packageJson.scripts.start) {
      packageJson.scripts.start = 'react-scripts start';
    }
    if (!packageJson.scripts.build) {
      packageJson.scripts.build = 'react-scripts build';
    }
    if (!packageJson.scripts.test) {
      packageJson.scripts.test = 'react-scripts test';
    }

    return packageJson;
  }

  private getMigrationGuideTemplate(): string {
    return `# Migration Guide: Create React App to Vite

This project is currently using Create React App. Consider migrating to Vite for better performance and faster development.

## Why migrate to Vite?

- Faster cold starts
- Lightning fast HMR (Hot Module Replacement)
- Better build performance
- Native ES modules support
- More flexible configuration

## Migration Steps

1. Install Vite and related dependencies:
\`\`\`bash
npm install --save-dev vite @vitejs/plugin-react
\`\`\`

2. Create a \`vite.config.js\` file in your project root:
\`\`\`javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
})
\`\`\`

3. Update your \`package.json\` scripts:
\`\`\`json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
\`\`\`

4. Move your \`index.html\` to the project root and update it:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.jsx"></script>
  </body>
</html>
\`\`\`

5. Remove react-scripts dependency:
\`\`\`bash
npm uninstall react-scripts
\`\`\`

## Note

This migration is optional but recommended for better development experience.
`;
  }
}