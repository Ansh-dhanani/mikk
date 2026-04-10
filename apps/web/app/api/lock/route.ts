import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, isAbsolute, normalize } from "path";

function isSafePath(targetPath: string, basePath: string): boolean {
  const normalizedTarget = normalize(targetPath);
  const normalizedBase = normalize(basePath);
  return normalizedTarget.startsWith(normalizedBase);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const repoPath = searchParams.get("repoPath");
    
    let lockFilePath: string;
    const cwd = process.cwd();
    const allowedBasePaths = [
      join(cwd, "public", "demo"),
      cwd,
      join(cwd, ".."),
    ];
    
    if (repoPath === "demo") {
      lockFilePath = join(cwd, "public", "demo", "mikk.lock.json");
    } else if (repoPath) {
      if (!isAbsolute(repoPath)) {
        lockFilePath = join(cwd, repoPath, "mikk.lock.json");
      } else {
        const isAllowed = allowedBasePaths.some(base => isSafePath(repoPath, base));
        if (!isAllowed) {
          return NextResponse.json(
            { error: "Invalid repoPath: must be relative or within allowed directories" },
            { status: 400 }
          );
        }
        lockFilePath = join(repoPath, "mikk.lock.json");
      }
    } else {
      lockFilePath = join(cwd, "..", "..", "mikk.lock.json");
    }
    
    console.log("[lock] Reading from:", lockFilePath);
    const content = await readFile(lockFilePath, "utf-8");
    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to read mikk.lock.json:", error);
    return NextResponse.json(
      { error: "Failed to load lock file. Make sure the repository has been analyzed with `mikk init`." },
      { status: 500 }
    );
  }
}
