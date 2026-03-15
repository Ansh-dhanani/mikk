/**
 * POST /api/feedback
 *
 * Mirrors the fumadocs-automation behaviour exactly:
 *   1. Search for an existing discussion titled "Feedback for <path>"
 *   2. If found  → add a comment to it
 *   3. If not    → create a new discussion in the "Docs Feedback" category
 *
 * Auth: GitHub App (preferred) OR Personal Access Token (fallback)
 *
 * Required env vars:
 *   GITHUB_REPO_OWNER              e.g. "ansh-dhanani"
 *   GITHUB_REPO_NAME               e.g. "mikk"
 *   DOCS_FEEDBACK_CATEGORY         Discussion category name, default "Docs Feedback"
 *
 *   GitHub App (recommended — same as fumadocs-automation):
 *     GITHUB_APP_ID                 numeric app ID
 *     GITHUB_APP_PRIVATE_KEY        PEM private key (newlines as \n)
 *
 *   OR Personal Access Token (simpler):
 *     GITHUB_TOKEN                  PAT with repo + discussion:write scopes
 */

import { NextRequest, NextResponse } from "next/server";
import { App, Octokit } from "octokit";
import { z } from "zod";

const OWNER = process.env.GITHUB_REPO_OWNER ?? "ansh-dhanani";
const REPO = process.env.GITHUB_REPO_NAME ?? "mikk";
const CATEGORY_NAME =
  process.env.DOCS_FEEDBACK_CATEGORY ?? "Docs Feedback";

// ── Singleton Octokit instance ───────────────────────────────
let _octokit: Octokit | undefined;

async function getOctokit(): Promise<Octokit | null> {
  if (_octokit) return _octokit;

  // Option A: GitHub App
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (appId && privateKey) {
    const app = new App({ appId, privateKey });
    const { data } = await app.octokit.request(
      "GET /repos/{owner}/{repo}/installation",
      { owner: OWNER, repo: REPO, headers: { "X-GitHub-Api-Version": "2022-11-28" } }
    );
    _octokit = await app.getInstallationOctokit(data.id);
    return _octokit;
  }

  // Option B: Personal Access Token
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    _octokit = new Octokit({ auth: token });
    return _octokit;
  }

  return null;
}

// ── Cached repo + category info ──────────────────────────────
interface RepoInfo {
  id: string;
  categoryId: string;
}
let _repoInfo: RepoInfo | undefined;

async function getRepoInfo(octokit: Octokit): Promise<RepoInfo | null> {
  if (_repoInfo) return _repoInfo;

  const result = await octokit.graphql<{
    repository: {
      id: string;
      discussionCategories: { nodes: { id: string; name: string }[] };
    };
  }>(`
    query {
      repository(owner: "${OWNER}", name: "${REPO}") {
        id
        discussionCategories(first: 20) {
          nodes { id name }
        }
      }
    }
  `);

  const category = result.repository.discussionCategories.nodes.find(
    (c) => c.name === CATEGORY_NAME
  );

  if (!category) {
    console.error(
      `[feedback] Category "${CATEGORY_NAME}" not found in ${OWNER}/${REPO}.\n` +
      `Available: ${result.repository.discussionCategories.nodes.map((c) => c.name).join(", ")}`
    );
    return null;
  }

  _repoInfo = { id: result.repository.id, categoryId: category.id };
  return _repoInfo;
}

// ── Search for existing discussion ───────────────────────────
async function findDiscussion(
  octokit: Octokit,
  title: string
): Promise<{ id: string; url: string } | null> {
  const query = `
    query($searchString: String!) {
      search(
        query: $searchString,
        type: DISCUSSION,
        first: 5
      ) {
        nodes {
          ... on Discussion { id url title }
        }
      }
    }
  `;
  const variables = {
    searchString: `repo:${OWNER}/${REPO} in:title \"${title}\"`
  };
  const result = await octokit.graphql<{ search: { nodes: { id: string; url: string; title: string }[] } }>(query, variables);
  return (
    result.search.nodes.find((n) => n.title === title) ?? null
  );
}

// ── Main handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const feedbackSchema = z.object({
      rating: z.enum(["good", "bad"]),
      path: z.string(),
      message: z.string().optional()
    });
    const bodyRaw = await req.json();
    const parsed = feedbackSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    const octokit = await getOctokit();
    if (!octokit) {
      // No credentials configured — silently succeed
      return NextResponse.json({ ok: true, skipped: true });
    }

    const repoInfo = await getRepoInfo(octokit);
    if (!repoInfo) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const emoji = body.rating === "good" ? "[good]" : "[bad]";
    const title = `Feedback for ${body.path}`;
    const commentBody = [
      `${emoji} ${body.message?.trim() || "(no message)"}`,
      "",
      "*Forwarded from user feedback.*",
    ].join("\n");

    // 1. Find existing discussion for this page
    let discussion = await findDiscussion(octokit, title);

    if (discussion) {
      // 2a. Add comment to existing discussion
      await octokit.graphql(`
        mutation {
          addDiscussionComment(input: {
            body: ${JSON.stringify(commentBody)},
            discussionId: "${discussion.id}"
          }) {
            comment { id }
          }
        }
      `);
    } else {
      // 2b. Create new discussion
      const result = await octokit.graphql<{
        createDiscussion: { discussion: { id: string; url: string } };
      }>(`
        mutation {
          createDiscussion(input: {
            repositoryId: "${repoInfo.id}",
            categoryId: "${repoInfo.categoryId}",
            title: ${JSON.stringify(title)},
            body: ${JSON.stringify(commentBody)}
          }) {
            discussion { id url }
          }
        }
      `);
      discussion = result.createDiscussion.discussion;
    }

    return NextResponse.json({ ok: true, url: discussion.url });
  } catch (err) {
    console.error("[feedback]", err);
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 500 });
    }
    // Never expose errors to the user in production
    return NextResponse.json({ ok: true });
  }
}
