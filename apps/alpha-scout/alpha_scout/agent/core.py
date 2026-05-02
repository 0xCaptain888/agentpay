from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from .tools import build_tools
from .prompts import SYSTEM_PROMPT
import logging

log = logging.getLogger("agent")


class AlphaScoutAgent:
    def __init__(self, settings, services: dict):
        self.settings = settings
        self.services = services
        self.llm = ChatOpenAI(
            model=settings.llm_model,
            temperature=0.2,
            api_key=settings.openai_api_key or None,
        )
        self.tools = build_tools(services)
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT),
            ("user", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ])
        self.agent = create_react_agent(self.llm, self.tools, self.prompt)
        self.executor = AgentExecutor(
            agent=self.agent, tools=self.tools, verbose=True,
            max_iterations=8, handle_parsing_errors=True,
        )

    async def run(self, trigger: str, context: dict) -> dict:
        log.info(f"Agent triggered: {trigger}")
        try:
            result = await self.executor.ainvoke({
                "input": f"Trigger: {trigger}",
                "trigger": trigger,
                "vault_state": context.get("vault_state", "unknown"),
            })
            log.info(f"Agent completed: {result}")
            return result
        except Exception as e:
            log.error(f"Agent error: {e}", exc_info=True)
            return {"error": str(e)}
