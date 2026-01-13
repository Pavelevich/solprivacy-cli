/**
 * SolPrivacy AI Agent - Multi-Provider LLM Support
 * Supports: OpenAI, Anthropic (Claude), xAI (Grok), Groq, Ollama
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createXai } from '@ai-sdk/xai';
import { createGroq } from '@ai-sdk/groq';
import type { LanguageModel } from 'ai';

export type LLMProvider = 'openai' | 'anthropic' | 'xai' | 'groq' | 'ollama';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string; // For Ollama or custom endpoints
}

// Default models per provider
const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  xai: 'grok-2-latest',
  groq: 'llama-3.1-70b-versatile',
  ollama: 'llama3.2',
};

/**
 * Create a language model instance based on provider config
 */
export function createModel(config: LLMConfig): LanguageModel {
  const model = config.model || DEFAULT_MODELS[config.provider];

  switch (config.provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return openai(model);
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: config.apiKey,
      });
      return anthropic(model);
    }

    case 'xai': {
      const xai = createXai({
        apiKey: config.apiKey,
      });
      return xai(model);
    }

    case 'groq': {
      const groq = createGroq({
        apiKey: config.apiKey,
      });
      return groq(model);
    }

    case 'ollama': {
      // Ollama OpenAI-compatible API - use .chat() for Chat Completions format
      const baseUrl = config.baseUrl || 'http://localhost:11434/v1';
      const ollama = createOpenAI({
        baseURL: baseUrl,
        apiKey: 'ollama', // Ollama doesn't need a real key
      });
      return ollama.chat(model); // Use chat mode, not responses mode
    }

    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Get provider display info
 */
export function getProviderInfo(provider: LLMProvider): { name: string; requiresKey: boolean } {
  const info: Record<LLMProvider, { name: string; requiresKey: boolean }> = {
    openai: { name: 'OpenAI', requiresKey: true },
    anthropic: { name: 'Anthropic (Claude)', requiresKey: true },
    xai: { name: 'xAI (Grok)', requiresKey: true },
    groq: { name: 'Groq', requiresKey: true },
    ollama: { name: 'Ollama (Local)', requiresKey: false },
  };
  return info[provider];
}

export const SUPPORTED_PROVIDERS: LLMProvider[] = ['openai', 'anthropic', 'xai', 'groq', 'ollama'];
