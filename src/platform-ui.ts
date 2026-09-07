import { decorateSettingTooltips } from './ui/index.js';
import { BRAND_ICON } from './ui/brand.js';

export const PLATFORM_NEW_CHAT_HTML = `<button type="button" id="pf-new-chat" class="sidebar-new-chat" aria-label="New chat" data-i18n-aria="ui_new_chat" title="New chat" data-i18n-title="ui_new_chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="ui_new_chat">New chat</span></button>`;
export const PLATFORM_HISTORY_HTML = `<section class="sidebar-history"><h3 data-i18n="ui_recent_chats">Recent conversations</h3><label><span class="visually-hidden" data-i18n="lbl_find_conversation">Find a conversation</span><input id="pf-session-search" type="search" placeholder="Search titles" data-i18n-ph="ph_search_titles"></label><div id="pf-sessions" class="platform-list"></div></section>`;

/** Dependency-free conversation and agent workspace, embedded in the dashboard. */
export const PLATFORM_STYLE = String.raw`
  .platform-shell { --platform-surface: #0A1729; }
  #side-nav [hidden] { display: none !important; }
  .platform-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
  .platform-heading h2 { margin: 0 0 5px; }
  .platform-heading p { margin: 0; max-width: 68ch; }
  .platform-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 5px; border: 1px solid var(--line); background: #07111F; border-radius: 10px; margin-bottom: 18px; }
  .platform-tabs button { flex: 1 1 auto; border-color: transparent; background: transparent; }
  .platform-tabs button[aria-selected="true"] { background: var(--panel-3); color: var(--blue-soft); border-color: var(--line-2); }
  .platform-pane[hidden], .platform-shell [hidden] { display: none !important; }
  .platform-split { display: grid; grid-template-columns: minmax(200px,240px) minmax(0,1fr); gap: 16px; align-items: start; }
  .platform-panel { border: 1px solid var(--line); background: var(--platform-surface); border-radius: 12px; padding: 16px; }
  .platform-panel h3 { margin: 0 0 12px; }
  .platform-list { display: grid; gap: 7px; max-height: 64vh; overflow: auto; scrollbar-width: thin; }
  .platform-list button { width: 100%; text-align: left; white-space: normal; overflow-wrap: anywhere; display: grid; gap: 4px; padding: 11px; }
  .platform-list button.active { border-color: var(--blue); background: var(--panel-3); }
  .platform-list small { color: var(--muted); font-weight: 400; }
  .platform-empty { color: var(--muted); padding: 20px 6px; text-align: center; }
  .platform-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  .platform-toolbar > label { flex: 1 1 180px; margin-bottom: 0; }
  .platform-toolbar > button { flex-shrink: 0; }
  .platform-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 12px; }
  .platform-fields .full { grid-column: 1 / -1; }
  .platform-context { margin: 12px 0; border: 1px solid var(--line); padding: 10px 12px; border-radius: 8px; }
  .platform-context > summary { cursor: pointer; color: var(--blue-soft); padding: 2px 0; }
  .platform-context[open] > summary { margin-bottom: 14px; }
  .platform-context small { display: block; color: var(--muted); margin: 0 0 12px; }
  .platform-transcript { display: grid; align-content: start; gap: 16px; min-height: 300px; max-height: 62vh; overflow: auto; padding: 12px 3px; scrollbar-width: thin; }
  .platform-message { border: 1px solid var(--line); padding: 14px 16px; border-radius: 12px; background: #07111F; }
  .platform-message.user { background: #0D1C33; margin-left: clamp(0px,4%,40px); }
  .platform-message.assistant { border-left: 3px solid var(--blue); margin-right: clamp(0px,4%,40px); }
  .platform-message header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 9px; }
  .platform-message header strong { color: var(--text); }
  .platform-message header small { font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
  .platform-message-content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; font-size: 14px; }
  .platform-message-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .platform-message-actions button { padding: 3px 8px; font-size: 11px; }
  .platform-composer { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 14px; }
  .platform-composer textarea { min-height: 100px; max-height: 300px; }
  .platform-context-summary { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; margin-bottom: 8px; }
  .platform-status { min-height: 24px; color: var(--muted); font-size: 13px; margin: 8px 0; overflow-wrap: anywhere; }
  .platform-status.error { color: var(--bad); }
  .platform-badge { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 5px; background: var(--panel-3); color: var(--blue-soft); }
  .platform-stats { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,140px),1fr)); gap: 10px; margin: 10px 0 18px; }
  .platform-stat { border: 1px solid var(--line); padding: 12px; border-radius: 8px; }
  .platform-stat strong { display: block; color: var(--text); font-size: 20px; }
  .platform-stat span { color: var(--muted); font-size: 12px; }
  .platform-output { white-space: pre-wrap; overflow-wrap: anywhere; background: #07111F; border: 1px solid var(--line); padding: 14px; border-radius: 8px; max-height: 440px; overflow: auto; }
  .platform-artifacts { display: grid; gap: 8px; }
  .platform-artifacts article { border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow-wrap: anywhere; }
  .platform-run-step { border-left: 2px solid var(--line-2); margin-left: 8px; padding: 0 0 16px 16px; overflow-wrap: anywhere; }
  .platform-run-step strong { color: var(--text); }
  .platform-review-banner { border: 1px solid var(--warn); background: var(--warn-bg); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
  .platform-library-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
  @media (max-width: 1050px) { .platform-split { grid-template-columns: minmax(0,1fr); } .platform-list { max-height: 230px; } }
  @media (max-width: 540px) { .platform-panel { padding: 12px; } .platform-fields { grid-template-columns: minmax(0,1fr); } .platform-message { padding: 12px; } .platform-transcript { max-height: 56vh; } .platform-toolbar > button { flex: 1 1 auto; } }
`;

