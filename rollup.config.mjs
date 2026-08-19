import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'

const external = [/^node:/]

const config = [
  // ESM bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/esm/index.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ extensions: ['.ts', '.js'] }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external,
  },
  // CJS bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/cjs/index.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ extensions: ['.ts', '.js'] }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external,
  },
  // Type declarations
  {
    input: 'src/index.ts',
    output: { file: 'dist/types/index.d.ts', format: 'es' },
    plugins: [dts({ tsconfig: './tsconfig.build.json', respectExternal: true })],
    external,
  },
]

export default config
