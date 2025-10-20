// packages/engine/src/frameworks/framework-registry.ts
import type { FrameworkAdapter } from "../core/types.js";
import { NextJSAdapter } from "./nextjs-adapter.js";
import { ViteAdapter } from "./vite-adapter.js";
import { ExpressAdapter } from "./express-adapter.js";
import { CRAAdapter } from "./cra-adapter.js";

type MaybeAdapter =
  | FrameworkAdapter
  | (new (...args: any[]) => FrameworkAdapter);

/** 클래스이든 객체든 FrameworkAdapter 형태로 변환 */
function toAdapter(a: MaybeAdapter): FrameworkAdapter {
  return typeof a === "function" ? new (a as any)() : (a as FrameworkAdapter);
}

export class FrameworkRegistry {
  private adapters = new Map<string, FrameworkAdapter>();

  constructor() {
    // 클래스/객체 혼용 등록 지원
    [NextJSAdapter, ViteAdapter, ExpressAdapter, CRAAdapter]
      .filter(Boolean)
      .map(toAdapter)
      .forEach((adapter) => this.register(adapter));
  }

  register(adapter: FrameworkAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): FrameworkAdapter | undefined {
    return this.adapters.get(name);
  }

  getAll(): FrameworkAdapter[] {
    return Array.from(this.adapters.values());
  }
}
