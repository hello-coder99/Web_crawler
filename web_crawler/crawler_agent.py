import asyncio
import os
import sys
import json
import re
import time
import uuid
from datetime import datetime
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# History storage directory
HISTORY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history")
os.makedirs(HISTORY_DIR, exist_ok=True)

def _normalize_source_url(url: str) -> str | None:
    """Normalize an HTTP(S) URL for matching citations to fetched pages."""
    try:
        parsed = urlparse(url.strip())
    except (AttributeError, ValueError):
        return None

    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return None

    path = parsed.path.rstrip("/") or "/"
    return parsed._replace(
        scheme=parsed.scheme.lower(),
        netloc=parsed.netloc.lower(),
        path=path,
        fragment="",
    ).geturl()


def extract_sources(text: str, tool_events: list = None) -> list:
    """Extract cited URLs and report whether the crawler successfully read them."""
    sources_by_url = {}

    def add_source(url: str, title: str, source_type: str) -> None:
        normalized_url = _normalize_source_url(url)
        if not normalized_url:
            return

        source = sources_by_url.get(normalized_url)
        if source is None:
            domain = urlparse(normalized_url).netloc.removeprefix("www.")
            source = {
                "url": url.strip(),
                "domain": domain,
                "title": title or domain,
                "type": source_type,
                "cited": source_type == "referenced",
            }
            sources_by_url[normalized_url] = source
        elif title and source.get("title") == source.get("domain"):
            source["title"] = title

        if source_type == "referenced":
            source["cited"] = True

        # A successful read is stronger evidence than a failed read or a citation alone.
        if source_type == "scraped" or (
            source_type == "failed" and source.get("type") == "referenced"
        ):
            source["type"] = source_type

    if tool_events:
        for ev in tool_events:
            args = ev.get("args") or {}
            url = args.get("url") or args.get("Url")
            if not url or str(ev.get("name", "")).lower() != "read_url_content":
                continue
            status = "scraped" if ev.get("status") == "completed" else "failed"
            add_source(str(url), "", status)

    # Markdown links make it possible to connect a finding directly to its source.
    md_links = re.findall(r'\[([^\]]+)\]\((https?://[^\s\)]+)\)', text)
    for title, url in md_links:
        add_source(url, title.strip(), "referenced")

    # Also retain plain URLs from reports that do not use Markdown links.
    plain_urls = re.findall(r'(?<!\()(https?://[a-zA-Z0-9_\-\./\?%&=+#~:;]+)', text)
    for url in plain_urls:
        url = url.rstrip('.,;)\'"')
        add_source(url, "", "referenced")

    return list(sources_by_url.values())

