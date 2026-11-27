import { type AgentAction, createAgent, registerTools } from '@ui-sdk/react/agent';

export const canAgentAct = (step: AgentAction) => step.component === 'diff-rows' && step.action === 'activate';

export const agent = createAgent({ allow: canAgentAct });

export const unregisterAgentTools = registerTools(agent, { allow: canAgentAct });

if (import.meta.hot) {
  import.meta.hot.dispose(unregisterAgentTools);
}
