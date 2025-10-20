// packages/engine/src/providers/provider-registry.ts

export interface Provider {
  /** 고유 ID (예: "groq-mixtral") */
  id: string;

  /** 실제 실행 함수(필요시 시그니처 수정) */
  run: (input: unknown) => Promise<unknown> | unknown;

  /** plan-generator.ts 에서 사용 */
  transform?: (projectPath: string, options?: unknown) => Promise<any[]> | any[];
}

export class ProviderRegistry {
  private map = new Map<string, Provider>();

  register(provider: Provider) {
    if (!provider?.id) throw new Error("Provider must have an id");
    this.map.set(provider.id, provider);
  }

  get(id: string): Provider {
    const p = this.map.get(id);
    if (!p) throw new Error(`Provider not found: ${id}`);
    return p;
  }

  has(id: string) {
    return this.map.has(id);
  }

  list(): Provider[] {
    return [...this.map.values()];
  }

  clear() {
    this.map.clear();
  }
}
