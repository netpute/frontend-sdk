import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from "@rollup/plugin-json";
import pkg from './package.json';

export default [
	// browser-friendly UMD build
	{
		input: 'src/main.js',
		output: {
			name: 'netpute',
			file: pkg.browser,
			format: 'umd'
		},
		plugins: [
      json(),
			resolve(), // so Rollup can find `ms`
			commonjs(), // so Rollup can convert `ms` to an ES module
		]
	},
];
