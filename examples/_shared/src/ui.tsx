import { PRIVACY_COPY, type ExpoAIPrivacyInfo, type ExpoAIProvider } from "@stewmore/expo-ai-core";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { theme, toneColor, type BadgeTone } from "./theme";

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const color = toneColor[tone];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export function PromptInput(props: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <TextInput
      style={[styles.input, props.multiline ? styles.inputMultiline : null]}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={theme.color.subtle}
      multiline={props.multiline}
    />
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      style={[styles.button, isDisabled ? styles.buttonDisabled : null]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? <ActivityIndicator color="#0b1020" /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
}

export function privacyTone(privacy: ExpoAIPrivacyInfo): BadgeTone {
  if (privacy.privacyMode === "on-device") return "ok";
  if (privacy.privacyMode === "apple-private-cloud-compute") return "info";
  if (privacy.privacyMode === "third-party-cloud") return "warn";
  return "neutral";
}

export function ProviderPrivacy({ provider, privacy }: { provider: ExpoAIProvider; privacy: ExpoAIPrivacyInfo }) {
  return (
    <View style={{ gap: theme.space(1) }}>
      <Row>
        <Badge label={provider} tone="info" />
        <Badge label={privacy.privacyMode} tone={privacyTone(privacy)} />
      </Row>
      <Text style={styles.privacyCopy}>{PRIVACY_COPY[privacy.privacyMode]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { padding: theme.space(2), gap: theme.space(2) },
  title: { color: theme.color.text, fontSize: 26, fontWeight: "700" },
  subtitle: { color: theme.color.subtle, fontSize: 14, marginTop: -theme.space(1) },
  card: {
    backgroundColor: theme.color.card,
    borderColor: theme.color.cardBorder,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.space(2),
    gap: theme.space(1.5),
  },
  cardTitle: { color: theme.color.text, fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(1), alignItems: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: theme.space(2) },
  kvLabel: { color: theme.color.subtle, fontSize: 13 },
  kvValue: { color: theme.color.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  input: {
    backgroundColor: theme.color.inputBg,
    borderColor: theme.color.cardBorder,
    borderWidth: 1,
    borderRadius: theme.radius,
    color: theme.color.text,
    padding: theme.space(1.5),
    fontSize: 15,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  button: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(1.5),
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#0b1020", fontSize: 16, fontWeight: "700" },
  privacyCopy: { color: theme.color.subtle, fontSize: 13 },
});
