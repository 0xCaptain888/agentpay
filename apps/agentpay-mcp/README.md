# AgentPay MCP Server

Expose AgentVault as MCP tools for AI agents.

## Install in Claude Desktop

1. Build: `cd apps/agentpay-mcp && pnpm build`
2. Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac)
   or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agentpay": {
      "command": "node",
      "args": ["/absolute/path/to/agentpay/apps/agentpay-mcp/dist/index.js"],
      "env": {
        "RPC_URL": "https://api.devnet.solana.com",
        "PROGRAM_ID": "3iJbMYgjMCFVkvHQSoeAb9EiTbcXyFqDxh88n4b7BP2s",
        "USDC_MINT": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        "MCP_OWNER_KEYPAIR_PATH": "/Users/you/.config/solana/id.json"
      }
    }
  }
}
```

3. Restart Claude Desktop.
4. Open Claude Desktop, you should see "agentpay" server in the connector menu.

## Try it

Prompt Claude:

> "Create a new agent vault for authority `9k...` with $1 per-tx limit and $5 per-day limit."

Claude will call `create_vault`, deploy a real PDA on devnet, and link to the explorer.

## Available tools

| Tool | Description |
|------|-------------|
| `create_vault` | Create a new on-chain AgentVault with spending policy |
| `get_vault` | Read vault state: balance, policy, stats |
| `simulate_payment` | Check if a payment would pass policy (dry run) |
| `update_policy` | Update spending limits on existing vault |
