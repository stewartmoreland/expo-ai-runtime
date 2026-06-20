package expo.modules.ai.aicore

import com.google.mlkit.genai.common.GenAiException

/**
 * Maps native errors into the normalized `ExpoAIError` payload the JS layer
 * understands (docs/prd.md §16). AICore "BUSY"/initializing is treated as
 * retryable (docs/prd.md §11).
 *
 * NOTE: the GenAiException error-code constants below follow the ML Kit GenAI
 * docs; confirm the exact symbol names against the installed SDK.
 */
object AndroidErrorMapper {
  const val PROVIDER = "android-aicore-gemini-nano"

  fun payload(error: Throwable): Map<String, Any?> {
    var code = "NATIVE_PROVIDER_ERROR"
    var retryable = false
    var fallbackRecommended = true

    if (error is GenAiException) {
      when (error.errorCode) {
        GenAiException.NOT_AVAILABLE,
        GenAiException.AICORE_INCOMPATIBLE -> {
          code = "UNSUPPORTED_DEVICE"
        }
        GenAiException.NEEDS_SYSTEM_UPDATE -> {
          code = "USER_SETTING_REQUIRED"
        }
        GenAiException.BUSY -> {
          // AICore is busy / still initializing — retry, or fall back.
          code = "MODEL_NOT_READY"
          retryable = true
        }
        GenAiException.REQUEST_TOO_LARGE -> {
          code = "CONTEXT_WINDOW_EXCEEDED"
        }
        GenAiException.NOT_ENOUGH_DISK_SPACE -> {
          code = "MODEL_DOWNLOAD_REQUIRED"
        }
        GenAiException.CANCELLED -> {
          code = "CANCELLED"
          fallbackRecommended = false
        }
        else -> {
          code = "NATIVE_PROVIDER_ERROR"
        }
      }
    }

    return mapOf(
      "code" to code,
      "provider" to PROVIDER,
      "message" to (error.message ?: "Unknown error"),
      "retryable" to retryable,
      "fallbackRecommended" to fallbackRecommended,
      "nativeMessage" to error.message,
    )
  }
}
