import asyncio
import os
import json
import uuid
import time
from datetime import datetime
from dotenv import load_dotenv

# Starlette imports
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.requests import Request
from starlette.responses import JSONResponse, FileResponse
from starlette.staticfiles import StaticFiles
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

# Import crawler logic
from crawler_agent import (
    crawl_topic,
    list_crawl_history,
    get_crawl_result,
    delete_crawl_result,
    clear_all_history,
)

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Task tracking in memory
# task_id -> { "queue": asyncio.Queue(), "status": str, "result": dict, "error": str, "created_at": float }
ACTIVE_TASKS = {}

AVAILABLE_MODELS = [
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash (Recommended)", "tag": "Fast & High Quota", "default": True},
    {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite", "tag": "Ultra Fast", "default": False},
    {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "tag": "Complex Reasoning", "default": False},
    {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "tag": "Next-Gen", "default": False},
]

AVAILABLE_TOOLS = [
    {"id": "search_web", "name": "Web Search (Google Search)", "desc": "Autonomously discover web pages and search results", "enabled": True},
    {"id": "read_url_content", "name": "URL Content Scraper", "desc": "Fetch, parse, and convert webpage HTML to markdown", "enabled": True},
    {"id": "view_file", "name": "File System Viewer", "desc": "Inspect local cache and artifacts on disk", "enabled": True},
    {"id": "create_file", "name": "Report & Artifact Saver", "desc": "Persist research summaries and structured datasets", "enabled": True},
]

async def index(request: Request):
    """Serve the single-page dashboard."""
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"status": "Dashboard frontend is initializing..."}, status_code=200)

async def get_status(request: Request):
    """Return backend status, API key state, models and tools."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    has_key = bool(api_key and len(api_key.strip()) > 8)
    masked_key = f"{api_key[:4]}...{api_key[-4:]}" if has_key else ""
    current_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    return JSONResponse({
        "status": "ready",
        "api_key_configured": has_key,
        "masked_key": masked_key,
        "current_model": current_model,
        "models": AVAILABLE_MODELS,
        "tools": AVAILABLE_TOOLS,
        "system_time": datetime.utcnow().isoformat(),
    })

async def run_crawl_worker(task_id: str, query: str, model: str, tools: list, mode: str, queue: asyncio.Queue):
    """Background worker that calls crawl_topic and pushes events to queue."""
    async def callback(event: dict):
        await queue.put(event)

    try:
        result = await crawl_topic(
            query=query,
            model_name=model,
            tools_enabled=tools,
            mode=mode,
            event_callback=callback,
        )
        ACTIVE_TASKS[task_id]["status"] = "completed"
        ACTIVE_TASKS[task_id]["result"] = result
    except Exception as e:
        ACTIVE_TASKS[task_id]["status"] = "error"
        ACTIVE_TASKS[task_id]["error"] = str(e)
        await queue.put({"type": "error", "message": str(e)})
    finally:
        # Send end-of-stream sentinel
        await queue.put(None)

async def start_crawl(request: Request):
    """Initiate a new crawl task."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    query = (body.get("query") or "").strip()
    if not query:
        return JSONResponse({"error": "Query string is required."}, status_code=400)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return JSONResponse({
            "error": "GEMINI_API_KEY is not configured.",
            "code": "MISSING_API_KEY"
        }, status_code=400)

    model = body.get("model") or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    mode = body.get("mode") or "deep"
    tools = body.get("tools") or ["search_web", "read_url_content", "view_file", "create_file"]

    task_id = f"crawl_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    queue = asyncio.Queue()

    ACTIVE_TASKS[task_id] = {
        "id": task_id,
        "query": query,
        "model": model,
        "mode": mode,
        "status": "running",
        "queue": queue,
        "result": None,
        "created_at": time.time(),
    }

    # Start background task
    asyncio.create_task(run_crawl_worker(task_id, query, model, tools, mode, queue))

    return JSONResponse({
        "task_id": task_id,
        "status": "started",
        "query": query,
        "model": model,
        "mode": mode,
    })

async def stream_crawl(request: Request):
    """Server-Sent Events endpoint streaming live crawl telemetry and output."""
    task_id = request.path_params.get("task_id")
    task_info = ACTIVE_TASKS.get(task_id)

    if not task_info:
        # Check if it was already saved in history
        saved = get_crawl_result(task_id)
        if saved:
            async def single_event():
                yield {"event": "done", "data": json.dumps({"type": "done", "result": saved})}
            return EventSourceResponse(single_event())
        return JSONResponse({"error": "Task not found."}, status_code=404)

    queue = task_info["queue"]

    async def event_generator():
        try:
            # Yield initial connection confirmation
            yield {
                "event": "connected",
                "data": json.dumps({"type": "connected", "task_id": task_id})
            }

            # If task is already finished
            if task_info.get("status") == "completed" and task_info.get("result"):
                yield {
                    "event": "done",
                    "data": json.dumps({"type": "done", "result": task_info["result"]})
                }
                return

            if task_info.get("status") == "error":
                yield {
                    "event": "error",
                    "data": json.dumps({"type": "error", "message": task_info.get("error", "Unknown error")})
                }
                return

            while True:
                # Disconnect check
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat ping
                    yield {"event": "ping", "data": json.dumps({"type": "ping", "time": time.time()})}
                    continue

                if event is None:
                    # End of stream sentinel
                    break

                ev_type = event.get("type", "message")
                yield {
                    "event": ev_type,
                    "data": json.dumps(event)
                }

                if ev_type in ("done", "error"):
                    break

        except asyncio.CancelledError:
            pass

    return EventSourceResponse(event_generator())

