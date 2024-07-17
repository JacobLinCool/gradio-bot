import { defineConfig } from "tsup";

export default defineConfig(() => ({
	entry: ["src/index.ts", "src/cli.ts"],
	outDir: "dist",
	target: "node18",
	format: ["esm", "cjs"],
	shims: true,
	clean: true,
	splitting: false,
	dts: true,
	// bundle patched @gradio/client before https://github.com/gradio-app/gradio/issues/8819 is resolved
	noExternal: ["@gradio/client"],
}));