export const PLATFORM_HTML = decorateSettingTooltips(String.raw`
    <div id="platform-section" class="wide page-section platform-shell active">
      <div class="platform-heading"><div><h2 data-i18n="h_platform">Conversation &amp; Agent Workspace</h2><p class="muted" data-i18n="ui_platform_description">Keep a conversation across models, choose its context, and follow bounded agent runs.</p></div><button id="pf-refresh" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg><span class="action-label" data-i18n="btn_refresh_workspace">Refresh workspace</span></button></div>
      <div class="platform-view-menu"><label><span class="visually-hidden" data-i18n="ui_workspace_views">Workspace views</span><select id="pf-view-select"><option value="chat" data-i18n="tab_webchat">Chat</option><option value="memory" data-i18n="tab_memory">Memory</option><option value="library" data-i18n="tab_agents_skills">Assistants</option><option value="runs" data-i18n="tab_runs_artifacts">Tasks</option><option value="system" data-i18n="tab_storage_diagnostics">Administration</option></select></label></div>
      <div class="platform-tabs" role="tablist" aria-label="Workspace views" data-i18n-aria="ui_workspace_views">
        <button type="button" role="tab" id="pf-tab-chat" aria-selected="true" aria-controls="pf-pane-chat" data-pf-tab="chat" data-i18n="tab_webchat">Webchat</button>
        <button type="button" role="tab" id="pf-tab-memory" aria-selected="false" aria-controls="pf-pane-memory" data-pf-tab="memory" data-i18n="tab_memory">Memory</button>
        <button type="button" role="tab" id="pf-tab-library" aria-selected="false" aria-controls="pf-pane-library" data-pf-tab="library" data-i18n="tab_agents_skills">Agents &amp; skills</button>
        <button type="button" role="tab" id="pf-tab-runs" aria-selected="false" aria-controls="pf-pane-runs" data-pf-tab="runs"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span class="action-label" data-i18n="tab_runs_artifacts">Runs &amp; artifacts</span></button>
        <button type="button" role="tab" id="pf-tab-system" aria-selected="false" aria-controls="pf-pane-system" data-pf-tab="system" data-i18n="tab_storage_diagnostics">Storage &amp; diagnostics</button>
      </div>
      <p id="pf-status" class="platform-status" role="status"></p>
      <section id="pf-pane-chat" class="platform-pane" role="tabpanel" aria-labelledby="pf-tab-chat">
        <div class="platform-split">

          <div class="platform-panel chat-surface">
            <details class="platform-context chat-options"><summary data-i18n="ui_chat_options">Conversation options</summary>
            <div class="platform-toolbar"><label><span data-i18n="lbl_conversation_title">Conversation title</span><input id="pf-chat-title" placeholder="New conversation" data-i18n-ph="ph_new_conversation" maxlength="200"></label><button type="button" id="pf-save-chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_details">Save details</span></button><button type="button" id="pf-export-chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg><span class="action-label" data-i18n="btn_export">Export</span></button><button type="button" id="pf-delete-chat" class="danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="10" y2="17"/><line x1="14" x2="14" y1="10" y2="17"/></svg><span class="action-label" data-i18n="btn_delete">Delete</span></button></div>
            <details class="platform-context"><summary data-i18n="ui_model_context_retention">Model, context &amp; retention</summary>
              <div class="platform-fields">

                <label><span data-i18n="lbl_provider_profile">Provider profile</span><select id="pf-chat-profile"><option value="" data-i18n="ui_default_credentials">Default credentials</option></select></label>
                <label><span data-i18n="lbl_retention">Retention</span><select id="pf-chat-retention"><option value="ephemeral" data-i18n="retention_ephemeral_description">Ephemeral: this service session</option><option value="retained" data-i18n="retention_retained_description">Retained: save on this device</option></select></label>
                <label><span data-i18n="lbl_workspace_context">Workspace context</span><select id="pf-chat-workspace"><option value="" data-i18n="ui_no_workspace_scope">No workspace scope</option></select></label>
                <label><span data-i18n="lbl_agent_persona">Agent persona</span><select id="pf-chat-agent"><option value="" data-i18n="ui_no_agent_persona">No agent persona</option></select></label>
                <label><span data-i18n="lbl_context_budget">Context token budget</span><input id="pf-chat-context" type="number" min="256" max="200000" step="256" value="8192"></label>
                <label><span data-i18n="lbl_response_tokens">Maximum response tokens</span><input id="pf-chat-output" type="number" min="1" max="32768" value="1024"></label>
                <label><span data-i18n="lbl_versioned_skills">Versioned skills</span><select id="pf-chat-skills" multiple size="3"></select></label>
                <label class="full"><span data-i18n="lbl_approved_memories">Approved memories to include</span><select id="pf-chat-memories" multiple size="3"></select></label>
              </div>
              <small data-i18n="ui_retention_description">Changing models preserves the conversation transcript. Only the selected memories and skill versions are attached. Retained conversations store their text locally; ephemeral conversations disappear when the service stops.</small>
              <button type="button" id="pf-inspect-context"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg><span class="action-label" data-i18n="btn_inspect_context">Inspect context budget</span></button><div id="pf-context-inspection" class="platform-status"></div><details class="platform-context"><summary data-i18n="ui_reviewed_summary">Use a reviewed conversation summary</summary><form id="pf-summary-form"><label><span data-i18n="lbl_summary_through">Summarize through this completed reply</span><select id="pf-summary-through"></select></label><label><span data-i18n="lbl_reviewed_summary">Reviewed summary</span><textarea id="pf-summary-content" maxlength="12000" placeholder="Write the facts and decisions to retain from earlier messages." data-i18n-ph="ph_reviewed_summary"></textarea></label><button type="submit" id="pf-summary-save"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_summary">Save context summary</span></button><p class="muted" data-i18n="ui_summary_description">The transcript stays intact. Future requests use this summary instead of messages up to the selected reply.</p></form></details>
            </details>
            <p id="pf-context-summary" class="platform-context-summary"></p>
            </details>
            <div id="pf-transcript" class="platform-transcript" aria-label="Conversation messages" data-i18n-aria="ui_conversation_messages" aria-live="polite"></div>
            <div id="pf-edit-branch" class="platform-context" hidden><label><span data-i18n="lbl_edit_branch">Edit a message to start a branch</span><textarea id="pf-edit-content"></textarea></label><div class="platform-toolbar"><button type="button" id="pf-create-branch" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_create_branch">Create edited branch</span></button><button type="button" id="pf-cancel-branch"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg><span class="action-label" data-i18n="btn_cancel_edit">Cancel edit</span></button></div></div>
            <form id="pf-chat-form" class="platform-composer"><label><span data-i18n="lbl_your_message">Your message</span><textarea id="pf-chat-input" maxlength="100000" placeholder="Ask a question or describe a task. Ctrl+Enter sends." data-i18n-ph="ph_chat_message" required></textarea></label><div class="platform-toolbar composer-bottom"><label class="composer-model"><span data-i18n="lbl_next_reply_model">Model for the next reply</span><select id="pf-chat-model"></select></label><button id="pf-chat-send" type="submit" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span class="action-label" data-i18n="btn_send_message">Send message</span></button><button id="pf-chat-stop" type="button" class="danger" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg><span class="action-label" data-i18n="btn_stop_reply">Stop reply</span></button><span id="pf-chat-progress" class="muted" role="status"></span></div></form><p class="chat-footnote" data-i18n="ui_chat_footnote">Your AI, your choice. Check important answers.</p>
          </div>
        </div>
      </section>
      <section id="pf-pane-memory" class="platform-pane" role="tabpanel" aria-labelledby="pf-tab-memory" hidden>
        <div class="platform-split">
          <aside class="platform-panel"><div class="platform-toolbar"><h3 data-i18n="h_memory_library">Memory library</h3><button type="button" id="pf-new-memory"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_new_memory">New memory</span></button></div><label><span data-i18n="lbl_search_memories">Search memories</span><input id="pf-memory-search" type="search" placeholder="Title or content" data-i18n-ph="ph_title_content"></label><label><span data-i18n="lbl_review_status">Review status</span><select id="pf-memory-status-filter"><option value="" data-i18n="ui_all_statuses">All statuses</option><option value="candidate" data-i18n="ui_review_inbox">Review inbox</option><option value="approved" data-i18n="status_approved">Approved</option><option value="rejected" data-i18n="status_rejected">Rejected</option></select></label><label><span data-i18n="lbl_scope_filter">Scope filter</span><select id="pf-memory-scope-filter"><option value="" data-i18n="ui_all_scopes">All scopes</option><option value="user" data-i18n="scope_user">user</option><option value="workspace" data-i18n="scope_workspace">workspace</option><option value="agent" data-i18n="scope_agent">agent</option><option value="provider" data-i18n="scope_provider">provider</option><option value="profile" data-i18n="scope_profile">profile</option></select></label><div id="pf-memories" class="platform-list"></div></aside>
          <form id="pf-memory-form" class="platform-panel"><h3 id="pf-memory-heading" data-i18n="h_create_memory">Create a memory</h3><div id="pf-memory-review" class="platform-review-banner" hidden data-i18n="ui_review_memory">Review this candidate before allowing it into conversation context.</div><label><span data-i18n="lbl_title">Title</span><input id="pf-memory-title" maxlength="200" required></label><div class="platform-fields"><label><span data-i18n="lbl_scope">Scope</span><select id="pf-memory-scope"><option value="user" data-i18n="scope_user">user</option><option value="workspace" data-i18n="scope_workspace">workspace</option><option value="agent" data-i18n="scope_agent">agent</option><option value="provider" data-i18n="scope_provider">provider</option><option value="profile" data-i18n="scope_profile">profile</option></select></label><label><span data-i18n="lbl_scope_identifier">Scope identifier</span><input id="pf-memory-scope-id" placeholder="Required for non-user scopes" data-i18n-ph="ph_scope_identifier" list="pf-scope-options"></label></div><datalist id="pf-scope-options"></datalist><label><span data-i18n="lbl_memory_content">Memory content</span><textarea id="pf-memory-content" maxlength="12000" style="min-height:180px" required></textarea></label><p id="pf-memory-meta" class="muted"></p><div class="platform-toolbar"><button type="submit" class="primary" id="pf-memory-save"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_memory">Save memory</span></button><button type="button" id="pf-memory-approve"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 0 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span class="action-label" data-i18n="btn_approve_item">Approve</span></button><button type="button" id="pf-memory-reject" class="danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg><span class="action-label" data-i18n="btn_reject_item">Reject</span></button><button type="button" id="pf-memory-delete" class="danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="10" y2="17"/><line x1="14" x2="14" y1="10" y2="17"/></svg><span class="action-label" data-i18n="btn_delete">Delete</span></button></div><p class="muted" data-i18n="ui_memory_description">New entries enter the review inbox. Approval makes a memory available for explicit attachment to a conversation.</p></form>
        </div>
      </section>
      <section id="pf-pane-library" class="platform-pane" role="tabpanel" aria-labelledby="pf-tab-library" hidden>
        <details class="platform-panel" style="margin-bottom:16px" id="pf-presets-panel"><summary data-i18n="h_coding_presets">Coding pipeline presets</summary><p class="muted" data-i18n="ui_coding_presets_description">Install an evidence-focused workflow with approval checkpoints. Choose a default model, then override individual roles if needed.</p><label><span data-i18n="lbl_preset_default_model">Default model for preset roles</span><select id="pf-preset-model"></select></label><details class="platform-context"><summary data-i18n="ui_role_overrides">Role model overrides</summary><div class="platform-fields"><label><span data-i18n="role_planner">Planner</span><select id="pf-preset-planner"></select></label><label><span data-i18n="role_implementer">Implementer</span><select id="pf-preset-implementer"></select></label><label><span data-i18n="role_reviewer">Reviewer</span><select id="pf-preset-reviewer"></select></label><label><span data-i18n="role_security_reviewer">Security reviewer</span><select id="pf-preset-security"></select></label></div></details><p id="pf-preset-role-note" class="muted"></p><div id="pf-presets-list" class="platform-artifacts"></div><p id="pf-preset-status" class="platform-status" role="status"></p><button type="button" id="pf-preset-open" hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg><span class="action-label" data-i18n="btn_open_installed_pipeline">Open installed pipeline</span></button></details>
        <div class="platform-library-tabs" aria-label="Catalog type" data-i18n-aria="ui_catalog_type"><button type="button" class="primary" data-pf-library="agents"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4H8M2 14h2m16 0h2M9 13v2m6-2v2"/></svg><span class="action-label" data-i18n="tab_agents">Agents</span></button><button type="button" data-pf-library="skills"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h6a2 2 0 0 1 2 2v16a3 3 0 0 0-3-3H4zM20 3h-6a2 2 0 0 0-2 2v16a3 3 0 0 1 3-3h5z"/></svg><span class="action-label" data-i18n="tab_skills">Skills</span></button><button type="button" data-pf-library="prompts"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="action-label" data-i18n="tab_prompts">Prompts</span></button></div>
        <div class="platform-split"><aside class="platform-panel"><div class="platform-toolbar"><h3 id="pf-library-heading" data-i18n="h_agent_catalog">Agent catalog</h3><button type="button" id="pf-new-entry"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_new_entry">New entry</span></button></div><label><span data-i18n="lbl_find_entry">Find an entry</span><input id="pf-library-search" type="search" placeholder="Name, description, or tag" data-i18n-ph="ph_search_catalog"></label><div id="pf-library-list" class="platform-list"></div></aside>
          <form id="pf-library-form" class="platform-panel"><h3 id="pf-entry-heading" data-i18n="h_create_agent">Create an agent</h3><div class="platform-fields"><label><span data-i18n="lbl_name">Name</span><input id="pf-entry-name" maxlength="200" required></label><label><span data-i18n="lbl_version_revision">Version / revision</span><input id="pf-entry-version" readonly value="New" data-i18n-value="btn_new"></label></div><label><span data-i18n="lbl_description">Description</span><input id="pf-entry-description" maxlength="1000"></label><label><span id="pf-entry-body-label" data-i18n="lbl_agent_instructions">Agent instructions</span><textarea id="pf-entry-body" maxlength="20000" style="min-height:200px" required></textarea></label>
            <div id="pf-agent-fields" class="platform-fields"><label><span data-i18n="lbl_preferred_model">Preferred model</span><select id="pf-entry-model"></select></label><label><span data-i18n="lbl_run_mode">Run mode</span><select id="pf-entry-mode"><option value="chat" data-i18n="mode_chat">Chat</option><option value="plan" data-i18n="mode_plan">Plan</option><option value="agent" data-i18n="mode_agent">Agent</option></select></label><label class="full"><span data-i18n="lbl_pinned_skills">Pinned skill versions</span><select id="pf-entry-skills" multiple size="4"></select></label></div>
            <div id="pf-skill-fields" hidden><label><span data-i18n="lbl_tags">Tags (comma separated)</span><input id="pf-entry-tags" placeholder="review, documentation" data-i18n-ph="ph_tags"></label><label><span data-i18n="lbl_required_tools">Required tools (comma separated)</span><input id="pf-entry-tools" placeholder="Use names from the tool catalog" data-i18n-ph="ph_required_tools"></label><label><span data-i18n="lbl_supported_modes">Supported modes</span><select id="pf-entry-modes" multiple size="3"><option value="chat" selected data-i18n="mode_chat">Chat</option><option value="plan" data-i18n="mode_plan">Plan</option><option value="agent" data-i18n="mode_agent">Agent</option></select></label></div>
            <p id="pf-entry-meta" class="muted"></p><div class="platform-toolbar"><button type="submit" class="primary" id="pf-entry-save"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_agent">Save agent</span></button><button type="button" id="pf-entry-use"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg><span class="action-label" data-i18n="btn_attach_webchat">Attach to Webchat</span></button></div><p class="muted" data-i18n="ui_catalog_versioning">Skill and prompt updates create a new version. Existing attachments stay pinned to their selected version.</p>
          </form></div>
      </section>
      <section id="pf-pane-runs" class="platform-pane" role="tabpanel" aria-labelledby="pf-tab-runs" hidden>
        <div class="platform-split"><aside class="platform-panel"><h3 data-i18n="h_job_queue">Job queue &amp; history</h3><div id="pf-runs" class="platform-list"></div></aside><div>
          <form id="pf-run-form" class="platform-panel"><h3 data-i18n="h_start_bounded_run">Start Bounded Agent Run</h3><label><span data-i18n="lbl_task">Task</span><textarea id="pf-run-prompt" maxlength="50000" required placeholder="Describe a concrete outcome and its acceptance criteria." data-i18n-ph="ph_run_task"></textarea></label><div class="platform-fields"><label><span data-i18n="lbl_model">Model</span><select id="pf-run-model"></select></label><label><span data-i18n="lbl_agent_persona">Agent persona</span><select id="pf-run-agent"><option value="" data-i18n="ui_no_agent_persona">No agent persona</option></select></label><label><span data-i18n="lbl_mode">Mode</span><select id="pf-run-mode"><option value="chat" data-i18n="mode_chat">Chat</option><option value="plan" data-i18n="mode_plan">Plan</option><option value="agent" data-i18n="mode_agent">Agent</option></select></label><label><span data-i18n="lbl_workspace">Workspace</span><select id="pf-run-workspace"><option value="" data-i18n="ui_default_workspace">Default Workspace</option></select></label><label><span data-i18n="lbl_iteration_output">Maximum output tokens per iteration</span><input id="pf-run-output" type="number" min="1" max="8192" value="1024" required></label><label><span data-i18n="lbl_approval_before_execution">Approval before execution</span><select id="pf-run-approval"><option value="false" data-i18n="ui_use_repo_policy">Use repository policy</option><option value="true" data-i18n="ui_require_approval">Require approval</option></select></label><label><span data-i18n="lbl_max_iterations">Maximum iterations</span><input id="pf-run-iterations" type="number" min="1" max="10" value="2" required></label><label><span data-i18n="lbl_max_duration">Maximum duration (seconds)</span><input id="pf-run-duration" type="number" min="1" max="1800" value="120" required></label><label><span data-i18n="lbl_max_cost">Maximum cost (USD)</span><input id="pf-run-cost" type="number" min="0" step="0.01" value="0.5" required></label><label><span data-i18n="lbl_max_total_tokens">Maximum total tokens</span><input id="pf-run-tokens" type="number" min="1" max="500000" value="8000" required></label><label class="full"><span data-i18n="lbl_success_text">Success text (optional, literal match)</span><input id="pf-run-success" placeholder="Text that a successful final response should contain" data-i18n-ph="ph_success_text" maxlength="200"></label></div><button type="submit" class="primary" id="pf-run-start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span class="action-label" data-i18n="btn_queue_run">Queue run</span></button><p class="muted" data-i18n="ui_run_limits_description">The run stops at its configured limits. Agent mode can change files in the selected workspace according to its execution policy.</p></form>
          <section class="platform-panel" style="margin-top:16px"><div class="platform-toolbar"><h3 data-i18n="h_run_details">Run details</h3><button id="pf-run-cancel" type="button" class="danger" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg><span class="action-label" data-i18n="btn_cancel_run">Cancel run</span></button><button id="pf-run-retry" type="button" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span class="action-label" data-i18n="btn_retry_run">Retry run</span></button></div><div id="pf-run-approval-review" class="platform-review-banner" hidden><strong data-i18n="ui_run_approval_required">Approval required before this run begins.</strong><label><span data-i18n="lbl_operator_feedback">Operator feedback (optional)</span><input id="pf-run-feedback" maxlength="2000"></label><div class="platform-toolbar"><button id="pf-run-approve" type="button" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 0 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span class="action-label" data-i18n="btn_approve_run">Approve run</span></button><button id="pf-run-reject" type="button" class="danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg><span class="action-label" data-i18n="btn_reject_run">Reject run</span></button></div></div><div id="pf-run-detail" class="platform-empty" data-i18n="ui_select_run">Select a run to inspect its progress.</div><h3 data-i18n="h_artifacts">Artifacts</h3><div id="pf-run-artifacts" class="platform-artifacts"></div><h3 data-i18n="h_model_evaluations">Model evaluations</h3><form id="pf-evaluation-form"><label><span data-i18n="lbl_compare_models">Models to compare (up to 8)</span><select id="pf-evaluation-models" multiple size="4"></select></label><button type="submit" class="primary" id="pf-evaluation-start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span class="action-label" data-i18n="btn_instruction_check">Run short instruction check</span></button><p class="muted" data-i18n="ui_instruction_check_description">One bounded request per model checks exact instruction following. This is a small reproducible check, not a general model benchmark.</p></form><div id="pf-evaluations" class="platform-output" data-i18n="ui_no_evaluation_loaded">No evaluation data loaded.</div></section>
        </div></div>
      </section>
      <section id="pf-pane-system" class="platform-pane" role="tabpanel" aria-labelledby="pf-tab-system" hidden><p id="pf-operator" class="platform-context-summary"></p>
        <div class="platform-fields"><section class="platform-panel"><h3 data-i18n="h_storage">Storage</h3><p class="muted" data-i18n="ui_storage_description">Inspect the active backend and its available capabilities. Backend migration is performed through the configured storage settings.</p><div id="pf-storage" data-i18n="ui_loading_storage">Loading storage details...</div><div class="platform-toolbar"><button type="button" id="pf-storage-backup"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg><span class="action-label" data-i18n="btn_download_backup">Download encrypted backup</span></button></div><form id="pf-storage-config-form"><label><span data-i18n="lbl_restart_backend">Backend to use after restart</span><select id="pf-storage-backend"><option value="file" data-i18n="storage_encrypted_file">Encrypted file</option><option value="sqlite">SQLite</option><option value="memory" data-i18n="storage_memory_only">Memory only</option><option value="prisma" disabled data-i18n="storage_prisma_config">Prisma (embedding configuration required)</option></select></label><p class="muted" data-i18n="ui_storage_migration_description">Export an encrypted backup before changing databases. Saving this preference does not copy your data or switch the running backend. Restart, then restore your backup into the selected backend.</p><button type="submit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_backend">Save backend preference</span></button><p id="pf-storage-config-status" class="platform-status"></p></form><form id="pf-storage-restore-form" style="margin-top:16px"><label><span data-i18n="lbl_restore_backup">Restore an encrypted backup</span><input type="file" id="pf-storage-restore-file" accept="application/json,.json"></label><button type="submit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg><span class="action-label" data-i18n="btn_restore_backup">Restore backup</span></button></form></section><section class="platform-panel"><h3 data-i18n="h_provider_diagnostics">CLI &amp; provider diagnostics</h3><p class="muted" data-i18n="ui_diagnostics_description">Local CLI availability and current provider configuration.</p><button type="button" id="pf-diagnostics-refresh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg><span class="action-label" data-i18n="btn_refresh_diagnostics">Refresh diagnostics</span></button><div id="pf-diagnostics" data-i18n="ui_loading_diagnostics">Loading diagnostics...</div></section></div>
        <section class="platform-panel" style="margin-top:16px"><div class="platform-toolbar"><h3 data-i18n="h_provider_profiles">Provider profiles</h3><button type="button" id="pf-profile-new"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_new_profile">New profile</span></button></div><div id="pf-profiles" class="platform-list"></div><form id="pf-profile-form" style="margin-top:16px"><div class="platform-fields"><label><span data-i18n="lbl_profile_name">Profile name</span><input id="pf-profile-name" required maxlength="100"></label><label><span data-i18n="lbl_provider">Provider</span><select id="pf-profile-provider"><option value="cli-codex">Codex CLI</option><option value="cli-claude">Claude CLI</option><option value="cli-gemini">Gemini CLI</option><option value="cli-grok">Grok CLI</option><option value="codex-api">OpenAI API</option><option value="claude-api">Anthropic API</option><option value="gemini-api">Gemini API</option><option value="openrouter-api">OpenRouter API</option><option value="perplexity-api">Perplexity API</option><option value="lmstudio">LM Studio</option><option value="bitnet">BitNet</option></select></label><label><span data-i18n="lbl_cli_executable">CLI executable (optional)</span><input id="pf-profile-executable" placeholder="Existing absolute file path" data-i18n-ph="ph_executable_path"></label><label><span data-i18n="lbl_default_model">Default model</span><input id="pf-profile-model" placeholder="Optional model ID" data-i18n-ph="ph_model_id"></label><label><span data-i18n="lbl_api_key_write_only">API key (write only)</span><input id="pf-profile-key" type="password" autocomplete="new-password" placeholder="Leave blank to preserve existing credentials" data-i18n-ph="ph_preserve_credentials"></label><label><span data-i18n="lbl_existing_api_key">Existing stored API key</span><select id="pf-profile-clear"><option value="false" data-i18n="ui_preserve_key">Preserve current key</option><option value="true" data-i18n="ui_remove_key">Remove current key</option></select></label><label><span data-i18n="lbl_default_effort">Default effort</span><input id="pf-profile-effort" placeholder="Provider-supported effort" data-i18n-ph="ph_provider_effort"></label><label><span data-i18n="lbl_max_concurrency">Maximum concurrent requests</span><input id="pf-profile-concurrency" type="number" min="1" max="16" value="1"></label><label><span data-i18n="lbl_profile_enabled">Profile enabled</span><select id="pf-profile-enabled"><option value="true" data-i18n="status_enabled">Enabled</option><option value="false" data-i18n="status_disabled">Disabled</option></select></label></div><p id="pf-profile-credential-status" class="muted"></p><div class="platform-toolbar"><button type="submit" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_profile">Save profile</span></button><button type="button" class="danger" id="pf-profile-delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="10" y2="17"/><line x1="14" x2="14" y1="10" y2="17"/></svg><span class="action-label" data-i18n="btn_delete_profile">Delete profile</span></button></div><p class="muted" data-i18n="ui_profile_credentials_description">API keys are write only. Leaving the key empty preserves its current value. Profiles remain subject to provider execution policies.</p></form></section>
      </section>
    </div>
`);

