import { ExpoAI, ExpoAIError, type GenerateResult } from '@stewmore/expo-ai-core';
import {
  Badge,
  Card,
  PrimaryButton,
  PromptInput,
  ProviderPrivacy,
  Screen,
} from '@stewmore/example-shared';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

export default function App() {
  const [prompt, setPrompt] = useState('Write a short poem about on-device AI.');
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<ExpoAIError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Abort an in-flight stream if the screen unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function onStream() {
    setStreaming(true);
    setText('');
    setResult(null);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      for await (const chunk of ExpoAI.stream({
        prompt,
        fallback: 'cloud',
        signal: controller.signal,
      })) {
        if (chunk.type === 'delta') setText((current) => current + chunk.text);
        else if (chunk.type === 'done') setResult(chunk.result);
      }
    } catch (caught) {
      const caughtError = ExpoAIError.from(caught, 'none');
      // Stopping the stream is intentional, not an error to surface.
      if (caughtError.code !== 'CANCELLED') setError(caughtError);
    } finally {
      setStreaming(false);
      controllerRef.current = null;
    }
  }

  return (
    <Screen title="Streaming Chat" subtitle="ExpoAI.stream with live tokens + cancellation">
      <Card title="Prompt">
        <PromptInput value={prompt} onChangeText={setPrompt} multiline />
        {streaming ? (
          <PrimaryButton title="Stop" onPress={() => controllerRef.current?.abort()} />
        ) : (
          <PrimaryButton title="Stream" onPress={() => void onStream()} />
        )}
      </Card>

      {text.length > 0 || streaming ? (
        <Card title="Output">
          {streaming ? <Badge label="streaming…" tone="info" /> : null}
          <Text style={{ color: '#eef2ff', fontSize: 15, lineHeight: 22 }}>{text}</Text>
          {result ? <ProviderPrivacy provider={result.provider} privacy={result.privacy} /> : null}
        </Card>
      ) : null}

      {error ? (
        <Card title="Error">
          <Badge label={error.code} tone="danger" />
          <Text style={{ color: '#f87171' }}>{error.message}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
