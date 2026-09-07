import { existsSync } from 'node:fs';
import { isAbsolute, join, delimiter } from 'node:path';
import type { ToolClassification, ToolSecurityRisk } from './types.js';

export type CliRunMode = 'chat' | 'plan' | 'agent';
export type CliModeProvider = 'cli-claude' | 'cli-gemini' | 'cli-codex' | 'cli-grok';

export type ParseModeResult =
  | { ok: true; mode: CliRunMode }
  | { ok: false; error: string };

const MODES = new Set<CliRunMode>(['chat', 'plan', 'agent']);

export const DEFAULT_MUTATING_TOOLS = 'Write,Edit,NotebookEdit,Bash';
const MUTATING_TOOLS = DEFAULT_MUTATING_TOOLS;

export type ToolCategory =
  | 'File Operations'
  | 'Shell / Terminal'
  | 'Web Access'
  | 'MCP Tools'
  | 'Workspace Editing'
  | 'Notebook Operations'
  | 'Custom Provider Tools';

export interface ToolDescriptor {
  name: string;
  displayName: string;
  category: ToolCategory;
  description: string;
  classification: ToolClassification;
  riskLevel: ToolSecurityRisk;
  mutating: boolean;
  docUrl?: string;
}

export const KNOWN_TOOLS: ToolDescriptor[] = [
  {
    name: 'Write',
    displayName: 'Workspace File Creator',
    category: 'File Operations',
    description: 'Create new files or overwrite existing files inside the designated workspace.',
    classification: 'Workspace Modify',
    riskLevel: 'medium',
    mutating: true,
    docUrl: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code',
  },
  {
    name: 'Edit',
    displayName: 'Workspace File Editor',
    category: 'File Operations',
    description: 'Apply targeted string or chunk modifications to existing files in the workspace.',
    classification: 'Workspace Modify',
    riskLevel: 'medium',
    mutating: true,
    docUrl: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code',
  },
  {
    name: 'MultiEdit',
    displayName: 'Batch Multi-File Editor',
    category: 'File Operations',
    description: 'Execute coordinated edits across multiple files simultaneously in one transaction.',
    classification: 'Workspace Modify',
    riskLevel: 'high',
    mutating: true,
    docUrl: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code',
  },
  {
    name: 'Read',
    displayName: 'File Content Reader',
    category: 'File Operations',
    description: 'Read and inspect file contents without making any modifications.',
    classification: 'Read Only',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'ListDir',
    displayName: 'Directory Tree Inspector',
    category: 'File Operations',
    description: 'Enumerate directories, list children, and inspect folder hierarchy in the workspace.',
    classification: 'Read Only',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'FileSearch',
    displayName: 'Codebase Pattern Searcher',
    category: 'File Operations',
    description: 'Search file names, path globs, and grep text content across the workspace.',
    classification: 'Read Only',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'Bash',
    displayName: 'Terminal Command Shell',
    category: 'Shell / Terminal',
    description: 'Execute shell scripts and bash commands in the system terminal environment.',
    classification: 'System Modify',
    riskLevel: 'critical',
    mutating: true,
  },
  {
    name: 'Terminal',
    displayName: 'Interactive Shell Session',
    category: 'Shell / Terminal',
    description: 'Spawn long-running interactive terminal sessions and process pipelines.',
    classification: 'System Modify',
    riskLevel: 'critical',
    mutating: true,
  },
  {
    name: 'Command',
    displayName: 'System Command Runner',
    category: 'Shell / Terminal',
    description: 'Run non-interactive system commands and process executables on the host.',
    classification: 'System Modify',
    riskLevel: 'critical',
    mutating: true,
  },
  {
    name: 'WebSearch',
    displayName: 'Search Engine Grounding',
    category: 'Web Access',
    description: 'Query external search engines to fetch real-time public web information.',
    classification: 'Network Access',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'Fetch',
    displayName: 'HTTP Resource Downloader',
    category: 'Web Access',
    description: 'Send outbound HTTP GET requests to fetch remote content and documentation.',
    classification: 'Network Access',
    riskLevel: 'medium',
    mutating: false,
  },
  {
    name: 'Browse',
    displayName: 'Headless Web Browser',
    category: 'Web Access',
    description: 'Navigate and inspect web pages through a local headless browser session.',
    classification: 'Network Access',
    riskLevel: 'medium',
    mutating: false,
  },
  {
    name: 'NotebookEdit',
    displayName: 'Jupyter Notebook Cell Editor',
    category: 'Notebook Operations',
    description: 'Modify cell sources, metadata, and markdown inside Jupyter notebook files.',
    classification: 'Workspace Modify',
    riskLevel: 'medium',
    mutating: true,
  },
  {
    name: 'NotebookRead',
    displayName: 'Jupyter Notebook Reader',
    category: 'Notebook Operations',
    description: 'Inspect notebook structure, outputs, and executed cell states read-only.',
    classification: 'Read Only',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'NotebookRun',
    displayName: 'Jupyter Kernel Execution',
    category: 'Notebook Operations',
    description: 'Execute Jupyter notebook code cells inside an active local Python kernel.',
    classification: 'System Modify',
    riskLevel: 'high',
    mutating: true,
  },
  {
    name: 'Patch',
    displayName: 'Diff Patch Applicator',
    category: 'Workspace Editing',
    description: 'Apply standard unified diff patches and hunk replacements directly to workspace files.',
    classification: 'Workspace Modify',
    riskLevel: 'medium',
    mutating: true,
  },
  {
    name: 'WorkspaceWrite',
    displayName: 'Workspace Storage Writer',
    category: 'Workspace Editing',
    description: 'Full write access to create directories and rewrite codebase files.',
    classification: 'Workspace Modify',
    riskLevel: 'high',
    mutating: true,
  },
  {
    name: 'mcp_call',
    displayName: 'MCP Tool Invoker',
    category: 'MCP Tools',
    description: 'Execute external functions and methods exposed by registered Model Context Protocol servers.',
    classification: 'External Service',
    riskLevel: 'high',
    mutating: true,
  },
  {
    name: 'mcp_list',
    displayName: 'MCP Tool Catalog Discovery',
    category: 'MCP Tools',
    description: 'Discover available capabilities, tools, and schemas on active MCP servers.',
    classification: 'External Service',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'mcp_read',
    displayName: 'MCP Resource Reader',
    category: 'MCP Tools',
    description: 'Fetch read-only resource payloads and documentation from active MCP servers.',
    classification: 'External Service',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'GrokBrowse',
    displayName: 'Grok Live Web Grounding',
    category: 'Custom Provider Tools',
    description: 'Direct internet grounding via Grok CLI integration with X platform and web knowledge.',
    classification: 'Network Access',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'GeminiSearch',
    displayName: 'Google Search Grounding',
    category: 'Custom Provider Tools',
    description: 'Google search grounding integration for Gemini models through Antigravity CLI.',
    classification: 'Network Access',
    riskLevel: 'low',
    mutating: false,
  },
  {
    name: 'ClaudeArtifacts',
    displayName: 'Artifact UI Renderer',
    category: 'Custom Provider Tools',
    description: 'Anthropic Claude artifact generator and visual previewing harness.',
    classification: 'Read Only',
    riskLevel: 'low',
    mutating: false,
  },
];

