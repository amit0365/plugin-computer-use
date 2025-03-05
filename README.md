# `@elizaos/plugin-computer-use`

This ElizaOS plugin provides **“computer-use”** actions via multi-turn loop modelled after Anthropic computer use demo, allowing AI agents to execute local GUI actions, run `bash` commands, edit text, and more—all in a headless Docker environment with VNC/noVNC access.

## Features

- **Multi-Turn “Tool Use”**: The agent can use a specialized loop that streams partial responses while it runs local system commands or GUI interactions in a Docker-based headless environment.
- **Local GUI Interactions**: Tools for “computer” and “bash” usage (mouse, keyboard, screenshots, file editing).
- **Anthropic Integration**: Leverages Anthropic’s advanced model endpoints (like `claude-3-5-sonnet-20241022`) with specialized “computer_use” Beta flags.

---

## Requirements

1. **ElizaOS**: 
2. **Anthropic**: Valid API key, e.g. `ANTHROPIC_API_KEY=sk-yourKeyHere`
3. **Linux / Docker**: Ubuntu-based environment recommended if running locally; or any Docker-compatible OS
4. **Node.js**: v23.3.0 (install in Docker)

---

## Installation

If you prefer to integrate the plugin into your local Eliza setup outside of Docker:

1. **Install the Plugin**:
   ```bash
   pnpm install @elizaos/plugin-computer-use
   ```

2. **Add to Your Character File**:
   ```jsonc
   {
     "name": "ComputerUseAgent",
     "modelProvider": "anthropic",
     "plugins": ["@elizaos/plugin-computer-use"],
     "settings": {
       "secrets": {
         "ANTHROPIC_API_KEY": "sk-yourKeyHere"
       }
     }
   }
   ```

3. **Set Up a Virtual X Environment**  
    Required `xvfb`, `xdotool`, etc. on your host for GUI simulation. The tools are alreadyinstalled in the Docker container. Then run the start.sh script to start the VM with GUI and Eliza.

4. **Start Your Agent**:
   ```bash
   pnpm start --character="characters/computer-use.character.json"
   ```
   Whenever the agent receives a message that triggers `ANTHROPIC_COMPUTER_USE`, it will attempt local commands.

---

## Docker Setup

The repository includes a **Dockerfile** and scripts to spin up a fully self-contained environment:

### 1. Directory Contents

```
/Users/ak36/Desktop/walle/eliza-acu-docker
├── .env.example          # Example environment variables
├── Dockerfile            # Defines the Ubuntu-based environment with Xvfb, noVNC, etc.
├── start.sh              # Entry script to run Xvfb, window manager, VNC, Eliza, and client
└── .config/tint2/        # Tint2 panel config & desktop launcher files
```

### 2. Build the Docker Image

1. Add your plugin code inside the Eliza monorepo, or ensure your `Dockerfile` references it properly.
2. From `eliza-acu-docker/`, run:
   ```bash
   docker build -t eliza-computer-use:latest .
   ```
   - The Dockerfile:
     - Installs dependencies (xvfb, xdotool, scrot, mutter, etc.)
     - Clones the Eliza repository, checks out `develop`
     - Installation and build steps (`RUN pnpm install && pnpm build`)
     - Copies scripts and config

### 3. Create and Customize `.env`

- Copy `.env.example` to `.env` and update relevant variables:
  ```bash
  cp .env.example .env
  nano .env
  ```
- Ensure you set `ANTHROPIC_API_KEY` and any other relevant environment variables for your Eliza agent.

### 4. Run the Container

```bash
docker run --name eliza-computer-use \
  -p 8080:8080 -p 5173:5173 -p 3000:3000 \
  -d eliza-computer-use:latest
```

- **Ports**:
  - **8080**: noVNC Access (GUI)
  - **5173**: Eliza UI client
  - **3000**: Eliza server (REST API, etc.)

### 5. Access the Environment

- **noVNC**:  
  Open [http://localhost:8080/vnc.html](http://localhost:8080/vnc.html) in your browser.  
  You’ll see a lightweight X session with a Tint2 panel and launcher icons (Firefox, xterm, gedit, etc.).  

- **Eliza Web Client**:  
  Open [http://localhost:5173](http://localhost:5173) to chat with your agent.  

- **Eliza Server**:  
  The internal agent logs appear in container logs:
  ```bash
  docker logs -f eliza-computer-use
  ```

### 6. Container Lifecycle

- **Stop Container**:
  ```bash
  docker stop eliza-computer-use
  ```
- **Restart Container**:
  ```bash
  docker start eliza-computer-use
  ```
- **Remove Container**:
  ```bash
  docker rm -f eliza-computer-use
  ```

---

## Usage Flow

1. **User**: “Could you open Firefox and show me a screenshot?”
2. **Agent** (via `ANTHROPIC_COMPUTER_USE` action):  
   - Launches Firefox by sending a `bash` or `computer` tool command inside the Docker container’s X session
   - Streams partial responses for each step
   - Takes a screenshot and returns the final base64-encoded image or partial images
3. **Console Logs**: Provide detail about tool calls, e.g.:
   ```
   [multiTurnComputerUse] Running tool 'bash' with input: (DISPLAY=:1 firefox-esr &)
   [tool_result] 'Launched Firefox successfully.'
   [multiTurnComputerUse] Running tool 'computer' with input: { "action": "screenshot" }
   [tool_result] [image omitted]
   ```

---

## Example `.env.example` Fields

Below are some commonly adjusted fields in `.env.example`:

```bash
ANTHROPIC_API_KEY=sk-...
WIDTH=1024
HEIGHT=768
```
Adjust them to match your environment and desired agent configuration.

---

## Development & Testing

### Local Rebuilds

If you edit your plugin code:

1. Rebuild your plugin and Eliza:
   ```bash
   cd eliza/packages/plugin-anthropic-computer-use
   pnpm install
   pnpm build
   ```
2. Rebuild Docker image:
   ```bash
   docker build -t eliza-computer-use:latest .
   ```
3. Run the container again with updated code.

### start.sh Script

The included `start.sh`:

- Launches `Xvfb` at `:1` with resolution from `$WIDTH`/`$HEIGHT`
- Starts `mutter` window manager and `tint2` panel
- Runs `x11vnc` on port `5900` plus `noVNC` on `8080`
- Finally starts the Eliza server (`pnpm start`) on port `3000` and the Eliza UI client on port `5173`
- Ends with a `tail -f /dev/null` to keep container alive

If you want to customize anything, just edit `start.sh` (for instance, change resolution or noVNC port).

---

## Demo Evidence

**Demo Video**:  
https://drive.google.com/file/d/1j70TUMyCNVl_7XQYw4hj-Y9wlore_cKm/view?usp=sharing

**Docker Logs**:  https://pastebin.com/E5uczf9B

---

## License

This plugin is distributed under the [MIT License](LICENSE).  
Contributions are welcome—please open a PR or file an issue!

## Author & Contact

- **Maintainer**: amit0365 / TinFoil Labs
- **Repository**: [GitHub Link](https://github.com/amit0365/plugin-computer-use)
- **Questions**: Feel free to reach out via GitHub issues

---

_Thanks for using `@elizaos/plugin-computer-use`—now your waifu can tinker with your cerebrum!_