async def get_task_result(request: Request):
    """Get completed result by task ID."""
    task_id = request.path_params.get("task_id")
    task_info = ACTIVE_TASKS.get(task_id)
    if task_info and task_info.get("result"):
        return JSONResponse(task_info["result"])

    saved = get_crawl_result(task_id)
    if saved:
        return JSONResponse(saved)

    if task_info:
        return JSONResponse({"status": task_info.get("status", "running")})

    return JSONResponse({"error": "Result not found."}, status_code=404)

async def history_list(request: Request):
    """List historical crawl sessions."""
    history = list_crawl_history()
    return JSONResponse({"history": history})

async def history_delete(request: Request):
    """Delete single crawl session from history."""
    task_id = request.path_params.get("task_id")
    ok = delete_crawl_result(task_id)
    if task_id in ACTIVE_TASKS:
        del ACTIVE_TASKS[task_id]
    return JSONResponse({"success": ok})

async def history_clear(request: Request):
    """Clear all past crawl records."""
    count = clear_all_history()
    ACTIVE_TASKS.clear()
    return JSONResponse({"success": True, "deleted_count": count})

async def update_settings(request: Request):
    """Update API key and/or default model, updating .env and current runtime environment."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    api_key = (body.get("api_key") or "").strip()
    model = (body.get("model") or "").strip()

    env_path = os.path.join(BASE_DIR, ".env")
    env_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            env_lines = f.readlines()

    updated_key = False
    updated_model = False
    new_lines = []

    for line in env_lines:
        if line.startswith("GEMINI_API_KEY=") and api_key:
            new_lines.append(f"GEMINI_API_KEY={api_key}\n")
            updated_key = True
        elif line.startswith("GEMINI_MODEL=") and model:
            new_lines.append(f"GEMINI_MODEL={model}\n")
            updated_model = True
        else:
            new_lines.append(line)

    if api_key and not updated_key:
        new_lines.append(f"GEMINI_API_KEY={api_key}\n")
    if model and not updated_model:
        new_lines.append(f"GEMINI_MODEL={model}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    if api_key:
        os.environ["GEMINI_API_KEY"] = api_key
    if model:
        os.environ["GEMINI_MODEL"] = model

    return JSONResponse({
        "success": True,
        "message": "Settings updated successfully",
        "model": os.getenv("GEMINI_MODEL"),
        "has_key": bool(os.getenv("GEMINI_API_KEY"))
    })

async def test_key(request: Request):
    """Test validity of a Gemini API key with a fast ping."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    key_to_test = (body.get("api_key") or "").strip() or os.getenv("GEMINI_API_KEY", "")
    if not key_to_test:
        return JSONResponse({"valid": False, "error": "No API key provided."}, status_code=400)

    try:
        from google.antigravity import Agent, LocalAgentConfig
        config = LocalAgentConfig(
            api_key=key_to_test,
            model="gemini-2.5-flash",
        )
        async with Agent(config) as agent:
            resp = await agent.chat("Ping test. Respond with 'PONG'.")
            t = await resp.text()
            return JSONResponse({"valid": True, "response": t.strip()})
    except Exception as e:
        return JSONResponse({"valid": False, "error": str(e)}, status_code=200)

# Routes definition
routes = [
    Route("/", endpoint=index, methods=["GET"]),
    Route("/api/status", endpoint=get_status, methods=["GET"]),
    Route("/api/crawl", endpoint=start_crawl, methods=["POST"]),
    Route("/api/crawl/{task_id}/stream", endpoint=stream_crawl, methods=["GET"]),
    Route("/api/crawl/{task_id}", endpoint=get_task_result, methods=["GET"]),
    Route("/api/history", endpoint=history_list, methods=["GET"]),
    Route("/api/history", endpoint=history_clear, methods=["DELETE"]),
    Route("/api/history/{task_id}", endpoint=history_delete, methods=["DELETE"]),
    Route("/api/settings", endpoint=update_settings, methods=["POST"]),
    Route("/api/test-key", endpoint=test_key, methods=["POST"]),
]

# Ensure static dir exists before mounting
os.makedirs(STATIC_DIR, exist_ok=True)
routes.append(Mount("/static", app=StaticFiles(directory=STATIC_DIR), name="static"))

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
]

app = Starlette(debug=False, routes=routes, middleware=middleware)

if __name__ == "__main__":
    import uvicorn
    print("[*] Starting Web Crawler Dashboard on http://127.0.0.1:8000")
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
