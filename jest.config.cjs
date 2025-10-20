/** @type {import('jest').Config} */
module.exports = {
  // TS + ESM
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],

  // 테스트만 스캔
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],

  // ts-jest가 전용 tsconfig로 ESM 트랜스파일
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.jest.json', useESM: true }
    ]
  },

  // 🔑 .js 로 요청되면 .ts 원본으로 매핑 (Jest가 .ts를 찾도록)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1.ts'
  },

  // node_modules 중 ESM이 필요한 것만 트랜스파일 허용
  transformIgnorePatterns: [
    'node_modules/(?!supertest|express|fs-extra|cors)'
  ],

  // 시끄러운 산출물/픽스처 경로 제외(있다면)
  modulePathIgnorePatterns: [
    '<rootDir>/apps/web/temp/',
    '<rootDir>/demo-vite/',
    '<rootDir>/.fixtures/'
  ],
  watchPathIgnorePatterns: [
    '<rootDir>/apps/web/temp/',
    '<rootDir>/demo-vite/',
    '<rootDir>/.fixtures/'
  ]
};
