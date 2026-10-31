import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', react: 'src/react.tsx', element: 'src/element.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  minify: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: ['react', 'react/jsx-runtime'],
});
