export type Evidence = {
    id: string;                // 'missing-scripts', 'next-config-missing' 등
    severity: 'low'|'med'|'high';
    summary: string;           // 한 줄 설명
    details?: string;          // 추가 설명
    files: string[];           // 관련 파일 경로
    autoFixable: boolean;
    data?: Record<string, any>;// 감지 결과 부가정보
  };
  
  export type Fix = {
    id: string;                        // evidence.id 와 동일
    title: string;                     // "package.json 스크립트 보정"
    description?: string;
    plan: Patch[];                     // 실제 수정 패치들
    confidence: number;                // 0~1
    requiresConfirm?: boolean;         // 위험하면 true
  };
  
  export type Patch =
    | { type:'write'; file:string; content:string; ifNotExists?:boolean }
    | { type:'mergeJson'; file:string; merge:any }
    | { type:'replaceInFile'; file:string; match:RegExp|string; replace:string }
    | { type:'delete'; file:string };
  
  export type DiagnoseResult = {
    evidences: Evidence[];
    fixes: Fix[];
    summary: { issues:number; autoFixable:number };
  };
  