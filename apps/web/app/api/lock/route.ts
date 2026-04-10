import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const repoPath = searchParams.get("repoPath");
    
    let lockFilePath: string;
    
    if (repoPath === "demo") {
      lockFilePath = join(process.cwd(), "public", "demo", "mikk.lock.json");
    } else if (repoPath) {
      lockFilePath = join(repoPath, "mikk.lock.json");
    } else {
      lockFilePath = join(process.cwd(), "..", "..", "mikk.lock.json");
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
