import {
  ExpoAI,
  ExpoAIError,
  type ExpoAIFallback,
  type GenerateResult,
} from "@stewmore/expo-ai-core";
import {
  Badge,
  Card,
  CLOUD_ENDPOINT,
  KeyValue,
  PrimaryButton,
  PromptInput,
  ProviderPrivacy,
  Row,
  Screen,
  theme,
} from "@stewmore/example-shared";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

const FALLBACKS: ExpoAIFallback[] = ["none", "cloud", "any"];

export default function App() {
  const [prompt, setPrompt] = useState("Summarize the attached contract clause.");
  const [sensitive, setSensitive] = useState(true);
  const [fallback, setFallback] = useState<ExpoAIFallback>("none");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<ExpoAIError | null>(null);

  async function onGenerate() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const generated = await ExpoAI.generate({ prompt, sensitive, fallback });
      setResult(generated);
    } catch (caught) {
      setError(ExpoAIError.from(caught, "none"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Cloud Fallback" subtitle="Explicit, privacy-aware routing (docs/prd.md §13–14)">
      <Card title="Routing">
        <View style={styles.switchRow}>
          <Text style={styles.label}>Treat prompt as sensitive</Text>
          <Switch value={sensitive} onValueChange={setSensitive} />
        </View>
        <Text style={styles.label}>Fallback policy</Text>
        <Row>
          {FALLBACKS.map((option) => {
            const selected = option === fallback;
            return (
              <Pressable
                key={option}
                onPress={() => setFallback(option)}
                style={[styles.chip, selected ? styles.chipSelected : null]}
              >
                <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{option}</Text>
              </Pressable>
            );
          })}
        </Row>
        <KeyValue label="Cloud endpoint" value={CLOUD_ENDPOINT} />
        <Text style={styles.note}>
          A sensitive prompt is only sent to a third-party cloud when fallback is explicitly “cloud”.
          With “none” or “any” it stays on-device or fails — it is never sent silently.
        </Text>
      </Card>

      <Card title="Prompt">
        <PromptInput value={prompt} onChangeText={setPrompt} multiline />
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
        <Card title={error.code === "UNAVAILABLE" ? "Blocked (no leak)" : "Error"}>
          <Badge label={error.code} tone={error.code === "UNAVAILABLE" ? "info" : "danger"} />
          <Text style={{ color: theme.color.subtle }}>{error.message}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: theme.color.subtle, fontSize: 14 },
  note: { color: theme.color.subtle, fontSize: 13, lineHeight: 19 },
  chip: {
    borderWidth: 1,
    borderColor: theme.color.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  chipText: { color: theme.color.subtle, fontWeight: "600" },
  chipTextSelected: { color: "#0b1020" },
});
