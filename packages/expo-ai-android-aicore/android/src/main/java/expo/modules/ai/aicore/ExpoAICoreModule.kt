package expo.modules.ai.aicore

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * Expo module exposing primitive ML Kit GenAI (Gemini Nano via AICore)
 * operations to JS (docs/prd.md §9, §11). Ergonomics live in the TypeScript
 * adapter.
 */
class ExpoAICoreModule : Module() {
  private val adapter by lazy { AICoreGeminiNanoAdapter(appContext.reactContext!!) }
  private val sessions = AndroidSessionStore()
  private val streamScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val streamJobs = mutableMapOf<String, Job>()

  override fun definition() = ModuleDefinition {
    Name("ExpoAICore")

    Events("onExpoAIStream")

    AsyncFunction("getAvailability") Coroutine { ->
      adapter.availability()
    }

    AsyncFunction("generate") Coroutine { options: Map<String, Any?> ->
      adapter.generate(options)
    }

    AsyncFunction("downloadModel") Coroutine { ->
      adapter.download()
      mapOf("ok" to true)
    }

    AsyncFunction("createSession") { options: Map<String, Any?> ->
      val id = sessions.create(options["instructions"] as? String)
      mapOf("sessionId" to id, "provider" to AndroidErrorMapper.PROVIDER)
    }

    AsyncFunction("generateInSession") Coroutine { sessionId: String, options: Map<String, Any?> ->
      val merged = sessions.composeOptions(sessionId, options)
      val result = adapter.generate(merged)
      sessions.commit(sessionId, options["prompt"] as? String ?: "", result["text"] as? String ?: "")
      result
    }

    AsyncFunction("resetSession") { sessionId: String ->
      sessions.reset(sessionId)
    }

    AsyncFunction("disposeSession") { sessionId: String ->
      sessions.dispose(sessionId)
    }

    AsyncFunction("startStreaming") { requestId: String, options: Map<String, Any?> ->
      startStreaming(requestId, options)
    }

    AsyncFunction("cancelStreaming") { requestId: String ->
      streamJobs.remove(requestId)?.cancel()
    }

    OnDestroy {
      streamScope.cancel()
      adapter.close()
    }
  }

  private fun startStreaming(requestId: String, options: Map<String, Any?>) {
    val job = streamScope.launch {
      try {
        sendEvent("onExpoAIStream", mapOf("requestId" to requestId, "type" to "start"))
        val accumulated = StringBuilder()
        adapter.generateStream(options).collect { delta ->
          accumulated.append(delta)
          sendEvent(
            "onExpoAIStream",
            mapOf("requestId" to requestId, "type" to "token", "text" to delta),
          )
        }
        sendEvent(
          "onExpoAIStream",
          mapOf(
            "requestId" to requestId,
            "type" to "done",
            "result" to mapOf("text" to accumulated.toString(), "finishReason" to "stop"),
          ),
        )
      } catch (error: Throwable) {
        sendEvent(
          "onExpoAIStream",
          mapOf(
            "requestId" to requestId,
            "type" to "error",
            "error" to AndroidErrorMapper.payload(error),
          ),
        )
      } finally {
        streamJobs.remove(requestId)
      }
    }
    streamJobs[requestId] = job
  }
}
