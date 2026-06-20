import { ExpoAI, ExpoAIError, type GenerateResult } from "@stewmore/expo-ai-core";
import {
  Badge,
  Card,
  KeyValue,
  PrimaryButton,
  PromptInput,
  ProviderPrivacy,
  Row,
  Screen,
  useCapabilities,
} from "@stewmore/example-shared";
import { useState } from "react";
import { Text } from "react-native";

export default function App() {
  const { loading, capabilities, refresh } = useCapabilities();
  const [prompt, setPrompt] = useState("Summarize what an Expo native module is in two sentences.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<ExpoAIError | null>(null);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const generated = await ExpoAI.generate({ prompt, fallback: "cloud" });
      setResult(generated);
    } catch (caught) {
      setError(ExpoAIError.from(caught, "none"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Basic Generate" subtitle="ExpoAI.generate with capability detection + cloud fallback">
      <Card title="Capability">
        {loading || !capabilities ? (
          <Text style={{ color: "#9aa6c4" }}>Checking…</Text>
        ) : (
          <>
            <Row>
              <Badge
                label={capabilities.available ? "available" : "unavailable"}
                tone={capabilities.available ? "ok" : "danger"}
              />
              <Badge label={capabilities.provider} tone="info" />
              {capabilities.reasonUnavailable ? (
                <Badge label={capabilities.reasonUnavailable} tone="warn" />
              ) : null}
            </Row>
            <KeyValue label="On-device" value={capabilities.isOnDevice ? "yes" : "no"} />
            <KeyValue label="Streaming" value={capabilities.supportsStreaming ? "yes" : "no"} />
            <KeyValue label="Structured output" value={capabilities.supportsStructuredOutput ? "yes" : "no"} />
            <KeyValue
              label="Context window"
              value={capabilities.contextWindow ? `${capabilities.contextWindow}` : "unknown"}
            />
            <PrimaryButton title="Re-check" onPress={() => void refresh()} />
          </>
        )}
      </Card>

      <Card title="Prompt">
        <PromptInput value={prompt} onChangeText={setPrompt} multiline placeholder="Ask something…" />
        <PrimaryButton title="Generate" onPress={() => void onGenerate()} loading={busy} />
      </Card>

      {result ? (
        <Card title="Result">
          <ProviderPrivacy provider={result.provider} privacy={result.privacy} />
          {result.usedFallback ? <Badge label="used fallback" tone="warn" /> : null}
          <Text style={{ color: "#eef2ff", fontSize: 15, lineHeight: 22 }}>{result.text}</Text>
        </Card>
      ) : null}

      {error ? (
        <Card title="Error">
          <Row>
            <Badge label={error.code} tone="danger" />
            {error.retryable ? <Badge label="retryable" tone="warn" /> : null}
            {error.fallbackRecommended ? <Badge label="fallback recommended" tone="info" /> : null}
          </Row>
          <Text style={{ color: "#f87171" }}>{error.message}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