export const PLATFORM_SCRIPT = String.raw`
  const pfState = { tab: 'chat', operator: null, models: null, workspaces: null, sessions: [], session: null, sessionEpoch: 0, memories: [], memory: null, agents: [], skills: [], prompts: [], profiles: [], profile: null, presets: [], presetModel: null, installedPreset: null, runs: [], run: null, runRequestId: null, library: 'agents', entry: null, drafts: new Map(), attachments: new Map(), busy: false, activeSessionId: null, controller: null, editingMessage: null, refreshPromise: null, refreshAgain: false };
  const pfPath = suffix => '/v1/platform' + suffix;
  const pfValues = id => Array.from($(id).selectedOptions || []).map(option => option.value);
  const pfRefs = id => pfValues(id).map(value => { const split = value.lastIndexOf('@'); return { id: value.slice(0, split), version: Number(value.slice(split + 1)) }; });
  const pfDate = value => value ? new Date(value).toLocaleString(currentLang) : '';
  function pfStatus(message, error) { setLocalizedText($('pf-status'), typeof message === 'function' ? message : () => message || ''); $('pf-status').className = 'platform-status' + (error ? ' error' : ''); }
  function pfApplyRole() {
    const operator = pfState.operator; if (!operator) return;
    const admin = operator.role === 'admin', operate = admin || operator.role === 'operator', review = admin || operator.role === 'reviewer';
    setLocalizedText($('pf-operator'), () => (operator.displayName || operator.operatorId) + ' · ' + localizedValue(operator.role) + ' · ' + ((operator.workspaceIds || []).includes('*') ? t('ui_all_authorized_workspaces') : (operator.workspaceIds || []).length + (' ' + t('ui_authorized_workspaces'))));
    $('pf-tab-system').hidden = !admin;
    for (const option of $('pf-view-select').options || []) if (option.value === 'system') option.disabled = !admin;
    for (const id of ['pf-new-chat','pf-save-chat','pf-delete-chat','pf-inspect-context','pf-summary-save','pf-run-start','pf-new-memory','pf-memory-save','pf-evaluation-start']) $(id).disabled = !operate || pfState.busy;
    $('pf-chat-send').disabled = !operate || pfState.busy;
    for (const id of ['pf-new-entry','pf-entry-save']) $(id).disabled = !admin;
    for (const id of ['pf-memory-approve','pf-memory-reject']) $(id).disabled = !review || !pfState.memory;
    for (const id of ['pf-run-approve','pf-run-reject']) $(id).disabled = !review;
    $('pf-memory-delete').disabled = !operate || !pfState.memory;
    $('pf-chat-profile').disabled = !admin;
    setLocalizedText($('pf-preset-role-note'), () => admin ? t('ui_install_preset_description') : t('ui_admin_install_presets'));
    $('pf-presets-list').querySelectorAll?.('[data-pf-install-preset]').forEach(button => { button.disabled = !admin; });
    $('pf-delete-chat').disabled = !operate || !pfState.session || pfState.busy;
    $('pf-export-chat').disabled = !pfState.session;
    if (!operate) { $('pf-run-cancel').disabled = true; $('pf-run-retry').disabled = true; }
    if (operator.source === 'operator-token') document.querySelectorAll('#sidebar [data-section]').forEach(button => { button.hidden = !['platform','help'].includes(button.dataset.section); });
    if (typeof updateNavGroups === 'function') updateNavGroups();
  }
  async function pfApi(path, body, method) { return request(pfPath(path), body === undefined ? undefined : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  function pfEntity(result, name) { return result?.[name] || result?.data || result; }
  function pfList(result) { return Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []; }
  function pfOptions(id, items, firstLabel, valueFn, labelFn, groupFn) {
    const select = $(id), previous = new Set(pfValues(id));
    const value = valueFn || (item => item.id), label = labelFn || (item => item.name || item.title || item.id);
    setLocalizedHtml(select, () => {
      const option = item => '<option value="' + esc(value(item)) + '">' + esc(label(item)) + '</option>';
      let html = items.map(option).join('');
      if (groupFn) {
        const groups = new Map();
        for (const item of items) { const group = groupFn(item); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(item); }
        html = Array.from(groups, ([group,values]) => '<optgroup label="' + esc(group) + '">' + values.map(option).join('') + '</optgroup>').join('');
      }
      return (firstLabel !== undefined ? '<option value="">' + esc(typeof firstLabel === 'function' ? firstLabel() : firstLabel) + '</option>' : '') + html;
    });
    for (const option of select.options || []) if (previous.has(option.value)) option.selected = true;
  }
  function pfChoose(id, values) { const chosen = new Set(values || []); for (const option of $(id).options || []) option.selected = chosen.has(option.value); }
  function pfModelLabel(item) {
    const parts = item.id.split('/'), source = parts.shift();
    const providers = { 'api-openrouter': 'OpenRouter', 'api-perplexity': 'Perplexity', 'cli-codex': 'Codex', 'cli-claude': 'Claude Code', 'cli-gemini': 'Gemini', 'cli-grok': 'Grok', lmstudio: 'LM Studio', bitnet: 'BitNet' };
    const name = parts.at(-1) || source;
    const account = source.startsWith('cli-') && parts.length > 1 ? ' · ' + parts.slice(0,-1).join('/') : '';
    return name.replace(/^gpt-/, 'GPT-').replace(/^claude-/, 'Claude ').replace(/^gemini-/, 'Gemini ').replace(/-(astra|sol|terra|luna)\b/g, (_, value) => ' ' + value[0].toUpperCase() + value.slice(1)) + ' · ' + (providers[source] || source) + account;
  }
  function modelPriority(id) { return id.startsWith('cli-') ? 0 : /^(lmstudio|bitnet)(\/|$)/.test(id) ? 1 : 2; }
  function preferredModels(items) { return [...items].sort((a,b) => modelPriority(a.id) - modelPriority(b.id) || a.id.localeCompare(b.id)); }
  function modelChoiceGroup(item) { return t(['ui_cli_models_preferred','ui_local_models_group','ui_api_models_group'][modelPriority(item.id)]); }
  function platformSyncModels() {
    const available = preferredModels(pfState.models || models), workspaces = pfState.workspaces || cachedWorkspaces;
    for (const id of ['pf-chat-model', 'pf-entry-model', 'pf-run-model', 'pf-preset-model']) pfOptions(id, available, available.length ? undefined : () => t('ui_no_models_available'), item => item.id, pfModelLabel, modelChoiceGroup);
    for (const role of ['planner','implementer','reviewer','security']) pfOptions('pf-preset-' + role, available, () => t('ui_use_default_model'), item => item.id, item => item.id);
    pfOptions('pf-evaluation-models', available, undefined, item => item.id, item => item.id);
    pfOptions('pf-chat-workspace', workspaces, () => t('ui_no_workspace_scope'));
    pfOptions('pf-run-workspace', workspaces, () => t('ui_default_workspace'));
    setLocalizedHtml($('pf-scope-options'), () => workspaces.map(workspace => '<option value="' + esc(workspace.id) + '">' + esc(workspace.name || workspace.id) + '</option>').join(''));
    pfContextSummary();
  }
  function pfContextSummary() {
    const agent = pfState.agents.find(item => item.id === $('pf-chat-agent').value);
    setLocalizedText($('pf-context-summary'), () => ($('pf-chat-model').value || t('ui_choose_model')) + (agent ? (' ' + t('ui_agent_prefix') + ' ') + agent.name + ' (' + (agent.skillRefs || []).length + (' ' + t('ui_pinned_skills_count')) : '') + ' · ' + pfValues('pf-chat-skills').length + (' ' + t('ui_attached_skills_count') + ' ') + pfValues('pf-chat-memories').length + (' ' + t('ui_approved_memories_count') + ' ') + localizedValue($('pf-chat-retention').value) + (' ' + t('ui_retention_suffix')));
  }
  function pfTab(name) {
    pfState.tab = name;
    $('pf-view-select').value = name;
    for (const tab of ['chat', 'memory', 'library', 'runs', 'system']) { $('pf-pane-' + tab).hidden = tab !== name; $('pf-tab-' + tab).setAttribute('aria-selected', String(tab === name)); }
    platformRefresh().catch(error => pfStatus(() => error.message, true));
  }
  async function platformRefresh() {
    if (pfState.refreshPromise) { pfState.refreshAgain = true; return pfState.refreshPromise; }
    pfState.refreshPromise = (async () => {
      const jobs = [];
      const tab = pfState.tab, library = pfState.library;
      if (!pfState.operator) {
        const me = await pfApi('/me'); pfState.operator = me.operator;
      }
      if (!pfState.models) jobs.push(pfApi('/models').then(result => { pfState.models = pfList(result); }));
      if (!pfState.workspaces) jobs.push(pfApi('/workspaces').then(result => { pfState.workspaces = pfList(result); }));
      if (pfState.tab === 'chat') {
        jobs.push(pfApi('/sessions').then(result => { pfState.sessions = pfList(result); pfRenderSessions(); }));
        jobs.push(pfLoadAttachments());
        if (pfState.session && !pfState.busy) {
          const sessionId = pfState.session.id;
          jobs.push(pfApi('/sessions/' + encodeURIComponent(sessionId)).then(result => { if (pfState.session?.id === sessionId) { pfState.session = pfEntity(result, 'session'); pfRenderTranscript(); } }));
        }
      } else if (pfState.tab === 'memory') {
        jobs.push(pfApi('/memories').then(result => { pfState.memories = pfList(result); pfRenderMemories(); }));
      } else if (pfState.tab === 'library') {
        jobs.push(pfApi('/' + library).then(result => { pfState[library] = pfList(result); if (pfState.library === library) pfRenderLibrary(); }));
        jobs.push(pfApi('/skills').then(result => { pfState.skills = pfList(result); pfRenderSkillOptions(); }));
      } else if (pfState.tab === 'runs') {
        jobs.push(pfApi('/runs').then(result => { pfState.runs = pfList(result); pfRenderRuns(); }));
        if (pfState.run) jobs.push(pfLoadRun(pfState.run.id));
        jobs.push(pfApi('/agents').then(result => { pfState.agents = pfList(result); pfOptions('pf-run-agent', pfState.agents, () => t('ui_no_agent_persona')); }));
        if (['admin','operator'].includes(pfState.operator?.role)) jobs.push(pfApi('/evaluations').then(pfRenderEvaluations));
      } else if (pfState.tab === 'system') {
        if (pfState.operator?.role !== 'admin') { pfStatus(() => t('error_admin_storage')); return; }
        jobs.push(pfApi('/storage').then(pfRenderStorage));
        jobs.push(pfApi('/diagnostics').then(pfRenderDiagnostics));
        jobs.push(pfApi('/profiles').then(result => { pfState.profiles = pfList(result); pfRenderProfiles(); }));
      }
      const results = await Promise.allSettled(jobs);
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) pfStatus(failures.map(result => result.reason.message).join(' · '), true);
      platformSyncModels();
      pfApplyRole();
      if (pfState.tab === 'library' && $('pf-preset-model').value && pfState.presetModel !== $('pf-preset-model').value) await pfLoadPresets();
    })().finally(() => { pfState.refreshPromise = null; if (pfState.refreshAgain) { pfState.refreshAgain = false; platformRefresh().catch(error => pfStatus(() => error.message, true)); } });
    return pfState.refreshPromise;
  }
  async function pfLoadAttachments() {
    const results = await Promise.allSettled([pfApi('/agents'), pfApi('/skills'), pfApi('/memories'), pfState.operator?.role === 'admin' ? pfApi('/profiles') : Promise.resolve({ data: [] })]);
    for (const [index, name] of ['agents','skills','memories','profiles'].entries()) if (results[index].status === 'fulfilled') pfState[name] = pfList(results[index].value);
    pfOptions('pf-chat-agent', pfState.agents, () => t('ui_no_agent_persona'));
    pfOptions('pf-chat-profile', pfState.profiles, () => t('ui_default_credentials'));
    pfRefreshMemoryOptions();
    pfRenderSkillOptions();
  }
  function pfRefreshMemoryOptions() {
    const model = $('pf-chat-model').value;
    const provider = typeof providerForModel === 'function' ? providerForModel(model) : model.split('/')[0];
    const scopes = { user: pfState.session?.userId || pfState.operator?.operatorId, workspace: pfState.session?.workspaceId || $('pf-chat-workspace').value, agent: $('pf-chat-agent').value, provider, profile: $('pf-chat-profile').value };
    pfOptions('pf-chat-memories', pfState.memories.filter(memory => memory.status === 'approved' && scopes[memory.scope] === memory.scopeId), undefined, item => item.id, item => item.title + ' [' + localizedValue(item.scope) + ']');
  }
  function pfRenderSkillOptions() {
    for (const id of ['pf-chat-skills','pf-entry-skills']) {
      const pinned = Array.from($(id).selectedOptions || []).map(option => ({ value: option.value, label: option.textContent }));
      pfOptions(id, pfState.skills, undefined, item => item.id + '@' + item.version, item => item.name + ' · v' + item.version);
      for (const previous of pinned) if (!Array.from($(id).options || []).some(option => option.value === previous.value)) {
        const option = document.createElement('option'); option.value = previous.value; setLocalizedText(option, () => previous.label); option.selected = true; $(id).appendChild(option);
      }
    }
  }
  async function pfHydrateSkillOptions(id, values, current = () => true) {
    for (const value of values) {
      if (!current()) return;
      if (Array.from($(id).options || []).some(option => option.value === value)) continue;
      const split = value.lastIndexOf('@'), skillId = value.slice(0, split), version = Number(value.slice(split + 1));
      const result = await pfApi('/skills/' + encodeURIComponent(skillId) + '?version=' + version);
      if (!current()) return;
      const skill = pfEntity(result, 'skill');
      if (skill.id !== skillId || skill.version !== version) throw localizedError(() => t('error_historical_skill'));
      const option = document.createElement('option'); option.value = value; setLocalizedText(option, () => skill.name + ' · v' + version); $(id).appendChild(option);
    }
    if (current()) pfChoose(id, values);
  }
  function pfRenderSessions() {
    const query = $('pf-session-search').value.toLowerCase();
    const sessions = pfState.sessions.filter(session => String(session.title || '').toLowerCase().includes(query));
    setLocalizedHtml($('pf-sessions'), () => sessions.map(session => '<button type="button" data-pf-session="' + esc(session.id) + '" class="' + (session.id === pfState.session?.id ? 'active' : '') + '"><strong>' + esc(session.title || t('ui_untitled_conversation')) + '</strong><small>' + esc(localizedValue(session.retention || 'ephemeral')) + ' · ' + esc(pfDate(session.updatedAt)) + '</small></button>').join('') || ('<p class="platform-empty">' + esc(t('ui_no_conversations')) + '</p>'));
  }
  async function pfOpenSession(id) {
    const epoch = ++pfState.sessionEpoch;
    if (pfState.session) {
      pfState.drafts.set(pfState.session.id, $('pf-chat-input').value);
      pfState.attachments.set(pfState.session.id, { skills: pfValues('pf-chat-skills'), memories: pfValues('pf-chat-memories'), profileId: $('pf-chat-profile').value, agentId: $('pf-chat-agent').value });
    }
    const result = await pfApi('/sessions/' + encodeURIComponent(id));
    if (epoch !== pfState.sessionEpoch) return;
    pfState.session = pfEntity(result, 'session');
    $('pf-chat-title').value = pfState.session.title || '';
    $('pf-chat-retention').value = pfState.session.retention || 'ephemeral';
    $('pf-chat-workspace').value = pfState.session.workspaceId || '';
    $('pf-chat-workspace').disabled = true;
    $('pf-chat-agent').value = pfState.session.agentId || '';
    const attachments = pfState.attachments.get(id);
    await pfHydrateSkillOptions('pf-chat-skills', attachments?.skills || [], () => epoch === pfState.sessionEpoch);
    if (epoch !== pfState.sessionEpoch) return;
    $('pf-chat-profile').value = attachments?.profileId || pfState.session.profileId || '';
    $('pf-chat-agent').value = attachments?.agentId || pfState.session.agentId || '';
    const last = (pfState.session.messages || []).findLast(message => message.role === 'assistant');
    if (pfState.session.model || last?.model) $('pf-chat-model').value = pfState.session.model || last.model;
    pfRefreshMemoryOptions(); pfChoose('pf-chat-memories', attachments?.memories || []);
    $('pf-chat-input').value = pfState.drafts.get(id) || '';
    $('pf-summary-content').value = pfState.session.summary?.content || '';
    $('pf-edit-branch').hidden = true;
    pfRenderSessions(); pfRenderTranscript(); pfContextSummary();
    pfApplyRole();
  }
  function pfPrepareNewChat() {
    if (pfState.busy) return;
    if (pfState.session) {
      pfState.drafts.set(pfState.session.id, $('pf-chat-input').value);
      pfState.attachments.set(pfState.session.id, { skills: pfValues('pf-chat-skills'), memories: pfValues('pf-chat-memories'), profileId: $('pf-chat-profile').value, agentId: $('pf-chat-agent').value });
    }
    pfState.sessionEpoch++;
    pfState.session = null;
    $('pf-chat-title').value = ''; $('pf-chat-input').value = ''; $('pf-chat-retention').value = 'ephemeral';
    $('pf-chat-model').value = preferredModels(pfState.models || models)[0]?.id || '';
    $('pf-summary-content').value = ''; setLocalizedText($('pf-context-inspection'), () => '');
    $('pf-chat-workspace').disabled = false; $('pf-chat-workspace').value = '';
    pfChoose('pf-chat-memories', []); pfChoose('pf-chat-skills', []); $('pf-chat-agent').value = '';
    pfRenderSessions(); pfRenderTranscript(); pfContextSummary(); pfApplyRole(); $('pf-chat-input').focus();
  }
  async function pfNewSession() {
    const selectedAttachments = { skills: pfValues('pf-chat-skills'), memories: pfValues('pf-chat-memories'), profileId: $('pf-chat-profile').value, agentId: $('pf-chat-agent').value };
    const workspaceId = $('pf-chat-workspace').value || undefined;
    const result = await pfApi('/sessions', { title: $('pf-chat-title').value.trim() || t('ph_new_conversation'), model: $('pf-chat-model').value, retention: $('pf-chat-retention').value || 'ephemeral', agentId: $('pf-chat-agent').value || undefined, profileId: $('pf-chat-profile').value || undefined, workspaceId });
    const session = pfEntity(result, 'session');
    pfState.attachments.set(session.id, selectedAttachments);
    await pfOpenSession(session.id);
    await platformRefresh();
    return session;
  }
  async function pfSaveSessionDetails() {
    if (!pfState.session) return pfNewSession();
    pfState.session = pfEntity(await pfApi('/sessions/' + encodeURIComponent(pfState.session.id), { title: $('pf-chat-title').value.trim() || t('ph_new_conversation'), model: $('pf-chat-model').value, retention: $('pf-chat-retention').value, expectedRevision: pfState.session.revision }, 'PATCH'), 'session');
    return pfState.session;
  }
  function pfRenderTranscript() {
    const messages = pfState.session?.messages || [];
    pfOptions('pf-summary-through', messages.filter(message => message.role === 'assistant'), () => t('ui_select_completed_reply'), message => message.id, message => pfDate(message.createdAt) + ' · ' + String(message.content).slice(0, 60));
    setLocalizedHtml($('pf-transcript'), () => messages.map(message => '<article class="platform-message ' + (message.role === 'user' ? 'user' : 'assistant') + '"><header><strong>' + (message.role === 'user' ? t('ui_you') : t('ui_assistant')) + '</strong><small>' + esc(message.model || message.provider || '') + ' · ' + esc(pfDate(message.createdAt)) + '</small></header><div class="platform-message-content">' + esc(message.content) + '</div><div class="platform-message-actions"><button type="button" data-pf-copy-message="' + esc(message.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' + '<span class="action-label">' + esc(t('btn_copy')) + '</span>' + '</button>') + (message.role === 'user' ? '<button type="button" data-pf-edit-message="' + esc(message.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>' + '<span class="action-label">' + esc(t('btn_edit_branch')) + '</span>' + '</button><button type="button" data-pf-retry-message="') + esc(message.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>' + '<span class="action-label">' + esc(t('btn_retry_branch')) + '</span>' + '</button>') : '<button type="button" data-pf-memory-message="' + esc(message.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>' + '<span class="action-label">' + esc(t('btn_propose_memory')) + '</span>' + '</button>')) + '</div></article>').join('') || ('<div class="platform-empty"><div class="chat-welcome-icon" aria-hidden="true">${BRAND_ICON}</div><h3>' + esc(t('h_portable_conversation')) + '</h3><p>' + esc(t('ui_start_conversation')) + '</p></div><div class="chat-suggestions">' + ['write','understand','plan'].map(topic => '<button type="button" data-chat-suggestion="' + topic + '">' + esc(t('ui_suggest_' + topic)) + '</button>').join('') + '</div>'));
  }
  function pfChatBody(content) { return { content, model: $('pf-chat-model').value, profileId: $('pf-chat-profile').value || undefined, agentId: $('pf-chat-agent').value || undefined, skillRefs: pfRefs('pf-chat-skills'), memoryIds: pfValues('pf-chat-memories'), contextTokens: Number($('pf-chat-context').value), maxOutputTokens: Number($('pf-chat-output').value), expectedRevision: pfState.session?.revision, stream: true }; }
  function pfRenderContextInspection(result) {
    const context = result.context || result;
    setLocalizedHtml($('pf-context-inspection'), () => '<p><strong>' + esc(context.estimatedInputTokens) + (' ' + esc(t('ui_estimated_input_tokens')) + '</strong> · ') + esc(context.maxOutputTokens) + (' ' + t('ui_output_reserved') + ' ') + esc(context.contextTokens) + (' ' + esc(t('ui_token_context')) + '</p><p>') + esc((context.selectedMessageIds || []).length) + (' ' + t('ui_prior_messages') + ' ') + esc((context.omittedMessageIds || []).length) + (' ' + t('ui_omitted_messages') + ' ') + esc((context.selectedMemoryIds || []).length) + (' ' + esc(t('ui_memories_included')) + '</p><p>') + (context.summaryUsed ? t('ui_summary_included') : t('ui_summary_not_included')) + (' ' + esc(t('ui_token_estimate')) + '</p>'));
  }
  async function pfReadEventStream(response, onEvent) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    const consume = frame => {
      const lines = frame.split(/\r?\n/);
      const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      let event; try { event = JSON.parse(data); } catch { throw localizedError(() => t('error_invalid_stream')); }
      onEvent(event);
    };
    try {
      while (true) {
        const result = await reader.read();
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done });
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) { consume(buffer.slice(0, boundary.index)); buffer = buffer.slice(boundary.index + boundary[0].length); }
        if (buffer.length > 2000000) throw localizedError(() => t('error_stream_limit'));
        if (result.done) { if (buffer.trim()) consume(buffer); break; }
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
  }
  async function pfSendChat() {
    const content = $('pf-chat-input').value.trim();
    if (!content || pfState.busy) return;
    if (!$('pf-chat-model').value) { pfStatus(() => t('error_choose_model_send'), true); return; }
    pfState.busy = true;
    pfState.controller = new AbortController();
    $('pf-chat-send').disabled = true; $('pf-chat-stop').disabled = false; $('pf-new-chat').disabled = true;
    setLocalizedText($('pf-chat-progress'), () => t('status_preparing_reply'));
    pfStatus('');
    let sessionId, accepted = false;
    try {
      if (!pfState.session) await pfNewSession();
      else if (pfState.session.retention !== $('pf-chat-retention').value) await pfSaveSessionDetails();
      sessionId = pfState.session.id;
      pfState.activeSessionId = sessionId;
      const body = pfChatBody(content);
      const response = await fetch(pfPath('/sessions/' + encodeURIComponent(sessionId) + '/messages'), { method: 'POST', headers: withAuth({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }), body: JSON.stringify(body), signal: pfState.controller.signal });
      if (!response.ok) { const result = await response.json(); throw localizedError(() => result.error?.message || result.message || t('error_message_request')); }
      accepted = true;
      $('pf-chat-input').value = ''; pfState.drafts.delete(sessionId);
      let streamed = '';
      appendLocalizedHtml($('pf-transcript'), () => ('<article class="platform-message user"><header><strong>' + esc(t('ui_you')) + '</strong></header><div class="platform-message-content">') + esc(content) + ('</div></article><article class="platform-message assistant" id="pf-stream-message"><header><strong>' + esc(t('ui_assistant')) + '</strong><small>') + esc(body.model) + '</small></header><div id="pf-stream-content" class="platform-message-content"></div></article>');
      setLocalizedText($('pf-chat-progress'), () => t('status_receiving_reply'));
      if ((response.headers.get('Content-Type') || '').includes('text/event-stream')) {
        await pfReadEventStream(response, event => {
          if (event.type === 'error' || event.error) throw localizedError(() => typeof event.error === 'string' ? event.error : event.error?.message || event.message || t('status_reply_failed'));
          const delta = event.delta || event.choices?.[0]?.delta?.content || '';
          if (typeof delta === 'string') {
            streamed += delta;
            if (streamed.length > 2000000) throw localizedError(() => t('error_reply_limit'));
            if (pfState.session?.id === sessionId && $('pf-stream-content')) {
              const transcript = $('pf-transcript'), atEnd = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 80;
              setLocalizedText($('pf-stream-content'), () => streamed);
              if (atEnd) transcript.scrollTop = transcript.scrollHeight;
            }
          }
        });
      } else { await response.json(); }
      setLocalizedText($('pf-chat-progress'), () => t('status_reply_complete'));
    } catch (error) {
      const stopped = pfState.controller?.signal.aborted;
      setLocalizedText($('pf-chat-progress'), () => stopped ? t('status_reply_stopped') : t('status_reply_failed'));
      if (!stopped) pfStatus(() => error.message, true);
      if (!accepted && (!$('pf-chat-input').value) && (!sessionId || pfState.session?.id === sessionId)) $('pf-chat-input').value = content;
    } finally {
      pfState.busy = false; pfState.controller = null; pfState.activeSessionId = null;
      $('pf-chat-send').disabled = false; $('pf-chat-stop').disabled = true; $('pf-new-chat').disabled = false;
      if (sessionId && pfState.session?.id === sessionId) { try { pfState.session = pfEntity(await pfApi('/sessions/' + encodeURIComponent(sessionId)), 'session'); pfRenderTranscript(); } catch (error) { pfStatus(() => error.message, true); } }
      await platformRefresh();
    }
  }
  async function pfStopChat() {
    const id = pfState.activeSessionId;
    pfState.controller?.abort();
    if (id) await pfApi('/sessions/' + encodeURIComponent(id) + '/cancel', {});
  }
  async function pfBranchMessage(messageId, content) {
    const result = await pfApi('/sessions/' + encodeURIComponent(pfState.session.id) + '/branch', { messageId, content });
    const session = pfEntity(result, 'session');
    await pfOpenSession(session.id);
    if (content !== undefined) $('pf-chat-input').value = content;
    $('pf-chat-input').focus();
    pfStatus(() => t('ui_branch_created'));
    await platformRefresh();
  }
  async function pfDownload(path, filename) {
    const response = await fetch(pfPath(path), { headers: withAuth({}) });
    if (!response.ok) throw localizedError(() => t('error_export_failed') + response.status + ')');
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function pfRenderMemories() {
    const query = $('pf-memory-search').value.toLowerCase(), status = $('pf-memory-status-filter').value, scope = $('pf-memory-scope-filter').value;
    const items = pfState.memories.filter(memory => (!status || memory.status === status) && (!scope || memory.scope === scope) && (memory.title + ' ' + memory.content).toLowerCase().includes(query));
    setLocalizedHtml($('pf-memories'), () => items.map(memory => '<button type="button" data-pf-memory="' + esc(memory.id) + '" class="' + (memory.id === pfState.memory?.id ? 'active' : '') + '"><strong>' + esc(memory.title) + '</strong><small>' + esc(localizedValue(memory.scope) + (memory.scopeId ? ':' + memory.scopeId : '') + ' · ' + localizedValue(memory.status)) + '</small></button>').join('') || ('<p class="platform-empty">' + esc(t('ui_no_memories_match')) + '</p>'));
  }
  function pfEditMemory(memory) {
    pfState.memory = memory || null;
    setLocalizedText($('pf-memory-heading'), () => memory ? t('h_edit_memory') : t('h_create_memory'));
    $('pf-memory-title').value = memory?.title || ''; $('pf-memory-content').value = memory?.content || '';
    $('pf-memory-scope').value = memory?.scope || 'user'; $('pf-memory-scope-id').value = memory?.scopeId || '';
    $('pf-memory-scope').disabled = Boolean(memory); $('pf-memory-scope-id').disabled = Boolean(memory);
    $('pf-memory-review').hidden = memory?.status !== 'candidate';
    setLocalizedText($('pf-memory-meta'), () => memory ? (t('ui_revision') + ' ') + memory.revision + ' · ' + localizedValue(memory.status) + ' · ' + localizedValue(memory.provenance?.sourceType || 'manual') + ' · ' + pfDate(memory.updatedAt) : '');
    for (const id of ['pf-memory-approve','pf-memory-reject','pf-memory-delete']) $(id).disabled = !memory;
    pfRenderMemories();
    pfApplyRole();
  }
  async function pfSaveMemory() {
    const data = { title: $('pf-memory-title').value.trim(), content: $('pf-memory-content').value.trim(), scope: $('pf-memory-scope').value, scopeId: $('pf-memory-scope-id').value.trim() || undefined };
    if (data.scope !== 'user' && !data.scopeId) throw localizedError(() => t('error_memory_scope', { scope: localizedValue(data.scope) }));
    const existing = pfState.memory;
    const result = existing ? await pfApi('/memories/' + encodeURIComponent(existing.id), { ...data, revision: existing.revision }, 'PATCH') : await pfApi('/memories', { ...data, status: 'candidate', provenance: { sourceType: 'manual' } });
    pfEditMemory(pfEntity(result, 'memory')); await platformRefresh(); pfStatus(() => t('ui_memory_saved'));
  }
  async function pfReviewMemory(status) {
    if (!pfState.memory) return;
    const result = await pfApi('/memories/' + encodeURIComponent(pfState.memory.id), { revision: pfState.memory.revision, status }, 'PATCH');
    pfEditMemory(pfEntity(result, 'memory')); await platformRefresh(); pfStatus(() => t('ui_memory_reviewed', { status: localizedValue(status).toLocaleLowerCase(currentLang) }));
  }
  function pfRenderLibrary() {
    const query = $('pf-library-search').value.toLowerCase();
    const items = pfState[pfState.library].filter(entry => (entry.name + ' ' + entry.description + ' ' + (entry.tags || []).join(' ')).toLowerCase().includes(query));
    setLocalizedHtml($('pf-library-list'), () => items.map(entry => '<button type="button" data-pf-entry="' + esc(entry.id) + '" data-pf-version="' + esc(entry.version || entry.revision || '') + '"><strong>' + esc(entry.name) + '</strong><small>' + esc(entry.description || '') + '</small><small>' + (pfState.library === 'agents' ? (t('ui_revision') + ' ') : (t('ui_version') + ' ')) + esc(entry.version || entry.revision || 1) + '</small></button>').join('') || ('<p class="platform-empty">' + esc(t('ui_no_entries')) + '</p>'));
  }
  async function pfLoadPresets() {
    const model = $('pf-preset-model').value;
    if (!model) { setLocalizedHtml($('pf-presets-list'), () => '<p class="muted">' + esc(t('ui_choose_model_presets')) + '</p>'); return; }
    const result = await pfApi('/presets?model=' + encodeURIComponent(model));
    if ($('pf-preset-model').value !== model) return;
    pfState.presets = pfList(result); pfState.presetModel = model;
    setLocalizedHtml($('pf-presets-list'), () => pfState.presets.map(preset => '<article><strong>' + esc(preset.name) + '</strong><p class="muted">' + esc(preset.description) + '</p><p>' + esc((preset.steps || []).length) + (' ' + t('ui_steps_count') + ' ') + esc((preset.steps || []).filter(step => step.requiresApproval).length) + (' ' + esc(t('ui_approval_checkpoints')) + '</p><button type="button" data-pf-install-preset="') + esc(preset.id) + '"' + (pfState.operator?.role === 'admin' ? '' : ' disabled') + ('>' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>' + '<span class="action-label">' + esc(t('btn_install_preset')) + '</span>' + '</button></article>')).join('') || ('<p class="muted">' + esc(t('ui_no_coding_presets')) + '</p>'));
  }
  async function pfInstallPreset(id) {
    if (pfState.operator?.role !== 'admin') throw localizedError(() => t('error_admin_presets'));
    const body = { model: $('pf-preset-model').value };
    if (!body.model) throw localizedError(() => t('error_default_model_preset'));
    for (const role of ['planner','implementer','reviewer','security']) if ($('pf-preset-' + role).value) body[role] = $('pf-preset-' + role).value;
    const result = await pfApi('/presets/' + encodeURIComponent(id) + '/install', body);
    const pipeline = result.pipeline;
    if (!pipeline?.id) throw localizedError(() => t('error_installed_pipeline'));
    pfState.installedPreset = pipeline.id;
    setLocalizedText($('pf-preset-status'), () => pipeline.name + (' ' + t('ui_preset_installed')));
    $('pf-preset-open').hidden = pfState.operator.source === 'operator-token';
  }
  function pfEditEntry(entry) {
    pfState.entry = entry || null;
    const agent = pfState.library === 'agents';
    setLocalizedText($('pf-library-heading'), () => agent ? t('h_agent_catalog') : pfState.library === 'skills' ? t('h_skill_catalog') : t('h_prompt_catalog'));
    setLocalizedText($('pf-entry-heading'), () => t('h_' + (entry ? 'edit_' : 'create_') + (agent ? 'agent' : pfState.library === 'skills' ? 'skill' : 'prompt')));
    $('pf-entry-name').value = entry?.name || ''; $('pf-entry-description').value = entry?.description || '';
    setLocalizedValue($('pf-entry-version'), () => entry?.version || entry?.revision || t('btn_new')); $('pf-entry-body').value = entry?.instructions || entry?.body || '';
    setLocalizedText($('pf-entry-body-label'), () => agent ? t('lbl_agent_instructions') : t('lbl_reusable_instructions'));
    $('pf-agent-fields').hidden = !agent; $('pf-skill-fields').hidden = agent;
    setLocalizedText($('pf-entry-save'), () => agent ? t('btn_save_agent') : entry ? t('btn_publish_version') : t('btn_save_first_version'));
    $('pf-entry-use').disabled = !entry;
    if (agent) { if (entry?.model) $('pf-entry-model').value = entry.model; $('pf-entry-mode').value = entry?.mode || 'chat'; pfHydrateSkillOptions('pf-entry-skills', (entry?.skillRefs || []).map(ref => ref.id + '@' + ref.version), () => pfState.entry === (entry || null)).catch(error => pfStatus(() => error.message, true)); }
    else { $('pf-entry-tags').value = (entry?.tags || []).join(', '); $('pf-entry-tools').value = (entry?.requiredTools || []).join(', '); pfChoose('pf-entry-modes', entry?.modes || ['chat']); }
    setLocalizedText($('pf-entry-meta'), () => entry?.id ? 'ID: ' + entry.id : '');
    pfApplyRole();
  }
  async function pfSaveEntry() {
    const name = $('pf-entry-name').value.trim(), description = $('pf-entry-description').value.trim(), body = $('pf-entry-body').value;
    const existing = pfState.entry, agent = pfState.library === 'agents';
    const data = agent ? { name, description, instructions: body, model: $('pf-entry-model').value || undefined, mode: $('pf-entry-mode').value, skillRefs: pfRefs('pf-entry-skills'), expectedRevision: existing?.revision } : { name, description, body, tags: $('pf-entry-tags').value.split(',').map(value => value.trim()).filter(Boolean), requiredTools: $('pf-entry-tools').value.split(',').map(value => value.trim()).filter(Boolean), modes: pfValues('pf-entry-modes'), id: existing?.id, expectedVersion: existing?.version };
    const path = '/' + pfState.library + (existing && agent ? '/' + encodeURIComponent(existing.id) : '');
    const result = await pfApi(path, data, existing && agent ? 'PATCH' : 'POST');
    pfEditEntry(pfEntity(result, agent ? 'agent' : pfState.library === 'skills' ? 'skill' : 'prompt'));
    await platformRefresh(); pfStatus(() => agent ? t('ui_agent_saved') : t('ui_version_saved'));
  }
  function pfRenderRuns() {
    setLocalizedHtml($('pf-runs'), () => pfState.runs.map(run => '<button type="button" data-pf-run="' + esc(run.id) + '" class="' + (run.id === pfState.run?.id ? 'active' : '') + '"><strong>' + esc(run.title || String(run.prompt || run.id).slice(0,80)) + '</strong><small>' + esc(localizedValue(run.status)) + ' · ' + esc(pfDate(run.createdAt || run.startedAt)) + '</small></button>').join('') || ('<p class="platform-empty">' + esc(t('ui_no_queued_runs')) + '</p>'));
  }
  async function pfLoadRun(id) {
    pfState.runRequestId = id;
    const result = await pfApi('/runs/' + encodeURIComponent(id));
    if (pfState.runRequestId !== id) return;
    pfState.run = pfEntity(result, 'run');
    const run = pfState.run, steps = run.steps || run.iterations || [];
    $('pf-run-detail').className = '';
    setLocalizedHtml($('pf-run-detail'), () => '<div class="platform-stats"><div class="platform-stat"><strong>' + esc(localizedValue(run.status)) + ('</strong><span>' + esc(t('lbl_status')) + '</span></div><div class="platform-stat"><strong>') + esc(Array.isArray(steps) ? steps.length : run.iteration || 0) + ' / ' + esc(run.maxIterations || '-') + ('</strong><span>' + esc(t('lbl_iterations')) + '</span></div><div class="platform-stat"><strong>') + esc(run.tokensConsumed ?? run.tokens ?? '-') + ('</strong><span>' + esc(t('lbl_tokens')) + '</span></div><div class="platform-stat"><strong>') + esc(run.costUsd === undefined ? '-' : '$' + Number(run.costUsd).toFixed(4)) + ('</strong><span>' + esc(t('lbl_estimated_cost')) + '</span></div></div>') + (run.error ? '<p class="platform-status error">' + esc(run.error) + '</p>' : '') + (run.stopReason ? '<p class="muted">' + esc(run.stopReason) + '</p>' : '') + (Array.isArray(steps) ? steps.map((step, index) => ('<div class="platform-run-step"><strong>' + esc(t('lbl_iteration')) + ' ') + (index + 1) + ' · ' + esc(localizedValue(step.status || 'recorded')) + '</strong><div class="platform-message-content">' + esc(step.content || step.output || step.summary || '') + '</div></div>').join('') : '') + (run.output ? '<div class="platform-output">' + esc(run.output) + '</div>' : ''));
    $('pf-run-cancel').disabled = !['queued','running','waiting_approval'].includes(run.status); $('pf-run-retry').disabled = !['failed','cancelled','interrupted','completed','exhausted'].includes(run.status);
    $('pf-run-approval-review').hidden = run.status !== 'waiting_approval';
    const artifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
    setLocalizedHtml($('pf-run-artifacts'), () => artifacts.map(artifact => '<article><strong>' + esc(artifact.name || artifact.title || artifact.id) + '</strong><div class="muted">' + esc(artifact.type || artifact.mimeType || '') + '</div>' + (artifact.content ? '<div class="platform-output">' + esc(artifact.content) + '</div>' : '') + '<button type="button" data-pf-artifact="' + esc(artifact.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' + '<span class="action-label">' + esc(t('btn_download')) + '</span>' + '</button></article>')).join('') || ('<p class="muted">' + esc(t('ui_no_run_artifacts')) + '</p>'));
    pfRenderRuns();
    pfApplyRole();
  }
  function pfRenderEvaluations(result) {
    const evaluations = pfList(result);
    $('pf-evaluations').className = 'platform-artifacts';
    setLocalizedHtml($('pf-evaluations'), () => evaluations.map(evaluation => '<article><strong>' + esc(evaluation.fixture || evaluation.id) + '</strong><div class="muted">' + esc(pfDate(evaluation.createdAt)) + '</div>' + (evaluation.runs || []).map(run => '<p><code>' + esc(run.model || run.id) + '</code> · ' + esc(localizedValue(run.status || 'queued')) + ' · ' + (['queued','running','waiting_approval'].includes(run.status) ? t('status_pending') : run.passed ? t('ui_passed_exact') : t('ui_failed_exact')) + (run.costUsd === undefined ? '' : ' · $' + Number(run.costUsd).toFixed(4)) + '</p>').join('') + '</article>').join('') || ('<p class="muted">' + esc(t('ui_no_evaluation_batches')) + '</p>'));
  }
  function pfRenderStorage(result) {
    const storage = result.storage || result;
    setLocalizedHtml($('pf-storage'), () => '<div class="platform-stats"><div class="platform-stat"><strong>' + esc(storage.backend) + ('</strong><span>' + esc(t('lbl_active_backend')) + '</span></div><div class="platform-stat"><strong>') + (storage.ready ? t('status_ready') : t('status_unavailable')) + ('</strong><span>' + esc(t('lbl_storage_status')) + '</span></div><div class="platform-stat"><strong>') + (storage.encrypted ? t('status_encrypted') : t('storage_memory_only')) + ('</strong><span>' + esc(t('lbl_retention_protection')) + '</span></div></div>') + (storage.error ? '<p class="platform-status error">' + esc(storage.error) + '</p>' : '') + ('<h4>' + esc(t('h_available_backends')) + '</h4>') + (storage.availableBackends || []).map(backend => '<p><strong>' + esc(backend.id) + '</strong> · ' + (backend.available ? t('status_available') : t('status_requires_configuration')) + (backend.reason ? '<br><span class="muted">' + esc(backend.reason) + '</span>' : '') + '</p>').join('') + '<p class="muted">' + esc(storage.migration || '') + '</p>');
  }
  function pfRenderDiagnostics(result) {
    setLocalizedHtml($('pf-diagnostics'), () => pfList(result).map(item => '<article class="platform-context"><strong>' + esc(item.provider || item.name || t('lbl_provider')) + '</strong> <span class="platform-badge">' + (item.available ? t('status_available') : t('status_unavailable')) + '</span><p>' + esc(item.version || item.error || t('ui_no_version')) + '</p><code>' + esc(item.path || item.requested || '') + '</code></article>').join('') || ('<p class="muted">' + esc(t('ui_no_diagnostics')) + '</p>'));
  }
  async function pfStartRun() {
    const workspaceId = $('pf-run-workspace').value || undefined;
    const workspace = (pfState.workspaces || cachedWorkspaces).find(item => item.id === workspaceId);
    const result = await pfApi('/runs', { prompt: $('pf-run-prompt').value.trim(), model: $('pf-run-model').value, agentId: $('pf-run-agent').value || undefined, workspaceId, workingDirectory: workspace?.path, mode: $('pf-run-mode').value, maxIterations: Number($('pf-run-iterations').value), maxDurationMs: Number($('pf-run-duration').value) * 1000, maxCostUsd: Number($('pf-run-cost').value), maxTokens: Number($('pf-run-tokens').value), maxOutputTokens: Number($('pf-run-output').value), requiresApproval: $('pf-run-approval').value === 'true', successPattern: $('pf-run-success').value.trim() || undefined });
    await pfLoadRun(pfEntity(result, 'run').id); await platformRefresh(); pfStatus(() => t('ui_run_queued'));
  }
  async function pfRunAction(action) { if (!pfState.run) return; const result = await pfApi('/runs/' + encodeURIComponent(pfState.run.id) + '/actions', { action, feedback: $('pf-run-feedback').value || undefined }); const run = pfEntity(result, 'run'); await pfLoadRun(run?.id || pfState.run.id); await platformRefresh(); }
  function pfRenderProfiles() {
    setLocalizedHtml($('pf-profiles'), () => pfState.profiles.map(profile => '<button type="button" data-pf-profile="' + esc(profile.id) + '"><strong>' + esc(profile.name || profile.id) + '</strong><small>' + esc(profile.provider + ' · ' + (profile.enabled === false ? t('status_disabled') : t('status_enabled'))) + '</small><small>' + esc(profile.hasCredential ? t('status_stored_credential') : profile.source || t('ui_provider_default_credentials')) + '</small></button>').join('') || ('<p class="muted">' + esc(t('ui_no_profiles')) + '</p>'));
  }
  function pfEditProfile(profile) {
    pfState.profile = profile || null;
    for (const [field, key] of [['name','name'],['provider','provider'],['model','model'],['executable','cliExecutable'],['effort','defaultEffort']]) $('pf-profile-' + field).value = profile?.[key] || (field === 'provider' ? 'cli-codex' : '');
    $('pf-profile-key').value = '';
    $('pf-profile-concurrency').value = profile?.maxConcurrent || 1;
    $('pf-profile-enabled').value = String(profile?.enabled !== false);
    $('pf-profile-clear').value = 'false';
    setLocalizedText($('pf-profile-credential-status'), () => profile?.hasCredential ? t('ui_credential_not_visible') : profile?.credentialSource || t('ui_default_credentials_unless_key'));
    $('pf-profile-delete').disabled = !profile;
  }
  async function pfSaveProfile() {
    const apiKey = $('pf-profile-key').value;
    const result = await pfApi('/profiles', { id: pfState.profile?.id, expectedRevision: pfState.profile?.revision, name: $('pf-profile-name').value.trim(), provider: $('pf-profile-provider').value, model: $('pf-profile-model').value.trim() || undefined, cliExecutable: $('pf-profile-executable').value.trim() || undefined, ...(apiKey ? { apiKey } : {}), ...($('pf-profile-clear').value === 'true' ? { clearCredential: true } : {}), defaultEffort: $('pf-profile-effort').value.trim() || undefined, maxConcurrent: Number($('pf-profile-concurrency').value), enabled: $('pf-profile-enabled').value === 'true' });
    $('pf-profile-key').value = '';
    pfEditProfile(pfEntity(result, 'profile')); await platformRefresh(); pfStatus(() => t('ui_profile_saved'));
  }
  function pfHandle(callback) {
    return event => {
      if (event?.type === 'submit') event.preventDefault();
      const target = event?.currentTarget;
      if (target?.dataset.pfPending === 'true') return;
      if (target) target.dataset.pfPending = 'true';
      return Promise.resolve().then(() => callback(event)).catch(error => pfStatus(() => error.message, true)).finally(() => { if (target) delete target.dataset.pfPending; });
    };
  }
  for (const tab of ['chat','memory','library','runs','system']) $('pf-tab-' + tab).addEventListener('click', () => pfTab(tab));
  $('pf-view-select').addEventListener('change', () => pfTab($('pf-view-select').value));
  $('pf-refresh').addEventListener('click', pfHandle(() => { pfState.models = null; pfState.workspaces = null; return platformRefresh(); }));
  $('pf-new-chat').addEventListener('click', () => { showSection('platform'); pfTab('chat'); pfPrepareNewChat(); });
  $('pf-transcript').addEventListener('click', event => { const button = event.target.closest('[data-chat-suggestion]'); if (button) { $('pf-chat-input').value = t('ui_prompt_' + button.dataset.chatSuggestion); $('pf-chat-input').focus(); } });
  $('pf-session-search').addEventListener('input', pfRenderSessions);
  $('pf-sessions').addEventListener('click', pfHandle(event => { const button = event.target.closest('[data-pf-session]'); if (button) { showSection('platform'); pfTab('chat'); return pfOpenSession(button.dataset.pfSession); } }));
  $('pf-chat-form').addEventListener('submit', pfHandle(pfSendChat));
  $('pf-chat-input').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); pfSendChat(); } });
  $('pf-chat-stop').addEventListener('click', pfHandle(pfStopChat));
  for (const id of ['pf-chat-model','pf-chat-agent','pf-chat-retention','pf-chat-skills','pf-chat-memories']) $(id).addEventListener('change', pfContextSummary);
  for (const id of ['pf-chat-model','pf-chat-agent','pf-chat-workspace','pf-chat-profile']) $(id).addEventListener('change', () => { pfRefreshMemoryOptions(); pfContextSummary(); });
  $('pf-save-chat').addEventListener('click', pfHandle(async () => { await pfSaveSessionDetails(); await platformRefresh(); pfStatus(() => t('ui_conversation_saved')); }));
  $('pf-export-chat').addEventListener('click', pfHandle(() => { if (pfState.session) return pfDownload('/sessions/' + encodeURIComponent(pfState.session.id) + '/export', 'conversation-' + pfState.session.id + '.json'); }));
  $('pf-delete-chat').addEventListener('click', pfHandle(async () => { if (!pfState.session || pfState.busy || !confirm(t('confirm_delete_conversation'))) return; await pfApi('/sessions/' + encodeURIComponent(pfState.session.id), {}, 'DELETE'); pfState.drafts.delete(pfState.session.id); pfState.session = null; $('pf-chat-title').value = ''; $('pf-chat-input').value = ''; pfRenderTranscript(); await platformRefresh(); }));
  $('pf-inspect-context').addEventListener('click', pfHandle(async () => { if (!pfState.session) { setLocalizedText($('pf-context-inspection'), () => t('error_create_conversation')); return; } if (!$('pf-chat-input').value.trim()) throw localizedError(() => t('error_draft_context')); const result = await pfApi('/sessions/' + encodeURIComponent(pfState.session.id) + '/context', pfChatBody($('pf-chat-input').value)); pfRenderContextInspection(result); }));
  $('pf-summary-form').addEventListener('submit', pfHandle(async () => { if (!pfState.session || !$('pf-summary-through').value || !$('pf-summary-content').value.trim()) throw localizedError(() => t('error_summary_required')); const result = await pfApi('/sessions/' + encodeURIComponent(pfState.session.id) + '/summary', { throughMessageId: $('pf-summary-through').value, content: $('pf-summary-content').value.trim(), expectedRevision: pfState.session.revision }); pfState.session = pfEntity(result, 'session'); pfStatus(() => t('ui_summary_saved')); }));
  $('pf-transcript').addEventListener('click', pfHandle(async event => {
    const button = event.target.closest('button'); if (!button || !pfState.session || pfState.busy) return;
    const id = button.dataset.pfCopyMessage || button.dataset.pfEditMessage || button.dataset.pfRetryMessage || button.dataset.pfMemoryMessage;
    const message = pfState.session.messages.find(item => item.id === id); if (!message) return;
    if (button.dataset.pfCopyMessage) { await navigator.clipboard.writeText(message.content); pfStatus(() => t('ui_message_copied')); }
    if (button.dataset.pfEditMessage) { pfState.editingMessage = id; $('pf-edit-content').value = message.content; $('pf-edit-branch').hidden = false; $('pf-edit-content').focus(); }
    if (button.dataset.pfRetryMessage) await pfBranchMessage(id, message.content);
    if (button.dataset.pfMemoryMessage) { pfTab('memory'); pfEditMemory(null); $('pf-memory-title').value = (t('ui_from') + ' ') + pfState.session.title; $('pf-memory-content').value = message.content; pfStatus(() => t('ui_review_proposed_memory')); }
  }));
  $('pf-cancel-branch').addEventListener('click', () => { $('pf-edit-branch').hidden = true; });
  $('pf-create-branch').addEventListener('click', pfHandle(() => pfBranchMessage(pfState.editingMessage, $('pf-edit-content').value)));
  for (const id of ['pf-memory-search','pf-memory-status-filter','pf-memory-scope-filter']) $(id).addEventListener(id.endsWith('search') ? 'input' : 'change', pfRenderMemories);
  $('pf-new-memory').addEventListener('click', () => pfEditMemory(null));
  $('pf-memories').addEventListener('click', event => { const button = event.target.closest('[data-pf-memory]'); if (button) pfEditMemory(pfState.memories.find(memory => memory.id === button.dataset.pfMemory)); });
  $('pf-memory-form').addEventListener('submit', pfHandle(pfSaveMemory));
  $('pf-memory-approve').addEventListener('click', pfHandle(() => pfReviewMemory('approved')));
  $('pf-memory-reject').addEventListener('click', pfHandle(() => pfReviewMemory('rejected')));
  $('pf-memory-delete').addEventListener('click', pfHandle(async () => { if (!pfState.memory || !confirm(t('confirm_delete_memory'))) return; await pfApi('/memories/' + encodeURIComponent(pfState.memory.id), { revision: pfState.memory.revision }, 'DELETE'); pfEditMemory(null); await platformRefresh(); }));
  document.querySelectorAll('[data-pf-library]').forEach(button => button.addEventListener('click', () => { pfState.library = button.dataset.pfLibrary; document.querySelectorAll('[data-pf-library]').forEach(item => item.classList.toggle('primary', item === button)); pfEditEntry(null); platformRefresh().catch(error => pfStatus(() => error.message, true)); }));
  $('pf-library-search').addEventListener('input', pfRenderLibrary);
  $('pf-preset-model').addEventListener('change', pfHandle(pfLoadPresets));
  $('pf-presets-list').addEventListener('click', pfHandle(event => { const button = event.target.closest('[data-pf-install-preset]'); if (button) return pfInstallPreset(button.dataset.pfInstallPreset); }));
  $('pf-preset-open').addEventListener('click', pfHandle(async () => { if (!pfState.installedPreset) return; const result = await request('/v1/pipelines'); renderPipelines(result.data || []); $('pipe-run-select').value = pfState.installedPreset; showSection('pipelines'); }));
  $('pf-new-entry').addEventListener('click', () => pfEditEntry(null));
  $('pf-library-list').addEventListener('click', event => { const button = event.target.closest('[data-pf-entry]'); if (button) pfEditEntry(pfState[pfState.library].find(entry => entry.id === button.dataset.pfEntry && String(entry.version || entry.revision || '') === button.dataset.pfVersion)); });
  $('pf-library-form').addEventListener('submit', pfHandle(pfSaveEntry));
  $('pf-entry-use').addEventListener('click', pfHandle(async () => { if (!pfState.entry) return; await pfLoadAttachments(); if (pfState.library === 'agents') $('pf-chat-agent').value = pfState.entry.id; else if (pfState.library === 'skills') pfChoose('pf-chat-skills', [...pfValues('pf-chat-skills'), pfState.entry.id + '@' + pfState.entry.version]); else $('pf-chat-input').value = pfState.entry.body; pfTab('chat'); pfContextSummary(); }));
  $('pf-run-form').addEventListener('submit', pfHandle(pfStartRun));
  $('pf-runs').addEventListener('click', pfHandle(event => { const button = event.target.closest('[data-pf-run]'); if (button) return pfLoadRun(button.dataset.pfRun); }));
  $('pf-run-cancel').addEventListener('click', pfHandle(() => pfRunAction('cancel')));
  $('pf-run-retry').addEventListener('click', pfHandle(() => pfRunAction('retry')));
  $('pf-run-approve').addEventListener('click', pfHandle(() => pfRunAction('approve')));
  $('pf-run-reject').addEventListener('click', pfHandle(() => pfRunAction('reject')));
  $('pf-run-artifacts').addEventListener('click', pfHandle(event => { const button = event.target.closest('[data-pf-artifact]'); if (button) return pfDownload('/artifacts/' + encodeURIComponent(button.dataset.pfArtifact) + '?download=1', 'artifact-' + button.dataset.pfArtifact + '.txt'); }));
  $('pf-evaluation-form').addEventListener('submit', pfHandle(async () => { const selected = pfValues('pf-evaluation-models'); if (!selected.length || selected.length > 8) throw localizedError(() => t('error_evaluation_models')); await pfApi('/evaluations', { models: selected }); await platformRefresh(); pfStatus(() => t('ui_evaluations_queued')); }));
  $('pf-storage-backup').addEventListener('click', pfHandle(() => pfDownload('/storage/backup', 'conduit-encrypted-backup.json')));
  $('pf-storage-config-form').addEventListener('submit', pfHandle(async () => { await pfApi('/storage/config', { backend: $('pf-storage-backend').value }); setLocalizedText($('pf-storage-config-status'), () => t('ui_backend_saved')); }));
  $('pf-storage-restore-form').addEventListener('submit', pfHandle(async () => { const file = $('pf-storage-restore-file').files?.[0]; if (!file) throw localizedError(() => t('error_select_backup')); if (file.size > 1048576) throw localizedError(() => t('error_backup_size')); const backup = JSON.parse(await file.text()); if (!confirm(t('confirm_restore_backup'))) return; await pfApi('/storage/restore', backup); pfState.session = null; pfState.run = null; pfState.memory = null; pfState.entry = null; pfState.drafts.clear(); pfState.attachments.clear(); await platformRefresh(); pfStatus(() => t('ui_backup_restored')); }));
  $('pf-diagnostics-refresh').addEventListener('click', pfHandle(platformRefresh));
  $('pf-profile-form').addEventListener('submit', pfHandle(pfSaveProfile));
  $('pf-profile-new').addEventListener('click', () => pfEditProfile(null));
  $('pf-profiles').addEventListener('click', event => { const button = event.target.closest('[data-pf-profile]'); if (button) pfEditProfile(pfState.profiles.find(profile => profile.id === button.dataset.pfProfile)); });
  $('pf-profile-delete').addEventListener('click', pfHandle(async () => { if (!pfState.profile || !confirm(t('confirm_delete_profile'))) return; await pfApi('/profiles/' + encodeURIComponent(pfState.profile.id), {}, 'DELETE'); pfEditProfile(null); await platformRefresh(); }));
  setInterval(() => {
    if (activeSection === 'platform' && pfState.tab === 'runs' && !document.hidden && pfState.runs.some(run => ['queued','running'].includes(run.status))) platformRefresh().catch(error => pfStatus(() => error.message, true));
  }, 3000);
`;
