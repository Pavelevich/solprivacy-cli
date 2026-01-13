/**
 * SolPrivacy AI Agent - ReAct (Reasoning + Acting) Architecture
 * Multi-provider AI agent with intelligent tool orchestration
 */

import { generateText, streamText, stepCountIs, type ModelMessage } from 'ai';
import { createModel, LLMConfig, getProviderInfo } from './providers.js';
import { agentTools } from './tools.js';

// ReAct-style system prompt with explicit reasoning steps
const SYSTEM_PROMPT = `You are SolPrivacy AI, an expert Solana blockchain privacy analyst using ReAct (Reasoning + Acting) methodology.

## YOUR APPROACH
For each user request, follow this pattern:
1. THINK: Analyze what information you need
2. ACT: Use tools to gather that information
3. OBSERVE: Review the results
4. REPEAT: If you need more info, go back to THINK
5. RESPOND: When you have enough info, provide your final answer

## AVAILABLE TOOLS
- analyzeWallet: Get privacy score, entropy, clustering, dust attacks, KYC exposure
- projectScore: Calculate future score if user implements improvements
- getPrivacyTools: Get actionable links to privacy tools (Light Protocol, Jupiter, etc.)
- explainMetric: Explain what a specific privacy metric means
- getWalletHistory: Get analysis history for a wallet (score changes over time)
- listAnalyzedWallets: List all previously analyzed wallets
- compareWallets: Compare two wallets' privacy scores and identify which is more private
- simulateAttack: Simulate privacy attacks (dust_attack, cluster_analysis, temporal_analysis, exchange_correlation)

## DECISION LOGIC
- If this is a NEW wallet analysis request → call analyzeWallet first
- If this is a FOLLOW-UP question about a previous analysis → answer directly using context, do NOT re-analyze
- If user asks "what is X?" or "explain X" → Use explainMetric and answer concisely
- If user asks about specific recommendation → Explain it in detail without re-analyzing
- If score < 50 and giving first analysis → call projectScore
- If giving recommendations → call getPrivacyTools for actionable links
- If user asks about history/progress → Use getWalletHistory
- If user asks "what wallets have I analyzed?" → Use listAnalyzedWallets
- If user asks to compare wallets → Use compareWallets
- If user asks about attacks/vulnerabilities → Use simulateAttack

## FOLLOW-UP HANDLING
When user asks a follow-up question:
1. Check if you already have the answer from previous analysis
2. If yes, answer DIRECTLY without calling tools
3. If no, call only the specific tool needed (e.g., explainMetric for "what is X?")
4. Keep responses focused on the question asked - don't repeat entire analysis

## PRIVACY METRICS EXPERTISE
- Entropy: Transaction randomness (0-1, higher = better)
- K-Anonymity: Size of your anonymity set (higher = harder to identify)
- Clustering: Linked addresses via on-chain patterns (fewer = better)
- KYC Exposure: % of transactions with known exchanges (lower = better)
- Temporal Patterns: Transaction timing regularity (random = better)
- Dust Attacks: Tracking via tiny unsolicited transfers

## RESPONSE FORMAT
For NEW analysis, use markdown with clear sections:
- **Current Status**: Score, grade, risk level
- **Issues Found**: Bullet list of problems
- **Recommendations**: Numbered list with priority, impact, and links
- **Projected Outcome**: Score after improvements

For FOLLOW-UP questions:
- Answer the specific question directly
- Be concise - don't repeat previous analysis
- Only include relevant information

## IMPORTANT
- Be specific and actionable - no vague advice
- Include direct URLs to tools when relevant
- For follow-ups: FOCUS on the question, don't re-analyze
- Keep follow-up responses short (2-4 paragraphs max)`;

// Extended response with reasoning trace
export interface AgentResponse {
  text: string;
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>;
  reasoning?: string[]; // ReAct reasoning steps
  iterations?: number;  // How many think-act cycles
}

export interface AgentOptions {
  llmConfig: LLMConfig;
  onStream?: (text: string) => void;
  onThinking?: (thought: string) => void; // Callback for reasoning steps
  maxIterations?: number; // Max ReAct cycles (default: 5)
}

