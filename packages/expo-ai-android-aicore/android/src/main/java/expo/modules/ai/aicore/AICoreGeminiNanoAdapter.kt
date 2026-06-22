package expo.modules.ai.aicore

import android.content.Context
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerationConfig
import com.google.mlkit.genai.prompt.GenerativeModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Wraps the ML Kit GenAI **Prompt API** (free-form generation via Gemini Nano /
 * AICore). Summarize / rewrite / proofread are emulated by the core runtime via
 * prompts, so only the Prompt API surface is needed here.
 *
 * NOTE: the genai-prompt Kotlin API is beta; confirm `GenerationConfig`,
 * `checkStatus()`, `GenerateContentResponse.text`, and `FeatureStatus` symbol
 * names against the installed SDK version.
 */
class AICoreGeminiNanoAdapter(
  // Retained for the ML Kit GenAI client wiring once the beta Prompt API
  // surface (see NOTE above) is confirmed; not referenced by the current calls.
  @Suppress("UnusedPrivateProperty") private val context: Context,
) {
  private var cached: GenerativeModel? = null

  private fun model(): GenerativeModel {
    return cached ?: Generation.getClient(GenerationConfig.builder().build())
      .also { cached = it }
  }

  suspend fun availability(): Map<String, Any?> {
    return try {
      val (available, reason) = mapStatus(model().checkStatus())
      val payload = mutableMapOf<String, Any?>(
        "available" to available,
        "provider" to AndroidErrorMapper.PROVIDER,
      )
      if (!available && reason != null) payload["reasonUnavailable"] = reason
      payload
    } catch (error: GenAiException) {
      mapOf(
        "available" to false,
        "provider" to AndroidErrorMapper.PROVIDER,
        "reasonUnavailable" to "aicore_unavailable",
      )
    } catch (error: Throwable) {
      mapOf(
        "available" to false,
        "provider" to AndroidErrorMapper.PROVIDER,
        "reasonUnavailable" to "unknown",
      )
    }
  }

  suspend fun generate(options: Map<String, Any?>): Map<String, Any?> {
    val response = model().generateContent(buildPrompt(options))
    val text = response.candidates.firstOrNull()?.text ?: ""
    return mapOf("text" to text, "finishReason" to "stop")
  }

  fun generateStream(options: Map<String, Any?>): Flow<String> {
    return model()
      .generateContentStream(buildPrompt(options))
      .map { it.candidates.firstOrNull()?.text ?: "" }
  }

  /** Trigger / await the on-device model download. */
  suspend fun download() {
    model().download()
  }

  fun close() {
    cached?.close()
    cached = null
  }

  private fun buildPrompt(options: Map<String, Any?>): String {
    val instructions = options["instructions"] as? String
    val prompt = options["prompt"] as? String ?: ""
    return if (instructions.isNullOrBlank()) prompt else "$instructions\n\n$prompt"
  }

  private fun mapStatus(status: Int): Pair<Boolean, String?> {
    return when (status) {
      FeatureStatus.AVAILABLE -> true to null
      FeatureStatus.DOWNLOADABLE -> false to "model_not_downloaded"
      FeatureStatus.DOWNLOADING -> false to "model_initializing"
      FeatureStatus.UNAVAILABLE -> false to "unsupported_device"
      else -> false to "aicore_unavailable"
    }
  }
}
