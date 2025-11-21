// packages/engine/src/core/template-manager.ts
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// (fs-extra는 안 쓰고 있어서 제거했어요. 필요하면 다시 import 하세요.)

// ESM(NodeNext)에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TemplateManager {
  private templateDir: string;

  constructor() {
    this.templateDir = path.join(__dirname, "../../templates");
  }

  async getTemplate(fileName: string): Promise<string | null> {
    const templates: Record<string, string> = {
      ".gitignore": this.getGitignoreTemplate(),
      ".vscode/settings.json": this.getVSCodeSettingsTemplate(),
      ".vscode/extensions.json": this.getVSCodeExtensionsTemplate(),
      ".prettierrc": this.getPrettierTemplate(),
      ".env.example": this.getEnvExampleTemplate(),
    };

    return templates[fileName] || null;
  }

  private getGitignoreTemplate(): string {
    return `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
*.lcov

# Next.js
.next/
out/

# Nuxt.js
.nuxt/
dist/

# Vite
dist/
dist-ssr/

# Environment variables
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
build/
dist/

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# NYC test coverage
.nyc_output

# Dependency directories
node_modules/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/settings.json
.idea/
*.swp
*.swo

# Temporary folders
tmp/
temp/

# Dev Migration Hub backups
.dev-migrate-backups/
`;
  }

  private getVSCodeSettingsTemplate(): string {
    return JSON.stringify(
      {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": true,
        },
        "typescript.preferences.importModuleSpecifier": "relative",
        "javascript.preferences.importModuleSpecifier": "relative",
      },
      null,
      2
    );
  }

  private getVSCodeExtensionsTemplate(): string {
    return JSON.stringify(
      {
        recommendations: [
          "esbenp.prettier-vscode",
          "dbaeumer.vscode-eslint",
          "bradlc.vscode-tailwindcss",
          "ms-vscode.vscode-typescript-next",
          "christian-kohler.path-intellisense",
          "formulahendry.auto-rename-tag",
          "ms-vscode.vscode-json",
        ],
      },
      null,
      2
    );
  }

  private getPrettierTemplate(): string {
    return JSON.stringify(
      {
        semi: true,
        trailingComma: "es5",
        singleQuote: true,
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
      },
      null,
      2
    );
  }

  private getEnvExampleTemplate(): string {
    return `# Environment Variables Guide
# Copy this file to .env.local and fill in your actual values

# Database
# DATABASE_URL=your_database_url_here

# Authentication
# NEXTAUTH_SECRET=your_nextauth_secret_here
# NEXTAUTH_URL=http://localhost:3000

# External APIs
# API_KEY=your_api_key_here

# Cloud Provider Configuration
# Add your specific environment variables here
`;
  }
}
