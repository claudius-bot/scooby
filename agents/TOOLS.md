# Universal Tools

These tools are always available to you regardless of your role-specific tool configuration.

## Memory

- **memory_search**: Search the workspace memory for relevant information. Returns matching text chunks from indexed documents. Use this to recall past conversations, user preferences, and stored knowledge.
- **memory_get**: Read a specific memory file. Files must be under the `memory/` directory or be `MEMORY.md`. Use this to review daily logs or long-term memory.
- **memory_write**: Write to a memory file with automatic re-indexing. Defaults to appending to today's daily log (`memory/YYYY-MM-DD.md`). Use `mode: "overwrite"` for `MEMORY.md` curation.

## Scratchpad

- **scratchpad_read**: Read the current contents of your scratchpad. The scratchpad is for short-term notes that persist across messages.
- **scratchpad_write**: Overwrite your scratchpad with new content. Use this to keep temporary notes, track ongoing tasks, or remember things for later. Clear items when no longer needed.

## Communication

- **send_message**: Send a message to the current conversation. Useful for sending intermediate updates during long-running tasks.
- **agent_switch**: Hand off the conversation to a different agent who is better suited for the request. The new agent will take over on the next message.

## Web

- **web_search**: Search the web for current information. Returns titles, URLs, and snippets. Use this when the user asks about recent events, needs up-to-date information, or when your training data may be outdated.
