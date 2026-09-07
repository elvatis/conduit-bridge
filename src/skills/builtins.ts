import { SkillRegistry } from './index.js';
import { webSearchSkill } from './web-search.js';
import { filesystemSkill } from './filesystem.js';
import { githubActionsSkill } from './github-actions.js';
import { browserSkill } from './browser.js';
import { memorySkill } from './memory.js';
import { sandboxSkill } from './sandbox.js';
import { codeSearchSkill } from './code-search.js';
import { notifySkill } from './notify.js';
import { promptSplitterSkill } from './prompt-splitter.js';
import { splitExecuteSkill } from './split-execute.js';
import { routingRulesSkill } from './routing-rules.js';

/** Construct all built-in executable tools without opening storage or authenticating providers. */
export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry([webSearchSkill, filesystemSkill, githubActionsSkill, browserSkill, memorySkill, sandboxSkill, codeSearchSkill, notifySkill, promptSplitterSkill, splitExecuteSkill, routingRulesSkill]);
}
