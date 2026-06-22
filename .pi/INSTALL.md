# Installing Superpowers Optimized for Pi (pi.dev)

Full Claude-Code parity for Pi: all 24 workflow skills **and** 9 of 10
lifecycle hooks (session_start, before_agent_start, input, tool_call,
tool_result, agent_end). The only missing hook is `SubagentStop` — Pi
has no sub-agent concept, so there is nothing to guard. See
[docs/platforms/pi.md](https://github.com/Paneon/superpowers-optimized/blob/main/docs/platforms/pi.md)
for the full parity breakdown.

## Prerequisites

- [Pi](https://pi.dev) installed
- Git installed
- Node.js ≥ 18 (required to spawn the underlying JS hook bodies)

## Installation Steps

### 1. Clone Superpowers

**Unix/macOS:**
```bash
git clone https://github.com/Paneon/superpowers-optimized.git ~/.config/pi/superpowers
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/Paneon/superpowers-optimized.git "$env:USERPROFILE\.config\pi\superpowers"
```

### 2. Symlink Skills

Pi auto-discovers skills under `~/.pi/agent/skills/`.

**Unix/macOS:**
```bash
mkdir -p ~/.pi/agent/skills
rm -rf ~/.pi/agent/skills/superpowers-optimized
ln -s ~/.config/pi/superpowers/skills ~/.pi/agent/skills/superpowers-optimized
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.pi\agent\skills"
Remove-Item -Recurse -Force "$env:USERPROFILE\.pi\agent\skills\superpowers-optimized" -ErrorAction SilentlyContinue
cmd /c mklink /J "$env:USERPROFILE\.pi\agent\skills\superpowers-optimized" "$env:USERPROFILE\.config\pi\superpowers\skills"
```

### 3. Symlink the Extension (lifecycle hooks)

Pi auto-discovers extensions under `~/.pi/agent/extensions/`. We ship a
**compiled** extension at `hooks/pi/dist/` — symlink that directory (not the
TypeScript source).

**Unix/macOS:**
```bash
mkdir -p ~/.pi/agent/extensions
rm -rf ~/.pi/agent/extensions/superpowers-optimized
ln -s ~/.config/pi/superpowers/hooks/pi/dist ~/.pi/agent/extensions/superpowers-optimized
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.pi\agent\extensions"
Remove-Item -Recurse -Force "$env:USERPROFILE\.pi\agent\extensions\superpowers-optimized" -ErrorAction SilentlyContinue
cmd /c mklink /J "$env:USERPROFILE\.pi\agent\extensions\superpowers-optimized" "$env:USERPROFILE\.config\pi\superpowers\hooks\pi\dist"
```

> **Windows note:** Directory junctions (`mklink /J`) work without admin
> rights or Developer Mode. If you prefer real symlinks, run an elevated
> shell and use `mklink /D`.

### 4. Restart Pi

Restart Pi. On the next `session_start` you should see the superpowers
context block injected (it begins with `<EXTREMELY_IMPORTANT>`).

Verify by asking: *"do you have superpowers?"*

## Usage

### Finding Skills

Pi's skill tool lists everything under the discovery paths above:

```
list available skills
```

### Loading a Skill

```
use the brainstorming skill to design a new feature
```

The full skill set lives under `~/.pi/agent/skills/superpowers-optimized/`
and stays in sync with the repo via the symlink.

### Personal Skills

Add your own skills under `~/.pi/agent/skills/` (sibling to the
`superpowers-optimized` symlink):

```bash
mkdir -p ~/.pi/agent/skills/my-skill
```

Create `~/.pi/agent/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Use when <specific trigger conditions>
---

# My Skill

[Your skill content here]
```

`name` must be ≤ 64 chars, lowercase + hyphens only (`^[a-z0-9-]+$`).
`description` must be ≤ 1024 chars.

### Project Skills

Pi also discovers `.pi/skills/` inside the current project. Use this for
repository-specific skills that should not be globally installed.

**Skill priority:** Project (`.pi/skills/`) > User (`~/.pi/agent/skills/`)
> Superpowers (the symlinked set above).

## Updating

After a `git pull`, **rebuild the extension** so the symlinked compiled
output picks up any TypeScript changes:

**Unix/macOS:**
```bash
cd ~/.config/pi/superpowers
git pull
npm install
npm run build
```

**Windows (PowerShell):**
```powershell
Set-Location "$env:USERPROFILE\.config\pi\superpowers"
git pull
npm install
npm run build
```

The compiled output (`hooks/pi/dist/`) is committed in the repo, so
`npm run build` is only needed if you're tracking unreleased commits or
making local edits to the adapters.

## Troubleshooting

### Skills not found

1. Check the symlink: `ls -l ~/.pi/agent/skills/superpowers-optimized`
2. Verify it resolves: `ls ~/.pi/agent/skills/superpowers-optimized/using-superpowers/SKILL.md`
3. Check Pi logs for skill-discovery errors.

### Extension not loading

1. Check the symlink: `ls -l ~/.pi/agent/extensions/superpowers-optimized`
2. Verify the dist file exists: `ls ~/.pi/agent/extensions/superpowers-optimized/index.js`
3. Confirm Node ≥ 18: `node --version`
4. Check Pi logs for extension-load errors.

### Hooks not firing

Lifecycle hooks shell out to the JS bodies in `hooks/*.js`. If a hook
appears inert:

1. Try running the underlying script directly with a sample payload:
   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' \
     | node ~/.config/pi/superpowers/hooks/safety/block-dangerous-commands.js
   ```
   Expected: a JSON `permissionDecision: deny` envelope on stdout.
2. Confirm Pi is delivering the event payload shape we expect. See
   `hooks/pi/types.ts` for the interfaces we consume.

### Tool mapping

When skills reference Claude Code tools, Pi's near-equivalents are:

- `TodoWrite` → Pi's task list (if installed via extension)
- `Task` with subagents → **no equivalent** (Pi has no sub-agents)
- `Skill` tool → Pi's native skill expansion (`input` event)
- File operations → Pi's native tools

## Getting Help

- Report issues: https://github.com/Paneon/superpowers-optimized/issues
- Full documentation: https://github.com/Paneon/superpowers-optimized/blob/main/docs/platforms/pi.md
