import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://mock_user:mock_pass@ep-test-mock.ap-southeast-2.aws.neon.tech/unstitch_test?sslmode=require',
    },
  },
});