def save_crawl_result(result: dict) -> str:
    """Save a completed crawl result to the history folder."""
    task_id = result.get("id") or str(uuid.uuid4())
    filename = f"{task_id}.json"
    filepath = os.path.join(HISTORY_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    return task_id

def list_crawl_history() -> list:
    """List all saved crawl runs sorted by timestamp descending."""
    results = []
    if not os.path.exists(HISTORY_DIR):
        return results

    for fname in os.listdir(HISTORY_DIR):
        if fname.endswith(".json"):
            fpath = os.path.join(HISTORY_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Return preview summary item
                    results.append({
                        "id": data.get("id", fname[:-5]),
                        "query": data.get("query", "Untitled Query"),
                        "timestamp": data.get("timestamp", ""),
                        "mode": data.get("mode", "deep"),
                        "model": data.get("model", ""),
                        "duration_s": data.get("metrics", {}).get("duration_s", 0),
                        "source_count": len(data.get("sources", [])),
                        "tool_calls_count": len(data.get("tools_used", [])),
                    })
            except Exception:
                continue

    results.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return results

def get_crawl_result(task_id: str) -> dict | None:
    """Retrieve full crawl result by ID."""
    fpath = os.path.join(HISTORY_DIR, f"{task_id}.json")
    if os.path.exists(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None

def delete_crawl_result(task_id: str) -> bool:
    """Delete a crawl result by ID."""
    fpath = os.path.join(HISTORY_DIR, f"{task_id}.json")
    if os.path.exists(fpath):
        try:
            os.remove(fpath)
            return True
        except Exception:
            return False
    return False

def clear_all_history() -> int:
    """Clear all crawl history files."""
    count = 0
    if os.path.exists(HISTORY_DIR):
        for fname in os.listdir(HISTORY_DIR):
            if fname.endswith(".json"):
                try:
                    os.remove(os.path.join(HISTORY_DIR, fname))
                    count += 1
                except Exception:
                    pass
    return count

async def crawl_topic(
    query: str,
    model_name: str | None = None,
    tools_enabled: list | None = None,
    mode: str = "deep",
    event_callback = None,
) -> dict:
    """
    Executes the autonomous Web Crawler agent using Google Antigravity SDK.
    Supports real-time event streaming to event_callback.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        err_msg = "GEMINI_API_KEY is not configured in .env or environment."
        if event_callback:
            await event_callback({"type": "error", "message": err_msg})
        raise ValueError(err_msg)

    start_time = time.time()
    crawl_id = f"crawl_{int(start_time)}_{uuid.uuid4().hex[:6]}"

    from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig, types
    from google.antigravity.hooks import hooks

    if not model_name:
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # Map requested tool keys to BuiltinTools
    default_tools = [
        types.BuiltinTools.SEARCH_WEB,
        types.BuiltinTools.READ_URL_CONTENT,
        types.BuiltinTools.VIEW_FILE,
        types.BuiltinTools.CREATE_FILE,
    ]

    selected_tools = []
    if tools_enabled is not None:
        tool_map = {
            "search_web": types.BuiltinTools.SEARCH_WEB,
            "read_url_content": types.BuiltinTools.READ_URL_CONTENT,
            "view_file": types.BuiltinTools.VIEW_FILE,
            "create_file": types.BuiltinTools.CREATE_FILE,
            "list_dir": types.BuiltinTools.LIST_DIR,
        }
        for t in tools_enabled:
            if t in tool_map:
                selected_tools.append(tool_map[t])
        if not selected_tools:
            selected_tools = [types.BuiltinTools.SEARCH_WEB, types.BuiltinTools.READ_URL_CONTENT]
    else:
        selected_tools = default_tools

    tool_events = []
    thought_buffer = []

    # Define lifecycle hooks to capture real-time execution telemetry
    @hooks.pre_tool_call_decide
    async def pre_tool_hook(tool_call: types.ToolCall) -> types.HookResult:
        ev = {
            "name": tool_call.name,
            "args": tool_call.args,
            "id": tool_call.id,
            "start_time": time.time(),
            "status": "executing",
        }
        tool_events.append(ev)
        if event_callback:
            await event_callback({
                "type": "tool_start",
                "tool": tool_call.name,
                "args": tool_call.args,
                "step_index": len(tool_events),
                "timestamp": datetime.utcnow().isoformat(),
            })
        return types.HookResult(allow=True)

    @hooks.post_tool_call
    async def post_tool_hook(tool_result):
        name = getattr(tool_result, "name", "tool")
        res = getattr(tool_result, "result", None)
        err = getattr(tool_result, "error", None)

        # Match with latest executing event
        for ev in reversed(tool_events):
            if ev.get("name") == name and ev.get("status") == "executing":
                ev["status"] = "error" if err else "completed"
                ev["duration_ms"] = round((time.time() - ev.get("start_time", time.time())) * 1000, 1)
                ev["error"] = str(err) if err else None
                break

        if event_callback:
            summary = ""
            if res:
                res_str = str(res)
                summary = res_str[:300] + ("..." if len(res_str) > 300 else "")
            await event_callback({
                "type": "tool_complete",
                "tool": name,
                "duration_ms": tool_events[-1].get("duration_ms", 0) if tool_events else 0,
                "summary": summary,
                "status": "error" if err else "completed",
                "timestamp": datetime.utcnow().isoformat(),
            })

    # Prepare customized prompt instructions based on research mode
    mode_instructions = {
        "fast": (
            "Provide a rapid, clear synthesis of the topic. Search for the most direct answers, "
            "provide 3-5 high-impact bullet points, key takeaways, and source citations. "
            "Cite factual claims inline with Markdown links to the specific supporting URLs."
        ),
        "deep": (
            "Perform comprehensive, deep research. Search the web with multiple queries if necessary, "
            "read and inspect the most authoritative pages, cross-examine evidence, and produce a detailed, "
            "structured research dossier with: Executive Summary, Key Findings, Technical Details, "
            "Emerging Trends, and Verified Sources. Cite factual claims inline with Markdown links to "
            "the specific supporting URLs; do not rely only on a references list."
        ),
        "technical": (
            "Conduct an in-depth technical investigation. Focus specifically on code patterns, API specifications, "
            "architectural diagrams/tables, configuration recipes, performance characteristics, and implementation guides. "
            "Include code blocks where applicable and cite official technical documentation inline with Markdown links."
        ),
        "market": (
            "Perform an industry intelligence analysis. Focus on market statistics, leading organizations/projects, "
            "timeline milestones, comparative analysis, future projections, and cited references. "
            "Cite factual claims inline with Markdown links to the specific supporting URLs."
        ),
    }
    mode_guide = mode_instructions.get(mode, mode_instructions["deep"])

    prompt = (
        f"You are an autonomous AI Web Crawler and Research Analyst.\n"
        f"Topic: '{query}'\n\n"
        f"Guidance: {mode_guide}\n\n"
        f"Required format:\n"
        f"1. Executive Summary\n"
        f"2. Core Insights & Detailed Findings (use markdown tables, bullet points, and code snippets when helpful)\n"
        f"3. Practical Applications or Architectural Notes\n"
        f"4. Verified Source References (list each URL examined)\n\n"
        f"Attach inline Markdown links to the relevant factual claims, using the exact page URLs you read. "
        f"Do not present a URL as a verified source unless its page was successfully read. "
        f"If evidence is unavailable, state that rather than inventing a citation.\n"
    )

    config = LocalAgentConfig(
        api_key=api_key,
        model=model_name,
        capabilities=CapabilitiesConfig(
            enabled_tools=selected_tools,
            agent_behavior=types.AgentBehavior.AUTONOMOUS,
        ),
        hooks=[pre_tool_hook, post_tool_hook],
    )

    if event_callback:
        await event_callback({
            "type": "status",
            "step": "initializing",
            "message": f"Initializing Google Antigravity Agent with {model_name}...",
        })

    response_text = ""
    usage_metadata = {}

    try:
        async with Agent(config) as agent:
            if event_callback:
                await event_callback({
                    "type": "status",
                    "step": "searching",
                    "message": f"Autonomous agent analyzing query and executing web research...",
                })

            response = await agent.chat(prompt)

            # Stream tokens
            if event_callback:
                await event_callback({
                    "type": "status",
                    "step": "synthesizing",
                    "message": "Synthesizing and formatting comprehensive research dossier...",
                })

            # Stream response text
            async for chunk in response:
                response_text += chunk
                if event_callback:
                    await event_callback({
                        "type": "token",
                        "delta": chunk,
                    })

            # Check usage metadata
            if hasattr(agent.conversation, "last_turn_usage") and agent.conversation.last_turn_usage:
                u = agent.conversation.last_turn_usage
                usage_metadata = {
                    "prompt_tokens": getattr(u, "prompt_token_count", None),
                    "output_tokens": getattr(u, "candidates_token_count", None),
                    "thought_tokens": getattr(u, "thoughts_token_count", None),
                    "total_tokens": getattr(u, "total_token_count", None),
                }

    except Exception as e:
        if event_callback:
            await event_callback({
                "type": "error",
                "message": f"Agent error: {str(e)}",
            })
        raise e

    elapsed_s = round(time.time() - start_time, 2)
    sources = extract_sources(response_text, tool_events)

    result = {
        "id": crawl_id,
        "query": query,
        "mode": mode,
        "model": model_name,
        "timestamp": datetime.utcnow().isoformat(),
        "summary": response_text,
        "sources": sources,
        "tools_used": [
            {
                "name": ev.get("name"),
                "args": ev.get("args"),
                "status": ev.get("status"),
                "duration_ms": ev.get("duration_ms"),
            }
            for ev in tool_events
        ],
        "metrics": {
            "duration_s": elapsed_s,
            "prompt_tokens": usage_metadata.get("prompt_tokens"),
            "output_tokens": usage_metadata.get("output_tokens"),
            "total_tokens": usage_metadata.get("total_tokens"),
        },
    }

    # Persist result
    save_crawl_result(result)

    if event_callback:
        await event_callback({
            "type": "done",
            "result": result,
        })

    return result

async def run_crawler_agent():
    """CLI runner and entry point."""
    args = sys.argv[1:]

    # Check for dashboard flags
    if "--dashboard" in args or "--ui" in args or "--serve" in args:
        print("[*] Launching Visual Dashboard on http://127.0.0.1:8000 ...")
        from app import launch_dashboard
        launch_dashboard()
        return

    # Check API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("\n[!] GEMINI_API_KEY is missing!")
        print("To run hosted Gemini models:")
        print("1. Obtain a free API key from Google AI Studio: https://aistudio.google.com/app/api-keys")
        print("2. Create a .env file with: GEMINI_API_KEY=your_key_here")
        print("3. Or run the visual dashboard with: python crawler_agent.py --dashboard\n")
        return

    query = args[0] if args else "Google Antigravity SDK release notes and core architecture"
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    print(f"[*] Starting Web Crawler Agent...")
    print(f"[*] Model: {model_name}")
    print(f"[*] Task: Research '{query}' and summarize findings.\n")

    result = await crawl_topic(query=query, model_name=model_name, mode="deep")

    print("\n=== Agent Output ===")
    print(result.get("summary", ""))
    print(f"\n[*] Completed in {result.get('metrics', {}).get('duration_s')}s")
    print(f"[*] Sources found: {len(result.get('sources', []))}")
    print(f"[*] Result saved to history (ID: {result.get('id')})")
    print(f"[*] To view the interactive Visual Dashboard, run: python app.py")

if __name__ == "__main__":
    asyncio.run(run_crawler_agent())
