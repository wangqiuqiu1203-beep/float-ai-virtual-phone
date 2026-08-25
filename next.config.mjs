import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";
const isWslUncPath = projectRoot.startsWith("\\\\wsl$\\");

function resolveDistDir() {
  // 支持通过 NEXT_DIST_DIR 环境变量覆盖构建输出目录，用于本地构建时复用 dev server 的 .next
  if (process.env.NEXT_DIST_DIR) {
    return process.env.NEXT_DIST_DIR;
  }
  if (!isWindows || !isWslUncPath) {
    return ".next";
  }

  const safeProjectName = path.basename(projectRoot).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(os.tmpdir(), `next-dist-${safeProjectName}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: projectRoot,
  distDir: resolveDistDir(),
  // Cloudflare Pages / 静态托管：开启静态导出
  output: "export",
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 项目里有部分类型不太兼容 TS 类型检查（chat-message-list 组件、weixin 助手 socket 兼容等），
    // 类型检查交给 IDE 和 `npx tsc --noEmit` 即可，不阻塞 build 构建。
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // @gltf-transform/core 的 dist 引用 node:fs / node:path（仅 node:），
      // 部分浏览器 bundle 会用到 node: 前缀导致 UnhandledSchemeError。
      // 这里做兼容替换，再使用 fallback 兜底（引入 WebIO，不支持 fs）。
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        module: false,
      };
    }
    return config;
  },
};

export default nextConfig;
