# Web Crawler Agent & Visual Intelligence Dashboard

An autonomous AI web crawler, research agent, and visual intelligence dashboard

![Antigravity Web Crawler](https://img.shields.io/badge/Google_Antigravity-SDK_v0.1.19-blue?style=for-the-badge)
![Gemini AI](https://img.shields.io/badge/Model-Gemini_2.5_Flash-cyan?style=for-the-badge)
![FastAPI & Starlette](https://img.shields.io/badge/Backend-Starlette_ASGI-emerald?style=for-the-badge)

---

## 🌟 Key Features

### 🖥️ Interactive Visual Dashboard
- **Cyber-Modern Glassmorphism UI**: High-impact futuristic dark aesthetic with subtle radial glow meshes, neon cyan/violet accents, and Google Fonts (`Outfit`, `Plus Jakarta Sans`, and `JetBrains Mono`).
- **Live 5-Stage Execution Pipeline**: Real-time animated tracker monitoring Query Intent → Web Search → URL Scraping → AI Synthesis → Workspace Archival.
- **Real-Time Telemetry & Tool Activity Feed**: Live streaming tool invocation cards displaying `SEARCH_WEB`, `READ_URL_CONTENT`, arguments, status, and millisecond latency.
- **Live Token & Reasoning Stream**: Stream response tokens and reasoning in real-time as the agent generates them.
- **Rich Markdown Findings Dossier**: Syntax-highlighted code blocks with 1-click copy, structured tables, callouts, and clean formatting.
- **Verified Sources Gallery**: Visual cards displaying each examined external domain, favicon/globe badge, and direct URL link.
- **One-Click Export**: Copy Markdown, download `.md` file, or generate print/PDF reports.
- **Search History & Knowledge Base**: Persistent JSON session archive in `history/`; click any previous crawl to instantly reload results without burning API tokens.
- **API Key & Model Manager**:

### 🤖 Autonomous Web Research Agent
- **Built-in**:
  - `SEARCH_WEB`: Formulates Google search queries to discover relevant web pages.
  - `READ_URL_CONTENT`: Scrapes web pages directly, parsing HTML to clean markdown without ad clutter.
  - `VIEW_FILE`: Reads local workspace cache and disk artifacts.
  - `CREATE_FILE`: Persists structured research dossiers.
- **4 Autonomous Strategies**:
  - 🔬 **Deep Research**: Comprehensive multi-query crawl & cross-source examination.
  - ⚡ **Rapid Synthesis**: Concise answers with key takeaways and citations.
  - 💻 **Technical & Code**: Extracts architecture, code snippets, APIs, and specifications.
  - 📊 **Market & Trends**: Extracts statistics, milestones, and industry trends.

---

## 🚀 Quick Start

### 1. Prerequisites & Environment

Ensure Python 3.10+ is installed. Activate the virtual environment:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

Or install dependencies:

```bash
pip install -r requirements.txt
```

### 2. Configure AI API Key

Hosted Gemini models require an API key:
1. Obtain a  API key.
2. Configure `.env`:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   ```
*(Alternatively, configure or test your key directly inside the Visual Dashboard's Settings Modal!)*

---

## 🌐 Launching the Visual Dashboard

To launch the web dashboard and automatically open it in your browser:

```bash
python app.py
```

Or using the crawler agent CLI flag:

```bash
python crawler_agent.py --dashboard
```

The dashboard will be live at **`http://127.0.0.1:8000`**.

---

## 💻 Running via Command Line (CLI Mode)

You can also run the autonomous crawler directly from your terminal:

```bash
# Default query
python crawler_agent.py

# Custom research query
python crawler_agent.py "Latest breakthroughs in quantum computing"
```

---

## 🏛️ Project Architecture

```
web_crawler/
├── app.py                # 1-line launcher with auto-browser launch
├── crawler_agent.py      # Core agent logic, lifecycle hooks, and CLI runner
├── server.py             # Starlette ASGI server with SSE streaming & REST API
├── requirements.txt      # Python dependencies (UTF-8)
├── .env                  # API Key & environment configuration
├── history/              # Persistent JSON store of past research sessions
└── static/
    ├── index.html        # Modern dashboard markup & semantic structure
    ├── css/
    │   └── dashboard.css # Vanilla CSS design system (glassmorphism, dark mode, animations)
    └── js/
        └── dashboard.js  # Real-time SSE listener, markdown parser, history, & controls
```

### Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the single-page Visual Dashboard |
| `GET` | `/api/status` | Returns system health, API key status, and available models |
| `POST` | `/api/crawl` | Dispatches an asynchronous autonomous research task |
| `GET` | `/api/crawl/{id}/stream` | Server-Sent Events (SSE) live telemetry stream |
| `GET` | `/api/crawl/{id}` | Fetches full JSON dossier for a crawl session |
| `GET` | `/api/history` | Lists past crawl sessions |
| `DELETE` | `/api/history/{id}` | Deletes a specific crawl record |
| `DELETE` | `/api/history` | Clears all past crawl records |
| `POST` | `/api/settings` | Updates active model and API key |
| `POST` | `/api/test-key` | Live connectivity test against Gemini endpoint |

---