// Simpler system prompt for follow-up questions
const FOLLOW_UP_PROMPT = `You are SolPrivacy AI. The user already received a wallet analysis and is now asking a follow-up question.

IMPORTANT: Answer the question directly and concisely. Do NOT repeat the analysis. Do NOT show "Current Status" or full report format.

Available tools if needed:
- explainMetric: Explain privacy metrics (entropy, k_anonymity, clustering, kyc_exposure, dust_attack, temporal_patterns)
- simulateAttack: Simulate attacks (dust_attack, cluster_analysis, temporal_analysis, exchange_correlation)

Keep your answer focused and brief (2-3 paragraphs max).`;

/**
 * Run the SolPrivacy agent with ReAct loop
 */
export async function runAgent(
  prompt: string,
  options: AgentOptions,
  conversationHistory: ModelMessage[] = []
): Promise<AgentResponse> {
  const model = createModel(options.llmConfig);
  const providerInfo = getProviderInfo(options.llmConfig.provider);
  const isOllama = options.llmConfig.provider === 'ollama';
  const maxIterations = options.maxIterations || 5;

  // Check if this is a follow-up (has conversation history)
  const isFollowUp = conversationHistory.length > 0;

  // Use simpler prompt for follow-ups
  const effectiveSystemPrompt = isFollowUp ? FOLLOW_UP_PROMPT : SYSTEM_PROMPT;

  const messages: ModelMessage[] = [
    ...conversationHistory,
    { role: 'user', content: prompt },
  ];

  const toolCalls: Array<{ name: string; args: unknown; result: unknown }> = [];
  const reasoning: string[] = [];

  try {
    // For Ollama, use the ReAct-compatible Ollama handler
    if (isOllama) {
      return await runAgentReActOllama(prompt, options, messages, toolCalls, reasoning, maxIterations, effectiveSystemPrompt);
    }

    // For other providers, use the AI SDK's built-in multi-step
    const result = await generateText({
      model,
      system: effectiveSystemPrompt,
      messages,
      tools: agentTools,
      stopWhen: stepCountIs(maxIterations * 2), // Allow multiple cycles
      onStepFinish: (step) => {
        // Track reasoning and tool calls
        if (step.text) {
          reasoning.push(`THINK: ${step.text.slice(0, 200)}...`);
          options.onThinking?.(step.text);
        }

        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            reasoning.push(`ACT: ${tc.toolName}(${JSON.stringify(tc.input).slice(0, 100)})`);
            const toolResult = step.toolResults?.find((r: { toolCallId: string }) => r.toolCallId === tc.toolCallId);
            toolCalls.push({
              name: tc.toolName,
              args: tc.input,
              result: toolResult?.output,
            });
            if (toolResult) {
              reasoning.push(`OBSERVE: Got result from ${tc.toolName}`);
            }
          }
        }
      },
    });

    return {
      text: result.text,
      toolCalls,
      reasoning,
      iterations: Math.ceil(toolCalls.length / 2) || 1,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      text: `Error communicating with ${providerInfo.name}: ${errorMessage}`,
      toolCalls: [],
      reasoning: [`ERROR: ${errorMessage}`],
      iterations: 0,
    };
  }
}

/**
 * Try to parse a JSON tool call from text (for when Ollama outputs JSON as text)
 */
