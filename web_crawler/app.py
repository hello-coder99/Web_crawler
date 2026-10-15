import sys
import time
import webbrowser
import threading
import uvicorn

def launch_dashboard(host: str = "127.0.0.1", port: int = 8000, open_browser: bool = True):
    """Starts the Web Crawler Visual Dashboard and opens the browser."""
    url = f"http://{host}:{port}"
    print("=" * 60)
    print("   🌐 GOOGLE ANTIGRAVITY WEB CRAWLER - VISUAL DASHBOARD")
    print("=" * 60)
    print(f"[*] Dashboard URL: {url}")
    print("[*] Press Ctrl+C in terminal to stop the server.\n")

    if open_browser:
        def _open():
            time.sleep(1.2)
            try:
                webbrowser.open(url)
            except Exception:
                pass
        threading.Thread(target=_open, daemon=True).start()

    uvicorn.run("server:app", host=host, port=port, log_level="info", reload=False)

if __name__ == "__main__":
    launch_dashboard()
