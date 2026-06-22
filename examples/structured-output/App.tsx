import { ExpoAI, ExpoAIError, type JSONSchema } from '@stewmore/expo-ai-core';
import { Badge, Card, PrimaryButton, PromptInput, Row, Screen } from '@stewmore/example-shared';
import { useState } from 'react';
import { Text } from 'react-native';

const schema: JSONSchema = {
  type: 'object',
  properties: {
    projectName: { type: 'string' },
    budget: { type: 'string' },
    timeline: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['projectName', 'timeline', 'risks'],
};

export default function App() {
  const [prompt, setPrompt] = useState(
    'Project Atlas launches in Q4 with a $250k budget. Risks: vendor delays and scope creep.',
  );
  const [busy, setBusy] = useState(false);
  const [object, setObject] = useState<unknown>(null);
  const [error, setError] = useState<ExpoAIError | null>(null);

  async function onExtract() {
    setBusy(true);
    setError(null);
    setObject(null);
    try {
      const result = await ExpoAI.generateObject({
        prompt: `Extract project name, budget, timeline, and risks from:\n${prompt}`,
        schema,
        fallback: 'cloud',
      });
      setObject(result);
    } catch (caught) {
      setError(ExpoAIError.from(caught, 'none'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Structured Output"
      subtitle="ExpoAI.generateObject with JSON-schema validation + repair"
    >
      <Card title="Schema">
        <Text style={{ color: '#9aa6c4', fontFamily: 'monospace', fontSize: 12 }}>
          {JSON.stringify(schema, null, 2)}
        </Text>
      </Card>

      <Card title="Source text">
        <PromptInput value={prompt} onChangeText={setPrompt} multiline />
        <PrimaryButton title="Extract object" onPress={() => void onExtract()} loading={busy} />
      </Card>

      {object ? (
        <Card title="Extracted object">
          <Badge label="schema valid" tone="ok" />
          <Text style={{ color: '#eef2ff', fontFamily: 'monospace', fontSize: 13 }}>
            {JSON.stringify(object, null, 2)}
          </Text>
        </Card>
      ) : null}

      {error ? (
        <Card title="Error">
          <Row>
            <Badge label={error.code} tone="danger" />
          </Row>
          <Text style={{ color: '#f87171' }}>{error.message}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