export interface DiscoveredSystemTool {
  executable: string;
  name: string;
  category: string;
  description: string;
  path?: string;
  available: boolean;
}

let cachedSystemTools: DiscoveredSystemTool[] | null = null;
let lastDiscoveryTime = 0;

/**
 * Automatically inspect system PATH on host OS (Windows / Linux) to detect installed tooling.
 * Caches results for 30 seconds to prevent unnecessary filesystem overhead.
 */
export function discoverSystemTools(force = false): DiscoveredSystemTool[] {
  const now = Date.now();
  if (!force && cachedSystemTools && now - lastDiscoveryTime < 30000) {
    return cachedSystemTools;
  }

  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const isWindows = process.platform === 'win32';
  const extensions = isWindows
    ? (process.env.PATHEXT ? process.env.PATHEXT.split(';') : ['.exe', '.cmd', '.bat', '.ps1'])
    : [''];

  const targets = [
    { executable: 'git', name: 'Git Version Control', category: 'Version Control', description: 'Repository inspection, branch tracking, and worktree isolation' },
    { executable: 'node', name: 'Node.js Runtime', category: 'Runtime Environments', description: 'JavaScript and server runtime engine' },
    { executable: 'npm', name: 'Node Package Manager', category: 'Package Managers', description: 'Package installation and dependency lifecycle tool' },
    { executable: 'npx', name: 'NPX Package Runner', category: 'Package Managers', description: 'Execute binaries and tools without manual installation' },
    { executable: 'pwsh', name: 'PowerShell Core', category: 'Shell Environments', description: 'Cross-platform task automation and configuration management' },
    { executable: isWindows ? 'powershell' : 'bash', name: isWindows ? 'Windows PowerShell' : 'Bash Shell', category: 'Shell Environments', description: 'Native operating system shell interpreter' },
    { executable: 'python', name: 'Python Interpreter', category: 'Runtime Environments', description: 'Python script execution and AI tooling runtime' },
    { executable: 'docker', name: 'Docker Engine CLI', category: 'Containerization', description: 'Container runtime management and sandbox environment' },
    { executable: 'cargo', name: 'Rust Cargo', category: 'Build Systems', description: 'Rust compiler toolchain and package manager' },
    { executable: 'go', name: 'Go Toolchain', category: 'Build Systems', description: 'Go language compiler and package runner' },
    { executable: 'claude', name: 'Claude Code CLI', category: 'Coding Agent CLIs', description: 'Anthropic Claude Code command-line developer harness' },
    { executable: 'codex', name: 'OpenAI Codex CLI', category: 'Coding Agent CLIs', description: 'OpenAI Codex interactive executive harness' },
    { executable: 'agy', name: 'Antigravity CLI (agy)', category: 'Coding Agent CLIs', description: 'Google Deepmind Antigravity developer agent CLI' },
    { executable: 'grok', name: 'xAI Grok CLI', category: 'Coding Agent CLIs', description: 'xAI Grok command-line assistant and code analysis tool' },
  ];

  const results: DiscoveredSystemTool[] = targets.map(target => {
    let foundPath: string | undefined;
    for (const dir of dirs) {
      for (const ext of extensions) {
        const full = join(dir, target.executable + (ext && !target.executable.toLowerCase().endsWith(ext.toLowerCase()) ? ext : ''));
        try {
          if (existsSync(full)) {
            foundPath = full;
            break;
          }
        } catch { /* ignore unreadable directories */ }
      }
      if (foundPath) break;
    }
    return {
      ...target,
      path: foundPath,
      available: Boolean(foundPath),
    };
  });

  cachedSystemTools = results;
  lastDiscoveryTime = now;
  return results;
}

