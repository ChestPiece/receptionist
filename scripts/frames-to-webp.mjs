// Convert a HyperFrames PNG sequence into the WebP sets <FrameSequence> plays.
// Usage: node scripts/frames-to-webp.mjs <png-dir> <out-dir> [quality=75]
// Writes <out-dir>/lg/0001.webp… (1920x1200, every frame) and <out-dir>/sm/0001.webp… (800x500, every 2nd frame).
// Needs ffmpeg with libwebp. Uses FFMPEG, then PATH, then the winget Gyan.FFmpeg install.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const [pngDir, outDir, quality = "75"] = process.argv.slice(2);
if (!pngDir || !outDir) throw new Error("usage: node scripts/frames-to-webp.mjs <png-dir> <out-dir> [quality]");

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch {}
  const root = join(process.env.LOCALAPPDATA ?? "", "Microsoft/WinGet/Packages");
  for (const pkg of existsSync(root) ? readdirSync(root).filter((d) => d.startsWith("Gyan.FFmpeg")) : []) {
    for (const build of readdirSync(join(root, pkg))) {
      const exe = join(root, pkg, build, "bin/ffmpeg.exe");
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error("ffmpeg not found: set FFMPEG or put it on PATH");
}

const ffmpeg = findFfmpeg();
const input = join(pngDir, "frame_%06d.png");
const sets = [
  { name: "lg", vf: "scale=1920:1200" },
  { name: "sm", vf: "select=not(mod(n\\,2)),scale=800:500" },
];

for (const { name, vf } of sets) {
  const dir = join(outDir, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync(ffmpeg, ["-v", "error", "-i", input, "-vf", vf, "-fps_mode", "vfr", "-pix_fmt", "yuv420p",
    "-c:v", "libwebp", "-quality", quality, "-compression_level", "6", join(dir, "%04d.webp")], { stdio: "inherit" });
  const files = readdirSync(dir);
  const bytes = files.reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
  console.log(`${name}: ${files.length} frames, ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MB)`);
}
