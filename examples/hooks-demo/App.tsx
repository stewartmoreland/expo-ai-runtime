import type { JSONSchema } from '@stewmore/expo-ai-core';
// Importing the shared barrel registers the on-device providers + cloud fallback
// (see examples/_shared/src/setup.ts) and gives us the example UI kit.
import {
  Badge,
  Card,
  KeyValue,
  PrimaryButton,
  PromptInput,
  ProviderPrivacy,
  Row,
  Screen,
} from '@stewmore/example-shared';
import { useCapabilities, useChat, useGenerate, useObject } from '@stewmore/expo-ai-react';
import { Text } from 'react-native';

const tripSchema: JSONSchema = {
  type: 'object',
  properties: {
    destination: { type: 'string' },
    activities: { type: 'array', items: { type: 'string' } },
  },
  required: ['destination', 'activities'],
};

type TripPlan = { destination: string; activities: string[] };

function CapabilitiesCard() {
  const { capabilities, loading, error, refresh } = useCapabilities();

  return (
    <Card title="useCapabilities">
      {loading ? (
        <Text style={{ color: '#94a3b8' }}>Checking device…</Text>
      ) : (
        <>
          <KeyValue label="provider" value={capabilities?.provider ?? 'none'} />
          <KeyValue label="available" value={String(capabilities?.available ?? false)} />
          <KeyValue label="streaming" value={String(capabilities?.supportsStreaming ?? false)} />
          <KeyValue
            label="structured"
            value={String(capabilities?.supportsStructuredOutput ?? false)}
          />
        </>
      )}
      {error ? <Text style={{ color: '#f87171' }}>{error.message}</Text> : null}
      <PrimaryButton title="Re-check" onPress={refresh} />
    </Card>
  );
}

function GenerateCard() {
  const { generate, text, result, isLoading, error } = useGenerate();

  return (
    <Card title="useGenerate">
      <PrimaryButton
        title="Write a haiku"
        loading={isLoading}
        onPress={() =>
          void generate({ prompt: 'Write a haiku about on-device AI.', fallback: 'cloud' })
        }
      />
      {text ? <Text style={{ color: '#eef2ff', lineHeight: 22 }}>{text}</Text> : null}
      {result ? <ProviderPrivacy provider={result.provider} privacy={result.privacy} /> : null}
      {error ? <Text style={{ color: '#f87171' }}>{error.message}</Text> : null}
    </Card>
  );
}

function ChatCard() {
  const { messages, input, setInput, append, isLoading, stop, error } = useChat({
    instructions: 'You are a concise, friendly assistant.',
    fallback: 'cloud',
  });

  return (
    <Card title="useChat">
      {messages.map((m) => (
        <Text
          key={m.id}
          style={{ color: '#eef2ff', fontWeight: m.role === 'user' ? '700' : '400' }}
        >
          {m.role === 'user' ? '🧑 ' : '🤖 '}
          {m.content}
        </Text>
      ))}
      <PromptInput value={input} onChangeText={setInput} placeholder="Ask something…" />
      {isLoading ? (
        <PrimaryButton title="Stop" onPress={stop} />
      ) : (
        <PrimaryButton title="Send" onPress={() => void append()} />
      )}
      {error ? <Text style={{ color: '#f87171' }}>{error.message}</Text> : null}
    </Card>
  );
}

function StructuredStreamCard() {
  const { submit, object, isLoading, error } = useObject<TripPlan>();

  return (
    <Card title="useObject · streamObject">
      <PrimaryButton
        title="Plan a trip"
        loading={isLoading}
        onPress={() =>
          void submit({
            prompt: 'Plan a 3-activity day trip to a coastal town.',
            schema: tripSchema,
            fallback: 'cloud',
          })
        }
      />
      {object?.destination ? (
        <Row>
          <Badge label={object.destination} tone="info" />
        </Row>
      ) : null}
      {object?.activities?.map((activity, i) => (
        <Text key={i} style={{ color: '#eef2ff' }}>
          • {activity}
        </Text>
      ))}
      {error ? <Text style={{ color: '#f87171' }}>{error.message}</Text> : null}
    </Card>
  );
}

export default function App() {
  return (
    <Screen title="Hooks Demo" subtitle="@stewmore/expo-ai-react — hooks + streamObject">
      <CapabilitiesCard />
      <GenerateCard />
      <ChatCard />
      <StructuredStreamCard />
    </Screen>
  );
}
