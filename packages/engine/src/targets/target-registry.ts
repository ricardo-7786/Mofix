// packages/engine/src/targets/target-registry.ts

export interface Target {
  /** 고유 ID (예: "openai-gpt-4o", "anthropic-claude") */
  id: string;

  /** 실행 혹은 전송 로직(필요시 시그니처 수정) */
  execute?: (payload: unknown) => Promise<unknown> | unknown;

  /** plan-generator.ts 에서 사용 */
  generateConfig?: (
    framework: string,
    projectPath: string,
    options?: unknown
  ) => Promise<any[]> | any[];
}

export class TargetRegistry {
  private map = new Map<string, Target>();

  register(target: Target) {
    if (!target?.id) throw new Error("Target must have an id");
    this.map.set(target.id, target);
  }

  get(id: string): Target {
    const t = this.map.get(id);
    if (!t) throw new Error(`Target not found: ${id}`);
    return t;
  }

  has(id: string) {
    return this.map.has(id);
  }

  list(): Target[] {
    return [...this.map.values()];
  }

  clear() {
    this.map.clear();
  }
}