function tryParseTextToolCall(text: string): { name: string; args: unknown } | null {
  if (!text) return null;

  // Pattern 1: {"name": "toolName", "parameters": {...}}
  const jsonMatch = text.match(/\{[\s\S]*"name"\s*:\s*"?(\w+)"?[\s\S]*"parameters"\s*:\s*(\{[\s\S]*?\})[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const name = jsonMatch[1];
      const args = JSON.parse(jsonMatch[2]);
      return { name, args };
    } catch {
      // JSON parse failed, try fixing common issues
      try {
        // Fix unquoted string values
        const fixedArgs = jsonMatch[2].replace(/:\s*(\w+)([,}])/g, ': "$1"$2');
        const args = JSON.parse(fixedArgs);
        return { name: jsonMatch[1], args };
      } catch {
        // Still failed
      }
    }
  }

  // Pattern 2: {"name": toolName, "parameters": {"metric": "value"}} (unquoted name)
  const unquotedMatch = text.match(/\{[\s\S]*"?name"?\s*:\s*(\w+)[\s\S]*"?parameters"?\s*:\s*\{[\s\S]*"(\w+)"\s*:\s*"?(\w+)"?/);
  if (unquotedMatch) {
    const name = unquotedMatch[1];
    const paramKey = unquotedMatch[2];
    const paramValue = unquotedMatch[3];
    return { name, args: { [paramKey]: paramValue } };
  }

  // Pattern 3: Simple format {"toolName": {...args}}
  const simpleMatch = text.match(/\{\s*"(\w+)"\s*:\s*(\{[\s\S]*?\})\s*\}/);
  if (simpleMatch) {
    try {
      const name = simpleMatch[1];
      const args = JSON.parse(simpleMatch[2]);
      return { name, args };
    } catch {
      // JSON parse failed
    }
  }

  return null;
}

/**
 * ReAct loop for Ollama - manual implementation due to message format limitations
 * Implements true iterative reasoning with multiple think-act-observe cycles
 */
async function runAgentReActOllama(
  prompt: string,
  options: AgentOptions,
  initialMessages: ModelMessage[],
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>,
  reasoning: string[],
  maxIterations: number,
  systemPrompt: string = SYSTEM_PROMPT
): Promise<AgentResponse> {
  const model = createModel(options.llmConfig);
  let currentMessages = [...initialMessages];
  let iteration = 0;
  let finalResponse = '';

  while (iteration < maxIterations) {
    iteration++;
    reasoning.push(`--- Iteration ${iteration} ---`);

    // THINK + ACT: Get response with potential tool calls
    const step = await generateText({
      model,
      system: systemPrompt,
      messages: currentMessages,
      tools: agentTools,
      stopWhen: stepCountIs(1),
    });

    // Check if we got proper tool calls
    let effectiveToolCalls = step.toolCalls || [];

    // If no tool calls but text contains JSON tool call, parse it
    if (effectiveToolCalls.length === 0 && step.text) {
      const parsedCall = tryParseTextToolCall(step.text);
      if (parsedCall && agentTools[parsedCall.name as keyof typeof agentTools]) {
        reasoning.push(`PARSE: Detected tool call in text: ${parsedCall.name}`);
        effectiveToolCalls = [{
          toolName: parsedCall.name,
          toolCallId: `manual-${Date.now()}`,
          input: parsedCall.args,
        } as any];
      }
    }

    // Check if we got tool calls
    if (effectiveToolCalls.length === 0) {
      // No more tool calls - agent is done thinking
      reasoning.push('RESPOND: Agent has enough information');
      finalResponse = step.text;
      break;
    }

    // OBSERVE: Execute tool calls and collect results
    const toolResults: Array<{ tool: string; result: unknown }> = [];

    for (const tc of effectiveToolCalls) {
      reasoning.push(`ACT: Calling ${tc.toolName}`);
      options.onThinking?.(`Calling ${tc.toolName}...`);

      const tool = agentTools[tc.toolName as keyof typeof agentTools];
      if (tool) {
        try {
          const result = await (tool as any).execute(tc.input);
          toolCalls.push({ name: tc.toolName, args: tc.input, result });
          toolResults.push({ tool: tc.toolName, result });
          reasoning.push(`OBSERVE: ${tc.toolName} returned data`);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          reasoning.push(`OBSERVE: ${tc.toolName} failed - ${errorMsg}`);
          toolResults.push({ tool: tc.toolName, result: { error: errorMsg } });
        }
      }
    }

    // Build context for next iteration
    const toolResultsText = toolResults
      .map(tr => `[${tr.tool}]: ${JSON.stringify(tr.result)}`)
      .join('\n\n');

    // Add observation to messages for next iteration (strip JSON tool call from text if present)
    const cleanedText = step.text?.replace(/\{[\s\S]*"name"\s*:[\s\S]*"parameters"[\s\S]*\}/g, '').trim();
    currentMessages = [
      ...currentMessages,
      {
        role: 'assistant' as const,
        content: cleanedText || `I'll analyze using: ${effectiveToolCalls.map(tc => tc.toolName).join(', ')}`,
      },
      {
        role: 'user' as const,
        content: `Tool results:\n${toolResultsText}\n\nBased on these observations, continue your analysis. If you have enough information, provide your final response. If you need more data, use additional tools.`,
      },
    ];

    reasoning.push('THINK: Evaluating if more information is needed...');
  }

  // If we hit max iterations without a final response, get one
  if (!finalResponse) {
    reasoning.push('RESPOND: Max iterations reached, generating final response');
    const finalStep = await generateText({
      model,
      system: systemPrompt,
      messages: [
        ...currentMessages,
        {
          role: 'user' as const,
          content: 'Please provide your final analysis and recommendations based on all the information gathered.',
        },
      ],
      stopWhen: stepCountIs(1),
    });
    finalResponse = finalStep.text;
  }

  return {
    text: finalResponse,
    toolCalls,
    reasoning,
    iterations: iteration,
  };
}

/**
 * Run the agent with streaming output
 */
export async function runAgentStream(
  prompt: string,
  options: AgentOptions,
  conversationHistory: ModelMessage[] = []
): Promise<AsyncIterable<string>> {
  const model = createModel(options.llmConfig);

  const messages: ModelMessage[] = [
    ...conversationHistory,
    { role: 'user', content: prompt },
  ];

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools: agentTools,
    stopWhen: stepCountIs(10),
  });

  return result.textStream;
}

