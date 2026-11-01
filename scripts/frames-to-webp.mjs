// Convert a HyperFrames render (PNG sequence dir, or an .mp4) into the WebP set <FrameSequence> plays.
// Usage: node scripts/frames-to-webp.mjs <lg|pt> <png-dir or .mp4> <out-dir> [quality=72]
//   lg = landscape film: 1920x1080, every frame      -> <out-dir>/lg/0001.webp…
//   pt = portrait film:  720x1280, every 2nd frame   -> <out-dir>/pt/0001.webp…
// Needs ffmpeg with libwebp. Uses FFMPEG, then PATH, then the winget Gyan.FFmpeg install.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const SETS = {
  lg: "scale=1920:1080",
  pt: "select=not(mod(n\\,2)),scale=720:1280",
};
const [name, pngDir, outDir, quality = "72"] = process.argv.slice(2);
if (!SETS[name] || !pngDir || !outDir) throw new Error("usage: node scripts/frames-to-webp.mjs <lg|pt> <png-dir|.mp4> <out-dir> [quality]");

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
const input = pngDir.endsWith(".mp4") ? pngDir : join(pngDir, "frame_%06d.png"); // an mp4 streams, so no PNG temp files
const dir = join(outDir, name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
execFileSync(ffmpeg, ["-v", "error", "-i", input, "-vf", SETS[name], "-fps_mode", "vfr", "-pix_fmt", "yuv420p",
  "-c:v", "libwebp", "-quality", quality, "-compression_level", "6", join(dir, "%04d.webp")], { stdio: "inherit" });
const files = readdirSync(dir);
const bytes = files.reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
console.log(`${name}: ${files.length} frames, ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MB)`);