/**
 * Resolve chat / plan / agent from the OpenAI-compatible request body.
 * `mode` wins when present. Otherwise `agentic: true` and `plan: true` are aliases.
 * An optional defaultMode can be supplied from per-provider policy.
 */
export function parseCliRunMode(
  body: {
    mode?: unknown;
    agentic?: unknown;
    plan?: unknown;
  },
  defaultMode: CliRunMode = 'chat',
): ParseModeResult {
  if (typeof body.mode === 'string' && body.mode.trim()) {
    const mode = body.mode.trim().toLowerCase() as CliRunMode;
    if (!MODES.has(mode)) {
      return { ok: false, error: 'mode must be chat, plan, or agent' };
    }
    return { ok: true, mode };
  }

  if (body.agentic === true && body.plan === true) {
    return { ok: false, error: 'agentic and plan cannot both be true' };
  }
  if (body.agentic === true) return { ok: true, mode: 'agent' };
  if (body.plan === true) return { ok: true, mode: 'plan' };
  return { ok: true, mode: defaultMode };
}

/**
 * Check whether a provider is permitted to run in agent mode.
 */
export function isAgentModeAllowed(
  provider: string,
  policy?: { agentEnabled?: boolean },
): boolean {
  if (policy && policy.agentEnabled === false) return false;
  return true;
}

/**
 * Agent mode writes the workspace. Refuse it without an absolute existing cwd
 * so the CLI cannot fall back to the home directory.
 */
export function agentModeCwdError(mode: CliRunMode, cwd: string | undefined): string | undefined {
  if (mode !== 'agent') return undefined;
  const path = cwd?.trim();
  if (!path || !isAbsolute(path) || !existsSync(path)) {
    return 'agent mode requires cwd as an absolute existing directory';
  }
  return undefined;
}

/**
 * Tools a read-only chat turn must not reach for. Comma-separated: both CLIs
 * accept "comma or space separated", and a space-separated list would make the
 * variadic flag swallow the arguments that follow it.
 *
 * Every name here has been run against the real binaries. Two traps:
 *   - Claude Code no longer knows `MultiEdit`; an unknown name makes it warn on
 *     stderr for every turn.
 *   - The flag SPELLING differs. `claude` wants camelCase `--disallowedTools`.
 *     On grok that same spelling is an alias for `--deny <RULE>`, which rejects
 *     `NotebookEdit` at parse time ("unsupported tool prefix") and exits 1 -
 *     grok's per-tool flag is the hyphenated `--disallowed-tools`.
 * Keep the two branches below spelled the way their own CLI expects.
 */
export function cliPermissionArgs(
  provider: CliModeProvider,
  mode: CliRunMode,
  opts: { isAgy?: boolean; disallowedTools?: string } = {},
): string[] {
  const mutatingTools = (opts.disallowedTools && opts.disallowedTools.trim()) || MUTATING_TOOLS;
  switch (provider) {
    case 'cli-claude':
      if (mode === 'agent') return ['--permission-mode', 'bypassPermissions'];
      if (mode === 'plan') return ['--permission-mode', 'plan'];
      return ['--disallowedTools', mutatingTools];
    case 'cli-gemini': {
      const legacy = opts.isAgy === false;
      if (mode === 'agent') {
        return legacy ? [] : ['--mode', 'accept-edits', '--dangerously-skip-permissions'];
      }
      if (mode === 'plan') {
        return legacy ? ['--approval-mode', 'plan'] : ['--mode', 'plan'];
      }
      // agy has no read-only mode: `--mode` takes only plan or accept-edits.
      // Default print mode is what makes chat answer instead of planning, but
      // it leaves agy write-capable - verified, it will create a file when a
      // prompt asks for one. Confinement comes from --add-dir in cli-gemini.ts,
      // not from a flag here. Tracked as a known gap in the PR.
      return [];
    }
    case 'cli-codex':
      return mode === 'agent'
        ? ['--sandbox', 'workspace-write', '--approve-for-me', '--ephemeral']
        : ['--sandbox', 'read-only', '--ephemeral'];
    case 'cli-grok':
      if (mode === 'agent') return ['--no-plan', '--always-approve'];
      if (mode === 'plan') return ['--permission-mode', 'plan'];
      // Hyphenated: grok's camelCase alias means --deny and refuses NotebookEdit.
      return ['--disallowed-tools', mutatingTools];
  }
}
