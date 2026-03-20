<repository_context>
  <name>@getmikk/cli</name>
  <stats>
    <files>17</files>
    <functions>30</functions>
    <modules>2</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
<tech_stack>
  <technology>SQL client</technology>
  <technology>esbuild</technology>
</tech_stack>
<commands>
  <command>
    <run>bun run dev</run>
    <executes>tsc --watch</executes>
  </command>
  <command>
    <run>bun run build</run>
    <executes>node esbuild.mjs</executes>
  </command>
  <command>
    <run>bun run test</run>
    <executes>bun test</executes>
  </command>
</commands>
  <module id="commands-contract">
    <name>CLI (Commands Contract)</name>
    <location>src/commands/contract/**</location>
    <purpose>Register contract commands</purpose>
    <entry_points>
      <function signature="registerContractCommands(program) [src/commands/contract/index.ts:9]" purpose="Register contract commands" />
    </entry_points>
  </module>
  <module id="commands">
    <name>CLI (Commands)</name>
    <location>src/commands/**</location>
    <purpose>Register adr command; Register analyze command; mikk ci — CI pipeline integration command</purpose>
    <entry_points>
      <function signature="registerContextCommands(program) [src/commands/context.ts:24]" purpose="Register context commands" />
      <function signature="registerCiCommand(program) [src/commands/ci.ts:14]" purpose="mikk ci — CI pipeline integration command." />
      <function signature="registerDeadCodeCommand(program) [src/commands/dead-code.ts:9]" purpose="Register dead code command" />
      <function signature="registerMcpCommand(program) [src/commands/mcp.ts:12]" purpose="Register the `mikk mcp` command — starts the MCP server." />
      <function signature="registerRemoveCommand(program) [src/commands/remove.ts:30]" purpose="Register remove command" />
    </entry_points>
    <key_internal_functions>
      <function name="buildMcpEntry" callers="3" purpose="Build mcp entry" />
      <function name="parseJsonSafe" callers="3" purpose="Parse json safe" />
      <function name="buildGraphFromLock" callers="1" purpose="Build graph from lock (same logic as MCP server)" />
      <function name="parseIntOption" callers="1" purpose="Parse a numeric CLI option with validation" />
      <function name="loadContractAndLock" callers="1" purpose="── Helpers ──────────────────────────────────────────────────────────────────" />
    </key_internal_functions>
  </module>
</modules>