/**
 * Quick analysis - optimized for single wallet analysis
 */
export async function quickAnalysis(
  walletAddress: string,
  options: AgentOptions
): Promise<AgentResponse> {
  const prompt = `Analyze wallet ${walletAddress}:

1. Get the current privacy score and identify main issues
2. Calculate projected score with recommended improvements
3. Provide top 3 actionable recommendations with tool links

Use your tools systematically: analyzeWallet → projectScore → getPrivacyTools`;

  return runAgent(prompt, { ...options, maxIterations: 4 });
}

/**
 * Deep analysis - comprehensive multi-step analysis
 */
export async function deepAnalysis(
  walletAddress: string,
  options: AgentOptions
): Promise<AgentResponse> {
  const prompt = `Perform a comprehensive privacy audit for wallet ${walletAddress}:

1. Analyze current privacy posture (score, entropy, clustering, KYC exposure)
2. Identify all privacy risks (dust attacks, temporal patterns, linked addresses)
3. Explain each metric and why it matters for this wallet
4. Calculate improvement projections for multiple scenarios
5. Provide prioritized action plan with specific tool links

Take your time and use all available tools to build a complete picture.`;

  return runAgent(prompt, { ...options, maxIterations: 6 });
}

/**
 * Compare two wallets
 */
export async function compareWallets(
  wallet1: string,
  wallet2: string,
  options: AgentOptions
): Promise<AgentResponse> {
  const prompt = `Compare the privacy of these two wallets:
- Wallet A: ${wallet1}
- Wallet B: ${wallet2}

1. Analyze both wallets
2. Compare their scores, issues, and risk levels
3. Identify which has better privacy and why
4. Recommend improvements for the weaker wallet`;

  return runAgent(prompt, { ...options, maxIterations: 5 });
}

// Re-export types and utilities
export { LLMConfig, LLMProvider, SUPPORTED_PROVIDERS, getProviderInfo } from './providers.js';
export { agentTools } from './tools.js';
export {
  getCachedAnalysis,
  cacheAnalysis,
  getWalletHistory,
  listCachedWallets,
  clearWalletCache,
  clearAllCache,
  getCacheStats,
  compareAnalyses,
} from './cache.js';
