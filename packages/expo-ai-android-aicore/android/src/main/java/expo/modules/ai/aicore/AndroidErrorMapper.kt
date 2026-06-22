package expo.modules.ai.aicore

import com.google.mlkit.genai.common.GenAiException

/**
 * Maps native errors into the normalized `ExpoAIError` payload the JS layer
 * understands (docs/prd.md §16). AICore "BUSY"/initializing is treated as
 * retryable (docs/prd.md §11).
 *
 * The GenAiException error-code constants live on the nested
 * `GenAiException.ErrorCode` interface (genai-common 1.0.0-beta3).
 */
object AndroidErrorMapper {
  const val PROVIDER = "android-aicore-gemini-nano"

  fun payload(error: Throwable): Map<String, Any?> {
    var code = "NATIVE_PROVIDER_ERROR"
    var retryable = false
    var fallbackRecommended = true

    if (error is GenAiException) {
      when (error.errorCode) {
        GenAiException.ErrorCode.NOT_AVAILABLE,
        GenAiException.ErrorCode.AICORE_INCOMPATIBLE -> {
          code = "UNSUPPORTED_DEVICE"
        }
        GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE -> {
          code = "USER_SETTING_REQUIRED"
        }
        GenAiException.ErrorCode.BUSY -> {
          // AICore is busy / still initializing — retry, or fall back.
          code = "MODEL_NOT_READY"
          retryable = true
        }
        GenAiException.ErrorCode.REQUEST_TOO_LARGE -> {
          code = "CONTEXT_WINDOW_EXCEEDED"
        }
        GenAiException.ErrorCode.NOT_ENOUGH_DISK_SPACE -> {
          code = "MODEL_DOWNLOAD_REQUIRED"
        }
        GenAiException.ErrorCode.CANCELLED -> {
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
